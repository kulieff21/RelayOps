import type { ApprovalOptions } from "../domain/approvals.js";

// Public synthetic owner, never a real Telegram recipient.
export const visitorApprovalOptions: ApprovalOptions = {
  mapping: {
    botId: 123456,
    userId: 222333,
    chatId: 222333,
    accountId: "owner",
    locale: "en",
  },
  liveEnabled: false,
};
