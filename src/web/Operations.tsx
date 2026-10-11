import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ClipboardCheck,
  Cpu,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Link, useShop } from "./shop";
import { useData } from "./data";
import { DataState, Status } from "./Orders";
import { dateTime, money, translatedCode, type MessageKey } from "./i18n";
import { auditName } from "./audit";
import { usageSummary } from "../shared/usage";
import { ProcurementAgent } from "./ProcurementAgent";
import type {
  AuditRecord,
  CaseDetail,
  PurchasingRecords,
  RunRecord,
} from "../shared/operations";
import type { Workspace } from "./types";

function Facts({ rows }: { rows: [MessageKey, ReactNode][] }) {
  const { t } = useShop();
  return (
    <dl className="operation-facts">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Empty({ text }: { text: MessageKey }) {
  const { t } = useShop();
  return (
    <div className="record-empty">
      <p>{t(text)}</p>
    </div>
  );
}
export function CaseFilter({
  data,
  view,
  caseId,
}: {
  data: Workspace;
  view: string;
  caseId: string | null;
}) {
  const { t, navigate } = useShop();
  return (
    <label className="case-filter">
      {t("case")}
      <select
        value={caseId ?? ""}
        onChange={(e) =>
          navigate(
            `/workspace/${view}${e.target.value ? `?case=${encodeURIComponent(e.target.value)}` : ""}`,
          )
        }
      >
        <option value="">{t("allCases")}</option>
        {data.cases.map((row) => (
          <option key={row.id} value={row.id}>
            #{row.id.slice(-8)}
          </option>
        ))}
        {caseId && !data.cases.some((row) => row.id === caseId) && (
          <option value={caseId}>#{caseId}</option>
        )}
      </select>
    </label>
  );
}
export function AuditTimeline({ records }: { records: AuditRecord[] }) {
  const { t, locale } = useShop();
  if (!records.length) return <Empty text="noAudit" />;
  return (
    <ol className="case-timeline" aria-label={t("audit")}>
      {records.map((row) => (
        <li key={row.id}>
          <ShieldCheck size={17} />
          <div>
            <strong>{auditName(locale, row.action)}</strong>
            <small>
              {t("recordId")}: {row.entity_id}
            </small>
          </div>
          <time dateTime={row.created_at}>
            {dateTime(locale, row.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
export function CaseDetails({ caseId }: { caseId: string }) {
  const { t, locale, products, session } = useShop();
  const { data, error } = useData<CaseDetail>(
    `/api/procurement/${encodeURIComponent(caseId)}`,
  );
  if (!data) return <DataState error={error} />;
  const row = data.case,
    order = data.order,
    consent = data.consent;
  const product = products.find((p) => p.id === row.product_id);
  const unknown = t("notProvided");
  return (
    <section className="case-detail" aria-label={t("caseDetails")}>
      <header className="case-detail-heading">
        <div>
          <h2>{product?.name ?? row.product_id}</h2>
          <p>
            {t("case")} #{row.id}
          </p>
        </div>
        <Status value={row.status} />
      </header>
      <nav className="case-related" aria-label={t("caseRecords")}>
        {(["approvals", "purchaseOrders", "audit", "modelUsage"] as const).map(
          (view) => (
            <Link
              key={view}
              to={`/workspace/${view}?case=${encodeURIComponent(caseId)}`}
            >
              {t(view)}
              <ArrowUpRight size={14} />
            </Link>
          ),
        )}
      </nav>
      <ProcurementAgent
        key={`${caseId}:${session?.account.id}`}
        caseId={caseId}
        closed={row.status === "closed"}
      />
      <div className="case-detail-columns">
        <section className="operation-section">
          <h3>{t("customerRequirement")}</h3>
          <Facts
            rows={[
              [
                "order",
                <Link to={`/orders/${order.id}`} className="text-link">
                  #{order.id.slice(-8)}
                  <ArrowUpRight size={14} />
                </Link>,
              ],
              ["status", <Status value={order.status} />],
              ["quantity", order.quantity],
              ["shortage", row.quantity],
              ["deliveredQuantity", order.delivered_quantity],
              ["deadline", dateTime(locale, order.deadline)],
              ["destination", translatedCode(locale, order.destination)],
              ["partialConsent", t(order.allow_partial ? "yes" : "no")],
              [
                "substitutionConsent",
                t(order.allow_substitution ? "yes" : "no"),
              ],
            ]}
          />
        </section>
        <section className="operation-section">
          <h3>{t("consentRecord")}</h3>
          <p>{t("consentBoundary")}</p>
          <Facts
            rows={[
              ["recordId", order.consent_offer_id],
              ["version", order.consent_version],
              ["quantity", consent.quantity ?? unknown],
              [
                "total",
                consent.total === null ? unknown : money(locale, consent.total),
              ],
              ["consentedAllocation", consent.availableAllocation ?? unknown],
              ["shortage", consent.shortage ?? unknown],
              [
                "supportedDelivery",
                consent.supportedDelivery
                  ? dateTime(locale, consent.supportedDelivery)
                  : t("pendingSupplierDate"),
              ],
            ]}
          />
          <h4>{t("acceptedSpecs")}</h4>
          {consent.productSpecs ? (
            <dl className="operation-facts">
              {Object.entries(consent.productSpecs).map(([key, value]) => (
                <div key={key}>
                  <dt>{translatedCode(locale, key)}</dt>
                  <dd>
                    {typeof value === "boolean"
                      ? t(value ? "yes" : "no")
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{unknown}</p>
          )}
        </section>
        <section className="operation-section">
          <h3>{t("stockAndReservations")}</h3>
          <Facts
            rows={[
              ["physical", data.inventory.physical],
              ["stock", data.inventory.available],
              ["reservedForOrder", data.inventory.reservedForOrder],
              ["consentedAllocation", consent.availableAllocation ?? unknown],
            ]}
          />
          {!data.reservations.length ? (
            <Empty text="noReservations" />
          ) : (
            data.reservations.map((r) => (
              <div className="reservation-record" key={r.id}>
                <strong>
                  {r.quantity} {t("units")}
                </strong>
                <Status value={r.effectiveStatus} />
                <small>
                  {t("expiresAt")}: {dateTime(locale, r.expires_at)}
                </small>
                {r.effectiveStatus !== r.status && (
                  <p className="record-warning">{t("reservationElapsed")}</p>
                )}
              </div>
            ))
          )}
        </section>
        <section className="operation-section">
          <h3>{t("purchasingBudget")}</h3>
          <Facts
            rows={[
              ["budget", money(locale, row.budget)],
              ["reservedBudget", money(locale, data.budget.reserved)],
              ["committedBudget", money(locale, data.budget.committed)],
              ["remainingBudget", money(locale, data.budget.remaining)],
              ["businessClock", dateTime(locale, data.businessClock)],
            ]}
          />
          <p>{t("budgetBoundary")}</p>
        </section>
      </div>
      <section className="operation-section">
        <h3>{t("processStatus")}</h3>
        <p>{t("processBoundary")}</p>
        {data.processes.length ? (
          <div className="process-records">
            {data.processes.map((p) => (
              <article key={p.id}>
                <Status value={p.state} />
                <span>
                  {t("version")} {p.version}
                </span>
                <time dateTime={p.updated_at}>
                  {dateTime(locale, p.updated_at)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <Empty text="noProcesses" />
        )}
      </section>
      <section className="operation-section">
        <h3>{t("fulfillmentBatches")}</h3>
        {data.fulfillment.length ? (
          data.fulfillment.map((b) => (
            <article key={b.id} className="fulfillment-record">
              <strong>
                {b.quantity} {t("units")}
              </strong>
              <Status value={b.status} />
              <time dateTime={b.promised_at}>
                {dateTime(locale, b.promised_at)}
              </time>
              {b.evidence && <p>{b.evidence}</p>}
            </article>
          ))
        ) : (
          <Empty text="noBatches" />
        )}
      </section>
      <section className="operation-section">
        <h3>{t("caseAudit")}</h3>
        <AuditTimeline records={data.audit} />
      </section>
    </section>
  );
}
const filterQuery = (caseId: string | null) =>
  caseId ? `?case=${encodeURIComponent(caseId)}` : "";
export function ProposalView({
  caseId,
  workspace,
}: {
  caseId: string | null;
  workspace: Workspace;
}) {
  const { t, locale } = useShop();
  const { data, error } = useData<PurchasingRecords>(
    `/api/purchasing-records${filterQuery(caseId)}`,
  );
  return (
    <>
      <div className="operation-toolbar">
        <p>{t("proposalViewText")}</p>
        <CaseFilter data={workspace} view="approvals" caseId={caseId} />
      </div>
      <div className="integration-note">
        <ClipboardCheck size={22} />
        <div>
          <strong>{t("decisionNotConnected")}</strong>
          <p>{t("decisionBoundary")}</p>
        </div>
      </div>
      {!data ? (
        <DataState error={error} />
      ) : !data.proposals.length ? (
        <Empty text="noProposals" />
      ) : (
        <div className="proposal-history">
          {data.proposals.map((p) => (
            <article className="operation-section" key={p.id}>
              <div className="record-heading">
                <div>
                  <Link
                    to={`/workspace/procurement?case=${encodeURIComponent(p.case_id)}`}
                    className="text-link"
                  >
                    {t("case")} #{p.case_id.slice(-8)}
                    <ArrowUpRight size={14} />
                  </Link>
                  <h2>
                    {p.supplier_name} · {t("version")} {p.version}
                  </h2>
                </div>
                <Status value={p.status} />
              </div>
              <Facts
                rows={[
                  ["recordId", p.id],
                  ["quantity", p.quantity],
                  ["total", money(locale, p.total)],
                  [
                    "quoteVersion",
                    <Link
                      className="text-link"
                      to={`/workspace/quotations?supplier=${encodeURIComponent(p.supplier_id)}&product=${encodeURIComponent(p.product_id)}`}
                    >
                      {p.quote_id} · v{p.quote_version}
                      <ArrowUpRight size={14} />
                    </Link>,
                  ],
                  ["expiresAt", dateTime(locale, p.expires_at)],
                  [
                    "approvalRoute",
                    t(p.total > 100000 ? "owner" : "purchaserOrOwner"),
                  ],
                ]}
              />
              {p.elapsed &&
                ![
                  "executed",
                  "rejected",
                  "superseded",
                  "invalidated",
                  "expired",
                ].includes(p.status) && (
                  <p className="record-warning">{t("decisionElapsed")}</p>
                )}
              <div className="approval-record">
                <h3>{t("approvalRecord")}</h3>
                {p.approval ? (
                  <>
                    <Facts
                      rows={[
                        ["recordId", p.approval.id],
                        ["recipient", p.approval.recipient_id],
                        ["status", <Status value={p.approval.status} />],
                        ["expiresAt", dateTime(locale, p.approval.expires_at)],
                      ]}
                    />
                    {p.approval.elapsed && p.approval.status === "pending" && (
                      <p className="record-warning">{t("decisionElapsed")}</p>
                    )}
                    {p.approval.decision ? (
                      <div className="decision-record">
                        <Status value={p.approval.decision.decision} />
                        <strong>{p.approval.decision.actor_id}</strong>
                        <time dateTime={p.approval.decision.created_at}>
                          {dateTime(locale, p.approval.decision.created_at)}
                        </time>
                        <p>{p.approval.decision.reason}</p>
                      </div>
                    ) : (
                      <p>{t("noDecision")}</p>
                    )}
                  </>
                ) : (
                  <p>{t("noApprovalRequest")}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function PurchaseView({
  caseId,
  workspace,
  purchasing,
}: {
  caseId: string | null;
  workspace: Workspace;
  purchasing: boolean;
}) {
  const { t, locale, products } = useShop();
  const { data, error } = useData<PurchasingRecords>(
    `/api/purchasing-records${filterQuery(caseId)}`,
  );
  return (
    <>
      <div className="operation-toolbar">
        <p>{t("purchaseViewText")}</p>
        {purchasing && (
          <CaseFilter data={workspace} view="purchaseOrders" caseId={caseId} />
        )}
      </div>
      <div className="integration-note">
        <PackageCheck size={22} />
        <div>
          <strong>{t("fulfillmentNotConnected")}</strong>
          <p>{t("receiptBoundary")}</p>
        </div>
      </div>
      {!data ? (
        <DataState error={error} />
      ) : !data.purchaseOrders.length ? (
        <Empty text="noPurchases" />
      ) : (
        data.purchaseOrders.map((po) => (
          <article className="operation-section purchase-record" key={po.id}>
            <div className="record-heading">
              <div>
                <h2>{po.supplier_name}</h2>
                <p>
                  {products.find((p) => p.id === po.product_id)?.name ??
                    po.product_id}
                </p>
              </div>
              <Status value={po.status} />
            </div>
            {purchasing && (
              <Link
                className="text-link"
                to={`/workspace/procurement?case=${encodeURIComponent(po.case_id)}`}
              >
                {t("case")} #{po.case_id.slice(-8)}
                <ArrowUpRight size={14} />
              </Link>
            )}
            <Facts
              rows={[
                ["recordId", po.id],
                ["proposalRecord", po.proposal_id],
                ["orderedQuantity", po.quantity],
                ["receivedQuantity", po.received_quantity],
                ["cancelledQuantity", po.cancelled_quantity],
                ["remainingQuantity", po.remaining_quantity],
                ["recordedAt", dateTime(locale, po.created_at)],
              ]}
            />
            <h3>{t("goodsReceipts")}</h3>
            {!po.receipts.length ? (
              <Empty text="noReceipts" />
            ) : (
              <div className="receipt-list">
                {po.receipts.map((r) => (
                  <section key={r.id} className="receipt-record">
                    <div className="record-heading">
                      <strong>#{r.id}</strong>
                      <Status value={r.inspection} />
                    </div>
                    <Facts
                      rows={[
                        ["quantity", r.quantity],
                        ["recordedAt", dateTime(locale, r.created_at)],
                        [
                          "serials",
                          r.serials.length
                            ? r.serials.join(", ")
                            : t("notProvided"),
                        ],
                      ]}
                    />
                    {r.exception_reason && (
                      <p>
                        {t("exceptionReason")}: {r.exception_reason}
                      </p>
                    )}
                  </section>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </>
  );
}
export function CaseAuditView({
  caseId,
  workspace,
}: {
  caseId: string | null;
  workspace: Workspace;
}) {
  const { t } = useShop();
  const { data, error } = useData<AuditRecord[]>(
    caseId ? `/api/procurement/${encodeURIComponent(caseId)}/audit` : null,
  );
  return (
    <>
      <div className="operation-toolbar">
        <p>{t("caseAuditText")}</p>
        <CaseFilter data={workspace} view="audit" caseId={caseId} />
      </div>
      {caseId ? (
        !data ? (
          <DataState error={error} />
        ) : (
          <AuditTimeline records={data} />
        )
      ) : (
        <Empty text="chooseAuditCase" />
      )}
    </>
  );
}
function usd(locale: string, amount: number) {
  const whole = Math.floor(amount / 1000000),
    fraction = String(amount % 1000000).padStart(6, "0");
  return `$${whole}${locale === "az" ? "," : "."}${fraction}`;
}
export function ModelUsageView({
  caseId,
  workspace,
}: {
  caseId: string | null;
  workspace: Workspace;
}) {
  const { t, locale } = useShop();
  const { data, error } = useData<RunRecord[]>(
    `/api/model-runs${filterQuery(caseId)}`,
  );
  const usage = data?.flatMap((r) => r.usage) ?? [];
  const count = (value: number) =>
    new Intl.NumberFormat(locale === "az" ? "az-AZ" : "en-GB").format(value);
  const summary = (
    field: "input_tokens" | "output_tokens" | "cost_microusd",
  ) => {
    const result = usageSummary(usage, field);
    return (
      <>
        <strong>
          {result.known === null
            ? t("notProvided")
            : field === "cost_microusd"
              ? usd(locale, result.known)
              : count(result.known)}
        </strong>
        <small>
          {t("knownEntries")}: {result.knownEntries} / {result.entries}
        </small>
      </>
    );
  };
  return (
    <>
      <div className="operation-toolbar">
        <p>{t("usageViewText")}</p>
        <CaseFilter data={workspace} view="modelUsage" caseId={caseId} />
      </div>
      <div className="integration-note">
        <Cpu size={22} />
        <div>
          <strong>{t("modelNotConnected")}</strong>
          <p>{t("usageBoundary")}</p>
        </div>
      </div>
      {!data ? (
        <DataState error={error} />
      ) : !data.length ? (
        <Empty text="noModelRuns" />
      ) : (
        <>
          <div className="usage-summary">
            {(["input_tokens", "output_tokens", "cost_microusd"] as const).map(
              (field) => (
                <div key={field}>
                  <span>{t(field)}</span>
                  {summary(field)}
                </div>
              ),
            )}
          </div>
          {data.map((run) => (
            <article className="operation-section run-record" key={run.id}>
              <div className="record-heading">
                <div>
                  <h2>
                    {t(
                      run.agent === "customer"
                        ? "customerAssistantRun"
                        : "procurementAgentRun",
                    )}
                  </h2>
                  <p>{run.id}</p>
                </div>
                <div className="run-badges">
                  <Status value={run.status} />
                  <Status value={run.mode} />
                </div>
              </div>
              <Facts
                rows={[
                  ["model", run.model ?? t("notProvided")],
                  ["recordedAt", dateTime(locale, run.started_at)],
                  [
                    "case",
                    run.case_id ? (
                      <Link
                        className="text-link"
                        to={`/workspace/procurement?case=${encodeURIComponent(run.case_id)}`}
                      >
                        #{run.case_id.slice(-8)}
                        <ArrowUpRight size={14} />
                      </Link>
                    ) : (
                      t("noLinkedCase")
                    ),
                  ],
                ]}
              />
              <h3>{t("toolActivity")}</h3>
              {run.toolCalls.length ? (
                <ul className="tool-activity">
                  {run.toolCalls.map((tool) => (
                    <li key={tool.id}>
                      <span>{tool.name}</span>
                      <Status value={tool.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="noToolCalls" />
              )}
              <h3>{t("usageEntries")}</h3>
              {run.usage.length ? (
                <div className="table-wrap">
                  <table className="data-table usage-table">
                    <thead>
                      <tr>
                        <th>{t("recordId")}</th>
                        <th>{t("inputTokens")}</th>
                        <th>{t("outputTokens")}</th>
                        <th>{t("reportedCost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.usage.map((u) => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>
                            {u.input_tokens === null
                              ? t("notProvided")
                              : count(u.input_tokens)}
                          </td>
                          <td>
                            {u.output_tokens === null
                              ? t("notProvided")
                              : count(u.output_tokens)}
                          </td>
                          <td>
                            {u.cost_microusd === null
                              ? t("notProvided")
                              : usd(locale, u.cost_microusd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="noUsageEntries" />
              )}
            </article>
          ))}
        </>
      )}
    </>
  );
}
