# Fictional demo scenario and walkthrough

All local accounts use **`RelayOps-demo-2026!`**. These public fixture credentials
are not a production authentication scheme. Use the account selection on the sign-in
screen; the selected UI locale is independent of the stored account locale.

| Email                       | Role      | Account locale |
| --------------------------- | --------- | -------------- |
| customer-a@relayops.example | Customer  | English        |
| customer-b@relayops.example | Customer  | Azerbaijani    |
| operator@relayops.example   | Operator  | English        |
| purchaser@relayops.example  | Purchaser | English        |
| owner@relayops.example      | Owner     | Azerbaijani    |

## Fresh-seed reference case

Case `fixture-006` belongs to customer B's order `fixture-003`: an accepted 20-unit
RelaySwitch 24G order with a five-business-day
deadline. Eight physical units are reserved; twelve are missing. The sales order is
4,580 AZN and the **purchasing** budget is 2,000 AZN; these are different amounts.

| Supplier     | All-in purchasing total     | Deterministic comparison        |
| ------------ | --------------------------- | ------------------------------- |
| Northlink    | 1,920 AZN / 12 units        | Feasible delivery and budget    |
| ByteHarbor   | 1,780 AZN / 12 units        | Cheaper but late                |
| CircuitDepot | 2,550 AZN / 20-unit minimum | Over budget; eight excess units |

All suppliers, products, customer records, quotes and fulfillment evidence are fictional.
Fresh seed has **no** agent run, proposal, purchasing decision, PO or receipt. The operator's
existing local database is intentionally different: it retains a genuine owner-operated
Telegram approval and one acknowledged 12-unit sandbox PO with zero receipts. Never
copy its private configuration/evidence into portfolio media or reset it for this demo.

## Guided integrated flow in a separate checkout

1. Run the credential-free visitor launcher. Open `/collection` and a product detail;
   catalog counts come from SQLite, and switches initially have zero unreserved stock.
2. Open `/assistant`, sign in as customer A, select English and use a displayed guided
   example to ask about equipment. Mode is **Guided demo**, not live model inference.
3. Switch to the synthetic owner in the workspace. Open
   `/workspace/procurement?case=fixture-006`. Review accepted demand, reservations,
   deadline/budget and supplier evidence before preparing a guided proposal.
4. Prepare the draft. Observe Northlink's immutable quotation version and the exact
   12-unit / 1,920-AZN proposal with explanations and alternatives. A draft has no PO.
5. Review `/workspace/approvals?case=fixture-006`, then open its linked supply case.
   The case's proposal controls create a **simulated approval** and record an explicit
   owner decision/reason. No Telegram message is sent. The approval reserves
   budget and queues continuation; goods have not arrived.
6. From a second terminal in this isolated checkout run
   `npm run demo:worker`. A single acknowledged synthetic PO is created;
   rerunning does not create another PO. This worker does not load a key to infer.
7. In `/workspace/purchaseOrders?case=fixture-006` explicitly receive twelve units, then
   mark the inspection sellable. Incoming/received/pending inspection/sellable allocated
   quantities are separate. A five-plus-seven partial receipt is also supported.
8. Inspect the case activity and customer B's order progress (`/orders/fixture-003`);
   keep the interface in English for portfolio capture. Staff explicitly prepare,
   ship and deliver with synthetic evidence; the customer sees only their own operational
   history. Full receipt does not claim final customer delivery.

Case-scoped audit links the actual proposal, approval, PO, receipt and allocation.
Rejection creates a new draft requiring another decision, never transferred approval.
Switching EN/AZ preserves selected case/form/conversation; evidence text retains its
original language. See [states/recovery](processes.md) and [limitations](limitations.md).

Portfolio screenshots and the short recording use only a separate synthetic checkout;
they are not the frozen paid evaluation or the measured human baseline.
