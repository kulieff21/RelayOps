# Bilingual end-to-end and visual review

Phase 15 was reviewed on 2026-10-12 using the Codex in-app Chromium browser and
the production frontend bundle. All writes used isolated in-memory databases.
The named demo, saved integration configuration and original model ledger were
preserved. No provider request, real Telegram message, supplier request or payment
was needed for this review.

## Verification matrix

| ID    | Review                             | Observed evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15.01 | English storefront journey         | Home/product navigation, persisted bag, demo sign-in, exact 329-AZN one-monitor offer, unchecked consent gate and successful order details. Catalog filtering, sorting and empty search were also exercised.                                                                                                                                                                                                                                                   |
| 15.02 | Azerbaijani storefront journey     | A separate one-monitor order was confirmed through the AZ checkout. Product descriptions, amounts, dates, order status and progress localized; AZ category/price filtering and empty search passed.                                                                                                                                                                                                                                                            |
| 15.03 | English business operations        | Actual guided procurement draft, proposal evidence and approval boundaries; receipt of five units, sellable inspection and remaining quantity seven. All eleven workspace routes were inspected at desktop width.                                                                                                                                                                                                                                              |
| 15.04 | Azerbaijani business operations    | Simulated purchasing approval, recorded owner decision and reload history; remaining seven-unit receipt and inspection. Both receipt records and twelve inspected units displayed correctly. All eleven workspace routes were inspected at mobile width.                                                                                                                                                                                                       |
| 15.05 | Mid-conversation switching         | The same saved monitor conversation retained its result, tool-backed product and unsent draft across AZ/EN. A subsequent EN turn stayed in that conversation. Procurement revision text and receipt quantity/evidence also survived locale changes. Stored historical prose remains in its original language.                                                                                                                                                  |
| 15.06 | Telegram and website agreement     | Four unpaid EN/AZ approved/rejected cases exercise the actual Telegram adapter with a supplied synthetic transport. Localized buttons, immutable quantity/cost/version, terminal edit and website decision agree. Repeated polling sends once and records one decision.                                                                                                                                                                                        |
| 15.07 | Translation completeness           | Existing catalog/category/spec and EN/AZ tuple coverage passes. Visible product highlights now localize ports, managed operation and CPU cores; model and purchasing notices describe current capabilities.                                                                                                                                                                                                                                                    |
| 15.08 | Storefront layout                  | Desktop and mobile home/product/collection/order views inspected. Final EN/AZ 320-pixel collection has equal document scroll/client widths, including a classic scrollbar. Product glyphs and long descriptions wrap.                                                                                                                                                                                                                                          |
| 15.09 | Business layout                    | EN desktop and AZ mobile overview, orders, returns, inventory, suppliers, quotations, procurement, approvals, purchase orders, audit and model-usage views inspected. Sampled document scroll/client widths agree; wide tables and the mobile workspace navigation scroll inside their own containers.                                                                                                                                                         |
| 15.10 | Text and controls                  | AZ product names, lowercase schwa and uppercase approval headings were inspected. Amount/date formats remain equivalent across locales. The mobile receipt dialog measured 337.2 by 657.8 pixels within a 390 by 844 viewport.                                                                                                                                                                                                                                 |
| 15.11 | Keyboard and mobile interaction    | Tab stays inside the native dialog; Escape closes it and restores the exact invoking control. Mobile menu expansion/collapse, quantity controls, filters, sorting and receipt/inspection controls were activated. Sorting now has an explicit localized accessible name.                                                                                                                                                                                       |
| 15.12 | Loading, empty, failure and motion | Empty catalog/records, initial loading, synthetic HTTP 503, EN/AZ retry and delayed recovery checked. Retry clears its old error before displaying loading. Hero pause removes animated art and pauses all descendants. Explicit reduced-motion fixture exercises the actual preference hook and compiled media rules: no animated hero art, no tilt and 0.01-ms CSS animation duration. A full-page navigation without the fixture restores normal animation. |
| 15.13 | Corrections                        | Localized product highlights, obsolete purchasing/model notices, sort accessible name, 320-pixel body/header overflow and stale retry error corrected; build and relevant browser checks repeated.                                                                                                                                                                                                                                                             |

## End-state checks

`test/bilingual-review.test.ts` runs four EN/AZ approved/rejected chains. Every
case starts from the same isolated seed and creates customer consent through the
authenticated HTTP API. Telegram send/callback/edit use the production adapter
with synthetic HTTP responses; no live transport is invoked.

Approved chains create one twelve-unit purchasing obligation, receive and inspect
five plus seven units, allocate stock, then process, dispatch and deliver all twenty
customer units. Replayed consent, inspection, purchase and delivery calls retain
one effect. Final order status is `delivered`, delivered quantity is twenty and
physical stock is zero. Customer notifications follow the account locale.

Rejected chains retain an awaiting-supply order, eight physical units, zero receipts
and zero purchase orders. Assertions inspect database/service state independently
of assistant prose. Together with the existing suites, the recorded full run passed
244 tests. Types, lint, formatting, production build, public-release scan and
compiled HTTP smoke also passed.

## Reproduce isolated UI review

Use Node 22.16+ within major 22 from the repository root:

```sh
npm ci
npm run build
node --import tsx scripts/review-ui.ts
```

Open `http://127.0.0.1:4315`. The server uses a fresh in-memory seed, the ordinary
production API/frontend, synthetic owner/AZ approval mapping and disabled live
integrations. The demo accounts/password are the ordinary public fixtures.
It never loads `.env` or either named runtime database. Stop it to discard QA data.

To start directly with an acknowledged mock PO and zero receipts:

```sh
node --import tsx scripts/review-ui.ts --purchase
```

The ignored `artifacts/ui/phase15-control.json` accepts `{"fail":true}` to simulate
an API outage, `{"delayMs":5000}` for bounded loading, or `{}` for normal operation.
Only this standalone review server reads that control file. Restart it between
independent scenarios; restarting invalidates its old demo sessions.

`http://127.0.0.1:4315/?__review=reduce` is an explicit test fixture. The embedded
browser does not expose media emulation and did not reflect the bounded Windows
preference change. This review-only HTML supplies a reduced preference to the
actual React hook and activates the compiled reduced-motion CSS media rules.
It does not modify the public application or the OS. Reloading without the query removes
the fixture. The temporary Windows preference probe restored its original value.

Screenshots and recorded measurements stay in ignored `artifacts/ui/`. Review used
1280-pixel desktop, 390-pixel mobile and a 320-pixel narrow viewport. Classic
scrollbars account for 1265/375/305-pixel content widths; document width equality,
not assumed scrollbar size, determines whether horizontal overflow exists.
Mobile activation and keyboard checks do not constitute physical phone or
smartboard testing. Synthetic Telegram checks do not claim a new live AZ delivery
or live-model semantic evaluation. These are bounded sandbox/UI checks.
