# Verification scope

Run `npm run check`: type-check source, scripts and tests; ESLint; Prettier; Node tests;
production API/frontend compilation. `npm run smoke` checks the compiled server over real HTTP on
dedicated loopback port 3099 and then stops it. All checks use unpaid fictional records.
CI runs the same check on Node 22.

The suite contains 38 tests covering:

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
- Migration 001 upgrades to 002 without losing supplier records; repeated migration, checksum tampering and unexpected-table refusal.

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
text cannot change deterministic totals or role policy; no model dispatcher is evaluated.

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
execution, worker lease recovery, partial receipts, model limits and live provider
performance remain future work. Current checks do not establish public deployment
readiness or AI-performance improvements.
