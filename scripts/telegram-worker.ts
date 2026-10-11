import { Store } from "../src/db/database.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Approvals } from "../src/domain/approvals.js";
import { config } from "../src/server/config.js";
import { frozenClock } from "../src/shared/time.js";
import {
  telegramTokenConfig,
  telegramMappingConfig,
} from "../src/telegram/setup.js";
import {
  TelegramApprovalApi,
  TelegramApprovalWorker,
} from "../src/telegram/approvals.js";

let store: Store | undefined, worker: TelegramApprovalWorker | undefined;
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
try {
  if (process.env.TELEGRAM_APPROVALS_ENABLED !== "true")
    throw new Error("TELEGRAM_LIVE_DISABLED");
  const values = config(),
    mapping = telegramMappingConfig();
  const api = new TelegramApprovalApi(telegramTokenConfig());
  store = new Store(values.databasePath);
  store.migrate();
  const approvals = new Approvals(
    new Business(store, frozenClock(values.DEMO_CLOCK)),
    new Auth(store),
    { mapping, liveEnabled: true },
  );
  worker = new TelegramApprovalWorker(approvals, api);
  await worker.verify();
  console.log(
    "RelayOps Telegram receiver ready; only explicitly requested live approvals are sent.",
  );
  let failures = 0;
  while (!stopped) {
    try {
      await worker.tick();
      failures = 0;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "TELEGRAM_RECEIVER_LEASED"
      )
        throw error;
      failures++;
      if (failures >= 3) throw new Error("TELEGRAM_RECEIVER_STOPPED");
      console.error("TELEGRAM_RECEIVER_RETRY");
    }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
} catch (error) {
  console.error(
    error instanceof Error && /^TELEGRAM_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "TELEGRAM_RECEIVER_FAILED",
  );
  process.exitCode = 1;
} finally {
  worker?.release();
  store?.close();
}
