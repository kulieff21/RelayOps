# Storefront and operations workspace

React / TypeScript / Vite supplies the bilingual client. `App` owns routing, locale,
cart and session state; `shop` shares typed context and ordinary deep links. `Storefront`
renders the premium product scenes, search and detail routes; `ProductArt` contains
original hardware illustrations. `Dialogs`, `Orders` and `Workspace` call authenticated
API routes. All mutations are confirmed user actions, never client-side SQL or local
simulated success. Manrope and the Noto Sans uppercase-schwa fallback are bundled locally.
`Purchasing` renders real supplier capabilities, quotation forms and immutable version
history; supplier/product filters are deep links and writes require purchaser/owner roles.

Run the API with `npm run dev`, then `npm run dev:web`. See `docs/frontend.md`,
`docs/design.md` and `docs/api.md` for behavior, limitations and the server boundary.
