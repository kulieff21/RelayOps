# Retail experience

The agreed direction is an animated premium technology retailer with no white page
background. A product stage, rather than a generic marketing illustration, anchors
the storefront. Product geometry and the catalog specifications remain consistent.

## Shared tokens

| Token     | Value   | Purpose                                     |
| --------- | ------- | ------------------------------------------- |
| Petrol    | #163b43 | Brand, primary actions, deep product scenes |
| Mist      | #e0e4e8 | Main page background                        |
| Lavender  | #d7dae8 | Hero and selected product surfaces          |
| Slate     | #324c56 | Secondary content                           |
| Sea glass | #9fc8bd | Availability and highlights                 |
| Ink       | #142b33 | Text                                        |

Manrope variable is bundled locally, including Latin Extended glyphs; Noto Sans supplies
the absent uppercase U+018F through a narrow local fallback face. The font cmaps were
checked for all Azerbaijani letters. Spacious, left-aligned display typography shares
its family with compact operational tables.
All surfaces use the same container axis. Radius follows hierarchy: rounded product
stages, small control corners, continuous table rows.

## Composition

The homepage opens with a split product scene: large editorial copy and a layered,
floating product render. The product selector sits in normal flow below the scene.
An animated SVG light field inside the monitor and modeled hardware housings give
motion a connection to the actual products. Selecting a product changes geometry,
specifications and purchase destination together. The collection uses six distinct
product renders with independent detail routes. A large storage feature and a
business-order section complete the storefront.

The initial generic black/neon palette was rejected during design review in favor
of petrol, cool mist and lavender, which support metal hardware and long operational
sessions. Animation concentrates on the product stage; cart, dialogs and route
changes explain user actions. Reduced motion disables continuous movement and tilt.

## Navigation and behavior

Storefront: Home, Collection, Business orders, Cart, Account/orders, product detail.
Workspace: Overview, Orders, Returns, Inventory, Procurement, Suppliers, Approvals,
Audit. Server permissions govern each read and action. English is the initial locale;
EN/AZ switching preserves cart, active route and open forms. Dates use Asia/Baku.

Desktop uses a split scene and sidebar workspace; tablet reduces columns; mobile
stacks the hero and keeps the product selector in flow. Dialogs trap keyboard focus,
restore focus on close and support Escape. Live error/status regions communicate
requests. Product artwork is original schematic SVG, not an actual manufacturer image.
AI and Telegram remain visibly disconnected until implemented in subsequent phases.
