import { useEffect, useRef, useState } from "react";
import { useShop } from "./shop";
import { useData } from "./data";
import { request, mutationKey } from "./api";
import { Status, DataState } from "./Orders";
import { translatedCode } from "./i18n";
import type { ApprovalState, ApprovalView } from "../shared/approvals";
import type { ProposalDetail } from "../shared/procurement";

export function ApprovalActions({ proposal }: { proposal: ProposalDetail }) {
  const { t, locale, session, refresh, fail } = useShop();
  const path = `/api/procurement/${encodeURIComponent(proposal.caseId)}/approvals`;
  const { data, error } = useData<ApprovalState>(path);
  const [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const keys = useRef(new Map<string, string>());
  const [latest, setLatest] = useState<ApprovalView | null>(null);
  const approval =
    latest ?? data?.requests.find((r) => r.proposalId === proposal.id);
  useEffect(() => {
    if (approval?.effectiveStatus !== "pending" || !session) return;
    let active = true;
    const timer = window.setInterval(() => {
      request<ApprovalState>(path, session)
        .then((value) => {
          if (!active) return;
          const next = value.requests.find((r) => r.proposalId === proposal.id);
          if (next) {
            setLatest(next);
            if (next.effectiveStatus !== "pending") refresh();
          }
        })
        .catch((error) => {
          if (active) {
            fail(error);
            window.clearInterval(timer);
          }
        });
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [approval?.id, approval?.effectiveStatus, session, path, proposal.id]);
  const send = async (intent: "mock" | "live" | "approved" | "rejected") => {
    if (!session || busy) return;
    setBusy(true);
    const fingerprint = JSON.stringify({
      intent,
      reason,
      version: proposal.version,
    });
    const key = keys.current.get(fingerprint) ?? mutationKey();
    keys.current.set(fingerprint, key);
    try {
      if (intent === "mock" || intent === "live") {
        await request(
          `/api/procurement/${encodeURIComponent(proposal.caseId)}/proposals/${encodeURIComponent(proposal.id)}/approval`,
          session,
          { mode: intent, expectedVersion: proposal.version, key },
        );
      } else if (approval) {
        await request(
          `${path}/${encodeURIComponent(approval.id)}/decision`,
          session,
          { decision: intent, reason, key },
        );
      }
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <DataState error={error} />;
  return (
    <div className="procurement-controls">
      <p className="small-muted">{t("approvalBoundary")}</p>
      {!data.configured && <p>{t("approvalDisconnected")}</p>}
      {!approval && data.configured && proposal.effectiveStatus === "draft" && (
        <>
          <p>
            {t("approvalRecipient")}: {data.recipientAccount} ·{" "}
            {data.recipientLocale?.toUpperCase()}
          </p>
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => void send("mock")}
          >
            {t("approvalMock")}
          </button>
          <button
            className="button"
            disabled={busy || !data.liveAvailable}
            onClick={() => void send("live")}
          >
            {t("approvalSend")}
          </button>
          {!data.liveAvailable && (
            <p className="small-muted">{t("approvalLiveDisabled")}</p>
          )}
        </>
      )}
      {approval && (
        <>
          <p>
            {t(
              approval.mode === "live"
                ? "approvalTelegram"
                : "approvalSimulation",
            )}{" "}
            · <Status value={approval.effectiveStatus} />
          </p>
          <p>
            {t("approvalDelivery")}:{" "}
            {translatedCode(locale, `approval_delivery_${approval.delivery}`)}
          </p>
          {approval.delivery === "unknown" && (
            <p className="record-warning">{t("approvalSendUnknown")}</p>
          )}
          {approval.decision && (
            <p>
              {t("approvalRecorded")}: {approval.decision.reason}
            </p>
          )}
          {approval.canDecide && (
            <>
              <label>
                {t("approvalReason")}
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <button
                className="button"
                disabled={busy || !reason.trim()}
                onClick={() => void send("approved")}
              >
                {t("approvalApprove")}
              </button>
              <button
                className="button button-quiet"
                disabled={busy || !reason.trim()}
                onClick={() => void send("rejected")}
              >
                {t("approvalReject")}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
