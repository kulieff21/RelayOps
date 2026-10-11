import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../shared/contracts.js";

const telegramId = z
  .number()
  .int()
  .positive()
  .max(2 ** 52 - 1);
const envId = z
  .string()
  .regex(/^[1-9]\d{0,15}$/)
  .transform(Number)
  .pipe(telegramId);
const botSchema = z.object({
  id: telegramId,
  is_bot: z.literal(true),
  username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
});
export type TelegramBot = z.infer<typeof botSchema>;

// These settings are only consumed by the explicit setup CLI. Server startup does
// not connect to Telegram, discover recipients or enable purchasing authority.
export function telegramTokenConfig(env = process.env) {
  if (!env.TELEGRAM_BOT_TOKEN?.trim())
    throw new Error("TELEGRAM_TOKEN_REQUIRED");
  const result = z
    .object({
      TELEGRAM_BOT_TOKEN: z
        .string()
        .trim()
        .regex(/^[1-9]\d{0,15}:[A-Za-z0-9_-]{20,128}$/),
      TELEGRAM_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(30000)
        .default(10000),
    })
    .safeParse(env);
  if (!result.success) throw new Error("TELEGRAM_CONFIGURATION_INVALID");
  return {
    token: result.data.TELEGRAM_BOT_TOKEN,
    timeoutMs: result.data.TELEGRAM_TIMEOUT_MS,
  };
}

export function telegramMappingConfig(env = process.env) {
  const result = z
    .object({
      TELEGRAM_BOT_ID: envId,
      TELEGRAM_APPROVER_USER_ID: envId,
      TELEGRAM_APPROVER_CHAT_ID: envId,
      TELEGRAM_APPROVER_ACCOUNT_ID: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      TELEGRAM_APPROVER_LOCALE: z.enum(["en", "az"]),
    })
    .safeParse(env);
  if (!result.success) throw new Error("TELEGRAM_MAPPING_REQUIRED_OR_INVALID");
  const v = result.data;
  // Initial setup supports one private recipient. Group/channel routing is not
  // inferred from usernames, chat titles or whoever most recently messaged a bot.
  if (v.TELEGRAM_APPROVER_USER_ID !== v.TELEGRAM_APPROVER_CHAT_ID)
    throw new Error("TELEGRAM_PRIVATE_MAPPING_REQUIRED");
  return {
    botId: v.TELEGRAM_BOT_ID,
    userId: v.TELEGRAM_APPROVER_USER_ID,
    chatId: v.TELEGRAM_APPROVER_CHAT_ID,
    accountId: v.TELEGRAM_APPROVER_ACCOUNT_ID,
    locale: v.TELEGRAM_APPROVER_LOCALE,
  };
}
export type TelegramMapping = ReturnType<typeof telegramMappingConfig>;

export function validateTelegramApprover(
  mapping: TelegramMapping,
  bot: TelegramBot,
  actor: Actor,
) {
  if (mapping.botId !== bot.id) throw new Error("TELEGRAM_BOT_MISMATCH");
  if (mapping.accountId !== actor.id || !actor.roles.includes("owner"))
    throw new Error("TELEGRAM_OWNER_REQUIRED");
  return { ...mapping, locale: mapping.locale };
}

