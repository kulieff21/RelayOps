# Backend verification scope

Run `npm run check`: type-check source, scripts and tests; ESLint; Prettier; Node tests;
production compilation. `npm run smoke` checks the compiled server over real HTTP on
dedicated loopback port 3099 and then stops it. All checks use unpaid fictional records.
CI runs the same check on Node 22.

The foundation suite contains 25 tests covering:

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

The race test uses separate SQLite connections in separate OS processes and inspects
stored effects. The restart test checks persistence; it does **not** demonstrate an
unimplemented approval worker's resumption. The supplier-text check demonstrates that
text cannot change deterministic totals or role policy; no model dispatcher is evaluated.

Full acceptance targets remain in `docs/product-spec.md`. UI switching, Telegram callbacks,
approval/PO execution, worker lease recovery, partial receipts, model limits and live
provider performance are future work. These checks establish backend foundation behavior,
not full deployment readiness or AI-performance improvements.
