# Verification scope

Run `npm run check`: type-check source, scripts and tests; ESLint; Prettier; Node tests;
production API/frontend compilation. `npm run smoke` checks the compiled server over real HTTP on
dedicated loopback port 3099 and then stops it. All checks use unpaid fictional records.
CI runs the same check on Node 22.

The suite contains 218 tests covering:

- Bilingual fixtures, reference totals and deterministic quote rejection reasons.
- No draft reservation, accepted 8/12 split and duplicate order/case prevention.
- Affirmative/owned/unexpired consent, stale price/stock and idempotency conflicts.
- Customer privacy, purchaser scope and rejection of model-supplied authority.
- Cancellation, dispatch evidence, stock consumption and manual order transitions.
- Reservation expiry and dispatch revalidation.
- Return windows/quantities, inspection-only restocking and quarantined outcomes.
- Exactly one refund/restock and separately confirmed zero-payable exchanges.
- Malformed/foreign-currency/stale quotes, approval thresholds and remaining budgets.
- Baku dates and business days across a UTC/local-day boundary.
- Hashed sessions, real-time expiry, logout, bounded login and safe error envelopes.
- Full fixture-row reproducibility and refusal to migrate/reset foreign environments or unexpected tables.
- Migration checksums, SQL constraints and immutable audit updates.
- Injected transaction failure leaves no partial order, reservation, case or audit.
- Closing/reopening SQLite preserves process checkpoints and reservations.
- Two independent Node processes cannot each reserve 5 of the same 8 switches.
- Customer-owned collection reads, purchaser/operator/owner workspace scope and omitted secret/audit payload fields.
- Complete paired EN/AZ UI entries, fixture category/spec coverage, Azerbaijani separators/months and Baku date boundaries.
- Real supplier capabilities, purchaser/owner writes, operator/customer denial, optimistic supplier versions and idempotent creation/update.
- Immutable quote rows/metadata, retained source evidence, latest-only comparison and rejection of an incomplete latest offer without falling back.
- Strict quotation fields, exact minor-unit amounts, expiry, capability checks and operator product scope.
- Two submissions with the same expected quotation version produce one revision and one conflict.
- Injected quotation-audit failure rolls back the row, recording metadata and retry result together.
- Migrations 001 and 005 upgrade through 006 without losing records or rewriting applied checksums; repeated migration, checksum tampering and unexpected-table refusal.

- Full case consent/specification/quantity data, effective reservation expiry, budget
  allocation totals, closed-case history and non-mutating reads.
- Bound proposal/quotation versions, human decisions, elapsed pending requests, PO
  remaining quantities and receipt inspection/serials without adding physical stock.
- Integrated audit entity/correlation relationships, unrelated-case exclusion and omission
  of arbitrary audit/provider/tool payloads.
- Owner/purchaser/operator/customer HTTP scope, missing cases, repeated/spoofed filters.
- Model-run scope and explicit distinction between null, known zero and partial usage totals.

The race test uses separate SQLite connections in separate OS processes and inspects
stored effects. The restart test checks persistence; it does **not** demonstrate an
unimplemented approval worker's resumption. The supplier-text check demonstrates that
text cannot change deterministic totals or role policy. The dispatcher checks below
exercise explicit model-request boundaries; they do not establish general prompt-injection resistance.

## OpenRouter adapter checks

Fourteen additional unpaid tests inject synthetic HTTP responses into the real adapter.
They cover configurable bounded settings, private-value-free errors, exact provider
capability/pricing checks, credential-free metadata fetch, price/token/routing caps,
strict input/response/tool names, invalid output with independently retained billing,
usage observers before requests and after billing (including invalid replies),
missing versus known-zero cost, rounded small charges, held non-2xx/lost/oversized
responses, no automatic retries and a real deadline abort. Two SQLite connections and
a reopen verify shared reservations; a separate business-demo reset does not touch
the budget ledger. Ceiling increases and observed billing overruns block new calls.

