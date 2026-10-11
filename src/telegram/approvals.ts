import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TelegramSetupApi, type telegramTokenConfig } from "./setup.js";
import {
  Approvals,
  callbackSchema,
  type ApprovalRow,
} from "../domain/approvals.js";
import { BusinessError } from "../shared/contracts.js";

export class TelegramApprovalApi extends TelegramSetupApi {
  constructor(
    private config: ReturnType<typeof telegramTokenConfig>,
    transport: typeof fetch = fetch,
  ) {
    super(config, transport);
  }
  async send(row: ApprovalRow) {
    const result = z
      .object({
        message_id: z.number().int().positive(),
        chat: z.object({ id: z.number().int() }),
      })
      .safeParse(
        await this.call("sendMessage", {
          chat_id: row.chat_id,
          text: row.summary,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: row.locale === "az" ? "Təsdiq et" : "Approve",
                  callback_data: `r:${row.id}:a`,
                },
                {
                  text: row.locale === "az" ? "Rədd et" : "Reject",
                  callback_data: `r:${row.id}:r`,
                },
              ],
            ],
          },
        }),
      );
    if (!result.success || String(result.data.chat.id) !== row.chat_id)
      throw new Error("TELEGRAM_RESPONSE_INVALID");
    return result.data.message_id;
  }
  async edit(row: ApprovalRow) {
    const labels: Record<string, [string, string]> = {
      approved: ["APPROVED", "TƏSDİQLƏNDİ"],
      rejected: ["REJECTED", "RƏDD EDİLDİ"],
      expired: ["EXPIRED", "MÜDDƏTİ BİTDİ"],
      invalidated: [
        "INVALIDATED — new proposal required",
        "ETİBARSIZ — yeni təklif tələb olunur",
      ],
    };
    const status =
      labels[row.status]?.[row.locale === "en" ? 0 : 1] ?? row.status;
    return this.call("editMessageText", {
      chat_id: row.chat_id,
      message_id: row.message_id,
      text: `[${status}]\n${row.summary}`,
      reply_markup: { inline_keyboard: [] },
    });
  }
  async updates(offset: number) {
    const result = z
      .array(
        z.object({ update_id: z.number().int().nonnegative() }).passthrough(),
      )
      .max(100)
      .safeParse(
        await this.call("getUpdates", {
          offset,
          limit: 100,
          timeout: Math.max(
            0,
            Math.min(20, Math.floor(this.config.timeoutMs / 1000) - 2),
          ),
          allowed_updates: ["message", "callback_query"],
        }),
      );
    if (!result.success) throw new Error("TELEGRAM_RESPONSE_INVALID");
    return result.data;
  }
  async answer(callbackId: string, status: string, locale: "en" | "az") {
    const messages: Record<string, [string, string]> = {
      approved: [
        "Approval recorded. Purchase/receipt are separate steps.",
        "Təsdiq qeydə alındı. Satınalma və qəbul ayrı mərhələlərdir.",
      ],
      rejected: [
        "Rejection recorded. A revised proposal needs a new decision.",
        "Rədd qeydə alındı. Yeni təklif üçün yeni qərar lazımdır.",
      ],
      expired: [
        "This request has expired. Prepare a new proposal.",
        "Bu sorğunun müddəti bitib. Yeni təklif hazırlayın.",
      ],
      invalidated: [
        "Evidence changed. A new proposal and decision are required.",
        "Məlumat dəyişib. Yeni təklif və qərar lazımdır.",
      ],
      denied: [
        "This decision is not authorized for this account/message.",
        "Bu hesab/mesaj üçün qərara icazə yoxdur.",
      ],
    };
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackId,
      text:
        messages[status]?.[locale === "en" ? 0 : 1] ??
        "Request not recognized.",
      show_alert: ["denied", "expired", "invalidated"].includes(status),
    });
  }
}

