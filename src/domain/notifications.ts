import { randomUUID } from "node:crypto";
import type { Business } from "./business.js";

export function notifyOrder(
  business: Business,
  orderId: string,
  messageKey: string,
  details: { quantity?: number; deliveryAt?: string; reason?: string } = {},
  notificationId: string = randomUUID(),
) {
  const account = business.store.one<{
    customer_id: string;
    locale: "en" | "az";
  }>(
    "SELECT o.customer_id,a.locale FROM orders o JOIN accounts a ON a.id=o.customer_id WHERE o.id=?",
    orderId,
  )!;
  business.store.run(
    "INSERT INTO notifications VALUES (?,?,?,?,?,?)",
    notificationId,
    account.customer_id,
    messageKey,
    JSON.stringify({ orderId, ...details }),
    account.locale,
    business.clock.now(),
  );
}