export class TelegramSetupApi {
  constructor(
    private settings: ReturnType<typeof telegramTokenConfig>,
    private transport: typeof fetch = fetch,
  ) {}
  private async call(
    method: "getMe" | "getWebhookInfo" | "getUpdates",
    body: object = {},
  ) {
    // Telegram authenticates in the URL: never allow redirects or print raw
    // transport errors, response descriptions, URLs or validation input.
    try {
      const response = await this.transport(
        `https://api.telegram.org/bot${this.settings.token}/${method}`,
        {
          method: "POST",
          redirect: "error",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.settings.timeoutMs),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`TELEGRAM_HTTP_${response.status}`);
      }
      // Bound both advertised and streamed content; abort deadline also covers reads.
      if (Number(response.headers.get("content-length")) > 1_000_000) {
        await response.body?.cancel();
        throw new Error("TELEGRAM_RESPONSE_TOO_LARGE");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("TELEGRAM_RESPONSE_INVALID");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1_000_000) throw new Error("TELEGRAM_RESPONSE_TOO_LARGE");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const data = z
        .object({ ok: z.literal(true), result: z.unknown() })
        .safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!data.success) throw new Error("TELEGRAM_RESPONSE_INVALID");
      return data.data.result;
    } catch (error) {
      if (
        error instanceof Error &&
        /^TELEGRAM_(HTTP_\d{3}|RESPONSE_TOO_LARGE|RESPONSE_INVALID)$/.test(
          error.message,
        )
      )
        throw new Error(error.message);
      throw new Error("TELEGRAM_REQUEST_FAILED");
    }
  }
  async bot(): Promise<TelegramBot> {
    const result = botSchema.safeParse(await this.call("getMe"));
    if (!result.success) throw new Error("TELEGRAM_RESPONSE_INVALID");
    if (String(result.data.id) !== this.settings.token.split(":")[0])
      throw new Error("TELEGRAM_BOT_MISMATCH");
    return result.data;
  }
  async requirePollingAvailable() {
    const result = z
      .object({
        url: z.string(),
        pending_update_count: z.number().int().nonnegative(),
      })
      .safeParse(await this.call("getWebhookInfo"));
    if (!result.success) throw new Error("TELEGRAM_RESPONSE_INVALID");
    if (result.data.url) throw new Error("TELEGRAM_WEBHOOK_ALREADY_CONFIGURED");
    return { pendingUpdates: result.data.pending_update_count };
  }
  async pendingUpdates() {
    // No offset, no negative offset, no allowed_updates mutation: do not acknowledge
    // or discard any existing update. No continuous receiver is started here.
    const result = z
      .array(z.unknown())
      .max(100)
      .safeParse(await this.call("getUpdates", { timeout: 0, limit: 100 }));
    if (!result.success) throw new Error("TELEGRAM_RESPONSE_INVALID");
    return result.data;
  }
}

const pairingSchema = z.strictObject({
  botId: telegramId,
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  createdAt: z.number().int().nonnegative(),
});
export type TelegramPairing = z.infer<typeof pairingSchema>;
export function createTelegramPairing(
  bot: TelegramBot,
  now = Date.now(),
): TelegramPairing {
  return {
    botId: bot.id,
    nonce: randomBytes(16).toString("hex"),
    createdAt: now,
  };
}
export function telegramPairing(
  raw: unknown,
  bot: TelegramBot,
  now = Date.now(),
) {
  const result = pairingSchema.safeParse(raw);
  if (!result.success) throw new Error("TELEGRAM_PAIRING_REQUIRED");
  if (result.data.botId !== bot.id) throw new Error("TELEGRAM_BOT_MISMATCH");
  if (result.data.createdAt > now || now - result.data.createdAt >= 15 * 60_000)
    throw new Error("TELEGRAM_PAIRING_EXPIRED");
  return result.data;
}
export function identifyTelegramRecipient(
  updates: unknown[],
  pairing: TelegramPairing,
  bot: TelegramBot,
  now = Date.now(),
) {
  const valid = telegramPairing(pairing, bot, now);
  const messageSchema = z.object({
    update_id: z.number().int().nonnegative(),
    message: z.object({
      date: z.number().int().nonnegative(),
      text: z.literal(`/start relayops_${valid.nonce}`),
      from: z.object({ id: telegramId, is_bot: z.literal(false) }),
      chat: z.object({ id: telegramId, type: z.literal("private") }),
    }),
  });
  const candidates = new Map<number, number>();
  for (const raw of updates) {
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data.message;
    if (
      m.from.id !== m.chat.id ||
      m.date * 1000 < Math.floor(valid.createdAt / 1000) * 1000 ||
      m.date * 1000 > now + 5000
    )
      continue;
    candidates.set(m.from.id, m.chat.id);
  }
  if (!candidates.size) throw new Error("TELEGRAM_START_NOT_FOUND");
  if (candidates.size !== 1) throw new Error("TELEGRAM_RECIPIENT_AMBIGUOUS");
  const [userId, chatId] = candidates.entries().next().value!;
  // Candidate only. An operator must explicitly select the RelayOps owner mapping.
  return { botId: bot.id, userId, chatId, authorized: false as const };
}
