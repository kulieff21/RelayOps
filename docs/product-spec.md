# RelayOps product specification

Version: 0.1. Status: implementation contract for the initial sandbox product.

All prices, thresholds, supplier promises and return policies in this document are
fictional demo rules. They are not legal advice, live merchant terms or measured results.

## 1. Retailer identity and catalog (01.02)

The fictional store is **RelayOps Supply**, an electronics and IT equipment retailer
serving individual customers and small organizations. The application/platform remains
named RelayOps. Its catalog supports English and Azerbaijani.

| Category              | Example items                            | Decision-relevant specifications            |
| --------------------- | ---------------------------------------- | ------------------------------------------- |
| Networking            | Managed switches, routers, access points | Ports, speed, management, PoE budget        |
| Computers             | Laptops, mini PCs, workstations          | CPU, RAM, storage, operating-system option  |
| Components            | Memory, SSDs, graphics cards             | Interface, capacity, physical compatibility |
| Storage               | External drives, NAS equipment           | Capacity, interface, bay count              |
| Peripherals           | Monitors, keyboards, docks               | Resolution, connectors, power delivery      |
| Power and accessories | UPS units, adapters, cables              | Power rating, connector, length             |

Seed products use clearly fictional model names and internally consistent specifications.
Product compatibility claims require stored specifications; the assistant must clarify
missing compatibility requirements rather than guess. Serial numbers are recorded for
demo items that need inspection/warranty tracking.

## 2. Roles and access (01.03–01.04)

An account may have multiple business roles, but permissions are checked per action.
An agent is a service actor with explicitly permitted tools, not a business owner.

| Action                                     | Customer | Operator                                | Purchaser              | Owner                   |
| ------------------------------------------ | -------- | --------------------------------------- | ---------------------- | ----------------------- |
| Browse catalog and public availability     | Yes      | Yes                                     | Yes                    | Yes                     |
| View/change a customer's own order         | Own only | All, within order rules                 | Read for linked cases  | All, within order rules |
| Submit cancellation/return/exchange        | Own only | Record on customer behalf with evidence | No                     | Record with evidence    |
| Inspect returns and record goods receipt   | No       | Yes                                     | Read                   | Yes                     |
| Manage supplier and quotation records      | No       | Read relevant records                   | Yes                    | Yes                     |
| Prepare/revise procurement proposals       | No       | Create shortage case                    | Yes                    | Yes                     |
| Approve purchasing up to 1,000 AZN         | No       | No                                      | Yes, subject to budget | Yes, subject to budget  |
| Approve purchasing above 1,000 AZN         | No       | No                                      | No                     | Yes, subject to budget  |
| Change case budget/purchasing policy       | No       | No                                      | No                     | Yes, with audit record  |
| View business audit and cost records       | No       | Operations scope                        | Procurement scope      | Full business scope     |
| Manage business roles and Telegram mapping | No       | No                                      | No                     | Yes                     |

Never authorize an action using a role, identity or account reference supplied by a model.
Customer confirmation is not purchasing approval. Telegram ownership mapping is separate
from GitHub access. The public source repository has only kulieff21 as owner/collaborator.

## 3. Order lifecycle (01.05)

| State                  | Meaning                                                          | Allowed next states                   |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| draft                  | Cart/request has not been confirmed                              | awaiting_supply, confirmed, cancelled |
| awaiting_supply        | Customer agreed to the documented shortage/fulfillment proposal  | confirmed, cancelled                  |
| confirmed              | Full required stock is reserved and sandbox checkout is accepted | processing, cancelled                 |
| processing             | Operator is preparing dispatch                                   | shipped, cancellation_requested       |
| cancellation_requested | Dispatch must be checked before acting                           | cancelled, processing, shipped        |
| shipped                | Dispatch event and quantity recorded                             | delivered                             |
| delivered              | Delivery event recorded                                          | No order-state transition             |
| cancelled              | Order closed and unshipped reservations released                 | No order-state transition             |

Returns and exchanges have their own lifecycle, linked to a delivered order. A delivered
order is not relabelled cancelled/returned. For the initial product, partially fulfilled
orders are represented by explicit fulfillment batches with remaining quantity recorded.
The parent order can reach delivered only when all accepted batches are delivered.
No purchasing approval may advance an order directly to shipped or delivered.

## 4. Customer consent (01.06)

Present a structured summary before order creation or a material order change: product
and specification, quantity, sale total, fulfillment batches and supported delivery dates.
Consent is stored against the exact summary version and authenticated customer.

