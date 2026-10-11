import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { projectRoot, config } from "../src/server/config.js";
import {
  TelegramSetupApi,
  telegramTokenConfig,
  telegramMappingConfig,
  createTelegramPairing,
  telegramPairing,
  identifyTelegramRecipient,
  validateTelegramApprover,
} from "../src/telegram/setup.js";

const sessionPath = join(projectRoot, "runtime/telegram-setup.json");
try {
  const [action, ...rest] = process.argv.slice(2);
  if (
    rest.length ||
    !["--prepare", "--identify", "--check"].includes(action ?? "")
  )
    throw new Error("TELEGRAM_SETUP_ARGUMENTS_INVALID");
  const api = new TelegramSetupApi(telegramTokenConfig());
  const bot = await api.bot();
  await api.requirePollingAvailable();
  if (action === "--prepare") {
    const pairing = createTelegramPairing(bot);
    mkdirSync(join(projectRoot, "runtime"), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(pairing) + "\n", { mode: 0o600 });
    console.log(
      JSON.stringify(
        {
          bot: bot.username,
          openInTelegram: `https://t.me/${bot.username}?start=relayops_${pairing.nonce}`,
          next: "Press Start using the intended approver's personal account, then run npm run telegram:setup -- --identify within 15 minutes.",
          messagesSent: false,
          approvalsEnabled: false,
        },
        null,
        2,
      ),
    );
  } else if (action === "--identify") {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(sessionPath, "utf8"));
    } catch {
      throw new Error("TELEGRAM_PAIRING_REQUIRED");
    }
    const pairing = telegramPairing(raw, bot);
    const candidate = identifyTelegramRecipient(
      await api.pendingUpdates(),
      pairing,
      bot,
    );
    console.log(
      JSON.stringify(
        {
          candidate,
          environmentFields: {
            TELEGRAM_BOT_ID: String(candidate.botId),
            TELEGRAM_APPROVER_USER_ID: String(candidate.userId),
            TELEGRAM_APPROVER_CHAT_ID: String(candidate.chatId),
          },
          next: "Explicitly select the RelayOps owner account and en/az locale before saving the mapping. Discovery does not grant purchasing authority.",
          updatesAcknowledged: false,
          messagesSent: false,
          approvalsEnabled: false,
        },
        null,
        2,
      ),
    );
  } else {
    const mapping = telegramMappingConfig();
    const db = new DatabaseSync(config().databasePath, { readOnly: true });
    try {
      const actor = z
        .object({ id: z.string(), locale: z.enum(["en", "az"]) })
        .parse(
          db
            .prepare("SELECT id,locale FROM accounts WHERE id=?")
            .get(mapping.accountId),
        );
      const roles = z
        .array(
          z.object({
            role: z.enum(["customer", "operator", "purchaser", "owner"]),
          }),
        )
        .parse(
          db
            .prepare("SELECT role FROM roles WHERE account_id=?")
            .all(mapping.accountId),
        )
        .map((row) => row.role);
      const valid = validateTelegramApprover(mapping, bot, { ...actor, roles });
      console.log(
        JSON.stringify(
          {
            bot: bot.username,
            accountId: valid.accountId,
            locale: valid.locale,
            mappingValidated: true,
            messagesSent: false,
            approvalsEnabled: process.env.TELEGRAM_APPROVALS_ENABLED === "true",
            next: "Setup fields are valid. See docs/telegram-approvals.md for opt-in delivery and the separate telegram:worker receiver.",
          },
          null,
          2,
        ),
      );
    } finally {
      db.close();
    }
  }
} catch (error) {
  // Do not print a stack or provider/configuration content (token lives in URLs).
  console.error(
    error instanceof Error && /^TELEGRAM_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "TELEGRAM_SETUP_FAILED",
  );
  process.exitCode = 1;
}
