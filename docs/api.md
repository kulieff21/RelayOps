# Backend contracts

All current operations are sandbox-only. Start with `npm run dev`; health is public.
Successful API responses use `{ "data": ... }`; `/health` returns its status object directly. Errors use
`{ "error": { "code": "STABLE_CODE", "correlationId": "server-request-id" } }`.
Amounts are integer AZN minor units (192000 means 1,920 AZN); quantities are positive
integers, timestamps UTC, date-only deadlines end at 23:59:59.999 Asia/Baku.

Login with a fixture account using JSON email/password. Use the returned opaque token
in `Authorization: Bearer TOKEN`. Identities/roles cannot be specified in mutation bodies.
Authenticated mutation contracts are strict; extra fields and invalid types fail with 400.
Read queries are scoped by the server actor. Never send a session in a URL.

| Method/path                            | Request                                                                                     | Result / authority                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/health`                          | None                                                                                        | Sandbox status, integration status, frozen business clock                                                                                   |
| POST `/api/auth/login`                 | email, password                                                                             | token, expiry, account roles/locale                                                                                                         |
| GET `/api/auth/me`                     | Session                                                                                     | Current account                                                                                                                             |
| POST `/api/auth/logout`                | Session                                                                                     | Session removed                                                                                                                             |
| GET `/api/products`                    | q, locale=en/az                                                                             | Localized catalog, specs, physical availability and separate incoming                                                                       |
| GET `/api/orders`                      | Session                                                                                     | Own orders; operator/owner all; purchaser only procurement-linked orders                                                                    |
| GET `/api/returns`                     | Session                                                                                     | Own returns; operator/owner all; purchaser forbidden                                                                                        |
| GET `/api/workspace`                   | Staff session                                                                               | Actor-scoped operations read model with inventory/movements; purchasing-only cases/suppliers/approval summaries; owner-only audit summaries |
| POST `/api/order-offers`               | productId, quantity, deadline=YYYY-MM-DD, destination=baku, allowSubstitution, allowPartial | Customer-only versioned summary; does not reserve                                                                                           |
| POST `/api/orders`                     | offerId, version=1, confirmed=true, key                                                     | Customer-only exact consent, transactional reservation and linked shortage                                                                  |
| GET `/api/orders/:id`                  | Session                                                                                     | Own order; staff subject to scope                                                                                                           |
| POST `/api/orders/:id/cancel`          | reason, key                                                                                 | Customer/operator/owner; dispatch rules enforced                                                                                            |
| POST `/api/orders/:id/transition`      | status, evidence, key                                                                       | Operator/owner; allowed state graph and stock recheck                                                                                       |
| POST `/api/returns`                    | orderId, quantity, reason, resolution=refund/exchange, key                                  | Own delivered items within policy                                                                                                           |
| POST `/api/returns/:id/transition`     | status=authorized/received/rejected, notes, key                                             | Operator/owner; never restocks                                                                                                              |
| POST `/api/returns/:id/inspect`        | outcome=sellable/damaged/incomplete/wrong_item, notes, key                                  | Operator/owner; sellable restocks once, failed inspection quarantines                                                                       |
| POST `/api/returns/:id/resolve`        | key                                                                                         | Operator/owner; inspected sellable refund once; exchange needs confirmation                                                                 |
| POST `/api/returns/:id/exchange-offer` | deadline                                                                                    | Customer-only same-product replacement offer; consent still required                                                                        |
| GET `/api/procurement/:id/comparison`  | Session                                                                                     | Purchaser/owner; deterministic feasible options/rejection reasons                                                                           |
| POST `/api/reservations/expire`        | Session                                                                                     | Operator/owner; releases elapsed reservations once                                                                                          |

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
There is no approval/PO execution endpoint yet. Policy helpers are not human decisions.

The foundation accepts one product line and one full shipment per order. The schema
supports future multiple lines/batches; route and service support is intentionally
deferred. Exchanges are the exact same SKU at the original unit price; changed prices
need review. A confirmed exchange order has zero payable total and an explicit credit
in its consent summary. No real payment/refund processor is connected.

Types and validation source: `src/shared/contracts.ts`; inferred service results preserve
their TypeScript structure. `toolSchemas` exports the future agent JSON schemas with
strict inputs and role metadata. API error codes are translated by the bilingual UI; raw
exceptions, passwords, tokens and database paths are not included in error responses.