- A different model/specification requires new consent even if its price is lower.
- Partial shipment requires consent to the batch quantities and dates.
- A changed price, quantity or delivery commitment requires renewed consent.
- Approval of a supplier purchase cannot replace customer consent.
- Switching interface language changes neither consent version nor business meaning.
- Pending requests may capture requirements without creating a binding stock/delivery claim.

## 5. Stock shortages and bulk requests (01.07)

Available quantity equals sellable physical stock minus active reservations. Incoming
purchase orders are shown separately and cannot be advertised as physical availability.
Any request above available quantity creates a shortage; requests of at least 10 units
also enter the bulk-request flow even when current stock is sufficient.

Capture exact product/specification, quantity, latest acceptable delivery date, destination
zone and whether the customer accepts substitution or partial fulfillment. Customer price
limits and the retailer's purchasing budget are separate fields.

Draft cart activity does not reserve stock. After consent to an awaiting-supply proposal,
reserve available units for that order and create a procurement case for the shortage.
The initial awaiting-supply reservation expires after 24 hours unless a valid purchase
order exists before expiry. Once purchasing commits, a dated reservation extension may
be applied within the customer's accepted delivery window and must be audited.

Repeated submissions with the same request key reuse the case. Different customers
retain separate cases even if future purchasing can consolidate their demand. The initial
version does not silently merge their requirements or reserve one item for both.

## 6. Cancellation and reservation release (01.08)

- Draft, awaiting-supply and confirmed orders can be cancelled before processing begins.
- A processing order creates cancellation_requested. The operator must verify dispatch
  state; cancellation is rejected for any quantity already dispatched.
- An approved supplier purchase does not guarantee that the supplier accepts cancellation.
  Cancelling customer demand releases its allocation but does not erase the purchase order.
- Purchased excess remains retailer inventory and is visible as unallocated supply.
- Release the applicable reservations once, transactionally with cancellation.
- Expire uncommitted awaiting-supply reservations after 24 hours; recheck availability
  before resuming a case whose reservations expired.
- Expire an ordinary unconfirmed checkout reservation after 15 minutes.
- Record who cancelled, the reason and any remaining purchasing obligation.

## 7. Return/exchange and inspection (01.09)

Sandbox policy: a return/exchange request is eligible within 14 calendar days of the
recorded delivery. Requested quantity cannot exceed delivered quantity minus completed
or currently active return quantities. Record reason, item identity where applicable and
customer-requested resolution. A request outside the window is escalated for an owner
exception; no agent silently changes the policy.

Return states: requested, authorized, received, inspected, resolved or rejected.
Rejecting one request cannot remove the original delivery evidence.

- Authorization records eligibility and return instructions; it does not restock an item.
- Receipt records that the item arrived but keeps it outside sellable stock.
- Inspection selects sellable, damaged, incomplete or wrong_item with supporting notes.
- Only an inspected sellable item may increase sellable stock, exactly once.
- Rejected/damaged items remain in a quarantine/disposition record.
- Exchange replacement must satisfy stock/specification rules and customer confirmation.
  If replacement stock is missing, create a linked procurement case.
- Refunds are sandbox ledger events only; duplicate resolution cannot repeat the refund.

## 8. Purchasing budgets and approval routes (01.10)

Default purchasing-case budget: **2,000 AZN**, including all declared charges. The owner
may change a case budget with a reason and audit event; a change does not automatically
approve an existing proposal.

Every purchase requires a human decision. For totals at most 1,000 AZN, an authorized
purchaser or owner may approve. Above 1,000 AZN, only the owner may approve. Over-budget
proposals cannot execute, even after a stale approval. Unsupported/missing charges make
a proposal incomplete rather than assumed zero.

Budget allocation is reserved when a proposal is approved and released if that proposal
expires or becomes invalid before execution. Purchase-order creation atomically converts
the allocation to a purchasing commitment. Receipts do not consume it again. Cancelled
supplier quantities release only the commitment actually acknowledged as cancelled.

## 9. Quotation and time contract (01.11)

Each quotation includes supplier ID, quote/version ID, product/specification, available
quantity, minimum order quantity, unit price, currency, delivery charge, other declared
charges, validity timestamp, supplier dispatch/receipt promise, delivery destination,
availability timestamp and terms/assumptions. Record original evidence with the normalized
fields. Missing required values make the quote ineligible until clarified.

Initial currency: **AZN only**, with amounts stored as integer minor units. Foreign-currency
quotes require an explicit later conversion design; never assume parity or fetch an
unrecorded exchange rate. Store quantities as positive integers. The quote's declared
total is gross for this sandbox; tax-policy calculations are outside the initial product.

