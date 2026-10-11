import { Store } from "../../src/db/database.js";
import { Auth } from "../../src/domain/auth.js";
import { Business } from "../../src/domain/business.js";
import { Approvals } from "../../src/domain/approvals.js";
import { PurchaseExecution } from "../../src/domain/purchase-execution.js";
import { ContinuationWorker } from "../../src/worker/continuation.js";
import { frozenClock } from "../../src/shared/time.js";
const store = new Store(process.argv[2]!);
const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
const worker = new ContinuationWorker(
  new PurchaseExecution(
    new Approvals(new Business(store, frozenClock()), new Auth(store), {
      mapping,
      liveEnabled: true,
    }),
  ),
);
worker.runOne();
if (process.argv[3] === "crash") process.exit(31);
store.close();
