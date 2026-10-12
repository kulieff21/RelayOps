# Backend contracts

All current operations are sandbox-only. Start with `npm run dev`; health is public.
Successful API responses use `{ "data": ... }`; `/health` returns its status object directly. Errors use
`{ "error": { "code": "STABLE_CODE", "correlationId": "server-request-id" } }`.
Amounts are integer AZN minor units (192000 means 1,920 AZN); order/MOQ quantities are positive
integers, timestamps UTC, date-only deadlines end at 23:59:59.999 Asia/Baku.

Login with a fixture account using JSON email/password. Use the returned opaque token
in `Authorization: Bearer TOKEN`. Identities/roles cannot be specified in mutation bodies.
Authenticated mutation contracts are strict; extra fields and invalid types fail with 400.
Read queries are scoped by the server actor. Never send a session in a URL.

| Method/path                            | Request                                                                                     | Result / authority                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/health`                          | None                                                                                        | Sandbox status, integration status, frozen business clock                                                                            |
| POST `/api/auth/login`                 | email, password                                                                             | token, expiry, account roles/locale                                                                                                  |
| GET `/api/auth/me`                     | Session                                                                                     | Current account                                                                                                                      |
| POST `/api/auth/logout`                | Session                                                                                     | Session removed                                                                                                                      |
| GET `/api/products`                    | q, locale=en/az                                                                             | Localized catalog, specs, physical availability and separate incoming                                                                |
| GET `/api/orders`                      | Session                                                                                     | Own orders; operator/owner all; purchaser only procurement-linked orders                                                             |
| GET `/api/returns`                     | Session                                                                                     | Own returns; operator/owner all; purchaser forbidden                                                                                 |
| GET `/api/workspace`                   | Staff session                                                                               | Actor-scoped operations read model, real supplier capabilities; purchasing-only cases/approval summaries; owner-only audit summaries |
| GET `/api/suppliers`                   | Staff session                                                                               | Stored names, capability categories/zone, version and update timestamp                                                               |
| POST `/api/suppliers`                  | name, capabilities, expectedVersion=0, key                                                  | Purchaser/owner; creates a supplier and audit event                                                                                  |
| POST `/api/suppliers/:id`              | name, capabilities, expectedVersion, key                                                    | Purchaser/owner; updates only the expected stored version                                                                            |
| GET `/api/quotes`                      | Staff session; optional supplier/product filters                                            | Immutable quotation history; operator scoped to products in open procurement cases                                                   |
| POST `/api/quotes`                     | Quotation fields, expectedVersion, revisionReason, key                                      | Purchaser/owner; appends a version, recording metadata and audit atomically                                                          |
| POST `/api/order-offers`               | productId, quantity, deadline=YYYY-MM-DD, destination=baku, allowSubstitution, allowPartial | Customer-only versioned summary; does not reserve                                                                                    |
| POST `/api/orders`                     | offerId, version=1, confirmed=true, key                                                     | Customer-only exact consent, transactional reservation and linked shortage                                                           |
| GET `/api/orders/:id`                  | Session                                                                                     | Own order; staff subject to scope                                                                                                    |
| POST `/api/orders/:id/cancel`          | reason, key                                                                                 | Customer/operator/owner; dispatch rules enforced                                                                                     |
| POST `/api/orders/:id/transition`      | status, evidence, key                                                                       | Operator/owner; allowed state graph and stock recheck                                                                                |
| POST `/api/returns`                    | orderId, quantity, reason, resolution=refund/exchange, key                                  | Own delivered items within policy                                                                                                    |
| POST `/api/returns/:id/transition`     | status=authorized/received/rejected, notes, key                                             | Operator/owner; never restocks                                                                                                       |
| POST `/api/returns/:id/inspect`        | outcome=sellable/damaged/incomplete/wrong_item, notes, key                                  | Operator/owner; sellable restocks once, failed inspection quarantines                                                                |
| POST `/api/returns/:id/resolve`        | key                                                                                         | Operator/owner; inspected sellable refund once; exchange needs confirmation                                                          |
| POST `/api/returns/:id/exchange-offer` | deadline                                                                                    | Customer-only same-product replacement offer; consent still required                                                                 |
| GET `/api/procurement/:id/comparison`  | Session                                                                                     | Purchaser/owner; deterministic feasible options/rejection reasons                                                                    |
| POST `/api/reservations/expire`        | Session                                                                                     | Operator/owner; releases elapsed reservations once                                                                                   |

Order offers expire in 15 minutes and reserve nothing before acceptance. The current
checkout creates an accepted order immediately after consent; it does not implement
an intermediate payment/checkout stock hold. Shortage orders reserve available units
for 24 hours. Full-stock accepted orders reserve through the accepted deadline and must
revalidate before processing/shipping. Extension after PO commitment and partial shipment
orchestration are future work. For shortages, the summary reports requested deadline
and `pending_supplier_confirmation`, not a guaranteed supply date.

Each mutation's key must be 8–100 characters. Retry identical input with the same key;
reusing it for a different request returns `IDEMPOTENCY_CONFLICT`. Obtaining a new offer
is required after stock/specification/price changed: `NEW_CONSENT_REQUIRED`. A purchaser
cannot approve more than 100000 minor units; over-budget totals always fail policy checks.
The approval endpoints below accept actual human decisions; PO execution remains later.

## Supplier and quotation records

Supplier capabilities are `{categories: [...], zone: "baku"}` with one or more distinct
supported category IDs: networking, computers, components, storage, peripherals, power.
Responses include `id`, `name`, `capabilities`, `version` and nullable `updated_at`.
Version 0 means create; updates require the current positive version. A stale write
returns `SUPPLIER_VERSION_CONFLICT` (409). Purchasers/owners may write; operators read;
customers are denied. Supplier evidence remains data and cannot grant authority.

Quotation bodies require `supplier_id`, `product_id`, `expectedVersion`, `key` and every
field below. Required evidence/reason are nonempty strings. Nullable fields must be
sent explicitly as null when unknown; omitted fields are invalid.

| Field                                    | Type/meaning                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| available                                | Nullable integer 0–10000; confirmed supplier quantity                                         |
| moq                                      | Nullable positive integer; minimum supplier order                                             |
| unit_price, delivery_fee, other_fees     | Nullable nonnegative integer AZN minor units                                                  |
| currency                                 | AZN or null; foreign currency rejected on new entry                                           |
| valid_until, receipt_at, availability_at | Nullable ISO UTC timestamps; expiry, supplier receipt promise, availability-confirmation time |
| destination                              | baku or null                                                                                  |
| specs                                    | Nullable nonempty object of string/number/boolean values; at most 40 bounded keys             |
| terms                                    | Nullable nonempty string, at most 2000 characters                                             |
| evidence                                 | Original supplier evidence, 1–4000 characters                                                 |
| revisionReason                           | Reason for this version, 1–1000 characters                                                    |

`expectedVersion` is the latest version for that supplier/product pair, or 0 for its
first offer. Saving inserts version+1 without updating or deleting any prior row.
Conflicting concurrent/stale saves return `QUOTE_VERSION_CONFLICT` (409). Supplier
categories must include the product category (`SUPPLIER_CAPABILITY_MISMATCH` otherwise).
All effects, immutable recording metadata, audit and retry response share one transaction.

History returns quotation fields with `id`, `version`, `isCurrent`, `status`, `recorded_at`
and `revision_reason`, newest first within each supplier/product pair. Status is current,
superseded, incomplete or expired; current identifies the latest complete/unexpired record,
not its suitability for a particular case. Legacy recording metadata stays null.
Comparison evaluates only the latest pair version and the supplier's current capabilities.
An incomplete latest offer is ineligible even when an older offer was feasible. Unknown
fees are never assumed zero. No stock, budget, purchase order or approval is created by
recording an offer. Shared validation is in `src/shared/purchasing.ts`.

The foundation accepts one product line and one full shipment per order. The schema
supports future multiple lines/batches; route and service support is intentionally
deferred. Exchanges are the exact same SKU at the original unit price; changed prices
need review. A confirmed exchange order has zero payable total and an explicit credit
in its consent summary. No real payment/refund processor is connected.

Types and validation source: `src/shared/contracts.ts`; inferred service results preserve
their TypeScript structure. `toolSchemas` exports strict agent JSON schemas with role
metadata. The server-side ToolDispatcher uses them with session-derived identity and
assistant/case scope; see [tool dispatch](tools.md). No tool-execution HTTP endpoint is
exposed yet. API error codes are translated by the bilingual UI; raw
exceptions, passwords, tokens and database paths are not included in error responses.

## Customer conversations

- GET `/api/assistant/settings`: public; default guided mock mode, live availability and
  frozen business clock. No key, provider request or budget renewal.
- GET `/api/assistant/conversations`: customer-only own conversation summaries.
- GET `/api/assistant/conversations/:id` and `/api/assistant/turns/:id`: owned selected
  history/evidence/status/confirmation/handoff; foreign IDs concealed as not found.
- POST `/api/assistant/turns`: strict key, locale, optional conversation/action and
  mock/live mode; 202 conversation/run IDs. Account/key/body idempotency precedes
  background execution. One unfinished live turn globally; per-account admission limits.
- POST `/api/assistant/turns/:id/resume`: `{locale:"en"|"az"}`; explicit authenticated
  checkpoint recovery. Cached terminal outcomes require no inference.
- POST `/api/assistant/turns/:id/decision`: `{decision:"confirm"|"decline",confirmed:true}`;
  no model arguments, actor or substitute action accepted. Run-bound snapshot/expiry,
  fresh business validation, server idempotency and atomic audit/effect commit.
- POST `/api/assistant/turns/:id/handoff`: strict `{}`; idempotent owned support request.
- GET `/api/assistant/handoffs`: operator/owner selected review references; customer denied.

Contracts live in `src/shared/assistant.ts`; details in [customer assistant](customer-assistant.md).
Full prompts/transcripts/checkpoints/provider IDs/session tokens and procurement budgets
are not exposed by these customer routes. Guided action inputs use the same strict tool
schemas; ordinary business routes remain available and enforce their existing policies.

## Case, purchasing and model-run reads

- GET `/api/procurement/:id`: purchaser/owner; full case requirements, accepted consent
  snapshot, reservations with stored/effective statuses, stock, budget allocations,
  safe process summaries, fulfillment batches and integrated audit summaries.
- GET `/api/procurement/:id/audit`: purchaser/owner; chronological events linked through
  stored case relationships. Private payloads/actor identities are omitted.
- GET `/api/purchasing-records`: staff; proposal versions with their exact quotation,
  approval request/decision plus PO/receipt records. Operators receive PO/receipts only.
- GET `/api/model-runs`: purchaser/owner; safe run/tool/nullable usage fields. Purchasers
  receive only procurement runs with an actual case relationship; owners see all runs.

The last two endpoints accept only the optional `case` query parameter. Unknown fields,
repeated parameters and supplied roles are rejected; missing cases return CASE_NOT_FOUND.
Filtering by case requires purchaser/owner access. Closed cases remain readable.
Elapsed pending proposals/requests are marked without mutating their stored statuses.
No read reserves stock/budget, creates proposals/POs, inspects goods or executes a model.

Read types: `src/shared/operations.ts`. The SQL selects public fields explicitly,
omitting arbitrary snapshots, checkpoints, provider IDs, raw tool inputs/results,
idempotency keys and Telegram mappings. These sandbox lists return the recorded history;
production pagination/large-volume scaling remains a later deployment concern.

## Procurement assistant

- GET `/api/procurement/:id/agent`: purchaser/owner; proposal snapshots/effective status,
  default mock/live availability and the requesting account's latest turn.
- POST `/api/procurement/:id/agent`: strict `{mode:"mock"|"live",locale:"en"|"az",
key,expectedVersion,revisionReason:string|null}`; queues a bounded turn and returns
  HTTP 202 `{runId}`. Identical key/body returns the existing run; changed body conflicts.
- GET `/api/procurement/:id/agent/:runId`: owned case/run status, selected terminal outcome
  and actual saved draft; foreign staff run IDs are concealed.
- POST `/api/procurement/:id/agent/:runId/resume`: strict `{}`; fresh authenticated recovery
  or cached completion without additional inference.

No customer/operator access or model-supplied identity. Human-provided expected version
and revision reason remain server-bound throughout the run. Case history can be read by
other authorized staff; full transcripts, provider IDs, tokens and private configuration
are never returned. Both assistants share live admission; no live fallback to mock.
POST prepares only a proposal draft and audit evidence, never approval/budget/PO/receipt.
GET/poll/reload do not execute inference. See [procurement assistant](procurement-agent.md).

## Purchasing approvals

- GET `/api/procurement/:id/approvals`: purchaser/owner; configured recipient account/locale,
  live availability and safe request/version/mode/delivery/decision/effective status.
- POST `/api/procurement/:id/proposals/:proposalId/approval`: purchaser/owner;
  strict `{mode:"mock"|"live",expectedVersion,key}`. Binds the current valid draft;
  live queues a Telegram message, mock explicitly sends none.
- POST `/api/procurement/:id/approvals/:requestId/decision`: mapped owner only;
  strict `{decision:"approved"|"rejected",reason,key}`. Fresh session, request expiry,
  immutable version and current evidence validation precede the transactional decision.

No supplied actor/recipient/amount/locale or foreign case binding is accepted. Responses
omit bot/user/chat IDs, message IDs, tokens and raw provider errors. GET is read-only.
First valid decision wins across website and Telegram; approval reserves budget and
queues a purchasing job, with no immediate receipt or model call. The separate explicit
sandbox worker consumes it; purchase reads include a labelled mock supplier acknowledgement.
See [Telegram approvals](telegram-approvals.md) for delivery and restart behavior.

## Receipt and fulfillment

- POST `/api/purchase-orders/:id/receipts`: operator/owner; strict
  `{quantity,serials?:string[],evidence,key}`. Records arrival and pending inspection;
  cannot exceed unreceived/uncancelled PO quantity. No sellable-stock effect.
- POST `/api/goods-receipts/:id/inspect`: operator/owner; strict
  `{outcome:"sellable"|"damaged"|"incomplete"|"wrong_item",notes,key}`.
  One terminal inspection; sellable inventory/allocation/order readiness is transactional.
- POST `/api/purchase-orders/:id/supplier-events`: purchaser/owner; strict
  `{kind:"delay",receiptAt,evidence,key}` or `{kind:"cancellation",quantity,evidence,key}`.
  Mock evidence only. Cancellation releases only its acknowledged commitment.
- POST `/api/procurement/:id/replan`: purchaser/owner; strict `{reason,key}`.
  Returns a new draft requiring a new human decision, or a recorded escalation.
- GET `/api/orders/:id/progress`: same order visibility as GET order; reservations,
  whole-order batches, filtered operational timeline and customer-specific in-app updates.

Supplied roles, totals, stock effects and customer IDs are rejected. These routes never
contact a supplier, payment provider or model. Read-only purchasing records now include
inspection notes/time and append-only mock supplier events; operators do not see refunded
budget amounts. See [goods handling](goods-fulfillment.md) for quantity/date/retry policy.