`npm run model:smoke -- --live` is an explicit paid diagnostic outside check/CI. It
performs at most two completion requests and one validated synthetic local probe;
usage and its tool result are persisted separately from prose. This is adapter
verification, not general agent-loop, business-tool or AI-benefit evaluation.
The 2026-10-10 live round trip passed; including two earlier schema diagnostics, four
requests recorded 88 micro-USD total, zero held funds and no business actions. See
[adapter setup/evidence](model-setup.md) for the bounded scope and token counts.

## Tool dispatcher checks

Eleven unpaid tests cover the seven strict tool contracts against real in-memory
business services: adapter-compatible definitions, typed order/summary/quote results,
selected locale, unknown functions, malformed/oversized/spoofed arguments, customer
privacy including multi-role downscoping, trusted case restrictions, session binding,
logout/expiry/role revocation, unexecuted human-confirmation requests, domain failures,
expired consent and audit rollback with sanitized errors. A mocked provider/tool-result
round trip connects the real adapter and dispatcher without a paid call.

These establish the current dispatcher boundaries. Human confirmation/resume UI remains a later task; see [tool dispatch](tools.md).
Named demo records and the USD 1 ledger are preserved.

## Agent loop checks

Eighteen unpaid tests exercise the server-only observe/action/result loop with real
isolated business services. Multiple iterations and sequential batches preserve matching
tool IDs and typed observations. Tests verify locale-controlled instructions, procurement
quote evidence, preparation followed by unexecuted confirmation, cancellation/return
boundaries, corrected argument rejections, own-order/case restrictions, duplicate-call
refusal, inconsistent finish reasons, iteration/context bounds and auth loss during
inference. Empty/truncated replies and provider/internal errors stop without retries;
committed preparation evidence survives later inference failure, audit failure rolls
back, and concurrent invocations do not share transcripts. One unpaid synthetic HTTP
round trip joins the real OpenRouter adapter, loop and catalog dispatcher while keeping
actual fixture usage/known zero cost separate from tool results.

See [agent loop](agent-loop.md). Conversations now persists and resumes internal run traces.
Ten additional outcome tests verify strict completion/clarification/escalation contracts,
successful/rejected/cross-run evidence restrictions, EN/AZ missing-field questions,
server-bound queues without actual handoff creation, no-feasible-quote evidence including
superseded comparisons, malformed/overprivileged outputs, confirmation precedence and
auth loss. The real adapter with synthetic HTTP retains known billing for invalid terminal
JSON without an automatic repair request. Website conversation/UI and broader live
business-task evaluation remain later phases.

## Browser review

The local storefront and workspace were exercised in the Codex in-app Chromium browser
at desktop, 820×1180 tablet and 390×844 mobile viewports. Reviewed homepage/product and
procurement screenshots; checked mobile page width against scroll width and separated
hero copy, stage and selector. Reviewed the compiled Vite preview on port 4173 as well.

Verified selectable product scenes, animation pause, product deep links, catalog search,
cart persistence, EN/AZ persistence across reload, preserved case query/open-form input,
native dialog focus containment, Escape and focus restoration. Submitted a synthetic
mini-PC order through affirmative server consent, confirmed its record and empty bag,
then cancelled it. Requested a delivered-monitor refund; the owner authorized, received,
inspected and resolved it. Inventory showed exactly one +1 return movement. Submitted
the second delivered unit for exchange, completed staff inspection, then confirmed a
separate customer replacement with 329 AZN credit and zero payable total. Prepared a
20-switch bulk offer, checked its 4,580 AZN total and unknown supply-date warning, and
closed it without creating another order. Compared
all three stored quotes, including 1,920 AZN feasible, 1,780 AZN late and 2,550 AZN
over-budget results, in both locales. Generated review screenshots stay in ignored
`artifacts/ui`; manual QA records remain in the named local sandbox until explicit reset.

