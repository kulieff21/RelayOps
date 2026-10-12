import { Store } from "../../src/db/database.js";
import { Auth } from "../../src/domain/auth.js";
import { Business } from "../../src/domain/business.js";
import { Approvals } from "../../src/domain/approvals.js";
import { PurchaseExecution } from "../../src/domain/purchase-execution.js";
import { ContinuationWorker } from "../../src/worker/continuation.js";
import { frozenClock } from "../../src/shared/time.js";
const [path, requestId, mode] = process.argv.slice(2);
const store = new Store(path!);
const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
const auth = new Auth(store),
  approvals = new Approvals(new Business(store, frozenClock()), auth, {
    mapping,
    liveEnabled: true,
  });
try {
  if (mode === "pending-crash") {
    approvals.row(requestId!);
    process.exit(36);
  }
  if (mode === "callback")
    approvals.callback(
      {
        update_id: 7,
        callback_query: {
          id: "isolated-race",
          from: { id: mapping.userId, is_bot: false },
          message: {
            message_id: 88,
            from: { id: mapping.botId, is_bot: true },
            chat: { id: mapping.chatId, type: "private" },
          },
          data: `r:${requestId}:a`,
        },
      },
      mapping.botId,
    );
  else if (mode === "purchase")
    new ContinuationWorker(new PurchaseExecution(approvals)).runOne();
  else
    approvals.decide(auth.actor("owner"), "fixture-006", requestId!, {
      decision: "approved",
      reason: "OS-process human decision",
      key: "isolated-web-decision",
    });
  if (mode === "approve-crash") process.exit(37);
} finally {
  store.close();
}
