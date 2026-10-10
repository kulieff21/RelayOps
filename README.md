# RelayOps

Retail and procurement operations for a fictional electronics/IT equipment retailer,
connecting customer demand, verified stock, supplier quotes and human decisions.
English is the original product language; Azerbaijani is a supported locale.

## Current status

The sandbox backend foundation runs locally: role-based sessions, bilingual catalog,
versioned customer consent, transactional reservations/shortage cases, scoped orders,
cancellation, delivery transitions, inspection-controlled returns/exchanges, exact quote
comparison and audit records. Website design and UI have not started.

OpenRouter agents, Telegram approvals, leased workers, purchasing/receipt orchestration
and the full bilingual website are planned. Their database records and architecture are
prepared; there are no live integration results or measured AI gains.

See the [product specification](docs/product-spec.md), [architecture](docs/architecture.md),
[API contracts](docs/api.md) and [verification scope](docs/testing.md).

## Run locally

Use **Node 22.16+ within major 22** and npm. Node 22's SQLite API is experimental and
isolated behind an adapter. No database server or provider credentials are required.

```sh
npm ci
npm run dev
```

The API listens at `http://127.0.0.1:3001`. `/health` and `/api/products?locale=az` are
public. First start migrates and seeds `runtime/relayops-demo.sqlite`. This is an API,
not a website page. The current server is loopback-only.

Optionally copy `.env.example` to `.env` to change the port or frozen business clock.
Fixture time is **2026-10-12 08:00 UTC**, explicitly reported by health; sessions expire
using real time. Integration credentials are neither needed nor consumed yet.

```sh
npm run check       # types, lint, format, tests and production compilation
npm run build
npm start           # compiled API; keep migrations/ beside dist/
npm run smoke       # bounded compiled-server HTTP check; exits afterward
npm run db:migrate
npm run db:seed     # no-op if complete; interrupted seed requires reset
npm run db:reset    # resets only the named sandbox; stop server first
```

On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`. Reset checks
the demo marker and rebuilds the named database tables, without deleting project files.
Local databases, credentials and generated evidence stay out of Git.

## Fictional demo accounts

All accounts use the public synthetic password **`RelayOps-demo-2026!`**. These are local
demo accounts, not production credentials. Login returns an opaque bearer session; use
it in the Authorization header, never URLs.

| Email | Role | Locale |
| --- | --- | --- |
| customer-a@relayops.example | Customer | English |
| customer-b@relayops.example | Customer | Azerbaijani |
| operator@relayops.example | Operator | English |
| purchaser@relayops.example | Purchaser | English |
| owner@relayops.example | Owner | Azerbaijani |

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