Font cmaps were checked for Azerbaijani glyphs; uppercase U+018F is supplied by the
local Noto Sans fallback. Reduced-motion CSS and MotionConfig honor the user preference;
the pause control was exercised in the initial review. Native Windows preference
verification and preference-change checks were completed in the later review below.
Manual browser review is bounded evidence, not automated coverage of every UI combination.

Supplier/quotation review exercised actual writes in the same local Chromium sandbox.
Created a fictional storage supplier, revised its capability categories and checked
that EN/AZ switching retained its name and selections. Entered `159,25` AZN with explicit
zero fees and unknown dates, saved it as incomplete, then appended a 158.25 AZN revision.
History retained both prices, original evidence and revision reasons. Recorded a complete
Northlink v2 with unchanged seeded values after exercising the Baku date control; comparison
used v2 and retained the 1,920 AZN reference total. Legacy v1 showed its recording time as
unknown. Followed the supplier/product history deep link from comparison.

Reviewed quotation history and the single-column AZ revision form at 390×844, measured
page/dialog widths for overflow, and checked Escape closing/restoring focus to the revision
button. The operator saw capability records and relevant switch history without edit
controls; the unrelated storage quotation filter returned an empty view. Temporary viewport
overrides were reset. New screenshots and synthetic QA records
remain local; fixture reference totals remain unchanged.

## Completed pre-agent panel review (2026-10-10)

Reviewed current EN/AZ case details on the named local sandbox: 20 requested, 8 reserved,
12 missing, 4,580 AZN accepted sale total, 2,000 AZN purchasing budget, explicit unknown
supply date, preserved consent/preferences, process state and the three linked audit events.
Northlink v2 comparison remained 1,920 AZN. Checked desktop and 390x844 mobile; page
scroll/client widths matched (the native scrollbar reduces content width to 375px).

An isolated in-memory server on a separate loopback port served the production frontend
and real APIs. Populated read fixtures exercised proposal versions, bound quotation IDs,
owner/purchaser approval routes, elapsed pending warnings, recorded decisions, a partial
12-unit PO (3 received, 1 cancelled, 8 remaining), pending/sellable receipts and serials.
These are read fixtures, not results from an approval or purchasing executor. The named
SQLite demo was not reset or populated with these future workflow records.

Reviewed mock/live run labels, unknown model, private payload omission, unknown usage,
known zero, six-decimal USD cost and coverage-labelled subtotals. Case filtering changed
coverage from 1/3 to 1/2 known input/cost records and hid an unrelated customer run.
EN/AZ switching, reload and browser Back preserved the selected case. Reviewed the final
production token/cost table headings after rebuild. Closed-case history remained readable
and did not offer a new quote comparison. Operators saw PO/receipt handling without
financial proposals, decisions, case audit or model routes; purchasers had no return actions.

Manual real HTTP operations against that isolated server exercised accepted ordinary order
creation/retry, operator processing/dispatch/delivery, customer refund request, receipt,
sellable inspection and duplicate refund resolution. Availability returned to its original
5 mini PCs with exactly one return movement; receipt alone did not restock. A separate
100-unit RAM shortage was created then cancelled, and its case/history showed closed with
no active reservation. Owner order/return/inventory/audit views showed those stored effects.

Native Windows Chrome was launched headlessly with a disposable profile solely for the
motion check because the in-app browser did not receive the host Windows preference.
With Windows client-area animation temporarily disabled, actual Chrome reported
prefers-reduced-motion=true, no continuous art class, transform=none and <=0.01ms CSS
animation duration. A shared reactive preference subscription drives MotionConfig and
hardware scenes. A no-preference override plus a viewport refresh in headless Chrome
restored normal art without an app reload. The original Windows preference was restored
and the temporary Chrome/profile closed. This establishes native preference handling;
it is not a claim that the in-app browser inherits host OS settings.

