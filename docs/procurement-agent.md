# Procurement assistant and purchasing drafts

Phase 11 connects the case-scoped procurement agent to actual accepted requirements,
current supplier quotations, deterministic comparison and immutable purchasing drafts.
Open `/workspace/procurement?case=fixture-006` as purchaser/owner and select **Prepare
purchasing draft**. Guided demo is free/default. Optional live mode uses the existing
OpenRouter adapter and original shared USD 1 ledger; evaluation remains disabled.

## Evidence and tools

Canonical English instructions live in `src/agent/prompts.ts`. The server binds every
tool to an authenticated purchaser/owner, one case, selected locale, expected proposal
version and human-authored revision reason. Authentication refreshes on every call.
Customers/operators cannot prepare proposals, model-supplied identity cannot grant
authority, and supplier evidence/terms remain untrusted data.

The agent reads `getProcurementRequirements`, `getSupplierQuotes`, `compareQuotes`, then
`preparePurchaseProposal`. Requirements use accepted consent specifications, not a mutable
catalog. Order quantity, deadline, destination and partial/substitution preferences must
match accepted consent. Missing/malformed accepted specifications block a proposal.

Purchasing need equals accepted quantity minus delivered quantity and effective active
reservations. Expired reservations do not cover demand; original shortage remains historical.
Unreserved physical stock is visible but never silently allocated. Active purchasing
PO quantities or pending inspections block another draft. Already received/cancelled
obligations still reduce the available case budget without blocking explicit remaining-demand
replanning by themselves. Incoming supply is not physical availability, and no unrelated
cases are merged. Explicit partial receipt/inspection is implemented separately; supply
consolidation is not enabled. See [goods handling](goods-fulfillment.md).

Only the latest quotation per supplier/product pair is considered, including current
supplier capabilities. An incomplete latest quote never falls back to an old offer.
Null fees are unknown, not zero. Deterministic code checks exact accepted specifications,
destination, quote validity, availability/receipt consistency, usable stock, MOQ, all-in
AZN minor-unit cost, remaining budget and supported customer delivery. Unsupported currency
and unstored quality scores do not become eligible through model prose.

Quantity is `max(remaining demand, MOQ)`; excess stays separate from customer demand.
Total includes unit price times quantity plus delivery and all declared fees. Supplier
receipt allows one business day for inspection and two for dispatch/delivery, using the
existing Mon–Fri Baku calendar. Accepted date-only deadlines keep Baku end-of-day semantics.
Feasible offers rank by lowest total, earliest supported delivery and stable supplier ID.

The reference case saves Northlink's 12-unit / 192,000-minor-unit (1,920 AZN) draft.
ByteHarbor's cheaper offer misses the deadline; CircuitDepot's MOQ creates eight excess
units and exceeds the original budget. Excluded alternatives retain quote IDs, versions
and recorded reasons. The model explains calculations; the server selects and computes.

## Versions and human boundary

`Procurement.evidence` captures one coherent SQLite transaction of accepted requirements,
effective reservations/stock, budget, current suppliers, latest immutable quotation records
and calculated alternatives. Its fingerprint must still match during preparation, along
with the exact expected proposal version. The server derives the operation key and computes
selection, quantity, total and expiry. Expiry is the earlier of 24 business-clock hours
and quote validity. The model contributes only a separately labelled explanation.

Migrations 005/006 preserve existing data, make proposal content immutable even in draft
and protect version history against deletion. Applied migration 005 stays unchanged;
the deletion guard is added by 006 for existing databases as well as fresh installs.
Revision inserts version+1, the predecessor reference and a reason. Only a previous draft
becomes superseded; a rejected version and its original human decision remain unchanged.
Pending/approved/executed versions cannot be revised through this service. No prior approval
is copied. Each snapshot retains original supplier evidence, requirements, alternatives,
amounts/dates, EN/AZ deterministic explanations and the original-language agent note/reason.
The business UI selects its locale; future approval recipients can select their configured
locale from the same saved explanations.

Reads preserve stored history while showing effective expired/invalidated status when
expiry or compared evidence changes. Invalidation conservatively includes any compared
quote, supplier record, stock/reservation, consent requirement or budget change. Reads
do not mutate the proposal or reserve anything; a new version requires fresh comparison.

Missing/contradictory requirements or no feasible offer require clarification/human review.
Guided mode cites actual `compareQuotes` with `no_feasible_quote` and creates no proposal.
Its `handoff.not_created` describes a review destination, not a sent message or invented
ticket. The comparison UI retains rejection reasons for staff correction or new consent.

A draft needs a separate human purchasing decision. Phase 11 creates no approval request,
Telegram message, budget allocation, purchase order, goods receipt or customer fulfillment
promise. Those workflows remain later phases. Agent completion ends its turn, not a business
process, and prose never proves an executed purchase.

## Durable entry points

All routes require purchaser/owner authentication and an existing bound case:

| Route                                           | Behavior                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET `/api/procurement/:id/agent`                | Draft history, live availability and requesting account's latest turn              |
| POST `/api/procurement/:id/agent`               | Strict mode, locale, key, expectedVersion, nullable revisionReason; HTTP 202/runId |
| GET `/api/procurement/:id/agent/:runId`         | Owned case/run status, selected outcome and saved draft evidence                   |
| POST `/api/procurement/:id/agent/:runId/resume` | Strict `{}`; explicit authenticated recovery or cached terminal result             |

Staff can read case proposal history; another account's run is concealed. Prompts,
transcripts, session tokens and provider IDs stay server-side. Identical account/key/body
returns the same run; changed content conflicts. One unfinished procurement turn owns a
case. Both assistants share one unfinished live-turn admission guard. Per-account limits
are 20 mock turns/minute or six live turns/hour. Live failure never falls back to mock.

Execution bounds: six model iterations, 90 seconds, 128,000 conservative aggregate token
allowance, 1,024 requested output tokens (also capped by adapter configuration), one safe
retry and the existing 16,000-byte context bound. Oversized records stop explicitly,
without truncating evidence. The durable Conversations executor atomically commits draft,
audit, tool result and next checkpoint. Restart resumes the committed cursor without
another draft. Ambiguous interrupted provider calls are never automatically replayed.
A saved draft stays visible if later explanation fails. Terminal execution/request-marker
gaps reconcile without inference. Startup, GET, polling, reload and cached resume do not
start a new live turn.

## Verification scope

Unpaid tests cover reference outcomes, declared charges/MOQ/excess, deterministic ties,
accepted specs, malformed consent, expired reservations, missing/conflicting quotations,
stale evidence, immutable/rejected revisions, roles/cases/privacy, atomic audit/tool rollback
and SQLite reopen. Two independent SQLite writers compete for one version. A real child
exits after draft/tool/checkpoint commit and resumes with one draft/audit. Actual OpenRouter
HTTP fixtures exercise all five model/tool steps and an isolated spending guard without
contacting a provider. Shared admission and no fallback after unknown-charge failure are
tested. These checks are not a live procurement benchmark or a general injection guarantee.
