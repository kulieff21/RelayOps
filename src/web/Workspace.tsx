import { useShop, Link } from "./shop";
import { useData } from "./data";
import { SupplierDirectory, QuotationDirectory } from "./Purchasing";
import { DataState, OrderTable, SignInPage, Status } from "./Orders";
import { ProductArt } from "./ProductArt";
import { date, money, translatedCode, type MessageKey } from "./i18n";
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { request } from "./api";
import type { Comparison, ProcurementCase, Workspace } from "./types";

function CaseCard({ row }: { row: ProcurementCase }) {
  const { t, locale, products } = useShop();
  const product = products.find((p) => p.id === row.product_id)!;
  return (
    <article className="case-card">
      <div className="case-product">
        <ProductArt id={product.id} />
      </div>
      <div className="case-info">
        <div className="case-topline">
          <span>
            {t("case")} #{row.id.slice(-8)}
          </span>
          <Status value={row.status} />
        </div>
        <h3>{product.name}</h3>
        <div className="case-facts">
          <span>
            {t("shortage")}
            <strong>{row.quantity}</strong>
          </span>
          <span>
            {t("budget")}
            <strong>{money(locale, row.budget)}</strong>
          </span>
        </div>
        {row.status !== "closed" && (
          <Link
            className="button button-small"
            to={`/workspace/procurement?case=${row.id}`}
          >
            {t("compare")}
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
function ComparisonView({ caseId, data }: { caseId: string; data: Workspace }) {
  const { t, locale } = useShop();
  const { data: comparison, error } = useData<{
    options: Comparison[];
    selectedQuoteId: string | null;
  }>(`/api/procurement/${caseId}/comparison`);
  if (!comparison) return <DataState error={error} />;
  return (
    <section className="comparison-panel">
      <h2>{t("compare")}</h2>
      <p>{t("quoteText")}</p>
      <div className="quote-grid">
        {comparison.options.map((option) => (
          <article
            key={option.id}
            className={
              option.feasible ? "quote-card feasible-quote" : "quote-card"
            }
          >
            <span className="quote-icon">
              {option.feasible ? (
                <CircleCheck size={24} />
              ) : (
                <Clock3 size={24} />
              )}
            </span>
            <h3>
              {data.suppliers.find((s) => s.id === option.supplier)?.name ??
                option.supplier}
            </h3>
            <Link
              className="text-link quote-version-link"
              to={`/workspace/quotations?supplier=${encodeURIComponent(option.supplier)}&product=${encodeURIComponent(data.cases.find((row) => row.id === caseId)!.product_id)}`}
            >
              {t("versionHistory")} · v{option.version ?? "—"}
              <ArrowUpRight size={14} />
            </Link>
            <span className="quote-verdict">
              {t(option.feasible ? "feasible" : "notFeasible")}
            </span>
            <strong className="quote-price">
              {option.total === null ? "—" : money(locale, option.total)}
            </strong>
            <dl>
              <div>
                <dt>{t("quantity")}</dt>
                <dd>{option.quantity ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("excess")}</dt>
                <dd>{option.excess ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("supplierDelivery")}</dt>
                <dd>
                  {option.customerDelivery
                    ? date(locale, option.customerDelivery)
                    : "—"}
                </dd>
              </div>
            </dl>
            <ul>
              {option.reasons.map((reason) => (
                <li key={reason}>{translatedCode(locale, reason)}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
export function WorkspacePage({ view }: { view: string }) {
  const { t, locale, session, setSession, refresh, products, url, open, fail } =
    useShop();
  const { data, error } = useData<Workspace>(
    session && session.account.roles.some((role) => role !== "customer")
      ? "/api/workspace"
      : null,
  );
  if (!session) return <SignInPage />;
  if (session.account.roles.every((role) => role === "customer"))
    return (
      <div className="container empty-state">
        <h1>{t("workspace")}</h1>
        <p>{t("FORBIDDEN")}</p>
        <button className="button" onClick={() => open({ type: "login" })}>
          {t("signIn")}
        </button>
      </div>
    );
  const owner = session.account.roles.includes("owner");
  const operations = owner || session.account.roles.includes("operator");
  const purchasing = owner || session.account.roles.includes("purchaser");
  const nav = [
    { key: "overview", icon: LayoutDashboard },
    { key: "orders", icon: ListOrdered },
    ...(operations ? [{ key: "returns", icon: RotateCcw }] : []),
    { key: "inventory", icon: Boxes },
    { key: "suppliers", icon: Users },
    { key: "quotations", icon: FileText },
    ...(purchasing
      ? [
          { key: "procurement", icon: Truck },
          { key: "approvals", icon: ClipboardCheck },
        ]
      : []),
    ...(owner ? [{ key: "audit", icon: ShieldCheck }] : []),
  ];
  const valid = nav.some((item) => item.key === view);
  const logout = async () => {
    try {
      await request("/api/auth/logout", session, {});
      setSession(null);
    } catch (error) {
      fail(error);
    }
  };
  const activeCase = new URLSearchParams(url.split("?")[1]).get("case");
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="workspace-label">
          <span className="workspace-symbol">
            <Boxes size={24} />
          </span>
          <div>
            <strong>RelayOps</strong>
            <span>{t("workspace")}</span>
          </div>
        </div>
        <nav aria-label={t("workspace")}>
          {nav.map(({ key, icon: Icon }) => (
            <Link
              key={key}
              to={`/workspace/${key}`}
              className={key === view ? "active" : ""}
            >
              <Icon size={18} />
              {t(key as MessageKey)}
              {key === view && <ChevronRight size={16} />}
            </Link>
          ))}
        </nav>
        <div className="workspace-user">
          <div className="avatar">
            {session.account.id.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{t(session.account.roles[0] as MessageKey)}</strong>
            <small>{session.account.id}</small>
          </div>
          <button
            className="icon-button"
            onClick={logout}
            aria-label={t("signOut")}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <section className="workspace-content">
        <div className="workspace-heading">
          <div>
            <p>{t("workspace")}</p>
            <h1>{valid ? t(view as MessageKey) : t("FORBIDDEN")}</h1>
          </div>
          <button className="refresh-button" onClick={refresh}>
            <RefreshCw size={16} />
            {t("refresh")}
          </button>
        </div>
        {!valid ? (
          <p>{t("FORBIDDEN")}</p>
        ) : !data ? (
          <DataState error={error} />
        ) : (
          <>
            {view === "overview" && (
              <>
                <div className="overview-banner">
                  <div>
                    <h2>{t("liveState")}</h2>
                    <p>{t("workspaceText")}</p>
                  </div>
                  <div className="overview-illustration">
                    <span />
                    <span />
                    <span />
                    <Package size={40} />
                  </div>
                </div>
                <div className="metrics">
                  <div>
                    <ListOrdered size={19} />
                    <strong>
                      {
                        data.orders.filter(
                          (o) => !["cancelled", "delivered"].includes(o.status),
                        ).length
                      }
                    </strong>
                    <span>{t("openOrders")}</span>
                  </div>
                  <div>
                    <Boxes size={19} />
                    <strong>
                      {products.reduce((n, p) => n + p.available, 0)}
                    </strong>
                    <span>{t("availableUnits")}</span>
                  </div>
                  {purchasing && (
                    <div>
                      <Truck size={19} />
                      <strong>
                        {
                          data.cases.filter((row) => row.status !== "closed")
                            .length
                        }
                      </strong>
                      <span>{t("supplyCases")}</span>
                    </div>
                  )}
                  {operations && (
                    <div>
                      <RotateCcw size={19} />
                      <strong>
                        {
                          data.returns.filter(
                            (row) =>
                              !["resolved", "rejected"].includes(row.status),
                          ).length
                        }
                      </strong>
                      <span>{t("returns")}</span>
                    </div>
                  )}
                </div>
                <div className="workspace-section-heading">
                  <h2>{t("recentOrders")}</h2>
                  <Link to="/workspace/orders" className="text-link">
                    {t("orders")}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
                <OrderTable orders={data.orders.slice(0, 5)} />
                {purchasing && (
                  <>
                    <div className="workspace-section-heading">
                      <h2>{t("nextDecision")}</h2>
                      <Link to="/workspace/procurement" className="text-link">
                        {t("procurement")}
                        <ArrowUpRight size={16} />
                      </Link>
                    </div>
                    {data.cases
                      .filter((row) => row.status !== "closed")
                      .slice(0, 1)
                      .map((row) => (
                        <CaseCard key={row.id} row={row} />
                      ))}
                  </>
                )}
              </>
            )}
            {view === "orders" && (
              <OrderTable orders={data.orders} staff={operations} />
            )}
            {view === "returns" && (
              <>
                {!data.returns.length ? (
                  <div className="empty-state">
                    <RotateCcw size={32} />
                    <p>{t("noRecords")}</p>
                  </div>
                ) : (
                  <div className="return-cards">
                    {data.returns.map((row) => (
                      <article key={row.id}>
                        <div className="return-card-heading">
                          <div>
                            <Link
                              to={`/orders/${row.order_id}`}
                              className="order-link"
                            >
                              #{row.order_id.slice(-8)}
                              <ArrowUpRight size={15} />
                            </Link>
                            <h3>
                              {
                                products.find((p) => p.id === row.product_id)
                                  ?.name
                              }
                            </h3>
                          </div>
                          <Status value={row.status} />
                        </div>
                        <p>{row.reason}</p>
                        <div className="return-facts">
                          <span>
                            {t("quantity")}: {row.quantity}
                          </span>
                          <span>{t(row.resolution as MessageKey)}</span>
                          <span>{date(locale, row.created_at)}</span>
                        </div>
                        <div className="table-actions">
                          {row.status === "requested" && (
                            <button
                              onClick={() =>
                                open({
                                  type: "staff",
                                  resource: "returns",
                                  id: row.id,
                                  action: "authorized",
                                })
                              }
                            >
                              {t("authorize")}
                            </button>
                          )}
                          {row.status === "authorized" && (
                            <button
                              onClick={() =>
                                open({
                                  type: "staff",
                                  resource: "returns",
                                  id: row.id,
                                  action: "received",
                                })
                              }
                            >
                              {t("receive")}
                            </button>
                          )}
                          {["requested", "authorized"].includes(row.status) && (
                            <button
                              onClick={() =>
                                open({
                                  type: "staff",
                                  resource: "returns",
                                  id: row.id,
                                  action: "rejected",
                                })
                              }
                            >
                              {t("reject")}
                            </button>
                          )}
                          {row.status === "received" && (
                            <button
                              onClick={() =>
                                open({
                                  type: "staff",
                                  resource: "returns",
                                  id: row.id,
                                  action: "inspect",
                                })
                              }
                            >
                              {t("inspect")}
                            </button>
                          )}
                          {row.status === "inspected" &&
                            row.resolution === "refund" && (
                              <button
                                onClick={() =>
                                  open({
                                    type: "staff",
                                    resource: "returns",
                                    id: row.id,
                                    action: "resolve",
                                  })
                                }
                              >
                                {t("resolve")}
                              </button>
                            )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            {view === "inventory" && (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t("collection")}</th>
                        <th>{t("physical")}</th>
                        <th>{t("stock")}</th>
                        <th>{t("incoming")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <Link to={`/product/${product.id}`}>
                              {product.name}
                            </Link>
                            <small>{product.id}</small>
                          </td>
                          <td>
                            {data.inventory.find((row) => row.id === product.id)
                              ?.stock ?? 0}
                          </td>
                          <td>{product.available}</td>
                          <td>{product.incoming}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="workspace-section-heading">
                  <h2>{t("movements")}</h2>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t("collection")}</th>
                        <th>{t("quantity")}</th>
                        <th>{t("source")}</th>
                        <th>{t("date")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {
                              products.find((p) => p.id === row.product_id)
                                ?.name
                            }
                          </td>
                          <td className={row.delta > 0 ? "positive" : ""}>
                            {row.delta > 0 ? "+" : ""}
                            {row.delta}
                          </td>
                          <td>
                            {row.source.startsWith("opening:")
                              ? locale === "en"
                                ? "Opening balance"
                                : "İlkin qalıq"
                              : row.source.startsWith("dispatch:")
                                ? t("shipped")
                                : t("returns")}
                          </td>
                          <td>{date(locale, row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {view === "procurement" && (
              <>
                <div className="case-list">
                  {data.cases.length ? (
                    data.cases.map((row) => <CaseCard key={row.id} row={row} />)
                  ) : (
                    <div className="empty-state">
                      <p>{t("noRecords")}</p>
                    </div>
                  )}
                </div>
                {activeCase &&
                  data.cases.some(
                    (row) => row.id === activeCase && row.status !== "closed",
                  ) && <ComparisonView caseId={activeCase} data={data} />}
              </>
            )}
            {view === "suppliers" && (
              <SupplierDirectory data={data} editable={purchasing} />
            )}
            {view === "quotations" && (
              <QuotationDirectory data={data} editable={purchasing} />
            )}
            {view === "approvals" && (
              <div className="integration-empty">
                <ClipboardCheck size={42} />
                <h2>{t("approvals")}</h2>
                <span className="badge">{t("disconnected")}</span>
                <p>{t("approvalsText")}</p>
                {data.approvals.map((row) => (
                  <div key={row.id}>
                    <span>#{row.id.slice(-8)}</span>
                    <Status value={row.status} />
                    <span>{date(locale, row.expires_at)}</span>
                  </div>
                ))}
              </div>
            )}
            {view === "audit" && (
              <div className="audit-list">
                {data.audit.map((row) => (
                  <article key={row.id}>
                    <span className="audit-icon">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>{auditName(locale, row.action)}</strong>
                      <small>#{row.entity_id.slice(-8)}</small>
                    </div>
                    <time>{date(locale, row.created_at)}</time>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function auditName(locale: string, action: string) {
  const labels: Record<string, [string, string]> = {
    "supplier.created": ["Supplier added", "Təchizatçı əlavə edildi"],
    "supplier.updated": ["Supplier updated", "Təchizatçı yeniləndi"],
    "quote.version_recorded": [
      "Quotation version recorded",
      "Təklif versiyası qeydə alındı",
    ],
    "order.offer_prepared": [
      "Order summary prepared",
      "Sifariş xülasəsi hazırlandı",
    ],
    "order.confirmed": ["Order confirmed", "Sifariş təsdiqləndi"],
    "procurement.shortage_created": [
      "Supply case opened",
      "Təchizat işi açıldı",
    ],
    "fixture.delivery": [
      "Demo delivery recorded",
      "Demo çatdırılma qeydə alındı",
    ],
    "order.cancellation": ["Cancellation recorded", "Ləğv qeydə alındı"],
    "order.status_changed": [
      "Order status updated",
      "Sifariş vəziyyəti yeniləndi",
    ],
    "return.requested": ["Return requested", "Qaytarma tələb edildi"],
    "return.status_changed": [
      "Return status updated",
      "Qaytarma vəziyyəti yeniləndi",
    ],
    "return.inspected": [
      "Returned goods inspected",
      "Qaytarılan məhsullar yoxlanıldı",
    ],
    "return.resolved": ["Return resolved", "Qaytarma tamamlandı"],
    "exchange.confirmed": ["Exchange confirmed", "Dəyişdirmə təsdiqləndi"],
    "exchange.offer_linked": [
      "Replacement summary prepared",
      "Əvəzləyici xülasə hazırlandı",
    ],
    "stock.reservation_expired": [
      "Reservation expired",
      "Rezervasiyanın müddəti bitdi",
    ],
  };
  return labels[action]?.[locale === "az" ? 1 : 0] ?? action;
}
