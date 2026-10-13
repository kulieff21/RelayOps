# Known limitations and real integration requirements

RelayOps is a local portfolio sandbox, not a deployed retailer or production procurement
system. Business policies are deterministic; AI may inspect evidence/select tools and
prepare a draft, while explicit humans and authenticated services authorize effects.

- SQLite is a synchronous single-writer database on persistent local disk. The suite
  tests bounded transaction/concurrency/crash behavior, not high-volume distributed load.
  Node 22's built-in SQLite API is experimental. No multi-instance hosting is verified.
- The UI/server listen on loopback. Known fixture passwords, bearer sessions retained
  in sessionStorage and synthetic accounts are for demonstrations. Public operation
  needs HTTPS, reviewed authentication/session protection, demo isolation, rate limits,
  backups/restore and persistence/monitoring appropriate to its threat model.
- Supplier acknowledgement, delay/cancellation, payment/refund, inspection and delivery
  evidence are synthetic. Real use needs supplier APIs/contracts, payment reconciliation,
  verified goods-handling inputs and actual shipping integrations. Approval is neither
  physical receipt nor a real external financial commitment.
- Telegram supports an explicitly mapped private owner and opt-in long polling. One
  operator-owned live English approval was observed; no production webhook/tunnel or
  unrestricted chat/role provisioning is implemented. Ambiguous sends may require
  website review. External notifications are Telegram approvals; customer updates are
  in-app. Visitor mode never sends Telegram messages.
- Guided assistants are deliberately bounded scripts using real sandbox services,
  not live model reasoning. Live mode requires a server-side provider key, verified
  capabilities/pricing, explicit opt-in and persistent spending admission. No silent
  fallback converts a failed live result into guided success.
- The eight-case frozen experiment recorded fixed 8/8, live 36/40 and assisted human
  6/8. Forty live runs repeat eight purposively chosen cases. Human coaching, exposure,
  learning, one participant and interface effects prevent unaided-performance or causal
  labor-savings conclusions. Provider output/evidence/context failures are retained;
  task success does not measure every explanatory sentence. All supplier/owner waiting
  events are simulated. See [actual results](evaluation-results.md).
- The stored trial configuration capped output at 512 tokens. Changing that or model/
  tools after completion requires a separately identified experiment; it cannot repair
  original results. Frozen execution/evidence stays private and unchanged. A normal new
  checkout lacks private raw evidence and cannot regenerate the original main report.
- The storefront's bag contains separate one-product orders. Six products, one service
  zone and the selected fixture branches are represented; there is no real CRM/ERP,
  tax/accounting integration or supported arbitrary retail catalog migration.
- Browser verification covers desktop/narrow viewports and controlled motion/error
  fixtures, not every physical device or an accessibility certification. The production
  JavaScript bundle currently emits Vite's >500 kB advisory; build succeeds.

No hosting or extra repository is required by this portfolio phase. Real operation
would need explicit deployment/integration work and separately evaluated reliability,
security and operating costs.