Verified supplier dialog labels, draft/category preservation through language switching,
keyboard focus inside the dialog, visible focus ring and Escape restoration. Temporary
viewport overrides and the isolated server were cleaned up after review. Existing named
sandbox QA records remain. Conversation preservation (06.07) is still dependent on the
Phase 09 conversation implementation; no conversation exists to exercise yet.

Full acceptance targets remain in `docs/product-spec.md`. Telegram callbacks, approval/PO
execution, business-worker lease recovery, partial receipts and live business-task
performance evaluation remain future work. Current checks do not establish public deployment
readiness or AI-performance improvements.

## Phase 09 execution recovery checks

Twenty new unpaid tests verify token admission/aggregate usage/output limits, unknown
token allowances, timeout/late-model behavior, deadline-covered retry backoff, pre-billing
metadata retries, non-retry of ambiguous billable failures, SQLite transient retries
after inner rollback or outer lock failure, exhausted retry stops and atomic rollback
when evidence insertion fails. Three real child-process exits and SQLite reopen checks
verify prepared-offer recovery without duplicate effects/audit, a committed confirmation
stop without skipped calls, and interrupted-model stop without another provider attempt.

Tests also cover concurrent conversation ownership/resume, fresh auth on cached results,
locale/history preservation, server-only session tokens, original mode/model binding,
previous-run evidence rejection, case-scoped staff summaries, deterministic real EN/AZ
mock reads and null token/known-zero cost. Real adapter HTTP fixtures verify known billing
for invalid terminal prose and durable unknown usage/held funds across business reset.
The 001 migration upgrade check now includes 007 and preserves old supplier records.

The explicit agent smoke command verifies the same durable catalog loop, real tool result,
strict completion and cached resume in mock mode before a separately requested paid live
check. It has a read-only tool allowlist, two-call ceiling and no order/stock mutation.
See [model setup](model-setup.md) for the actual bounded live result/cost; it is not
an evaluation of business-process completion, semantic accuracy or AI gains.

## Phase 10 customer assistant checks

Seventeen unpaid tests exercise real business services and authenticated asynchronous
HTTP queue/poll endpoints: identical request recovery/changed-content conflicts, cached
resume without inference, hidden provider/session data, customer/multi-role boundaries,
EN/AZ catalog/specs/quantity delivery, missing-field clarification, explicit consent and
decline, price/stock/spec/version/expiry revalidation, duplicate order/cancel/return effects,
return window/quantity and inspection separation, actual shortage requirements/handoff,
saved support references, audit-failure atomic rollback and SQLite reopen with no replay.
Mocked live requests verify no startup call, global concurrency and hourly admission.

Reviewed the production bundle in disposable headless Chrome against an isolated seeded
in-memory server because the in-app Browser runtime could not start. At 1440×1000 and
390×844, document scroll/client widths matched (1425/1425 and 390/390). EN/AZ switching
preserved the human draft, product, quantity 10, deadline and partial preference, along
with the existing conversation. The affirmative checkbox started unchecked and disabled
confirmation. A confirmed ten-mini-PC order created a real five-unit shortage case; its
stored unknown date, support reference and order state were visible in Azerbaijani and
English. Reload retained two turns and the recorded decision; own-order progress and
confirmed cancellation followed the actual records. Account B showed no A history/draft.
Reduced-motion media was honored and no runtime exception was observed. Screenshots and
QA records stayed local; no named database reset/mutation or provider request in UI review.

This verifies connected capabilities and the sampled UI paths, not general live-model
semantic accuracy, purchasing-worker completion or an evaluation of AI performance gains.

## Phase 11 procurement assistant checks

Twenty-four unpaid procurement tests and one applied-005 upgrade test bring the suite
to 153. They verify the reference 12-unit / 1,920 AZN draft and excluded alternatives,
accepted consent specifications rather than mutable catalog specs, remaining demand,
expired reservations, MOQ/excess, all declared fees, budget/date constraints and stable
cost/delivery/supplier-ID ties. Missing, malformed and contradictory evidence blocks
drafts; an incomplete latest quote never falls back to a historical offer.

