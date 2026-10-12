# Frontend behavior and boundaries

The local React application is a real client of the SQLite sandbox API. It does not
fall back to fabricated catalog or business results when the backend is unavailable.
Network failures expose a localized retry state. Build output is `dist/web`.

## Storefront

`/` has three selectable animated product scenes, original SVG hardware renders,
featured equipment, a storage feature and business-order navigation. `/collection`
supports category, search, available-stock filtering and price sorting. Each of the
six products has a deep link at `/product/:id`; browser Back and direct reload work.
Product illustrations are schematic, not manufacturer photos or proofs of industrial design.

The bag persists in local browser storage. It records intent; it never reserves stock.
Each bag line is reviewed and confirmed as a separate one-product order, matching the
current server contract. Quantity, deadline, substitution and partial-delivery preferences
are submitted to a server-generated, versioned offer. The exact amount, allocation,
shortage and supported/unknown delivery are shown before affirmative confirmation.
Retries reuse the same mutation key. Price/stock changes require a fresh summary.

`/account` shows owned orders. `/orders/:id` supports cancellation and delivered-item
return requests. A sellable, inspected exchange is separately reviewed and confirmed
by the customer, with its credit and zero payable amount visible. There is no real
payment, refund, supplier commitment or delivery integration.

## Workspace

`/workspace/:view` contains overview, orders, returns, inventory/movements, procurement,
suppliers, quotations, approvals, purchase orders/receipts, case activity, model usage
and owner-wide audit summaries. The server supplies actual stored state;
the client only displays authorized routes. Operators/owners can record processing,
dispatch/delivery evidence, authorize/receive/inspect returns and resolve simulated refunds.
Purchasers only see procurement-linked orders and purchasing views, not customer returns.

Quotation comparison shows deterministic total, quantity/MOQ excess, delivery timing
and rejection reasons for a selected case, with links to the exact supplier/product version
history. No agent has made that decision. Purchasing execution and approval actions
remain disconnected; their review screens cannot authorize or execute a purchase.
The equipment-help panel opens the connected `/assistant` conversation interface.

`/workspace/suppliers` displays stored equipment categories and the Baku service zone.
Purchasers/owners can add suppliers and edit their names/capabilities. Versions reject
stale edits; operators see a read-only directory. Capability changes are audited and
rechecked during quotation entry and comparison, without changing historical evidence.

`/workspace/quotations` filters by supplier/product through shareable query parameters.
Purchasers/owners record a new quotation or append a revision, with original evidence
and a required revision reason. The form shows the next version and preserves its inputs
when switching EN/AZ. Decimal AZN inputs are parsed directly to integer minor units;
no floating-point rounding is used. Date/time fields explicitly use Baku time.

Blank availability, fees, dates, destination, specs or terms remain unknown. Saving an
incomplete latest version is explicit, and comparison will not fall back to an older
complete offer. Latest, superseded, incomplete and expired versions have distinct labels;
the latest label alone does not establish case feasibility. History preserves every
version's amounts, dates, terms, specs, evidence and reason. Pre-upgrade records with no
recording metadata show an unknown timestamp. Operators can read quotes only for products
linked to open procurement cases. Only purchasers/owners can save changes. Retry keys
prevent duplicates; version conflicts ask the user to reopen and review current data.

## Case and execution record views

`/workspace/procurement?case=:id` opens full requirements and accepted consent,
including the stored specification snapshot, original 8/12 allocation, delivery deadline
and substitution/partial preferences. It shows current physical/available stock,
order reservations, purchasing budget reservations/commitments, safe process state,
fulfillment batches and an integrated activity timeline. Closed cases retain their
history; only open cases expose comparison. Elapsed reservations have a separate
effective status without rewriting the historical stored state during a read.

`/workspace/approvals` reads each stored proposal version, its exact quotation/version,
quantity, AZN total, required approval route, expiry and linked human decision/reason.
Expired pending records retain their stored status with an explicit elapsed warning.
No decision or proposal is invented when its table is empty. Bound submission and human
decision controls connect to the durable website/Telegram approval workflow.

