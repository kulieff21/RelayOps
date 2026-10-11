import { Store } from "../../src/db/database.js";
import { Business } from "../../src/domain/business.js";
import { Auth } from "../../src/domain/auth.js";
import { Approvals } from "../../src/domain/approvals.js";
import { frozenClock } from "../../src/shared/time.js";
const store = new Store(process.argv[2]!);
const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
const approvals = new Approvals(
  new Business(store, frozenClock()),
  new Auth(store),
  { mapping, liveEnabled: true },
  () => 1_800_000_000_000,
);
approvals.callback(
  {
    update_id: 7,
    callback_query: {
      id: "cb7",
      from: { id: mapping.userId, is_bot: false },
      message: {
        message_id: 88,
        from: { id: mapping.botId, is_bot: true },
        chat: { id: mapping.chatId, type: "private" },
      },
      data: `r:${process.argv[3]!}:a`,
    },
  },
  mapping.botId,
);
process.exit(29);