Tests check immutable content/history, idempotent retry, stale evidence/version conflicts,
revision reasons, rejected-decision preservation, expiry and pending/approved revision
blocks. Authentication, case/account privacy, revocation and server-bound versions are
exercised through actual services and asynchronous HTTP queue/poll/resume routes. Audit
or tool-evidence failure rolls back all draft effects. Independent OS processes compete
for one SQLite proposal version; another process exits after draft/tool/checkpoint commit
and resumes with exactly one proposal and audit. SQLite reopen and a terminal-marker gap
recover without inference. A later explanatory-model failure preserves the saved draft.

Synthetic HTTP exercises the actual OpenRouter adapter over all five guided model/tool
steps with an isolated budget ledger. Shared customer/procurement live admission and
unknown-charge failure without mock fallback are tested. No real provider request was
made for Phase 11; this is adapter-path verification, not live semantic evaluation.

The production bundle was reviewed in the in-app Browser against an isolated seeded
in-memory server. EN/AZ preparation, reason preservation on locale change, version-2
revision, saved evidence and reload history passed. The old draft became superseded;
authoritative explanations, amount separators and Baku delivery/expiry dates displayed
in both languages. At 1280-pixel desktop and 390×844 mobile widths, document scroll/client
widths matched (1265/1265 and 375/375). Azerbaijani text wrapped without clipping, the logo
loaded and no browser runtime error was observed. Temporary viewport override/tab were
closed; no UI writes touched the named demo. Read-only fingerprints verified original
business/conversation records and the eight-request / 820-micro-USD ledger unchanged.

All 153 tests, types/lint/format/build and compiled HTTP startup passed. Existing migration
005 was preserved byte-for-byte; the deletion guard is a separate 006 migration. Approval
delivery, Telegram callbacks, purchasing/receipt workers and live procurement performance
remain outside these checks. See [procurement assistant](procurement-agent.md).

## Telegram onboarding checks

Ten unpaid tests cover strict token/recipient configuration without leaking inputs,
explicit read-only setup requests, no construction-time calls, refused redirects,
bot/token identity and existing-webhook refusal. Pairing checks reject expired or
wrong-bot sessions, older/foreign nonces, group/bot/edited/forged messages and
ambiguous recipients; repeated messages from the same recipient remain a candidate.
Real SQLite account roles are checked, including owner-role revocation, without
creating approval records. Response size limits cover headers and streamed content;
provider/transport errors and CLI failure output omit credentials and private URLs.

These synthetic HTTP and local process checks do not prove a live Telegram connection,
actual message delivery or approval persistence/recovery. No Telegram request is made
by the ordinary API startup or checks. Each operator must explicitly verify their
bot/token/mapping. See [Telegram onboarding](telegram-setup.md).

## Purchasing approval checks

Nineteen new unpaid tests cover immutable request/summary binding, EN/AZ controls,
strict authenticated HTTP boundaries and hidden Telegram IDs, exact mapped private
callback identity, duplicate/conflicting website decisions, expiry, changed stock and
supplier evidence, owner revocation, mapping changes and atomic audit rollback.
Budget reservation excludes itself during revalidation and is released on invalidation.
Actual adapter HTTP fixtures exercise sending, callbacks, terminal message edits,
offset persistence, uncertain-send recovery without replay, exclusive receiver leases,
three-attempt edit limits and a website decision during an in-flight send.

A pending request survives SQLite close/reopen. A real child process exits after a
decision commit; reopening returns the cached callback and exactly one decision,
budget allocation and continuation job. The 001/005 migration checks preserve old
records/checksums while applying new 007 tables; previous migrations remain unchanged.

The production UI was reviewed in disposable headless Chrome against an isolated
in-memory server after the in-app Browser kernel could not start. At 1280×1000 and
390×844, document scroll/client widths matched (1265/1265 and 390/390). A simulated
pending request preserved its reason across polling and EN/AZ changes. Rejection,
reload, a new guided revision and approval persisted two separate decisions and one
192000-minor-unit allocation, with no purchase order or browser runtime exception.
Real-send controls were disabled in this isolated review. Screenshots remain ignored.