`/workspace/purchaseOrders` reads ordered/received/cancelled/remaining quantities and
all linked receipt inspections, serials and exception reasons. Operators can inspect
these goods-handling records without accessing proposal amounts or decisions.
A recorded receipt is not itself proof of allocation or sellable physical stock.
Explicit sandbox purchasing, goods receipt, inspection and linked-order allocation
services are connected; acknowledgment and physical handling remain separate.

`/workspace/audit?case=:id` follows explicit order, consent, case, proposal, bound quote,
approval, PO, receipt, return, process, run and tool relationships. It includes event
summaries in timestamp/ID order, never arbitrary audit payloads or unrelated
supplier/product-wide activity. Purchasers can inspect integrated cases; owner-wide
activity remains available to owners when no case is selected.

`/workspace/modelUsage` reads run agent/mode/model/status, safe tool names/statuses and
nullable input/output tokens and integer micro-USD costs. Purchasers only see
procurement runs linked to cases; owners see all runs. Mock/live labels remain distinct.
Known-entry subtotals show their coverage; missing records and null costs are unknown,
not zero. USD rendering retains six decimals. Provider request identifiers, tool
arguments/results, checkpoints and credentials stay private. The adapter/executor
is implemented for customer conversations and procurement drafts; purchasing execution and
PO creation remain later stages. Freshly seeded demos have no run, proposal or PO records.

Proposal, purchase, audit and usage case filters use shareable query parameters;
locale changes, reload and browser Back preserve their meaning. The complete panel
is translated into Azerbaijani. These are database-backed read views, not claimed
agent or purchasing workflow completion.

## Locale and accessibility

The case detail includes a guided/live procurement assistant, explicit prepare/revise
controls, a required revision reason, idempotent async polling/resume and saved draft
history. Both EN/AZ explanations cite actual quotations and excluded alternatives.
Locale switches preserve the reason/mode; reload retrieves recorded versions. Original
agent notes/reasons retain their authored language. Reads show effective expired/stale
statuses without changing history. Preparation creates drafts only, not approvals or
purchases. See [procurement assistant](procurement-agent.md).

`/assistant` uses account-scoped durable history and an explicit guided/live selector.
Typed product/delivery/order evidence and run-bound confirmation summaries show actual
records. GET polling and reload never initiate inference; ambiguous sends retain their
original request key/body. Conversation/draft/guided forms survive locale changes and
reload. Original messages keep their original language; labels/evidence/errors follow
selected EN/AZ. Account changes remount the view. See [customer assistant](customer-assistant.md).

English is initial/default. EN/AZ selection persists across reloads. Language changes
preserve cart, session, product route, case query and open-form input. Azerbaijani months
and AZN separators are explicitly formatted so Chromium builds with incomplete CLDR
data do not expose `M10` month placeholders. Business dates use Asia/Baku.

Source and translation are paired typed entries; catalog/spec coverage is tested.
The font cmaps cover `Ə ə ı İ ğ ş ç ö ü`; uppercase schwa uses a local Noto Sans fallback.
Native dialogs contain keyboard focus, support Escape and restore the previous focus.
Visible focus rings, form labels, status/error regions, motion pause and reduced-motion
styles are included. A shared subscription responds to changes in the motion preference
without clearing the app; both MotionConfig and continuous hardware scenes follow it. Sessions stay in session storage; no tokens enter navigation URLs.

## Local operation

The purchasing panel connects explicit full/partial receipt, terminal inspection,
supplier delay/cancellation evidence and supply review. Operator/owner handling controls
are separate from purchaser/owner supplier controls. EN/AZ native dialogs preserve input
on locale changes and reuse the original retry key/body after an uncertain response.
PO acknowledgement never substitutes for receipt or inspection. Customer order details
show persisted supply/fulfillment batches, operational history and localized in-app updates.
An awaiting-supply order does not highlight confirmed in the order stepper. See
[goods handling](goods-fulfillment.md).

Run `npm run dev` and `npm run dev:web` in separate terminals. For the production bundle,
run `npm run build`, then `npm start` and `npm run preview`. SPA hosting must provide a
history fallback and an API proxy to the separately hosted persistent backend. The
default Vite proxy assumes API port 3001. Public deployment has not been configured.