// One explicitly launched local receiver per bot. Leases use real wall time;
// network operations are never inside a SQLite transaction.
export class TelegramApprovalWorker {
  readonly owner = randomUUID();
  constructor(
    readonly approvals: Approvals,
    readonly api: TelegramApprovalApi,
  ) {}
  private lease() {
    const { store, options, wallTime } = this.approvals;
    if (!options?.liveEnabled)
      throw new BusinessError("TELEGRAM_LIVE_DISABLED");
    const botId = String(options.mapping.botId),
      now = wallTime();
    store.transaction(() => {
      store.run(
        "INSERT INTO telegram_receiver(bot_id) VALUES (?) ON CONFLICT DO NOTHING",
        botId,
      );
      const result = store.run(
        "UPDATE telegram_receiver SET lease_owner=?,lease_until=? WHERE bot_id=? AND (lease_owner=? OR lease_until<=?)",
        this.owner,
        now + 120_000,
        botId,
        this.owner,
        now,
      );
      if (!result.changes) throw new BusinessError("TELEGRAM_RECEIVER_LEASED");
    });
    return botId;
  }
  release() {
    if (!this.approvals.options) return;
    this.approvals.store.run(
      "UPDATE telegram_receiver SET lease_until=0,lease_owner=NULL WHERE bot_id=? AND lease_owner=?",
      String(this.approvals.options.mapping.botId),
      this.owner,
    );
  }
  async verify() {
    const bot = await this.api.bot();
    if (bot.id !== this.approvals.options?.mapping.botId)
      throw new Error("TELEGRAM_BOT_MISMATCH");
    await this.api.requirePollingAvailable();
  }
  async tick() {
    const botId = this.lease(),
      { store } = this.approvals;
    this.approvals.sweep();
    // The send-after-effect ambiguity cannot be solved by Telegram idempotency:
    // a crash/timeout makes the send unknown; never blindly resend it.
    store.run(
      "UPDATE approval_delivery SET status='unknown',error_code='TELEGRAM_SEND_INTERRUPTED' WHERE bot_id=? AND status='sending'",
      botId,
    );
    const queued = store.all<{ request_id: string }>(
      "SELECT d.request_id FROM approval_delivery d JOIN approval_requests a ON a.id=d.request_id WHERE d.bot_id=? AND d.mode='live' AND d.status='queued' AND a.status='pending' ORDER BY d.rowid LIMIT 10",
      botId,
    );
    for (const item of queued) {
      this.lease();
      const row = store.transaction(() => {
        const current = this.approvals.expireOrInvalidate(
          this.approvals.row(item.request_id),
        );
        if (current.status !== "pending") return null;
        store.run(
          "UPDATE approval_delivery SET status='sending',error_code=NULL WHERE request_id=? AND status='queued'",
          current.id,
        );
        return current;
      });
      if (!row) continue;
      try {
        const messageId = await this.api.send(row);
        store.run(
          `UPDATE approval_delivery SET status='sent',message_id=?,
           edit_pending=CASE WHEN (SELECT status FROM approval_requests WHERE id=request_id)!='pending' THEN 1 ELSE edit_pending END
           WHERE request_id=? AND status='sending'`,
          messageId,
          row.id,
        );
      } catch {
        store.run(
          "UPDATE approval_delivery SET status='unknown',error_code='TELEGRAM_SEND_UNCERTAIN' WHERE request_id=?",
          row.id,
        );
      }
    }
    const offset = store.one<{ next_offset: number }>(
      "SELECT next_offset FROM telegram_receiver WHERE bot_id=?",
      botId,
    )!.next_offset;
    this.lease();
    const updates = await this.api.updates(offset);
    updates.sort((a, b) => a.update_id - b.update_id);
    for (const update of updates) {
      this.lease();
      const result = store.transaction(() => {
        const decision = this.approvals.callback(update, Number(botId));
        store.run(
          "UPDATE telegram_receiver SET next_offset=MAX(next_offset,?) WHERE bot_id=? AND lease_owner=?",
          update.update_id + 1,
          botId,
          this.owner,
        );
        return decision;
      });
      const parsed = callbackSchema.parse(update);
      if (parsed.callback_query) {
        try {
          await this.api.answer(
            parsed.callback_query.id,
            result.status,
            this.approvals.options!.mapping.locale,
          );
        } catch {
          /* Decision is durable; an expired toast does not repeat its effect. */
        }
      }
    }
    const edits = store.all<{ request_id: string }>(
      "SELECT request_id FROM approval_delivery WHERE bot_id=? AND mode='live' AND edit_pending=1 AND edit_attempts<3 AND message_id IS NOT NULL LIMIT 10",
      botId,
    );
    for (const item of edits) {
      this.lease();
      try {
        await this.api.edit(this.approvals.row(item.request_id));
        store.run(
          "UPDATE approval_delivery SET edit_pending=0,error_code=NULL WHERE request_id=?",
          item.request_id,
        );
      } catch {
        store.run(
          "UPDATE approval_delivery SET edit_attempts=edit_attempts+1,error_code='TELEGRAM_EDIT_FAILED' WHERE request_id=?",
          item.request_id,
        );
      }
    }
  }
}
