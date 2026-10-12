# RelayOps

Retail and procurement operations for a fictional electronics/IT equipment retailer,
connecting customer demand, verified stock, supplier quotes and human decisions.
English is the original product language; Azerbaijani is a supported locale.

## Current status

The sandbox backend foundation runs locally: role-based sessions, bilingual catalog,
versioned customer consent, transactional reservations/shortage cases, scoped orders,
cancellation, delivery transitions, inspection-controlled returns/exchanges, exact quote
comparison and audit records. The React storefront and operations workspace now run
against those services: animated hardware scenes, six product detail routes, search,
category/availability filters, cart, order confirmation, cancellation and return requests.
Both experiences support English and Azerbaijani, with local fonts and Baku dates.
The workspace supports supplier capabilities and quotation entry with immutable version
history, original evidence, explicit missing data and guarded concurrent edits.
Full case details, linked activity, proposal/decision history, PO/receipt inspection
and model usage reads are available with role-scoped access and honest empty states.
Operators/owners explicitly record full/partial goods receipt and inspection; sellable
stock movements and linked-order allocation commit once. Purchasing staff record mock
supplier delay/cancellation and review replacement drafts without transferring approval.
Customer order details show saved fulfillment dates, operational history and localized
updates. See [goods receipt and fulfillment](docs/goods-fulfillment.md).

The server-side OpenRouter adapter and persistent shared spending guard are implemented.
Typed tool dispatch validates model arguments, rechecks session/role/case scope and
routes allowed calls to deterministic services. Model-requested confirmation,
cancellation and returns produce human-confirmation requests without executing mutations.
The internal observe/action/result loop now feeds typed tool observations back to the
model, stops for human confirmation and preserves separate durable evidence.
Aggregate time/token/iteration limits, classified safe retries and authenticated
conversation checkpoints support restart recovery without replaying committed tools.
An explicitly selected deterministic mock adapter supports unpaid tests and demos.
Explicit completion, clarification and escalation outcomes use strict JSON and validated
tool-result references. The connected `/assistant` website offers account-scoped durable
conversations, real catalog/delivery/order evidence, explicit human confirmations and
persistent support/procurement handoffs. Its free guided demo is the default; optional
live mode uses the existing shared spending guard. Reload and polling never start inference.
The case-scoped procurement assistant reads accepted demand and current quotations,
compares feasible options and saves immutable purchasing drafts with EN/AZ explanations,
alternatives, guarded revisions and durable recovery. Guided mode is free; explicit live
mode shares the original spending guard. Drafts require a separate human purchasing decision.
Durable Telegram/website approvals bind a human decision to one draft, reserve sandbox
budget and queue a persisted continuation. An explicitly started leased polling receiver
sends requested approvals and handles mapped private-chat callbacks. An explicit sandbox
worker creates a unique approved PO/mock acknowledgement or a new rejected-draft revision.
Receipt/inspection/allocation are explicit authenticated operations; an approval does not mean stock arrived. Adapter connection
checks do not measure business-task success or AI gains.

See the [product specification](docs/product-spec.md), [architecture](docs/architecture.md),
[API contracts](docs/api.md) and [verification scope](docs/testing.md).
See [visual design](docs/design.md) and [frontend behavior](docs/frontend.md).
See [OpenRouter setup and adapter verification](docs/model-setup.md) for the selected
model, authorized spending policy and explicit paid diagnostic command.
See [tool dispatch and authority](docs/tools.md) and [agent loop](docs/agent-loop.md)
for the implemented server boundaries and their remaining limits.
See [procurement assistant](docs/procurement-agent.md) for proposal evidence and revisions.
See [Telegram onboarding](docs/telegram-setup.md) for the explicit bot/token/private
recipient setup CLI. Setup does not enable approvals or send messages.
See [Telegram approvals](docs/telegram-approvals.md) for opt-in delivery, simulated
website decisions, recovery limits and the remaining purchasing boundary.
See [sandbox continuation](docs/purchase-continuation.md) for the explicit worker,
unique approved PO, mock supplier acknowledgement and rejection revision.
See [difficult-case verification](docs/difficult-cases.md) for the twenty verified failure
boundaries, adversarial scenarios, audit reconciliation and observed/fixed defects.
See [comparative experiment protocol](docs/evaluation.md) and [recorded comparison results](docs/evaluation-results.md): fixed workflow passed 8/8, live agent 36/40, and assisted human execution 6/8. All recorded arms are complete; the human session deviated from the planned unaided condition. These results do not establish independent human performance or a human productivity gain.

