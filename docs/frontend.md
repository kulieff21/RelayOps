# Frontend behavior and boundaries

The local React application is a real client of the SQLite sandbox API. It does not
fall back to fabricated catalog or business results when the backend is unavailable.
Network failures expose a localized retry state. Build output is `dist/web`.

## Storefront

`/` has three selectable animated product scenes, original SVG hardware renders,
featured equipment, a storage feature and business-order navigation. `/collection`
supports category, search, available-stock filtering and price sorting. Each of the
six products has a deep link at `/product/:id`; browser Back and direct reload work.
Product illustrations are schematic, not manufacturer photos or proofs of industrial design.

The bag persists in local browser storage. It records intent; it never reserves stock.
Each bag line is reviewed and confirmed as a separate one-product order, matching the
current server contract. Quantity, deadline, substitution and partial-delivery preferences
are submitted to a server-generated, versioned offer. The exact amount, allocation,
shortage and supported/unknown delivery are shown before affirmative confirmation.
Retries reuse the same mutation key. Price/stock changes require a fresh summary.

`/account` shows owned orders. `/orders/:id` supports cancellation and delivered-item
return requests. A sellable, inspected exchange is separately reviewed and confirmed
by the customer, with its credit and zero payable amount visible. There is no real
payment, refund, supplier commitment or delivery integration.

## Workspace

`/workspace/:view` contains overview, orders, returns, inventory/movements, procurement,
suppliers, approvals and owner audit summaries. The server supplies actual stored state;
the client only displays authorized routes. Operators/owners can record processing,
dispatch/delivery evidence, authorize/receive/inspect returns and resolve simulated refunds.
Purchasers only see procurement-linked orders and purchasing views, not customer returns.

Quotation comparison shows deterministic total, quantity/MOQ excess, delivery timing
and rejection reasons for a selected case. No agent has made that decision. Suppliers
currently list the seeded networking/Baku records. Editable capabilities, quote entry,
quote-version history, full case audit, proposals, PO/receipt workflows and usage views
remain later work. The approvals surface is disconnected; it cannot authorize a purchase.
The equipment-help panel states that the AI assistant has not been connected.

## Locale and accessibility

English is initial/default. EN/AZ selection persists across reloads. Language changes
preserve cart, session, product route, case query and open-form input. Azerbaijani months
and AZN separators are explicitly formatted so Chromium builds with incomplete CLDR
data do not expose `M10` month placeholders. Business dates use Asia/Baku.

Source and translation are paired typed entries; catalog/spec coverage is tested.
The font cmaps cover `Ə ə ı İ ğ ş ç ö ü`; uppercase schwa uses a local Noto Sans fallback.
Native dialogs contain keyboard focus, support Escape and restore the previous focus.
Visible focus rings, form labels, status/error regions, motion pause and reduced-motion
styles are included. Sessions stay in session storage; no tokens enter navigation URLs.

## Local operation

Run `npm run dev` and `npm run dev:web` in separate terminals. For the production bundle,
run `npm run build`, then `npm start` and `npm run preview`. SPA hosting must provide a
history fallback and an API proxy to the separately hosted persistent backend. The
default Vite proxy assumes API port 3001. Public deployment has not been configured.
