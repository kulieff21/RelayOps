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
tool-result references; escalation reports a server-selected, not-yet-created handoff.
The website assistant connection, Telegram approvals, leased workers and purchasing/receipt
orchestration are planned. Their database records and architecture are prepared;
adapter connection checks do not measure business-task success or AI gains. The approvals
and assistant surfaces explicitly show their disconnected state. Review screens do
not imply that future purchasing worker execution is already implemented.

See the [product specification](docs/product-spec.md), [architecture](docs/architecture.md),
[API contracts](docs/api.md) and [verification scope](docs/testing.md).
See [visual design](docs/design.md) and [frontend behavior](docs/frontend.md).
See [OpenRouter setup and adapter verification](docs/model-setup.md) for the selected
model, authorized spending policy and explicit paid diagnostic command.
See [tool dispatch and authority](docs/tools.md) and [agent loop](docs/agent-loop.md)
for the implemented server boundaries and their remaining limits.

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
live adapter/agent diagnostics; ordinary server startup and checks do not make inference calls.

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
