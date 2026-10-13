import { Store } from "../src/db/database.js";
import { config } from "../src/server/config.js";
import { visitorApprovalOptions } from "../src/server/visitor.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Approvals } from "../src/domain/approvals.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import { ContinuationWorker } from "../src/worker/continuation.js";
import { frozenClock } from "../src/shared/time.js";

// Explicit credential-free continuation for the same visitor database/mapping.
if (process.argv.length !== 2)
  throw new Error("Demo worker accepts no arguments.");
const store = new Store(config({}).databasePath);
try {
  store.migrate();
  const approvals = new Approvals(
    new Business(store, frozenClock()),
    new Auth(store),
    visitorApprovalOptions,
  );
  const worker = new ContinuationWorker(new PurchaseExecution(approvals));
  const results = [];
  for (let i = 0; i < 10; i++) {
    const result = worker.runOne();
    if (!result) break;
    results.push(result.status);
  }
  console.log(
    JSON.stringify({
      mode: "visitor-sandbox",
      results,
      modelCalls: 0,
      physicalStockAdded: false,
    }),
  );
} finally {
  store.close();
}
