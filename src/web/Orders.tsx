import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Check,
  Clock3,
  LogOut,
  PackageCheck,
  Truck,
} from "lucide-react";
import { Link, useShop } from "./shop";
import { Login } from "./Dialogs";
import { useData } from "./data";
import { ProductArt } from "./ProductArt";
import { date, money, translatedCode, type MessageKey } from "./i18n";
import { request } from "./api";
import type { Order, Return } from "./types";

export function Status({ value }: { value: string }) {
  const { locale } = useShop();
  return (
    <span className={`badge status-${value}`}>
      {translatedCode(locale, value)}
    </span>
  );
}
export function DataState({ error }: { error?: string | null }) {
  const { t, locale, refresh } = useShop();
  return (
    <div className="empty-state">
      <p>{error ? translatedCode(locale, error) : t("loading")}</p>
      {error && (
        <button className="button" onClick={refresh}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}
export function SignInPage() {
  const { t } = useShop();
  return (
    <section className="container sign-in-page">
      <div className="sign-in-scene">
        <h1>{t("heroTitle")}</h1>
        <ProductArt id="PC-MINI-16" animated />
      </div>
      <Login />
    </section>
  );
}
export function OrderTable({
  orders,
  staff = false,
}: {
  orders: Order[];
  staff?: boolean;
}) {
  const { t, locale, products, open } = useShop();
  if (!orders.length)
    return (
      <div className="empty-state">
        <Box size={35} />
        <p>{t("noRecords")}</p>
      </div>
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("order")}</th>
            <th>{t("collection")}</th>
            <th>{t("quantity")}</th>
            <th>{t("total")}</th>
            <th>{t("status")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const line = order.lines[0]!;
            const product = products.find((p) => p.id === line.product_id);
            return (
              <tr key={order.id}>
                <td>
                  <Link to={`/orders/${order.id}`} className="order-link">
                    #{order.id.slice(-8)}
                    <ArrowUpRight size={14} />
                  </Link>
                  <small>{date(locale, order.created_at)}</small>
                </td>
                <td>{product?.name ?? line.product_id}</td>
                <td>{line.quantity}</td>
                <td>{money(locale, order.total)}</td>
                <td>
                  <Status value={order.status} />
                </td>
                <td>
                  {staff ? (
                    <div className="table-actions">
                      {(order.status === "confirmed" ||
                        order.status === "cancellation_requested") && (
                        <button
                          onClick={() =>
                            open({
                              type: "staff",
                              resource: "orders",
                              id: order.id,
                              action: "processing",
                            })
                          }
                        >
                          {t("processingAction")}
                        </button>
                      )}
                      {(order.status === "processing" ||
                        order.status === "cancellation_requested") && (
                        <button
                          onClick={() =>
                            open({
                              type: "staff",
                              resource: "orders",
                              id: order.id,
                              action: "shipped",
                            })
                          }
                        >
                          {t("shipAction")}
                        </button>
                      )}
                      {order.status === "shipped" && (
                        <button
                          onClick={() =>
                            open({
                              type: "staff",
                              resource: "orders",
                              id: order.id,
                              action: "delivered",
                            })
                          }
                        >
                          {t("deliverAction")}
                        </button>
                      )}
                      {(order.status === "confirmed" ||
                        order.status === "cancellation_requested") && (
                        <button
                          onClick={() =>
                            open({
                              type: "staff",
                              resource: "orders",
                              id: order.id,
                              action: "cancelled",
                            })
                          }
                        >
                          {t("cancel")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={`/orders/${order.id}`}
                      className="icon-button"
                      aria-label={t("orderDetails")}
                    >
                      <ArrowUpRight size={18} />
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function AccountPage() {
  const { t, session, setSession, fail, locale } = useShop();
  const { data, error } = useData<Order[]>(
    session?.account.roles.includes("customer") ? "/api/orders" : null,
  );
  if (!session) return <SignInPage />;
  const logout = async () => {
    try {
      await request("/api/auth/logout", session, {});
      setSession(null);
    } catch (error) {
      fail(error);
    }
  };
  return (
    <section className="container account-page">
      <div className="page-heading account-heading">
        <div>
          <p>{session.account.id}</p>
          <h1>{t("myOrders")}</h1>
          <span>{t("ordersText")}</span>
        </div>
        <button className="text-link" onClick={logout}>
          <LogOut size={18} />
          {t("signOut")}
        </button>
      </div>
      {session.account.roles.includes("customer") ? (
        data ? (
          <OrderTable orders={data} />
        ) : (
          <DataState error={error} />
        )
      ) : (
        <div className="empty-state">
          <p>
            {locale === "en"
              ? "Your account has access to business operations."
              : "Hesabın biznes əməliyyatlarına girişə malikdir."}
          </p>
          <Link to="/workspace/overview" className="button">
            {t("workspace")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </section>
  );
}
export function OrderPage({ id }: { id: string }) {
  const { t, locale, session, products, open } = useShop();
  const { data: order, error } = useData<Order>(
    session ? `/api/orders/${id}` : null,
  );
  const { data: returns } = useData<Return[]>(
    session?.account.roles.some((role) =>
      ["customer", "operator", "owner"].includes(role),
    )
      ? "/api/returns"
      : null,
  );
  if (!session) return <SignInPage />;
  if (!order)
    return (
      <section className="container">
        <DataState error={error} />
      </section>
    );
  const line = order.lines[0]!;
  const product = products.find((p) => p.id === line.product_id)!;
  const own = session.account.id === order.customer_id;
  const orderReturns = (returns ?? []).filter((row) => row.order_id === id);
  const returned = orderReturns
    .filter((row) => row.status !== "rejected" || row.outcome !== null)
    .reduce((sum, row) => sum + row.quantity, 0);
  const remaining = Math.max(0, line.delivered_quantity - returned);
  const steps: [typeof Check, MessageKey][] = [
    [Check, "confirmed"],
    [Box, "processing"],
    [Truck, "shipped"],
    [PackageCheck, "delivered"],
  ];
  const progression =
    order.status === "delivered"
      ? 3
      : order.status === "shipped"
        ? 2
        : order.status === "processing"
          ? 1
          : 0;
  return (
    <section className="container order-page">
      <Link
        to={own ? "/account" : "/workspace/orders"}
        className="text-link breadcrumb"
      >
        <ArrowLeft size={16} />
        {t("orders")}
      </Link>
      <div className="page-heading order-heading">
        <div>
          <p>
            {t("order")} #{id.slice(-8)}
          </p>
          <h1>{t("orderDetails")}</h1>
          <span>{date(locale, order.created_at)}</span>
        </div>
        <Status value={order.status} />
      </div>
      <div className="order-layout">
        <div>
          <div className="order-product">
            <ProductArt id={product.id} />
            <div>
              <span className="category-label">
                {t(product.category as MessageKey)}
              </span>
              <Link to={`/product/${product.id}`}>
                <h2>{product.name}</h2>
              </Link>
              <p>{product.description}</p>
              <span>
                {t("quantity")}: {line.quantity}
              </span>
              <strong>{money(locale, order.total)}</strong>
            </div>
          </div>
          {!["cancelled", "cancellation_requested"].includes(order.status) && (
            <div className="order-timeline">
              {steps.map(([Icon, label], index) => (
                <div
                  key={label}
                  className={index <= progression ? "reached" : ""}
                >
                  <span>
                    <Icon size={18} />
                  </span>
                  <strong>{t(label)}</strong>
                </div>
              ))}
            </div>
          )}
          {order.status === "awaiting_supply" && (
            <p className="supply-warning">
              <Clock3 size={18} />
              {t("supplyPending")}
            </p>
          )}
          <div className="order-return-list">
            {orderReturns.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>
                    {t(row.resolution as MessageKey)} / {row.quantity}{" "}
                    {t("units")}
                  </strong>
                  <Status value={row.status} />
                </div>
                <p>{row.reason}</p>
                {row.resolution === "exchange" &&
                  row.status === "inspected" &&
                  own && (
                    <button
                      className="button button-small"
                      onClick={() =>
                        open({
                          type: "checkout",
                          productId: row.product_id,
                          quantity: row.quantity,
                          returnId: row.id,
                        })
                      }
                    >
                      {t("exchangeOffer")}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
              </article>
            ))}
          </div>
        </div>
        <aside className="order-side">
          <h3>{t("review")}</h3>
          <div className="order-summary">
            <div>
              <span>{t("destination")}</span>
              <strong>{t("baku")}</strong>
            </div>
            <div>
              <span>{t("deadline")}</span>
              <strong>{date(locale, order.deadline)}</strong>
            </div>
            <div>
              <span>{t("quantity")}</span>
              <strong>{line.quantity}</strong>
            </div>
            <div>
              <span>{t("total")}</span>
              <strong>{money(locale, order.total)}</strong>
            </div>
          </div>
          <p className="small-muted">{t("simulation")}</p>
          {own &&
            ![
              "shipped",
              "delivered",
              "cancelled",
              "cancellation_requested",
            ].includes(order.status) && (
              <button
                className="text-link"
                onClick={() =>
                  open({ type: "cancel", orderId: id, quantity: line.quantity })
                }
              >
                {t("cancelOrder")}
              </button>
            )}
          {own && order.status === "delivered" && remaining > 0 && (
            <button
              className="button"
              onClick={() =>
                open({ type: "return", orderId: id, quantity: remaining })
              }
            >
              {t("returnRequest")}
              <ArrowUpRight size={17} />
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
