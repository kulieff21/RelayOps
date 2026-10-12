import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Modal } from "./Dialogs";
import { useShop } from "./shop";
import { mutationKey, request, ApiError } from "./api";
import { dateTime, translatedCode } from "./i18n";
import { auditName } from "./audit";
import { useData } from "./data";
import { DataState, Status } from "./Orders";
import type { OrderProgress } from "../shared/fulfillment";

export type SupplyAction = {
  kind: "receive" | "inspect" | "delay" | "cancellation" | "replan";
  id: string;
  remaining?: number;
};
const titles = {
  receive: "receiveGoods",
  inspect: "inspectGoods",
  delay: "recordDelay",
  cancellation: "recordSupplierCancellation",
  replan: "replanSupply",
} as const;
export function SupplyDialog({
  action,
  onClose,
}: {
  action: SupplyAction;
  onClose: () => void;
}) {
  const { t, locale, session, refresh, notify } = useShop();
  const [quantity, setQuantity] = useState(action.remaining ?? 1),
    [notes, setNotes] = useState(""),
    [serials, setSerials] = useState("");
  const [outcome, setOutcome] = useState("sellable"),
    [receiptAt, setReceiptAt] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ fingerprint: "", key: mutationKey() });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body =
        action.kind === "receive"
          ? {
              quantity,
              serials: serials
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
              evidence: notes,
            }
          : action.kind === "inspect"
            ? { outcome, notes }
            : action.kind === "delay"
              ? {
                  kind: "delay",
                  receiptAt: new Date(`${receiptAt}:00+04:00`).toISOString(),
                  evidence: notes,
                }
              : action.kind === "cancellation"
                ? { kind: "cancellation", quantity, evidence: notes }
                : { reason: notes };
      const fingerprint = JSON.stringify(body);
      if (
        attempt.current.fingerprint &&
        attempt.current.fingerprint !== fingerprint
      )
        attempt.current.key = mutationKey();
      attempt.current.fingerprint = fingerprint;
      const route =
        action.kind === "receive"
          ? `/api/purchase-orders/${action.id}/receipts`
          : action.kind === "inspect"
            ? `/api/goods-receipts/${action.id}/inspect`
            : action.kind === "replan"
              ? `/api/procurement/${action.id}/replan`
              : `/api/purchase-orders/${action.id}/supplier-events`;
      const result = await request<{ outcome?: string }>(route, session, {
        ...body,
        key: attempt.current.key,
      });
      onClose();
      refresh();
      notify(
        t(
          result.outcome === "escalated"
            ? "replanEscalated"
            : result.outcome === "new_decision_required"
              ? "replanDecisionRequired"
              : "supplySaved",
        ),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "INVALID_INPUT");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label={t(titles[action.kind])} onClose={onClose}>
      <div className="record-editor">
        <h2>{t(titles[action.kind])}</h2>
        <p>{t("receiptBoundary")}</p>
        <form className="stack-form" onSubmit={submit}>
          {(action.kind === "receive" || action.kind === "cancellation") && (
            <label>
              {t("quantity")}
              <input
                type="number"
                min={1}
                max={action.remaining}
                step={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          )}
          {action.kind === "receive" && (
            <label>
              {t("serials")}
              <textarea
                value={serials}
                rows={3}
                maxLength={12000}
                onChange={(e) => setSerials(e.target.value)}
              />
              <small>{t("serialEntryHelp")}</small>
            </label>
          )}
          {action.kind === "inspect" && (
            <label>
              {t("inspection")}
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {(
                  ["sellable", "damaged", "incomplete", "wrong_item"] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {action.kind === "delay" && (
            <label>
              {t("supplierReceiptAt")}
              <input
                type="datetime-local"
                required
                value={receiptAt}
                onChange={(e) => setReceiptAt(e.target.value)}
              />
              <small>{t("bakuTime")}</small>
            </label>
          )}
          <label>
            {t("evidence")}
            <textarea
              required
              rows={3}
              minLength={1}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {translatedCode(locale, error)}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy && <LoaderCircle size={17} className="spinner" />}
            {t("recordAction")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
export function CustomerProgress({ orderId }: { orderId: string }) {
  const { t, locale } = useShop();
  const { data, error } = useData<OrderProgress>(
    `/api/orders/${orderId}/progress`,
  );
  if (!data) return <DataState error={error} />;
  return (
    <section className="customer-progress operation-section">
      <h3>{t("supplyProgress")}</h3>
      <p>
        {t("reservedForOrder")}: <strong>{data.reserved}</strong> ·{" "}
        {t("remainingToDeliver")}: {data.required}
      </p>
      {data.batches.map((batch) => (
        <div className="receipt-record" key={batch.id}>
          <strong>
            {batch.quantity} {t("units")}
          </strong>{" "}
          · <Status value={batch.status} />
          <p>
            {t("supportedDelivery")}: {dateTime(locale, batch.promised_at)}
          </p>
        </div>
      ))}
      {data.notifications.length > 0 && (
        <>
          <h4>{t("notifications")}</h4>
          <ol className="supply-notifications">
            {data.notifications.map((n) => (
              <li key={n.id}>
                <strong>{translatedCode(locale, n.message_key)}</strong>
                {n.parameters.quantity !== undefined && (
                  <span>
                    {t("quantity")}: {n.parameters.quantity}
                  </span>
                )}
                {n.parameters.deliveryAt && (
                  <span>
                    {t(
                      n.message_key === "nSupplyReview"
                        ? "revisedEstimate"
                        : "supportedDelivery",
                    )}
                    : {dateTime(locale, n.parameters.deliveryAt)}
                  </span>
                )}
                {n.parameters.reason && (
                  <span>{translatedCode(locale, n.parameters.reason)}</span>
                )}
                <time>{dateTime(locale, n.created_at)}</time>
              </li>
            ))}
          </ol>
        </>
      )}
      <h4>{t("timeline")}</h4>
      <ol className="supply-notifications">
        {data.timeline.map((row) => (
          <li key={row.id}>
            <strong>{auditName(locale, row.action)}</strong>
            <time>{dateTime(locale, row.created_at)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
