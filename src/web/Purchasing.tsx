import { useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  FileText,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { Link, useShop } from "./shop";
import { Modal } from "./Dialogs";
import { DataState } from "./Orders";
import { useData } from "./data";
import { ApiError, mutationKey, request } from "./api";
import { dateTime, money, translatedCode, type MessageKey } from "./i18n";
import type { Product, Supplier, QuoteRecord, Workspace } from "./types";

const categories = [
  "networking",
  "computers",
  "components",
  "storage",
  "peripherals",
  "power",
] as const;
function FormError({ code }: { code: string }) {
  const { locale } = useShop();
  return code ? (
    <p className="inline-error" role="alert">
      {translatedCode(locale, code)}
    </p>
  ) : null;
}
function SupplierEditor({
  supplier,
  onClose,
}: {
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const { t, session, refresh, notify } = useShop();
  const [name, setName] = useState(supplier?.name ?? "");
  const [selected, setSelected] = useState<string[]>(
    supplier?.capabilities.categories ?? [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(mutationKey());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(
        supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers",
        session,
        {
          name,
          capabilities: { categories: selected, zone: "baku" },
          expectedVersion: supplier?.version ?? 0,
          key: key.current,
        },
      );
      onClose();
      refresh();
      notify(t("supplierSaved"));
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INTERNAL_ERROR");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      onClose={onClose}
      label={t(supplier ? "editSupplier" : "newSupplier")}
    >
      <div className="record-editor">
        <span className="record-editor-icon">
          <Users size={25} />
        </span>
        <h2>{t(supplier ? "editSupplier" : "newSupplier")}</h2>
        <p>{t("supplierEditText")}</p>
        <form className="stack-form" onSubmit={submit}>
          <label>
            {t("supplierName")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <fieldset className="capability-picker">
            <legend>{t("capabilities")}</legend>
            {categories.map((category) => (
              <label className="checkbox-label" key={category}>
                <input
                  type="checkbox"
                  checked={selected.includes(category)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, category]
                        : selected.filter((value) => value !== category),
                    )
                  }
                />
                {t(category)}
              </label>
            ))}
          </fieldset>
          <label>
            {t("destination")}
            <input value={t("baku")} readOnly />
          </label>
          <FormError code={error} />
          <button className="button" disabled={busy || !selected.length}>
            {busy ? (
              <LoaderCircle size={17} className="spinner" />
            ) : (
              <Check size={17} />
            )}{" "}
            {t("saveSupplier")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
export function SupplierDirectory({
  data,
  editable,
}: {
  data: Workspace;
  editable: boolean;
}) {
  const { t } = useShop();
  const [editor, setEditor] = useState<{ supplier: Supplier | null } | null>(
    null,
  );
  return (
    <>
      <div className="record-toolbar">
        <p>{t("supplierDirectoryText")}</p>
        {editable && (
          <button
            className="button button-small"
            onClick={() => setEditor({ supplier: null })}
          >
            <Plus size={17} />
            {t("newSupplier")}
          </button>
        )}
      </div>
      {!editable && <p className="small-muted">{t("readOnlyPurchasing")}</p>}
      <div className="supplier-directory">
        {data.suppliers.map((supplier) => (
          <article className="supplier-record" key={supplier.id}>
            <span className="supplier-avatar">{supplier.name.slice(0, 1)}</span>
            <div className="supplier-record-name">
              <h2>{supplier.name}</h2>
              <span>
                {t("version")} {supplier.version}
              </span>
            </div>
            <div className="supplier-capabilities">
              {supplier.capabilities.categories.map((category) => (
                <span className="spec-chip" key={category}>
                  {t(category)}
                </span>
              ))}
              <span className="badge">{t("baku")}</span>
            </div>
            <div className="record-actions">
              <Link
                to={`/workspace/quotations?supplier=${encodeURIComponent(supplier.id)}`}
                className="text-link"
              >
                {t("viewQuotes")}
                <ArrowUpRight size={16} />
              </Link>
              {editable && (
                <button
                  className="icon-button"
                  aria-label={`${t("editSupplier")}: ${supplier.name}`}
                  onClick={() => setEditor({ supplier })}
                >
                  <Pencil size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
        {!data.suppliers.length && <p>{t("noRecords")}</p>}
      </div>
      {editor && (
        <SupplierEditor
          supplier={editor.supplier}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
const quoteStatus: Record<QuoteRecord["status"], MessageKey> = {
  current: "quoteCurrent",
  superseded: "quoteSuperseded",
  incomplete: "quoteIncomplete",
  expired: "quoteExpired",
};
function QuoteEvidence({ row }: { row: QuoteRecord }) {
  const { t, locale } = useShop();
  const showMoney = (value: number | null) =>
    value === null
      ? t("notProvided")
      : row.currency === "AZN"
        ? money(locale, value)
        : `${(value / 100).toFixed(2)} ${row.currency ?? t("notProvided")}`;
  const showTime = (value: string | null) =>
    value ? dateTime(locale, value) : t("notProvided");
  const fields: [MessageKey, string | number][] = [
    ["unitPrice", showMoney(row.unit_price)],
    ["deliveryFee", showMoney(row.delivery_fee)],
    ["otherFees", showMoney(row.other_fees)],
    ["supplierStock", row.available ?? t("notProvided")],
    ["minimumOrder", row.moq ?? t("notProvided")],
    [
      "destination",
      row.destination === "baku"
        ? t("baku")
        : (row.destination ?? t("notProvided")),
    ],
    ["quoteValidUntil", showTime(row.valid_until)],
    ["supplierReceiptAt", showTime(row.receipt_at)],
    ["availableAt", showTime(row.availability_at)],
  ];
  return (
    <div className="quote-evidence">
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h4>{t("quoteSpecs")}</h4>
      <pre>
        {row.specs ? JSON.stringify(row.specs, null, 2) : t("notProvided")}
      </pre>
      <h4>{t("quoteTerms")}</h4>
      <p>{row.terms ?? t("notProvided")}</p>
      <h4>{t("quoteEvidence")}</h4>
      <blockquote>{row.evidence}</blockquote>
    </div>
  );
}
export function QuotationDirectory({
  data,
  editable,
}: {
  data: Workspace;
  editable: boolean;
}) {
  const { t, locale, products, url, navigate } = useShop();
  const params = new URLSearchParams(url.split("?")[1]);
  const supplier = params.get("supplier") ?? "",
    product = params.get("product") ?? "";
  const query = new URLSearchParams();
  if (supplier) query.set("supplier", supplier);
  if (product) query.set("product", product);
  const { data: quotes, error } = useData<QuoteRecord[]>(
    `/api/quotes${query.size ? `?${query}` : ""}`,
  );
  const [editor, setEditor] = useState<{ base: QuoteRecord | null } | null>(
    null,
  );
  const filter = (key: string, value: string) => {
    if (value) query.set(key, value);
    else query.delete(key);
    navigate(`/workspace/quotations${query.size ? `?${query}` : ""}`);
  };
  const groups = new Map<string, QuoteRecord[]>();
  for (const row of quotes ?? []) {
    const key = `${row.supplier_id}/${row.product_id}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return (
    <>
      <div className="record-toolbar">
        <p>{t("quoteDirectoryText")}</p>
        {editable && (
          <button
            className="button button-small"
            disabled={!data.suppliers.length}
            onClick={() => setEditor({ base: null })}
          >
            <Plus size={17} />
            {t("newQuote")}
          </button>
        )}
      </div>
      {!editable && <p className="small-muted">{t("readOnlyPurchasing")}</p>}
      {!data.suppliers.length && <p>{t("addSupplierFirst")}</p>}
      <div className="record-filters">
        <label>
          {t("supplier")}
          <select
            value={supplier}
            onChange={(e) => filter("supplier", e.target.value)}
          >
            <option value="">{t("allSuppliers")}</option>
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("collection")}
          <select
            value={product}
            onChange={(e) => filter("product", e.target.value)}
          >
            <option value="">{t("all")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!quotes ? (
        <DataState error={error} />
      ) : !quotes.length ? (
        <div className="empty-state">
          <FileText size={34} />
          <p>{t("noQuotes")}</p>
        </div>
      ) : (
        <div className="quotation-directory">
          {[...groups.values()].map((rows) => {
            const current = rows[0]!;
            return (
              <article
                className="quotation-record"
                key={`${current.supplier_id}/${current.product_id}`}
              >
                <div className="quotation-heading">
                  <div>
                    <span>
                      {data.suppliers.find((s) => s.id === current.supplier_id)
                        ?.name ?? current.supplier_id}
                    </span>
                    <h2>
                      {products.find((p) => p.id === current.product_id)
                        ?.name ?? current.product_id}
                    </h2>
                  </div>
                  <span className={`badge quote-status-${current.status}`}>
                    {t(quoteStatus[current.status])} · v{current.version}
                  </span>
                </div>
                <div className="quotation-summary">
                  <div>
                    <span>{t("unitPrice")}</span>
                    <strong>
                      {current.unit_price === null
                        ? t("notProvided")
                        : current.currency === "AZN"
                          ? money(locale, current.unit_price)
                          : t("quoteIncomplete")}
                    </strong>
                  </div>
                  <div>
                    <span>{t("minimumOrder")}</span>
                    <strong>{current.moq ?? "—"}</strong>
                  </div>
                  <div>
                    <span>{t("supplierStock")}</span>
                    <strong>{current.available ?? "—"}</strong>
                  </div>
                  {editable && (
                    <button
                      className="text-link"
                      onClick={() => setEditor({ base: current })}
                    >
                      {t("reviseQuote")}
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
                {current.status === "incomplete" && (
                  <p className="quote-clarification">
                    {t("quoteIncompleteText")}
                  </p>
                )}
                <details className="quote-history">
                  <summary>
                    <History size={16} />
                    {t("versionHistory")} ({rows.length})
                  </summary>
                  <div className="quote-versions">
                    {rows.map((row) => (
                      <section className="quote-version" key={row.id}>
                        <div className="quote-version-heading">
                          <strong>
                            {t("version")} {row.version}
                          </strong>
                          <span className={`badge quote-status-${row.status}`}>
                            {t(quoteStatus[row.status])}
                          </span>
                        </div>
                        <p className="recording-time">
                          {row.recorded_at
                            ? `${t("recordedAt")}: ${dateTime(locale, row.recorded_at)}`
                            : t("recordingUnknown")}
                        </p>
                        {row.revision_reason && (
                          <p className="revision-reason">
                            {row.revision_reason}
                          </p>
                        )}
                        <QuoteEvidence row={row} />
                      </section>
                    ))}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
      {editor && (
        <QuoteEditor
          key={editor.base?.id ?? "new"}
          base={editor.base}
          suppliers={data.suppliers}
          products={products}
          initialSupplier={supplier}
          initialProduct={product}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
export function parseQuoteAmount(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new ApiError("INVALID_QUOTE_AMOUNT");
  const [whole, fraction = ""] = value.trim().split(/[.,]/);
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 100000000)
    throw new ApiError("INVALID_QUOTE_AMOUNT");
  return amount;
}
const amountInput = (value: number | null | undefined) =>
  value == null
    ? ""
    : `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
const timeInput = (value: string | null | undefined) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Baku",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
};
const parseTime = (value: string) =>
  value
    ? new Date(
        `${value.length === 16 ? `${value}:00` : value}+04:00`,
      ).toISOString()
    : null;
type Draft = {
  available: string;
  moq: string;
  unit_price: string;
  delivery_fee: string;
  other_fees: string;
  valid_until: string;
  receipt_at: string;
  availability_at: string;
  destination: string;
  specs: string;
  terms: string;
  evidence: string;
  revisionReason: string;
};
function QuoteEditor({
  base,
  suppliers,
  products,
  initialSupplier,
  initialProduct,
  onClose,
}: {
  base: QuoteRecord | null;
  suppliers: Supplier[];
  products: Product[];
  initialSupplier: string;
  initialProduct: string;
  onClose: () => void;
}) {
  const { t, session, refresh, notify } = useShop();
  const [supplierId, setSupplierId] = useState(
    base?.supplier_id ??
      (suppliers.some((s) => s.id === initialSupplier)
        ? initialSupplier
        : suppliers[0]!.id),
  );
  const supplier = suppliers.find((s) => s.id === supplierId)!;
  const eligible = products.filter((p) =>
    supplier.capabilities.categories.some((c) => c === p.category),
  );
  const [productId, setProductId] = useState(
    base?.product_id ??
      (eligible.some((p) => p.id === initialProduct)
        ? initialProduct
        : (eligible[0]?.id ?? "")),
  );
  const { data: pair, error: pairError } = useData<QuoteRecord[]>(
    `/api/quotes?supplier=${encodeURIComponent(supplierId)}&product=${encodeURIComponent(productId)}`,
  );
  const [draft, setDraft] = useState<Draft>(() => ({
    available: base?.available?.toString() ?? "",
    moq: base?.moq?.toString() ?? "",
    unit_price: amountInput(base?.unit_price),
    delivery_fee: amountInput(base?.delivery_fee),
    other_fees: amountInput(base?.other_fees),
    valid_until: timeInput(base?.valid_until),
    receipt_at: timeInput(base?.receipt_at),
    availability_at: timeInput(base?.availability_at),
    destination: base?.destination ?? "",
    specs: JSON.stringify(
      base?.specs ?? products.find((p) => p.id === productId)?.specs ?? {},
      null,
      2,
    ),
    terms: base?.terms ?? "",
    evidence: base?.evidence ?? "",
    revisionReason: "",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(mutationKey());
  const set = (field: keyof Draft, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  const expectedVersion =
    base?.version ?? Math.max(0, ...(pair ?? []).map((row) => row.version));
  const incomplete = (
    [
      "available",
      "moq",
      "unit_price",
      "delivery_fee",
      "other_fees",
      "valid_until",
      "receipt_at",
      "availability_at",
      "destination",
      "specs",
      "terms",
    ] as const
  ).some((field) => !draft[field].trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let specs = null;
      if (draft.specs.trim()) {
        try {
          specs = JSON.parse(draft.specs);
        } catch {
          throw new ApiError("INVALID_QUOTE_SPECS");
        }
      }
      await request("/api/quotes", session, {
        supplier_id: supplierId,
        product_id: productId,
        expectedVersion,
        available: draft.available.trim() ? Number(draft.available) : null,
        moq: draft.moq.trim() ? Number(draft.moq) : null,
        unit_price: parseQuoteAmount(draft.unit_price),
        currency: "AZN",
        delivery_fee: parseQuoteAmount(draft.delivery_fee),
        other_fees: parseQuoteAmount(draft.other_fees),
        valid_until: parseTime(draft.valid_until),
        receipt_at: parseTime(draft.receipt_at),
        availability_at: parseTime(draft.availability_at),
        destination: draft.destination || null,
        specs,
        terms: draft.terms.trim() || null,
        evidence: draft.evidence,
        revisionReason: draft.revisionReason,
        key: key.current,
      });
      onClose();
      refresh();
      notify(t("quoteSaved"));
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INVALID_INPUT");
    } finally {
      setBusy(false);
    }
  };
  const field = (
    name: keyof Draft,
    label: MessageKey,
    type = "text",
    required = false,
  ) => (
    <label key={name}>
      {t(label)}
      <input
        type={type}
        value={draft[name]}
        onChange={(e) => set(name, e.target.value)}
        required={required}
        {...(type === "number"
          ? { min: name === "moq" ? 1 : 0, max: 10000, step: 1 }
          : type === "datetime-local"
            ? { step: 1 }
            : { maxLength: 30, inputMode: "decimal" as const })}
      />
    </label>
  );
  return (
    <Modal onClose={onClose} wide label={t(base ? "reviseQuote" : "newQuote")}>
      <div className="record-editor quote-editor">
        <span className="record-editor-icon">
          <FileText size={25} />
        </span>
        <h2>
          {t(base ? "reviseQuote" : "newQuote")}{" "}
          {pair && <span className="badge">v{expectedVersion + 1}</span>}
        </h2>
        <p>{t("quoteEntryText")}</p>
        <p className="small-muted">{t("bakuTime")}</p>
        <form className="stack-form" onSubmit={submit}>
          <fieldset className="quote-form-section">
            <legend>{t("supplierEquipment")}</legend>
            <div className="record-form-grid">
              <label>
                {t("supplier")}
                <select
                  disabled={!!base}
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    const next = products.find((p) =>
                      suppliers
                        .find((s) => s.id === e.target.value)!
                        .capabilities.categories.some((c) => c === p.category),
                    );
                    setProductId(next?.id ?? "");
                    set("specs", JSON.stringify(next?.specs ?? {}, null, 2));
                  }}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("collection")}
                <select
                  disabled={!!base}
                  required
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    set(
                      "specs",
                      JSON.stringify(
                        products.find((p) => p.id === e.target.value)?.specs ??
                          {},
                        null,
                        2,
                      ),
                    );
                  }}
                >
                  {base
                    ? products
                        .filter((p) => p.id === productId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))
                    : eligible.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset className="quote-form-section">
            <legend>{t("quotePricing")}</legend>
            <div className="record-form-grid">
              {field("unit_price", "unitPrice")}
              {field("delivery_fee", "deliveryFee")}
              {field("other_fees", "otherFees")}
              <label>
                {t("currency")}
                <input readOnly value="AZN" />
              </label>
            </div>
          </fieldset>
          <fieldset className="quote-form-section">
            <legend>{t("quoteAvailability")}</legend>
            <div className="record-form-grid">
              {field("available", "supplierStock", "number")}
              {field("moq", "minimumOrder", "number")}
              {field("valid_until", "quoteValidUntil", "datetime-local")}
              {field("receipt_at", "supplierReceiptAt", "datetime-local")}
              {field("availability_at", "availableAt", "datetime-local")}
              <label>
                {t("destination")}
                <select
                  value={draft.destination}
                  onChange={(e) => set("destination", e.target.value)}
                >
                  <option value="">{t("notProvided")}</option>
                  <option value="baku">{t("baku")}</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset className="quote-form-section">
            <legend>{t("quoteSource")}</legend>
            <label>
              {t("quoteSpecs")}
              <textarea
                className="spec-input"
                value={draft.specs}
                onChange={(e) => set("specs", e.target.value)}
                rows={4}
                maxLength={10000}
                spellCheck={false}
              />
            </label>
            <label>
              {t("quoteTerms")}
              <textarea
                value={draft.terms}
                onChange={(e) => set("terms", e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </label>
            <label>
              {t("quoteEvidence")}
              <textarea
                value={draft.evidence}
                onChange={(e) => set("evidence", e.target.value)}
                required
                rows={3}
                maxLength={4000}
              />
            </label>
            <label>
              {t("revisionReason")}
              <textarea
                value={draft.revisionReason}
                onChange={(e) => set("revisionReason", e.target.value)}
                required
                rows={2}
                maxLength={1000}
              />
            </label>
          </fieldset>
          <FormError code={error || pairError || ""} />
          <button className="button" disabled={busy || !pair || !productId}>
            {busy ? (
              <LoaderCircle size={17} className="spinner" />
            ) : (
              <Check size={17} />
            )}{" "}
            {t(incomplete ? "saveIncompleteQuote" : "saveQuote")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