Bot identity and operator mapping were verified separately using explicit live setup;
an operator-owned live EN button approval subsequently recorded one decision and
allocation, delivered message and successful terminal edit. See [Telegram approvals](telegram-approvals.md).

## Sandbox continuation checks

Thirteen unpaid tests validate fresh approved request/decision/owner binding, expiry,
changed inventory/budget/consent, one acknowledged PO, exact reserved-to-committed budget,
unchanged physical stock/order state and zero receipts. Mock acknowledgement is immutable;
simulated failure retains evidence, releases its allocation and excludes incoming supply.
Reservations extend within the accepted deadline; historical executed approvals retain
their purchasing obligation after later expiry or revoked authority.

Rejection creates a new deterministic immutable draft requiring a separate human decision;
no feasible quote escalates. Audit failure rolls back PO, allocation, acknowledgement,
reservation extension and job claim. Active/abandoned/exhausted leases are checked.
A real child process exits after continuation commit and resumes with one completed job;
two independent OS processes compete for one PO without repeating it. Migration 008
preserves existing checksums/records. Separate receipt/fulfillment checks follow below.

The production PO view was reviewed in disposable headless Chrome against an isolated
server at 1280×1000 and 390×844. EN/AZ mock supplier disclosure, acknowledged quantity 12,
received quantity zero, committed budget and reload passed, with matching document
scroll/client widths (1265/1265 and 390/390) and no runtime exception.

## Goods receipt and fulfillment checks

Twenty-three unpaid checks exercise full and partial receipt, pending/terminal inspection,
exactly-once inventory and linked-order allocation, retained damaged/incomplete/wrong-item
evidence, quantity/serial rejection and global delivery-key conflict. Audit failure rolls
back receipt quantities, inspection, stock, allocation, notifications, readiness and retry
records together. Expired holds reacquire only free stock; competing accepted orders retain
their units. Cancelled customers leave supply unallocated and purchasing obligations intact.

Late inspection and changed accepted requirements preserve actual inspected inventory but
block allocation/new promises. Supplier delay saves a reviewed estimate; partial cancellation
releases unit costs while retaining fees. Full pre-receipt cancellation releases the remaining
commitment and creates a new valid draft requiring a fresh human decision. That decision can
create a separate replacement PO while retaining the old cancelled PO/executed decision.
Insufficient remaining budget or an unresolved PO escalates without purchasing again.

HTTP checks verify role denials, revoked sessions/roles, strict arguments and foreign customer
progress concealment. Notification locale and replay deduplication are checked. An isolated
customer HTTP offer/consent creates the 20-unit order and 12-unit shortage; real services then
compare, approve, purchase, receive, inspect, allocate, prepare, ship and deliver all 20 units.
Database final state and one dispatch/receipt effect verify the outcome independently of
model prose. The timeline records receipt before inspection before allocation before ready.

A pending receipt survives reopening; a real process exits immediately after inspection commit
and resumes the same key with one stock/allocation effect. Two independent OS inspectors racing
on the same receipt also preserve one effect. Migration 009 preserves earlier checksums;
full-fixture reset reproduction includes stable notification IDs. All 218 tests, types, lint,
format, API/frontend production build and compiled HTTP startup passed.

The production bundle was reviewed in the in-app Browser against an isolated in-memory server.
EN/AZ full quantities, 5+7 partial arrivals/inspection, notes preserved across locale changes,
customer readiness/date/updates, reload and original-language evidence passed. At 1280×1000
and 390×844, scroll/client widths matched (1265/1265 and 375/375); the mobile receipt dialog
fit within the viewport, Azerbaijani labels wrapped and no browser error was observed.
The original named database retains one acknowledged PO and zero receipts; all QA writes
were isolated. No paid request, supplier network, payment or Telegram message was made.
