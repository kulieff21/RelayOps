import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, MessageSquare, Plus, Send } from "lucide-react";
import type {
  AssistantConversation,
  AssistantEvidence,
  AssistantRequest,
  AssistantSettings,
  AssistantTurn,
  ConfirmationView,
  ConversationSummary,
  GuidedAction,
} from "../shared/assistant";
import { ApiError, mutationKey, readSaved, request, save } from "./api";
import { Link, useShop } from "./shop";
import { SignInPage, Status } from "./Orders";
import { ProductArt } from "./ProductArt";
import {
  date,
  dateTime,
  money,
  messages,
  translatedCode,
  type MessageKey,
} from "./i18n";
import { useData } from "./data";
import type { Order, Product } from "./types";

const actionLabels = {
  searchProducts: "aSearch",
  getDeliveryOptions: "aDelivery",
  prepareOrder: "aPrepare",
  getOrderProgress: "aProgress",
  cancelOrder: "aCancel",
  requestReturn: "aReturn",
} as const;
const codeOf = (error: unknown) =>
  error instanceof ApiError ? error.code : "CONNECTION_ERROR";

function Specs({ specs }: { specs: Record<string, unknown> }) {
  const { t, locale } = useShop();
  return (
    <dl className="assistant-specs">
      {Object.entries(specs).map(([key, value]) => (
        <div key={key}>
          <dt>{key in messages ? t(key as MessageKey) : key}</dt>
          <dd>
            {typeof value === "boolean"
              ? t(value ? "yes" : "no")
              : value === "none"
                ? t("none")
                : value === "Demo six-core"
                  ? locale === "az"
                    ? "Demo altı nüvəli"
                    : value
                  : Array.isArray(value)
                    ? value.join(", ")
                    : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function ProductResult({ product }: { product: Product }) {
  const { products, t, locale } = useShop();
  // Locale changes affect labels/descriptions, never the recorded price/stock/specs.
  const localized = products.find((p) => p.id === product.id) ?? product;
  return (
    <div className="assistant-product">
      <Link
        to={`/product/${encodeURIComponent(product.id)}`}
        className="assistant-art"
      >
        <ProductArt id={product.id} />
      </Link>
      <div>
        <Link to={`/product/${encodeURIComponent(product.id)}`}>
          <h3>{localized.name}</h3>
        </Link>
        <p>{localized.description}</p>
        <div className="assistant-facts">
          <strong>{money(locale, product.price)}</strong>
          <span>
            {t("aStock")}: {product.available}
          </span>
        </div>
        <Specs specs={product.specs} />
      </div>
    </div>
  );
}
type Progress = NonNullable<ConfirmationView["snapshot"]["progress"]>;
function OrderProgress({ progress }: { progress: Progress }) {
  const { t, locale, products } = useShop();
  return (
    <div className="assistant-order">
      <div className="assistant-facts">
        <Link
          to={`/orders/${encodeURIComponent(progress.order.id)}`}
          className="text-link"
        >
          {t("orderDetails")} <ArrowUpRight size={16} />
        </Link>
        <Status value={progress.order.status} />
        <strong>{money(locale, progress.order.total)}</strong>
      </div>
      {progress.order.lines.map((line) => (
        <p key={line.id}>
          {products.find((p) => p.id === line.product_id)?.name ??
            line.product_id}{" "}
          — {line.quantity} {t("units")}
        </p>
      ))}
      <p>
        {t("deadline")}: {date(locale, progress.order.deadline)}
      </p>
      {progress.cases.map((c) => (
        <div key={c.id} className="assistant-case">
          <p>
            {t("aCase")}: <span className="assistant-reference">{c.id}</span>
          </p>
          <div className="assistant-facts">
            <Status value={c.status} />
            <span>
              {t(c.status === "open" ? "aShortage" : "quantity")}: {c.quantity}
            </span>
          </div>
          {c.status === "open" && <p>{t("aUnknownDate")}</p>}
        </div>
      ))}
      {progress.fulfillment.map((batch, i) => (
        <p key={i}>
          {t("aSupported")}: {date(locale, batch.promised_at)} —{" "}
          {batch.quantity} {t("units")} <Status value={batch.status} />
        </p>
      ))}
    </div>
  );
}
function Evidence({ evidence }: { evidence: AssistantEvidence }) {
  const { t, locale, products } = useShop();
  if (evidence.name === "searchProducts")
    return (
      <div className="assistant-evidence">
        {evidence.data.length ? (
          evidence.data.map((p) => <ProductResult key={p.id} product={p} />)
        ) : (
          <p>{t("noResults")}</p>
        )}
      </div>
    );
  if (evidence.name === "getDeliveryOptions") {
    const d = evidence.data;
    return (
      <div className="assistant-evidence">
        <h3>
          {products.find((p) => p.id === d.productId)?.name ?? d.productId}
        </h3>
        <dl className="assistant-specs">
          <div>
            <dt>{t("quantity")}</dt>
            <dd>{d.quantity}</dd>
          </div>
          <div>
            <dt>{t("aStock")}</dt>
            <dd>{d.available}</dd>
          </div>
          <div>
            <dt>{t("aAllocation")}</dt>
            <dd>{d.allocation}</dd>
          </div>
          <div>
            <dt>{t("aShortage")}</dt>
            <dd>{d.shortage}</dd>
          </div>
          <div>
            <dt>{t("destination")}</dt>
            <dd>{t("baku")}</dd>
          </div>
          {d.requestedDeadline && (
            <div>
              <dt>{t("deadline")}</dt>
              <dd>{date(locale, d.requestedDeadline)}</dd>
            </div>
          )}
        </dl>
        <p>
          {d.supportedDelivery
            ? `${t("aSupported")}: ${date(locale, d.supportedDelivery)}`
            : t(d.shortage ? "aUnknownDate" : "aNoPromise")}
        </p>
        <small>{t("aNoReservation")}</small>
      </div>
    );
  }
  if (evidence.name === "getOrderProgress")
    return (
      <div className="assistant-evidence">
        <OrderProgress progress={evidence.data} />
      </div>
    );
  if (evidence.name === "getOrder")
    return (
      <div className="assistant-evidence">
        <Link
          to={`/orders/${encodeURIComponent(evidence.data.id)}`}
          className="text-link"
        >
          {t("orderDetails")}
        </Link>{" "}
        <Status value={evidence.data.status} />
      </div>
    );
  // The prepared offer is displayed in the exact confirmation summary below.
  return null;
}

function Confirmation({
  turn,
  onChange,
}: {
  turn: AssistantTurn;
  onChange: () => void;
}) {
  const { t, locale, products, session, refresh } = useShop();
  const confirmation = turn.confirmation!;
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const summary = confirmation.snapshot.offer?.summary;
  const decide = async (decision: "confirm" | "decline") => {
    setBusy(true);
    setError("");
    try {
      await request(`/api/assistant/turns/${turn.runId}/decision`, session, {
        decision,
        confirmed: true,
      });
      setConsent(false);
      refresh();
      onChange();
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="assistant-confirmation" aria-label={t("aConfirmTitle")}>
      <div className="assistant-facts">
        <h3>{t("aConfirmTitle")}</h3>
        <Status value={confirmation.state} />
      </div>
      <h4>
        {t(
          confirmation.name === "confirmOrder"
            ? "aPrepare"
            : confirmation.name === "cancelOrder"
              ? "aCancel"
              : "aReturn",
        )}
      </h4>
      {summary ? (
        <>
          <p>
            {products.find((p) => p.id === summary.productId)?.name ??
              summary.productId}
          </p>
          <Specs
            specs={JSON.parse(summary.productSpecs) as Record<string, unknown>}
          />
          <dl className="assistant-specs">
            <div>
              <dt>{t("quantity")}</dt>
              <dd>{summary.quantity}</dd>
            </div>
            <div>
              <dt>{t("total")}</dt>
              <dd>{money(locale, summary.total)}</dd>
            </div>
            <div>
              <dt>{t("deadline")}</dt>
              <dd>{date(locale, summary.deadline)}</dd>
            </div>
            <div>
              <dt>{t("destination")}</dt>
              <dd>{t("baku")}</dd>
            </div>
            <div>
              <dt>{t("partial")}</dt>
              <dd>{t(summary.allowPartial ? "yes" : "no")}</dd>
            </div>
            <div>
              <dt>{t("substitution")}</dt>
              <dd>{t(summary.allowSubstitution ? "yes" : "no")}</dd>
            </div>
            <div>
              <dt>{t("reserve")}</dt>
              <dd>{summary.availableAllocation}</dd>
            </div>
            <div>
              <dt>{t("aShortage")}</dt>
              <dd>{summary.shortage}</dd>
            </div>
          </dl>
          <p>
            {summary.supportedDelivery
              ? `${t("aSupported")}: ${date(locale, summary.supportedDelivery)}`
              : t("aUnknownDate")}
          </p>
          <small>{t("simulation")}</small>
        </>
      ) : (
        <>
          {confirmation.state === "pending" &&
            confirmation.snapshot.progress && (
              <OrderProgress progress={confirmation.snapshot.progress} />
            )}
          <p>
            {t("reason")}:{" "}
            {confirmation.name !== "confirmOrder" && confirmation.input.reason}
          </p>
          {confirmation.name === "requestReturn" && (
            <>
              <p>
                {t("quantity")}: {confirmation.input.quantity} —{" "}
                {t(confirmation.input.resolution)}
              </p>
              <p>{t("aReturnPolicy")}</p>
            </>
          )}
        </>
      )}
      {confirmation.state === "pending" ? (
        <>
          <p className="assistant-expiry">
            {t("aExpires")}: {dateTime(locale, confirmation.expiresAt)}
          </p>
          <label className="assistant-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
            />
            {t("aConsent")}
          </label>
          <div className="assistant-facts">
            <button
              className="button"
              disabled={!consent || busy}
              onClick={() => void decide("confirm")}
            >
              <Check size={17} />
              {t("aConfirm")}
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void decide("decline")}
            >
              {t("aDecline")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{t("aDecisionRecorded")}</p>
          {confirmation.result && (
            <>
              <h4>{t("aDecisionResult")}</h4>
              <Status value={confirmation.result.status} />
              {confirmation.result.progress ? (
                <OrderProgress progress={confirmation.result.progress} />
              ) : (
                confirmation.result.orderId && (
                  <Link
                    to={`/orders/${encodeURIComponent(confirmation.result.orderId)}`}
                    className="text-link"
                  >
                    {t("orderDetails")}
                  </Link>
                )
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {translatedCode(locale, error)}
        </p>
      )}
    </section>
  );
}

type ActionDraft = {
  name: GuidedAction["name"];
  productId: string;
  quantity: number;
  deadline: string;
  query: string;
  orderId: string;
  reason: string;
  resolution: "refund" | "exchange";
  partial: boolean;
  substitution: boolean;
};
function GuidedForm({
  value,
  onChange,
  send,
  disabled,
  orders,
}: {
  value: ActionDraft;
  onChange: (value: ActionDraft) => void;
  send: (text: string, action: GuidedAction) => void;
  disabled: boolean;
  orders: Order[];
}) {
  const { t, locale, products } = useShop();
  const update = (part: Partial<ActionDraft>) =>
    onChange({ ...value, ...part });
  const ownsOrder = [
    "getOrderProgress",
    "cancelOrder",
    "requestReturn",
  ].includes(value.name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    let action: GuidedAction;
    if (value.name === "searchProducts")
      action = { name: value.name, input: { query: value.query, locale } };
    else if (value.name === "getDeliveryOptions")
      action = {
        name: value.name,
        input: {
          productId: value.productId,
          quantity: value.quantity,
          ...(value.deadline ? { deadline: value.deadline } : {}),
        },
      };
    else if (value.name === "prepareOrder")
      action = {
        name: value.name,
        input: {
          productId: value.productId,
          quantity: value.quantity,
          deadline: value.deadline,
          destination: "baku",
          allowPartial: value.partial,
          allowSubstitution: value.substitution,
        },
      };
    else if (value.name === "getOrderProgress")
      action = { name: value.name, input: { orderId: value.orderId } };
    else if (value.name === "cancelOrder")
      action = {
        name: value.name,
        input: {
          orderId: value.orderId,
          reason: value.reason,
          key: mutationKey(),
        },
      };
    else
      action = {
        name: value.name,
        input: {
          orderId: value.orderId,
          quantity: value.quantity,
          reason: value.reason,
          resolution: value.resolution,
          key: mutationKey(),
        },
      };
    const subject = ownsOrder
      ? value.orderId
      : value.name === "searchProducts"
        ? value.query
        : (products.find((p) => p.id === value.productId)?.name ??
          value.productId);
    send(`${t(actionLabels[value.name])}: ${subject}`, action);
  };
  return (
    <details className="assistant-guided">
      <summary>{t("aAction")}</summary>
      <form onSubmit={submit}>
        <fieldset disabled={disabled}>
          <label>
            {t("aAction")}
            <select
              value={value.name}
              onChange={(e) =>
                update({ name: e.target.value as GuidedAction["name"] })
              }
            >
              {Object.entries(actionLabels).map(([name, label]) => (
                <option key={name} value={name}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <div className="assistant-fields">
            {value.name === "searchProducts" ? (
              <label>
                {t("aQuery")}
                <input
                  required
                  maxLength={100}
                  value={value.query}
                  onChange={(e) => update({ query: e.target.value })}
                />
              </label>
            ) : ownsOrder ? (
              <label>
                {t("order")}
                <select
                  required
                  value={value.orderId}
                  onChange={(e) => update({ orderId: e.target.value })}
                >
                  <option value="">{t("aProgress")}</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.id} —{" "}
                      {order.status in messages
                        ? t(order.status as MessageKey)
                        : order.status}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {t("aQuery")}
                <select
                  value={value.productId}
                  onChange={(e) => update({ productId: e.target.value })}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["getDeliveryOptions", "prepareOrder", "requestReturn"].includes(
              value.name,
            ) && (
              <label>
                {t("quantity")}
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={value.quantity}
                  onChange={(e) => update({ quantity: Number(e.target.value) })}
                />
              </label>
            )}
            {["getDeliveryOptions", "prepareOrder"].includes(value.name) && (
              <label>
                {t("deadline")}
                <input
                  type="date"
                  required={value.name === "prepareOrder"}
                  value={value.deadline}
                  onChange={(e) => update({ deadline: e.target.value })}
                />
              </label>
            )}
            {["cancelOrder", "requestReturn"].includes(value.name) && (
              <label>
                {t("reason")}
                <textarea
                  required
                  minLength={1}
                  maxLength={1000}
                  value={value.reason}
                  onChange={(e) => update({ reason: e.target.value })}
                />
              </label>
            )}
            {value.name === "requestReturn" && (
              <label>
                {t("resolution")}
                <select
                  value={value.resolution}
                  onChange={(e) =>
                    update({
                      resolution: e.target.value as "refund" | "exchange",
                    })
                  }
                >
                  <option value="refund">{t("refund")}</option>
                  <option value="exchange">{t("exchange")}</option>
                </select>
              </label>
            )}
          </div>
          {value.name === "prepareOrder" && (
            <>
              <p>
                {t("destination")}: {t("baku")}
              </p>
              <label className="assistant-consent">
                <input
                  type="checkbox"
                  checked={value.partial}
                  onChange={(e) => update({ partial: e.target.checked })}
                />
                {t("partial")}
              </label>
              <label className="assistant-consent">
                <input
                  type="checkbox"
                  checked={value.substitution}
                  onChange={(e) => update({ substitution: e.target.checked })}
                />
                {t("substitution")}
              </label>
            </>
          )}
          {value.name === "requestReturn" && <p>{t("aReturnPolicy")}</p>}
          {ownsOrder && !orders.length && <p>{t("aNoOrders")}</p>}
          <button
            className="button"
            disabled={disabled || (ownsOrder && !value.orderId)}
          >
            {t("aBuild")}
            <ArrowUpRight size={16} />
          </button>
        </fieldset>
      </form>
    </details>
  );
}

export function AssistantPage() {
  const { session, t } = useShop();
  if (!session) return <SignInPage />;
  if (!session.account.roles.includes("customer"))
    return (
      <section className="container empty-state">
        <p>{t("aCustomerOnly")}</p>
        <Link to="/account" className="button">
          {t("account")}
        </Link>
      </section>
    );
  return <Conversation />;
}
function Conversation() {
  const { session, locale, t, fail } = useShop();
  const accountKey = `relayops-assistant:${session!.account.id}`;
  const [selected, setSelected] = useState<string | null>(() =>
    readSaved(`${accountKey}:selected`, null, sessionStorage),
  );
  const [draft, setDraft] = useState(() =>
    readSaved(`${accountKey}:draft`, "", sessionStorage),
  );
  const [pending, setPending] = useState<AssistantRequest | null>(() =>
    readSaved(`${accountKey}:pending`, null, sessionStorage),
  );
  const [action, setAction] = useState<ActionDraft>(() =>
    readSaved(
      `${accountKey}:action`,
      {
        name: "searchProducts",
        query: "",
        productId: "NET-SW-24G",
        quantity: 1,
        deadline: "",
        orderId: "",
        reason: "",
        resolution: "refund",
        partial: false,
        substitution: false,
      },
      sessionStorage,
    ),
  );
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] =
    useState<AssistantConversation | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const orders = useData<Order[]>("/api/orders");
  useEffect(() => {
    save(`${accountKey}:selected`, selected, sessionStorage);
  }, [accountKey, selected]);
  useEffect(() => {
    save(`${accountKey}:draft`, draft, sessionStorage);
  }, [accountKey, draft]);
  useEffect(() => {
    save(`${accountKey}:action`, action, sessionStorage);
  }, [accountKey, action]);
  useEffect(() => {
    save(`${accountKey}:pending`, pending, sessionStorage);
  }, [accountKey, pending]);
  useEffect(() => {
    let current = true;
    request<AssistantSettings>("/api/assistant/settings")
      .then((s) => {
        if (current) setSettings(s);
      })
      .catch((e) => {
        if (current) setError(codeOf(e));
      });
    request<ConversationSummary[]>("/api/assistant/conversations", session)
      .then((h) => {
        if (current) setHistory(h);
      })
      .catch((e) => {
        if (current) {
          setError(codeOf(e));
          if (codeOf(e) === "UNAUTHORIZED") fail(e);
        }
      });
    return () => {
      current = false;
    };
  }, [session, tick]);
  useEffect(() => {
    if (!selected) {
      setConversation(null);
      return;
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const c = await request<AssistantConversation>(
          `/api/assistant/conversations/${encodeURIComponent(selected)}`,
          session,
        );
        if (!current) return;
        setConversation(c);
        if (c.turns.some((turn) => turn.status === "running"))
          timer = setTimeout(() => void poll(), 750);
      } catch (e) {
        if (current) {
          setError(codeOf(e));
          if (codeOf(e) === "UNAUTHORIZED") fail(e);
        }
      }
    };
    setConversation(null);
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [selected, session, tick]);
  const working =
    busy ||
    !!pending ||
    !!conversation?.turns.some(
      (turn) => turn.status === "running" || turn.status === "interrupted",
    );
  const refresh = () => setTick((n) => n + 1);
  const send = async (payload: AssistantRequest) => {
    setBusy(true);
    setError("");
    setPending(payload);
    // Persist before fetch, so reload during an ambiguous network failure retains
    // the same request key and exact body. GET/polling never initiates inference.
    save(`${accountKey}:pending`, payload, sessionStorage);
    try {
      const result = await request<{ conversationId: string; runId: string }>(
        "/api/assistant/turns",
        session,
        payload,
      );
      setSelected(result.conversationId);
      setDraft("");
      setPending(null);
      save(`${accountKey}:pending`, null, sessionStorage);
      refresh();
    } catch (e) {
      setError(codeOf(e));
      if (codeOf(e) !== "CONNECTION_ERROR") {
        setPending(null);
        save(`${accountKey}:pending`, null, sessionStorage);
      }
      if (codeOf(e) === "UNAUTHORIZED") fail(e);
    } finally {
      setBusy(false);
    }
  };
  const start = (text: string, chosenAction?: GuidedAction) =>
    void send({
      key: mutationKey(),
      ...(selected ? { conversationId: selected } : {}),
      locale,
      mode,
      userText: text,
      ...(chosenAction ? { action: chosenAction } : {}),
    });
  const runAction = async (
    turn: AssistantTurn,
    endpoint: "resume" | "handoff",
  ) => {
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/assistant/turns/${turn.runId}/${endpoint}`,
        session,
        endpoint === "resume" ? { locale } : {},
      );
      refresh();
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() && !working) start(draft.trim());
  };
  return (
    <section className="container assistant-page">
      <div className="assistant-heading">
        <div>
          <h1>{t("aTitle")}</h1>
          <p>{t("assistantIntro")}</p>
        </div>
        <div className="assistant-mode">
          <label>
            {t("aMode")}
            <select
              value={mode}
              disabled={working}
              onChange={(e) => setMode(e.target.value as "mock" | "live")}
            >
              <option value="mock">{t("aDemo")}</option>
              {settings?.liveAvailable && (
                <option value="live">{t("aLive")}</option>
              )}
            </select>
          </label>
          {settings && (
            <small>
              {t("aClock")}: {date(locale, settings.businessClock)}
            </small>
          )}
        </div>
      </div>
      <div className="assistant-layout">
        <aside className="assistant-history" aria-label={t("aHistory")}>
          <button
            className="button"
            disabled={busy || !!pending}
            onClick={() => {
              setSelected(null);
              setError("");
              composer.current?.focus();
            }}
          >
            <Plus size={17} />
            {t("aNew")}
          </button>
          <h2>{t("aHistory")}</h2>
          <div>
            {history.map((c) => (
              <button
                key={c.id}
                className={selected === c.id ? "selected" : ""}
                disabled={busy || !!pending}
                onClick={() => {
                  setSelected(c.id);
                  setError("");
                }}
              >
                <MessageSquare size={16} />
                <span>
                  {c.lastText}
                  <small>{date(locale, c.updatedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="assistant-thread">
          <p className="assistant-mode-note">
            {t(mode === "mock" ? "aDemoNote" : "aLiveNote")}
          </p>
          <div className="assistant-messages">
            {!selected && (
              <div className="assistant-welcome">
                <ProductArt id="NET-SW-24G" />
                <h2>{t("aEmpty")}</h2>
                <button
                  className="text-link"
                  disabled={working}
                  onClick={() =>
                    start(
                      locale === "en"
                        ? "Show switch specifications"
                        : "Kommutatorun xüsusiyyətlərini göstər",
                    )
                  }
                >
                  {t("aSearch")}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
            {selected && !conversation && <p>{t("loading")}</p>}
            {conversation?.turns.map((turn) => (
              <article className="assistant-turn" key={turn.runId}>
                <p className="assistant-user">{turn.userText}</p>
                <div className="assistant-response">
                  <div className="assistant-facts" aria-live="polite">
                    <strong>{t("assistant")}</strong>
                    <Status
                      value={
                        turn.confirmation &&
                        turn.confirmation.state !== "pending"
                          ? turn.confirmation.state
                          : turn.status
                      }
                    />
                    <small>{t(turn.mode === "mock" ? "aDemo" : "aLive")}</small>
                  </div>
                  {turn.status === "running" && (
                    <p role="status">{t("aWorking")}</p>
                  )}
                  {turn.outcome?.message && <p>{turn.outcome.message}</p>}
                  {turn.outcome?.question && <p>{turn.outcome.question}</p>}
                  {turn.outcome?.code && (
                    <p role="alert" className="form-error">
                      {translatedCode(locale, turn.outcome.code)}
                    </p>
                  )}
                  {turn.tools.length > 0 && (
                    <details className="assistant-tools">
                      <summary>{t("toolActivity")}</summary>
                      {turn.tools.map((tool, index) => (
                        <p key={`${tool.id}:${index}`}>
                          {`tool_${tool.name}` in messages
                            ? t(`tool_${tool.name}` as MessageKey)
                            : t("aEvidence")}
                          : <Status value={tool.status} />
                          {tool.code && (
                            <span> {translatedCode(locale, tool.code)}</span>
                          )}
                        </p>
                      ))}
                    </details>
                  )}
                  {turn.evidence.map((evidence) => (
                    <Evidence key={evidence.toolCallId} evidence={evidence} />
                  ))}
                  {turn.confirmation && (
                    <Confirmation turn={turn} onChange={refresh} />
                  )}
                  <div className="assistant-handoffs">
                    {turn.handoffs.map((h) => (
                      <div key={h.id}>
                        <p>
                          {t(
                            h.queue === "procurement_review"
                              ? "aProcurementSaved"
                              : "aSupportSaved",
                          )}
                        </p>
                        <small>
                          {t("aTicket")}:{" "}
                          <span className="assistant-reference">{h.id}</span>
                        </small>
                        {h.caseId && (
                          <p>
                            {t("aCase")}:{" "}
                            <span className="assistant-reference">
                              {h.caseId}
                            </span>
                          </p>
                        )}
                        <Status value={h.status} />
                      </div>
                    ))}
                  </div>
                  <div className="assistant-facts">
                    {turn.canResume && (
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => void runAction(turn, "resume")}
                      >
                        {t("aResume")}
                      </button>
                    )}
                    {turn.status !== "running" &&
                      !turn.handoffs.some(
                        (h) => h.queue === "customer_support",
                      ) && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => void runAction(turn, "handoff")}
                        >
                          {t("aSupport")}
                        </button>
                      )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="assistant-compose">
            {error && (
              <p className="form-error" role="alert">
                {translatedCode(locale, error)}
                <button className="text-link" onClick={refresh}>
                  {t("retry")}
                </button>
              </p>
            )}
            {pending && !busy && (
              <div role="status">
                <p>{t("aUncertain")}</p>
                <button className="button" onClick={() => void send(pending)}>
                  {t("aRetrySend")}
                </button>
              </div>
            )}
            <GuidedForm
              value={action}
              onChange={setAction}
              send={start}
              disabled={working}
              orders={orders.data ?? []}
            />
            {orders.error && (
              <p role="alert">{translatedCode(locale, orders.error)}</p>
            )}
            <form onSubmit={submit}>
              <label htmlFor="assistant-message">{t("aDraft")}</label>
              <div className="assistant-compose-row">
                <textarea
                  id="assistant-message"
                  ref={composer}
                  rows={2}
                  value={draft}
                  maxLength={4000}
                  disabled={!!pending}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className="button"
                  disabled={working || !draft.trim()}
                  aria-label={t("aSend")}
                >
                  <Send size={19} />
                  <span>{t("aSend")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
