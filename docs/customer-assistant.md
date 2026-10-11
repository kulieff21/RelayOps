# Website customer assistant

Phase 10 connects `/assistant` to the durable loop and real sandbox business services.
Account-scoped history, typed evidence, human decisions and handoffs persist in SQLite.
No browser model key or direct provider request is used.

## Modes and requests

The default **Guided demo** needs no credentials, inference or spending ledger. Forms
select actual catalog, quantity-specific delivery, owned order progress, preparation,
cancellation and return/exchange tools. A small EN/AZ vocabulary supports catalog questions
and missing quantity/deadline/specification clarification. It is explicitly deterministic,
not a general natural-language model or automatic fallback from a failed live request.

Set `ASSISTANT_LIVE_ENABLED=true` with a server-side OpenRouter configuration to offer
**Live assistant** as an explicit selection. The adapter verifies fresh metadata and uses
the original shared `runtime/model-budget.sqlite`; no ceiling renewal on restart/reset.
Startup/settings/GET/polling make no inference call. Admission permits one unfinished
website live turn globally, six new live turns per customer/hour, and twenty mock turns
per customer/minute, using wall time. Each turn independently bounds four iterations,
sixty seconds, aggregate token allowances, 512 output tokens and one classified safe retry.
An ambiguous paid request is never replayed.

Strict requests accept a key, selected EN/AZ locale, explicit mode, human message,
optional owned conversation and validated guided action. Identity, roles, system prompts
and arbitrary history cannot be supplied. Fresh bearer authentication derives the actor;
multi-role accounts use customer authority only. Live guided data stays user data.
Preparation/checkpoint/request-key binding commit together before asynchronous execution.
Identical account/key/body recovers the same run; changed content conflicts. Polling never
schedules work. Explicit authenticated resume recovers interrupted work after lease expiry
while preserving original model/mode, committed tools and aggregate limits.

## Evidence and decisions

`searchProducts` returns actual specs, prices and availability. `getDeliveryOptions`
computes quantity-specific local allocation and supported Baku delivery using business
days, without a reservation. Incoming supply is separate; shortage supplier arrival stays
unknown. A requested deadline is not a promise. `getOrderProgress` reads owned orders,
their real shortage statuses and recorded fulfillment promises. Purchasing budgets,
supplier/proposal amounts and private execution traces are omitted.

Model-requested order acceptance/cancellation/return stops at `confirmation_required`.
The website service persists exact action, immutable offer/order snapshot and expiry.
Model-supplied `confirmed=true` creates no business effect. The UI shows quantity, specs,
total, deadline, partial/substitution preferences, allocation and supply conditions;
cancellation/return summaries show the owned order/reason, with return quantity/resolution.
Consent starts unchecked. A separate affirmative button sends only the run-bound decision,
never replacement action arguments.

Fresh authentication/ownership, expiry/version and business policy are checked again at
decision time. Run-specific server idempotency prevents duplicate orders/reservations/
returns. Repeated identical decisions return the stored result; opposing decisions conflict.
Decline changes no business order/stock. Effect, handoff, decision observation and audit
commit together; audit failure rolls back everything. Changed price/specs/allocation need
new consent. Return eligibility enforces delivered quantity and fourteen-day policy;
staff inspection and settlement remain separate from the customer's request.

Confirmed shortages create existing business procurement cases with accepted requirements.
The `procurement_review` handoff links a real case and exact consent snapshot. This is not
purchasing approval, a supplier promise or stock receipt. Escalation and **Request human
help** persist a support reference visible in the conversation. Operators/owners read
selected summaries at `/api/assistant/handoffs`. Notifications/workers remain later phases.

## Website state and verification

History and decisions are server records. Account-scoped browser session storage keeps
selected conversation, draft/form and the exact unconfirmed outgoing request. Its key/body
are saved before fetch; ambiguous delivery exposes **Retry the same request**. GET and
reload never trigger another paid run. Account changes remount the view; one customer's
selected history never becomes another's. Locale changes retain conversation/draft/form;
later turns use the new locale. Original human/model messages keep their original language.
Evidence labels, status, tool progress, dates and failures follow the selected language.

Seventeen unpaid tests cover EN/AZ evidence, identity/downscoping, duplicate recovery,
confirmed-only writes, decline, changed consent, cancellation, return/exchange policy,
shortage handoff, atomic audit rollback, SQLite reopen and mocked live admission.
Browser review uses an isolated in-memory production server and disposable Chrome:
desktop/mobile, draft/form preservation, disabled initial confirmation, real shortage/
cancellation, reload, owned order lookup and account-switch privacy. This is capability
verification, not general semantic/reliability or prompt-injection evaluation.
