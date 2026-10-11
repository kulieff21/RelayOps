import { Store } from "../src/db/database.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Approvals } from "../src/domain/approvals.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import { ContinuationWorker } from "../src/worker/continuation.js";
import { config } from "../src/server/config.js";
import { frozenClock } from "../src/shared/time.js";
import { telegramMappingConfig } from "../src/telegram/setup.js";

let store: Store | undefined;
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 1 ||
    !["--once", "--once-fail-supplier"].includes(args[0]!)
  )
    throw new Error("PROCESS_WORKER_ARGUMENTS_INVALID");
  const values = config(),
    mapping = telegramMappingConfig();
  store = new Store(values.databasePath);
  store.migrate();
  const approvals = new Approvals(
    new Business(store, frozenClock(values.DEMO_CLOCK)),
    new Auth(store),
    { mapping, liveEnabled: process.env.TELEGRAM_APPROVALS_ENABLED === "true" },
  );
  const worker = new ContinuationWorker(new PurchaseExecution(approvals));
  const results = [];
  // Explicit bounded local batch; no receiver, provider or supplier network is started.
  for (let i = 0; i < 10; i++) {
    const result = worker.runOne(
      args[0] === "--once-fail-supplier" ? "failed" : "acknowledged",
    );
    if (!result) break;
    results.push(result.status);
  }
  console.log(
    JSON.stringify({
      mode: "sandbox",
      results,
      physicalStockAdded: false,
      modelCalls: 0,
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error && /^PROCESS_[A-Z_]+$/.test(error.message)
      ? error.message
      : "PROCESS_WORKER_FAILED",
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