Persist timestamps in UTC and display the selected locale in Asia/Baku. The demo business
calendar is Monday–Friday with no holiday adjustments. Store explicit calculated dates;
do not keep recomputing a historical promise from today's relative date.

From supplier receipt, allow one business day for inspection and two business days for
customer dispatch/delivery in the default demo zone. A quote is feasible only if its
calculated customer-delivery date meets the accepted deadline. Date-only customer
deadlines mean the end of that date in Asia/Baku. Changes to these assumptions are versioned.

## 10. Supplier comparison and missing data (01.12)

Filter by exact specification, quantity/minimum order, availability, validity, supported
currency, budget and delivery feasibility. For each option calculate purchase quantity,
excess quantity and the all-in total from validated fields.

Default preference among feasible options: lowest all-in cost, then earliest supported
customer-delivery date, then stable supplier ID for a deterministic tie. An owner can
configure an explicit preference rule; an agent must not invent supplier quality scores.
The agent explains tradeoffs using quote IDs and the deterministic comparison results.

An infeasible cheap quote remains visible with its rejection reason. When no feasible
option exists, propose clarification, customer consent to a new date/specification or
owner escalation. Do not manufacture a supplier offer or bypass a budget.

### Reference shortage case

Fictional SKU: `NET-SW-24G`, RelaySwitch 24G, 24-port managed gigabit switch without PoE.
Customer requests 20 identical units by T+5 business days; physical available stock is 8.
Retail sale price is 229 AZN/unit. The shortage is 12 units; purchasing budget is 2,000 AZN.

| Supplier          | Unit price | MOQ | Stock | Receipt lead      | Delivery fee | Calculated total          | Result                                 |
| ----------------- | ---------- | --- | ----- | ----------------- | ------------ | ------------------------- | -------------------------------------- |
| Northlink Demo    | 155 AZN    | 1   | 30    | T+1 business day  | 60 AZN       | 12 × 155 + 60 = 1,920 AZN | Feasible; customer delivery T+4        |
| ByteHarbor Demo   | 145 AZN    | 1   | 30    | T+3 business days | 40 AZN       | 12 × 145 + 40 = 1,780 AZN | Customer delivery T+6 misses deadline  |
| CircuitDepot Demo | 125 AZN    | 20  | 40    | T+1 business day  | 50 AZN       | 20 × 125 + 50 = 2,550 AZN | Exceeds budget; creates 8 excess units |

All reference offers explicitly declare zero other charges and the same exact product.
They are fictional fixtures, not live prices. Instantiate T and quote expiry from a
controlled fixture clock; reserve the original dates when recording trial evidence.

## 11. Decisions, expiry and revision (01.13)

Proposal states: draft, pending_approval, approved, rejected, expired, superseded,
invalidated and executed. Every submitted version is immutable. An approval request
is tied to one version and expires at the earlier of 24 hours or quote validity.

- Send the approver the specification, quantity, total, deadline, supplier, rationale,
  alternatives and material assumptions in the recipient's preferred language.
- Check authenticated approver mapping, role, threshold and current request state.
- A duplicate decision returns the recorded outcome without repeating effects.
- Conflicting later clicks do not overwrite the first valid decision.
- A rejection records a reason and may generate a revised version or close/escalate the case.
- Quote, supplier, quantity, amount, budget, specification or delivery changes require a
  new approval version if material. Release the invalidated budget reservation.
- After waiting, recheck requirements, reservations, quote and budget before execution.
- Persist waiting state; a restart must not send a new purchase or lose the decision.
- Late Telegram updates return the current expired/superseded status rather than approve it.

## 12. Receipt, allocation and notifications (01.14)

Purchase-order states: created, acknowledged, partially_received, received, cancelled
or failed. Record acknowledged cancellation quantities separately from received quantities.
One approved proposal version can create at most one purchase order.

Goods receipt records purchase order, line, actual quantity, timestamp, inspection and
an idempotency key. Received quantity cannot exceed the remaining ordered quantity without
an explicit operator exception record. Sellable inventory is added after inspection.

Allocate received units first to the linked accepted customer requirements, subject to
their current reservations/consent. For explicitly shared supply, use accepted-request
timestamp and stable order ID as the tie-break; enforce transactional allocation. Partial
receipt does not falsely complete the remaining order quantity.

Localized in-app notifications record shortage acknowledged, proposal awaiting decision,
decision outcome, purchasing confirmed, supply delayed, stock received/allocated and order
ready/shipped/delivered. A notification reports actual state rather than advancing it.
No email/SMS integration is required in the initial product.

## 13. Observable acceptance criteria (01.15)