## Run locally

Use **Node 22.16+ within major 22** and npm. Node 22's SQLite API is experimental and
isolated behind an adapter. No database server or provider credentials are required.

```sh
npm ci
npm run dev
```

In a second terminal:

```sh
npm run dev:web
```

Open **http://127.0.0.1:5173/** for the storefront or `/workspace/overview` for operations.
Vite forwards API requests to the local backend on port 3001. The workspace sign-in
offers the synthetic owner account; customer account A has a delivered monitor order.
The frontend contains no model keys, supplier credentials or direct database access.

The API listens at `http://127.0.0.1:3001`. `/health` and `/api/products?locale=az` are
public. First start migrates and seeds `runtime/relayops-demo.sqlite`. The API and
frontend listen on loopback only. If changing the API port, update Vite's local proxy.

Optionally copy `.env.example` to `.env` to change the port or frozen business clock.
Fixture time is **2026-10-12 08:00 UTC**, explicitly reported by health; sessions expire
using real time. Provider credentials are optional and only consumed by explicitly selected
live adapter/agent diagnostics or opt-in website live turns; ordinary server startup and
checks do not make inference calls. Set `ASSISTANT_LIVE_ENABLED=true` with the server-side
key to offer live mode; it does not change the website's default guided mode or renew the
shared USD 1 development allowance. See [customer assistant](docs/customer-assistant.md).

```sh
npm run check       # types, lint, format, tests and production compilation
npm run build       # compiled API + dist/web frontend
npm start           # compiled API; keep migrations/ beside dist/
npm run preview     # production frontend on port 4173; API must be running
npm run smoke       # bounded compiled-server HTTP check; exits afterward
npm run db:migrate
npm run db:seed     # no-op if complete; interrupted seed requires reset
npm run db:reset    # resets only the named sandbox; stop server first
```

On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`. Reset checks
the demo marker and rebuilds the named database tables, without deleting project files.
Local databases, credentials and generated evidence stay out of Git.
The separate `runtime/model-budget.sqlite` spending ledger survives business-demo reset.
Preserve this file across restarts and backups; deleting it discards spending history.

## Fictional demo accounts

All accounts use the public synthetic password **`RelayOps-demo-2026!`**. These are local
demo accounts, not production credentials. Login returns an opaque bearer session; use
it in the Authorization header, never URLs.

| Email                       | Role      | Locale      |
| --------------------------- | --------- | ----------- |
| customer-a@relayops.example | Customer  | English     |
| customer-b@relayops.example | Customer  | Azerbaijani |
| operator@relayops.example   | Operator  | English     |
| purchaser@relayops.example  | Purchaser | English     |
| owner@relayops.example      | Owner     | Azerbaijani |

## Reference case

An accepted order needs 20 RelaySwitch 24G switches by T+5 business days. Eight physical
units are reserved; the case needs 12 more with a 2,000 AZN purchasing budget. Northlink's
1,920 AZN offer meets the deadline; ByteHarbor's cheaper 1,780 AZN offer arrives too late;
CircuitDepot's minimum quantity costs 2,550 AZN and exceeds the budget. A delivered monitor
order supports return/exchange demonstrations.

Comparison is deterministic; no AI has selected or purchased anything. Customer consent
and purchasing approval remain separate. Incoming purchases never count as received
stock. Quotes, refunds, dispatch evidence and inspection are synthetic.

## Publishing

The full product requires a persistent backend for SQLite, agents and Telegram. The
future frontend may be hosted separately, including on GitHub Pages. A self-contained
JavaScript visitor demo can later live in a separate public repo with labelled simulation.
No hosting or extra demo repository has been set up yet.
