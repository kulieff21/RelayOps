# Local setup and visitor demo

## One-command credential-free launch

Install **Node 22.16 or later within major 22**, npm and Git. From a fresh checkout:

```sh
git clone https://github.com/kulieff21/RelayOps.git
cd RelayOps
npm run demo
```

On Windows PowerShell, use `npm.cmd run demo` if `npm.ps1` is blocked by execution
policy. The command runs `npm ci`, builds the API and frontend, then serves both at
**http://127.0.0.1:4173**. The first launch requires access to the npm registry; later
launches can use `npm run demo -- --skip-build` with the installed dependencies and
existing production build. Ctrl+C stops the owned server; occupied ports fail without
stopping other processes. To select another port set `DEMO_PORT`, for example:

```powershell
$env:DEMO_PORT = '4187'
npm.cmd run demo -- --skip-build
```

The visitor entry point does **not** load `.env`, construct a live model adapter,
connect to Telegram or start a purchasing worker. Guided assistants use real sandbox
records with deterministic scripted responses; simulated approval is mapped to the
public synthetic owner account in English. It remains a loopback-only sandbox,
including when a shell contains live integration flags. There is no implicit live
fallback and no credential setup is needed. Mock labels remain visible in the UI.

The first start migrates/seeds `runtime/relayops-demo.sqlite`; later starts preserve
all demo changes. Never run two servers against this file for a reset. The frozen
business clock is 2026-10-12 08:00 UTC / 12:00 Baku; sessions and leases use real time.
No container is selected for this local portfolio: Node plus built-in SQLite needs
no database service. Hosting and container persistence are separate future work.

## Development and optional live integrations

```sh
npm ci
npm run dev
# In another terminal:
npm run dev:web
```

API: http://127.0.0.1:3001. UI: http://127.0.0.1:5173. Vite proxies `/api` and
`/health` to 3001. To use a different API port, update its proxy as well. `npm start`
runs the compiled API; `npm run preview` runs the built frontend separately.

Optional configuration: copy `.env.example` to `.env` **only if `.env` is absent**.
Never overwrite existing secrets. Development/API commands explicitly load that file;
the visitor launcher intentionally ignores it. Credentials are server-only, never
`VITE_` values. Ordinary startup does not infer or contact Telegram.

For paid turns follow [model setup](model-setup.md), configure your own OpenRouter
key and spending ceiling, and explicitly enable `ASSISTANT_LIVE_ENABLED=true`.
The website still defaults to guided mode. Preserve `runtime/model-budget.sqlite`;
the existing project's original allowance is shared and never renewed by reset.
The reported experiment is complete; reproducing a new live batch requires a new,
separately identified protocol and explicit budget, not replacement of old records.

For real Telegram messages follow [private onboarding](telegram-setup.md) and
[approval delivery](telegram-approvals.md). Map the intended private owner and locale,
enable the explicit live flag and start `npm run telegram:worker`. Sending an approval
and deciding remain deliberate human actions. `npm run process:worker -- --once`
consumes approved/rejected jobs using synthetic supplier acknowledgement; it performs
no real supplier purchase/payment. Receipt and inspection remain explicit operations.

## Checks and reset

```sh
npm run check
npm run smoke
# Stop all API/demo/workers for THIS checkout before resetting:
npm run db:reset
```

Reset requires the RelayOps demo marker and resets the named **business** database,
including demo conversations/approvals/orders. It never resets the separate model
spending ledger or the retained evaluation artifacts. Make a backup first if demo
changes matter. Do not reset the operator's existing demonstration to follow a tutorial;
use a separate checkout for experiments/screenshots. See [demo walkthrough](demo.md).

## Troubleshooting

| Symptom                                | Action                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unsupported Node / SQLite import error | Use major 22, version 22.16+; run `node --version`.                                        |
| Occupied 4173                          | Choose `DEMO_PORT`; leave unrelated listeners running.                                     |
| Build/dependency failure               | Read the failing command, verify registry/network access and rerun without `--skip-build`. |
| Missing UI build                       | Run the normal demo command or `npm run build`.                                            |
| Development connection error           | Start the API and match the Vite proxy port.                                               |
| Migration checksum mismatch            | Restore the original applied migration; add a new migration for changes.                   |
| Interrupted seed                       | Stop this checkout's processes, back up its data and run its explicit demo reset.          |
| Stale proposal/expired consent         | Re-read current records; prepare a new version and obtain fresh human consent/approval.    |

The documented clean-checkout verification is in [portfolio evidence](portfolio.md).