| ID   | Given/trigger                                        | Required observable outcome                                                         |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AC01 | English is the initial locale                        | Storefront and business UI start in English                                         |
| AC02 | User switches to Azerbaijani                         | UI/assistant locale changes without clearing cart, consent or case                  |
| AC03 | Customer queries an order owned by another account   | Server denies access and discloses no order data                                    |
| AC04 | Agent supplies owner identity/role in tool arguments | Server derives permissions from trusted context and rejects escalation              |
| AC05 | Customer drafts a request                            | Inventory remains unreserved until the specified consent/checkout step              |
| AC06 | Two orders compete for the same stock                | Active reservations never exceed sellable stock                                     |
| AC07 | The reference 20-unit request is accepted            | Eight units reserved and one linked 12-unit shortage case recorded                  |
| AC08 | Request is retried with the same key                 | No duplicate order, reservation or procurement case                                 |
| AC09 | Reference quotations are compared                    | Northlink selected; ByteHarbor deadline and CircuitDepot budget exclusions recorded |
| AC10 | A required quotation field is missing                | Quote cannot advance to a purchase proposal as if complete                          |
| AC11 | A foreign-currency quote is supplied                 | No assumed conversion; explicit clarification/escalation                            |
| AC12 | A 1,920 AZN proposal is submitted                    | Only a mapped owner can approve it                                                  |
| AC13 | A valid 900 AZN proposal within budget is submitted  | Mapped purchaser or owner may decide; operator cannot                               |
| AC14 | Quote validity is shorter than 24 hours              | Approval request expires with the quote                                             |
| AC15 | Decision is rejected or expires                      | No purchase order or purchasing commitment is created                               |
| AC16 | A Telegram callback is duplicated                    | The existing decision is returned; business action occurs once                      |
| AC17 | Another Telegram user clicks                         | No approval is recorded and no purchase executes                                    |
| AC18 | Price/budget/quantity changes while waiting          | Old approval cannot execute the changed proposal                                    |
| AC19 | Application restarts during approval wait            | Existing pending request and process checkpoint survive                             |
| AC20 | Approval arrives                                     | One purchase order is created after revalidation; stock is not yet received         |
| AC21 | Execution retry follows a successful commit          | Same purchase order returned; budget is not consumed again                          |
| AC22 | Customer cancels after supplier purchase             | Customer allocation released; outstanding supplier obligation remains visible       |
| AC23 | An uncommitted shortage reservation expires          | Units released once and later resume rechecks availability                          |
| AC24 | Only six of twelve purchased units arrive            | Six accepted units added/allocated; six remain outstanding                          |
| AC25 | Goods receipt is submitted twice                     | Sellable stock changes once                                                         |
| AC26 | Substitution or later delivery is proposed           | Customer consent required for the new version                                       |
| AC27 | Return request exceeds eligible delivered quantity   | Request rejected without modifying stock                                            |
| AC28 | Item is authorized/received for return               | It remains outside sellable stock until inspection                                  |
| AC29 | Damaged/wrong item is inspected                      | No sellable restocking or unjustified refund                                        |
| AC30 | Refund/return resolution is retried                  | One sandbox ledger event and one stock effect at most                               |
| AC31 | Supplier text contains instructions to bypass policy | No additional tool permissions or purchasing approval                               |
| AC32 | Provider/tool fails repeatedly                       | Bounded recovery and clear persisted escalation; no infinite paid loop              |
| AC33 | An entire case is reviewed                           | Audit trail reconstructs requirements, tools, proposals, decisions and stock events |
| AC34 | Mock integrations are used                           | UI/evidence identifies mock execution, not a live model or supplier run             |

These define full-product acceptance targets. Implemented sandbox UI/process behavior
and isolated end-to-end verification are in docs/testing.md. Limited live model/Telegram
observations are separate from synthetic supplier/payment/delivery events.

## 14. Scope and integration boundaries (01.16)

Live integrations: configurable OpenRouter calls and a dedicated Telegram bot, once
credentials, recipient mapping and a test budget are supplied. No credentials belong
in source, fixtures, audit screenshots or client bundles.

Sandbox: supplier quotes/acknowledgements, purchases, payments/refunds, deliveries and
inspection events. A visitor mode uses labelled mock integrations without credentials.
No real payment, supplier commitment, live personal customer data or automatic tax
compliance claim is included. Hosted deployment is not assumed by this specification.

The selected stack is in docs/architecture.md and visual direction in docs/design.md.
The recorded experiment used openai/gpt-6-luna with the openai provider, eight cases
and five live repetitions, within a USD 0.50 allocation inside the original USD 1.
See docs/evaluation.md and docs/evaluation-results.md for frozen settings and limitations.
This specification defines intended behavior; verification is recorded separately.
