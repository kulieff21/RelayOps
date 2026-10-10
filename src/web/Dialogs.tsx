import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  ShoppingBag,
  X,
  LoaderCircle,
  PackageCheck,
} from "lucide-react";
import { useShop, Link, type Overlay } from "./shop";
import { ProductArt } from "./ProductArt";
import { Quantity } from "./Storefront";
import { ApiError, mutationKey, request } from "./api";
import { date, money, translatedCode, type MessageKey } from "./i18n";
import type { Offer, Order, Session } from "./types";

export function Login({ after }: { after?: () => void }) {
  const { t, locale, setSession, notify, fail, url } = useShop();
  const [email, setEmail] = useState(
    url.startsWith("/workspace")
      ? "owner@relayops.example"
      : "customer-a@relayops.example",
  );
  const [password, setPassword] = useState("RelayOps-demo-2026!");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await request<Session>("/api/auth/login", null, {
        email,
        password,
      });
      setSession(session);
      notify(locale === "en" ? "Signed in" : "Hesaba daxil olundu");
      after?.();
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INTERNAL_ERROR");
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-content">
      <div className="login-symbol">
        <img src="/mark.svg" alt="" width="52" height="52" />
      </div>
      <h2>{t("welcome")}</h2>
      <form onSubmit={submit} className="stack-form">
        <label>
          {t("email")}
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          {t("password")}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorText error={error} />
        <button className="button" disabled={busy}>
          {busy ? <LoaderCircle className="spinner" size={18} /> : null}
          {t("signIn")}
          <ArrowUpRight size={18} />
        </button>
      </form>
      <div className="demo-accounts">
        <span>{t("demoAccounts")}</span>
        <div>
          {["customer-a", "customer-b", "operator", "purchaser", "owner"].map(
            (id) => (
              <button
                key={id}
                type="button"
                className={email === `${id}@relayops.example` ? "selected" : ""}
                onClick={() => {
                  setEmail(`${id}@relayops.example`);
                  setPassword("RelayOps-demo-2026!");
                }}
              >
                {t(id.startsWith("customer") ? "customer" : (id as MessageKey))}
                {id.startsWith("customer")
                  ? ` ${id.slice(-1).toUpperCase()}`
                  : ""}
              </button>
            ),
          )}
        </div>
        <p>
          {t("demoPassword")}
          <code>RelayOps-demo-2026!</code>
        </p>
      </div>
    </div>
  );
}
export function Modal({
  children,
  onClose,
  wide = false,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t, locale, setLocale } = useShop();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide-modal" : ""}`}
      aria-label={label ?? t("review")}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current!.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <button
          className="modal-locale locale"
          onClick={() => setLocale(locale === "en" ? "az" : "en")}
          aria-label={
            locale === "en" ? "Switch to Azerbaijani" : "İngilis dilinə keç"
          }
        >
          {locale.toUpperCase()}
        </button>
        <button
          className="modal-close icon-button"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X size={20} />
        </button>
        {children}
      </motion.div>
    </dialog>
  );
}
function ErrorText({ error }: { error: string }) {
  const { locale } = useShop();
  return error ? (
    <p role="alert" className="inline-error">
      {translatedCode(locale, error)}
    </p>
  ) : null;
}
function Bag() {
  const { t, cart, setCart, products, locale, open } = useShop();
  return (
    <div className="bag-content">
      <h2>
        {t("cart")}
        <span>{cart.reduce((n, line) => n + line.quantity, 0)}</span>
      </h2>
      {cart.length ? (
        <>
          <div className="bag-lines">
            {cart.map((line) => {
              const p = products.find((p) => p.id === line.productId);
              if (!p) return null;
              return (
                <article className="bag-line" key={line.productId}>
                  <Link to={`/product/${p.id}`} onClick={() => open(null)}>
                    <ProductArt id={p.id} />
                  </Link>
                  <div>
                    <Link to={`/product/${p.id}`} onClick={() => open(null)}>
                      <h3>{p.name}</h3>
                    </Link>
                    <strong>{money(locale, p.price * line.quantity)}</strong>
                    <div className="bag-line-controls">
                      <Quantity
                        value={line.quantity}
                        onChange={(quantity) =>
                          setCart(
                            cart.map((item) =>
                              item.productId === line.productId
                                ? { ...item, quantity }
                                : item,
                            ),
                          )
                        }
                      />
                      <button
                        className="text-link"
                        onClick={() =>
                          setCart(
                            cart.filter(
                              (item) => item.productId !== line.productId,
                            ),
                          )
                        }
                      >
                        {t("remove")}
                      </button>
                    </div>
                    <button
                      className="button button-small"
                      onClick={() =>
                        open({
                          type: "checkout",
                          productId: p.id,
                          quantity: line.quantity,
                        })
                      }
                    >
                      {t("checkout")}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="bag-total">
            <span>{t("total")}</span>
            <strong>
              {money(
                locale,
                cart.reduce(
                  (sum, line) =>
                    sum +
                    (products.find((p) => p.id === line.productId)?.price ??
                      0) *
                      line.quantity,
                  0,
                ),
              )}
            </strong>
          </div>
          <p className="small-muted">{t("bagNote")}</p>
        </>
      ) : (
        <div className="empty-state">
          <ShoppingBag size={44} />
          <h3>{t("emptyBag")}</h3>
          <Link to="/collection" className="button" onClick={() => open(null)}>
            {t("shop")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </div>
  );
}
function Checkout({
  overlay,
}: {
  overlay: Extract<Overlay, { type: "checkout" }>;
}) {
  const {
    t,
    locale,
    session,
    setSession,
    products,
    fail,
    notify,
    open,
    navigate,
    refresh,
    setCart,
    cart,
  } = useShop();
  const [deadline, setDeadline] = useState("");
  const [clock, setClock] = useState("");
  const [quantity, setQuantity] = useState(overlay.quantity);
  const [partial, setPartial] = useState(false);
  const [substitution, setSubstitution] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(mutationKey());
  useEffect(() => {
    request<{ businessClock: string }>("/health")
      .then((health) => {
        setClock(health.businessClock);
        const dt = new Date(health.businessClock);
        dt.setUTCDate(dt.getUTCDate() + 7);
        setDeadline(dt.toISOString().slice(0, 10));
      })
      .catch(fail);
  }, []);
  useEffect(() => {
    setOffer(null);
    setConsent(false);
    key.current = mutationKey();
  }, [session?.account.id]);
  const product = products.find((p) => p.id === overlay.productId)!;
  if (!session) return <Login />;
  if (!session.account.roles.includes("customer"))
    return (
      <div className="empty-state">
        <h2>{t("customer")}</h2>
        <p>{t("FORBIDDEN")}</p>
        <button
          className="button"
          onClick={async () => {
            try {
              await request("/api/auth/logout", session, {});
              setSession(null);
            } catch (error) {
              fail(error);
            }
          }}
        >
          {t("signOut")}
        </button>
      </div>
    );
  const prepare = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = overlay.returnId
        ? await request<Offer>(
            `/api/returns/${overlay.returnId}/exchange-offer`,
            session,
            { deadline },
          )
        : await request<Offer>("/api/order-offers", session, {
            productId: product.id,
            quantity,
            deadline,
            destination: "baku",
            allowPartial: partial,
            allowSubstitution: substitution,
          });
      setOffer(result);
      key.current = mutationKey();
      setConsent(false);
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INTERNAL_ERROR");
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!offer || !consent) return;
    setBusy(true);
    setError("");
    try {
      const order = await request<Order>("/api/orders", session, {
        offerId: offer.id,
        version: offer.version,
        confirmed: true,
        key: key.current,
      });
      if (!overlay.returnId)
        setCart(
          cart.flatMap((line) =>
            line.productId !== product.id
              ? [line]
              : line.quantity > offer.summary.quantity
                ? [
                    {
                      ...line,
                      quantity: line.quantity - offer.summary.quantity,
                    },
                  ]
                : [],
          ),
        );
      open(null);
      refresh();
      navigate(`/orders/${order.id}`);
      notify(t("confirmedMessage"));
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INTERNAL_ERROR");
      if (
        error instanceof ApiError &&
        [
          "NEW_CONSENT_REQUIRED",
          "CONSENT_EXPIRED",
          "EXCHANGE_CONSENT_STALE",
        ].includes(error.code)
      ) {
        setOffer(null);
        setConsent(false);
      }
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="checkout-content">
      <div className="modal-heading">
        <span className="modal-step">
          <PackageCheck size={20} />
          {t("review")}
        </span>
        <h2>{product.name}</h2>
        <p>{t("simulation")}</p>
      </div>
      <div className="checkout-product">
        <ProductArt id={product.id} />
        <span>{product.description}</span>
      </div>
      {offer ? (
        <>
          <div className="order-summary">
            <div>
              <span>{t("quantity")}</span>
              <strong>{offer.summary.quantity}</strong>
            </div>
            <div>
              <span>{t("unitPrice")}</span>
              <strong>{money(locale, offer.summary.unitPrice)}</strong>
            </div>
            {offer.summary.exchangeCredit !== undefined && (
              <div>
                <span>{t("exchangeCredit")}</span>
                <strong>−{money(locale, offer.summary.exchangeCredit)}</strong>
              </div>
            )}
            <div>
              <span>{t("total")}</span>
              <strong>{money(locale, offer.summary.total)}</strong>
            </div>
            <div>
              <span>{t("reserve")}</span>
              <strong>{offer.summary.availableAllocation}</strong>
            </div>
            <div>
              <span>{t("shortage")}</span>
              <strong>{offer.summary.shortage}</strong>
            </div>
            <div>
              <span>{t("deadline")}</span>
              <strong>{date(locale, offer.summary.deadline)}</strong>
            </div>
            <div>
              <span>{t("destination")}</span>
              <strong>{t("baku")}</strong>
            </div>
            {offer.summary.supportedDelivery && (
              <div>
                <span>{t("supportedDelivery")}</span>
                <strong>{date(locale, offer.summary.supportedDelivery)}</strong>
              </div>
            )}
          </div>
          {offer.summary.shortage > 0 && (
            <p className="supply-warning">{t("supplyPending")}</p>
          )}
          <p className="small-muted">{t("reviewText")}</p>
          <label className="consent-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{t("consent")}</span>
          </label>
          <ErrorText error={error} />
          <button
            className="button full-button"
            disabled={!consent || busy}
            onClick={confirm}
          >
            {busy ? (
              <LoaderCircle className="spinner" size={18} />
            ) : (
              <Check size={18} />
            )}{" "}
            {t("confirmOrder")}
          </button>
          <button
            className="text-link edit-review"
            disabled={busy}
            onClick={() => {
              setOffer(null);
              setConsent(false);
            }}
          >
            {t("back")}
          </button>
        </>
      ) : (
        <form className="stack-form" onSubmit={prepare}>
          {!overlay.returnId && (
            <div className="summary-line">
              <span>{t("quantity")}</span>
              <Quantity value={quantity} onChange={setQuantity} />
            </div>
          )}
          <label>
            {t("deadline")}
            <input
              required
              type="date"
              value={deadline}
              min={clock.slice(0, 10)}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          {clock && (
            <p className="small-muted">
              {t("businessClock")}: {date(locale, clock)}
            </p>
          )}
          <label>
            {t("destination")}
            <input value={t("baku")} readOnly />
          </label>
          {!overlay.returnId && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={partial}
                  onChange={(e) => setPartial(e.target.checked)}
                />
                {t("partial")}
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={substitution}
                  onChange={(e) => setSubstitution(e.target.checked)}
                />
                {t("substitution")}
              </label>
            </>
          )}
          <ErrorText error={error} />
          <button className="button" disabled={busy || !deadline}>
            {busy ? <LoaderCircle className="spinner" size={18} /> : null}
            {t("prepare")}
            <ArrowUpRight size={17} />
          </button>
        </form>
      )}
    </div>
  );
}
function ActionForm({
  overlay,
}: {
  overlay: Extract<Overlay, { type: "cancel" | "return" | "staff" }>;
}) {
  const { t, session, open, fail, notify, refresh } = useShop();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [resolution, setResolution] = useState("refund");
  const [outcome, setOutcome] = useState("sellable");
  const [error, setError] = useState("");
  const key = useRef(mutationKey());
  const isReturn = overlay.type === "return";
  const isStaff = overlay.type === "staff";
  const isInspection = isStaff && overlay.action === "inspect";
  const isResolve = isStaff && overlay.action === "resolve";
  const title = isReturn
    ? t("returnRequest")
    : overlay.type === "cancel"
      ? t("cancelOrder")
      : isInspection
        ? t("inspect")
        : isResolve
          ? t("resolve")
          : t(overlay.action as MessageKey);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      let path: string;
      let body: unknown;
      if (overlay.type === "cancel") {
        path = `/api/orders/${overlay.orderId}/cancel`;
        body = { reason: notes, key: key.current };
      } else if (overlay.type === "return") {
        path = "/api/returns";
        body = {
          orderId: overlay.orderId,
          quantity,
          reason: notes,
          resolution,
          key: key.current,
        };
      } else {
        const resource = overlay.resource;
        const action = isInspection
          ? "inspect"
          : isResolve
            ? "resolve"
            : "transition";
        path = `/api/${resource}/${overlay.id}/${action}`;
        body = isInspection
          ? { outcome, notes, key: key.current }
          : isResolve
            ? { key: key.current }
            : resource === "orders"
              ? { status: overlay.action, evidence: notes, key: key.current }
              : { status: overlay.action, notes, key: key.current };
      }
      await request(path, session, body);
      open(null);
      refresh();
      notify(t("requestSaved"));
    } catch (error) {
      setError(error instanceof ApiError ? error.code : "INTERNAL_ERROR");
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="action-content">
      <h2>{title}</h2>
      <p>
        {t(
          isReturn
            ? "returnText"
            : overlay.type === "cancel"
              ? "cancelText"
              : "simulation",
        )}
      </p>
      <form className="stack-form" onSubmit={submit}>
        {isReturn && (
          <>
            <div className="summary-line">
              <span>{t("quantity")}</span>
              <Quantity
                value={quantity}
                onChange={setQuantity}
                max={overlay.quantity}
              />
            </div>
            <label>
              {t("resolution")}
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="refund">{t("refund")}</option>
                <option value="exchange">{t("exchange")}</option>
              </select>
            </label>
          </>
        )}
        {isInspection && (
          <label>
            {t("outcome")}
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              {["sellable", "damaged", "incomplete", "wrong_item"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(value as MessageKey)}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {!isResolve && (
          <label>
            {t(isStaff ? "notes" : "reason")}
            <textarea
              required
              minLength={1}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </label>
        )}
        <ErrorText error={error} />
        <button className="button" disabled={busy}>
          {busy ? <LoaderCircle className="spinner" size={18} /> : null}
          {t("submit")}
          <Check size={18} />
        </button>
      </form>
    </div>
  );
}
export function Dialogs() {
  const { overlay, open, t } = useShop();
  if (!overlay) return null;
  return (
    <Modal
      key={
        overlay.type +
        ("id" in overlay
          ? overlay.id
          : "productId" in overlay
            ? overlay.productId
            : "")
      }
      onClose={() => open(null)}
      wide={overlay.type === "cart"}
    >
      {overlay.type === "login" ? (
        <Login after={() => open(null)} />
      ) : overlay.type === "cart" ? (
        <Bag />
      ) : overlay.type === "checkout" ? (
        <Checkout overlay={overlay} />
      ) : overlay.type === "help" ? (
        <div className="help-content">
          <div className="help-orb">
            <span />
          </div>
          <h2>{t("assistantTitle")}</h2>
          <span className="badge">{t("disconnected")}</span>
          <p>{t("assistantText")}</p>
          <Link to="/business" className="button" onClick={() => open(null)}>
            {t("bulkCTA")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      ) : (
        <ActionForm overlay={overlay} />
      )}
    </Modal>
  );
}
