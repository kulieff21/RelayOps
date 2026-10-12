# Sandbox goods receipt and fulfillment

Goods handling is an explicit authenticated operation in the purchasing panel. Nothing
arrives automatically on API/Telegram startup. Purchase creation, supplier events,
receipt, inspection, allocation and dispatch are distinct recorded steps. All supplier
evidence and fulfillment in this product are fictional sandbox records.

## Receipt and inspection

Operators and owners record a positive quantity against an acknowledged PO. The
quantity cannot exceed ordered minus received minus acknowledged cancellations.
An optional serial list must contain exactly one distinct serial per recorded unit;
the same product/serial cannot enter another receipt. An overdelivery is refused:
this UI does not provide a quantity-exception bypass.

Receipt increments physical arrival tracking, reduces incoming supply and persists
a pending inspection. It does not increase sellable product stock. An operator then
records one immutable inspection outcome and notes for that receipt. Use separate
receipts for groups with different inspection outcomes. Sellable inspection adds one
unique inventory movement; damaged, incomplete and wrong-item groups retain receipt/
inspection evidence outside sellable inventory and escalate remaining demand.

All quantities, evidence, inventory, reservations, notifications and retry results
commit together under an immediate SQLite write transaction. The same actor/key/body
recovers the result; changed payloads conflict. A delivery key reused by a different
actor conflicts rather than becoming a second receipt. Keys represent delivery identity;
operators must retain the original key for uncertain retries. Fresh keys without serials
cannot establish whether two real-world deliveries are the same event.

## Allocation and supported dates

The policy is **linked accepted order first**. Supply is not shared or silently merged
across customer cases. Unneeded inspected quantities remain unallocated retailer stock.
Before allocating, recheck the exact accepted specification, quantity, total, consent
version, destination, partial/substitution flags and deadline. Cancellation prevents
allocation but leaves the supplier obligation and purchased excess intact.

Update the order's unique reservation using only currently free sellable stock.
Expired holds may be reacquired if still free; another order's reservation is never
borrowed. Each receipt has at most one allocation record for its linked line, bounded
by its inspected quantity. Reacquired local stock is separately quantified in audit.

Partial receipts do not complete the customer order. A partial-fulfillment preference
alone does not authorize new batch quantities/dates: no partial shipment is invented.
Only when all accepted units are reserved is a whole-order planned batch saved and
an awaiting-supply order advanced to confirmed. Customer delivery is estimated from
the actual inspection timestamp plus two Baku business days; after actual inspection
there is no need to estimate a further inspection day. A future supplier-delay estimate
uses receipt plus one inspection and two customer-handling business days.

A date beyond the accepted deadline or a previously accepted specific delivery date
requires review; the system does not extend customer consent or claim completion.
Verified allocation closes the procurement case/process, not the customer delivery.
The existing operator processing, shipping and delivery routes require separate evidence
and reserve/revalidate/consume stock once. The parent reaches delivered only after the
whole accepted batch is recorded delivered.

## Supplier delay, cancellation and replanning

Purchasers and owners can record mock supplier events with evidence. Delay must be later
than the original/latest supplier receipt promise and current business time. It records
a revised estimate and review outcome without increasing stock, freeing committed funds
or changing an accepted promise.

Acknowledged cancellation is limited to unreceived, uncancelled quantities. A partial
cancellation releases its exact unit costs, retaining the original declared fees.
Cancelling the entire remaining PO before any receipt releases all remaining committed
funds, including fees. Received obligations remain committed. Cancellation events retain
the released amount and evidence; retries cannot release it again.

Explicit supply review recalculates remaining demand, free case budget and current
quotations. An outstanding PO or pending inspection prevents a competing replacement.
If there is a feasible replacement, prepare a fresh immutable draft/version requiring
a separate human submission/decision. The old executed proposal and decision remain
historical. Missing/infeasible evidence, inadequate remaining budget, elapsed deadlines
or unresolved supplier obligations produce a recorded escalation. No automatic paid
inference, Telegram message, alternate purchase or new customer consent occurs.

## Customer-visible evidence

Authenticated order progress exposes reserved quantity, undelivered quantity, saved
batches, a filtered operational timeline and in-app updates scoped to that order/customer.
It omits purchasing amounts, supplier raw payloads, integration credentials and private
Telegram identifiers. The existing account/order visibility boundary applies.

Updates use message keys and structured quantities/dates; the original account locale
is saved and EN/AZ labels render in the selected interface language. Shortage, pending
decision, decision outcome, purchasing, receipt pending inspection, allocation, ready,
delay/review, preparation, dispatch, delivery and cancellation report actual recorded
events. Reads/reload/locale changes never mutate records or call a provider.

Migration 009 adds immutable inspection/allocation/supplier evidence and receipt binding
guards without changing applied migration checksums. The named demonstration and original
model ledger are preserved during implementation; receipt QA uses isolated databases.
