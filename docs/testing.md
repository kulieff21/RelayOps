# Verification scope

Run `npm run check`: type-check source, scripts and tests; ESLint; Prettier; Node tests;
production API/frontend compilation. `npm run smoke` checks the compiled server over real HTTP on
dedicated loopback port 3099 and then stops it. All checks use unpaid fictional records.
CI runs the same check on Node 22.

The suite contains 27 tests covering:

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
the pause control was exercised, but OS-level reduced-motion emulation was not performed.
Manual browser review is bounded evidence, not automated coverage of every UI combination.

Full acceptance targets remain in `docs/product-spec.md`. Telegram callbacks, approval/PO
execution, worker lease recovery, partial receipts, model limits and live provider
performance remain future work. Current checks do not establish public deployment
readiness or AI-performance improvements.
