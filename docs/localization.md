# English and Azerbaijani maintenance

English is the canonical product/documentation language. Azerbaijani covers the
storefront, workspace, form errors, statuses, assistant controls and customer progress.

`src/web/i18n.ts` defines paired catalogs and the typed `MessageKey`. Add each UI
message to both catalogs and render through `t(...)`; add error/status mappings through
`translatedCode` rather than printing raw internal codes. `src/db/seed.ts` stores paired
product/category descriptions. Domain progress uses structured message keys/quantities;
proposal snapshots save deterministic EN/AZ explanations, separate from original-language
agent notes and supplier evidence. Never translate evidence into a fabricated quotation.

Use selected UI locale for rendering and authenticated server locale for assistant
requests. Telegram uses the explicitly mapped recipient locale. Switching language must
preserve the case/cart, active form inputs and saved conversation; it never submits a
decision. Account locale and interface language need not match.

Format AZN from integer minor units, USD from micro-USD and dates in `Asia/Baku` with
`Intl`/shared formatting helpers. Preserve unknown values as unknown. Check Ə/ə, Ğ/ğ,
İ/ı, Ö/ö, Ş/ş, Ü/ü and Ç/ç in the locally bundled Manrope/Noto Sans fonts.

After changing messages run `npm run typecheck`, the locale/bilingual tests and affected
checks. Review EN/AZ desktop and narrow layouts for wrapping, dialogs, keyboard focus,
locale-switch preservation and translated error/empty states. The existing visual matrix
is in [bilingual review](bilingual-review.md). Raw rationale completeness is a separate
quality question from translating labels or passing a task-success oracle.
