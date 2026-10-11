import { useEffect, useState } from "react";
import { Sparkles, FileCheck2 } from "lucide-react";
import { useShop } from "./shop";
import { useData } from "./data";
import { ApiError, mutationKey, readSaved, request, save } from "./api";
import { DataState, Status } from "./Orders";
import { dateTime, money, translatedCode } from "./i18n";
import type {
  ProcurementRequest,
  ProcurementTurn,
  ProposalDetail,
} from "../shared/procurement";

type State = {
  liveAvailable: boolean;
  latestVersion: number;
  proposals: ProposalDetail[];
  latestTurn: ProcurementTurn | null;
};
export function ProcurementAgent({
  caseId,
  closed,
}: {
  caseId: string;
  closed: boolean;
}) {
  const { t, locale, session, refresh, fail } = useShop();
  const path = `/api/procurement/${encodeURIComponent(caseId)}/agent`;
  const { data, error } = useData<State>(path);
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `relayops-procurement-${session?.account.id}-${caseId}`;
  const [pending, setPending] = useState<ProcurementRequest | null>(() =>
    readSaved(storageKey, null, sessionStorage),
  );
  const [turn, setTurn] = useState<ProcurementTurn | null>(null);
  const current = turn ?? data?.latestTurn;
  const running =
    !!current && current.status !== "done" && !current.needsResume;
  useEffect(() => {
    if (!running || !current || !session) return;
    let active = true;
    const timer = window.setInterval(() => {
      request<ProcurementTurn>(
        `${path}/${encodeURIComponent(current.runId)}`,
        session,
      )
        .then((value) => {
          if (!active) return;
          setTurn(value);
          if (value.status === "done") refresh();
        })
        .catch((error) => {
          if (active) {
            fail(error);
            window.clearInterval(timer);
          }
        });
    }, 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [current?.runId, running, session, path]);
  const start = async () => {
    if (!session || !data) return;
    const input = pending ?? {
      mode,
      locale,
      key: mutationKey(),
      expectedVersion: data.latestVersion,
      revisionReason: data.latestVersion ? reason.trim() : null,
    };
    setPending(input);
    save(storageKey, input, sessionStorage);
    setBusy(true);
    try {
      const result = await request<{ runId: string }>(path, session, input);
      setTurn(
        await request<ProcurementTurn>(
          `${path}/${encodeURIComponent(result.runId)}`,
          session,
        ),
      );
      setPending(null);
      save(storageKey, null, sessionStorage);
      refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code !== "CONNECTION_ERROR") {
        setPending(null);
        save(storageKey, null, sessionStorage);
      }
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const resume = async () => {
    if (!session || !current) return;
    setBusy(true);
    try {
      await request(
        `${path}/${encodeURIComponent(current.runId)}/resume`,
        session,
        {},
      );
      setTurn(
        await request<ProcurementTurn>(
          `${path}/${encodeURIComponent(current.runId)}`,
          session,
        ),
      );
      refresh();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="operation-section procurement-agent"
      aria-label={t("procurementAgent")}
    >
      <div className="record-heading">
        <div>
          <h3>
            <Sparkles size={20} />
            {t("procurementAgent")}
          </h3>
          <p>{t("procurementAgentText")}</p>
        </div>
      </div>
      {!data ? (
        <DataState error={error} />
      ) : (
        <>
          {!closed && (
            <div className="procurement-controls">
              <label>
                {t("procurementMode")}
                <select
                  value={mode}
                  disabled={busy || running || !!pending}
                  onChange={(event) =>
                    setMode(event.target.value as "mock" | "live")
                  }
                >
                  <option value="mock">{t("aDemo")}</option>
                  {data.liveAvailable && (
                    <option value="live">{t("aLive")}</option>
                  )}
                </select>
              </label>
              {!!data.latestVersion && (
                <label className="procurement-reason">
                  {t("proposalRevisionReason")}
                  <textarea
                    maxLength={1000}
                    value={reason}
                    disabled={busy || running || !!pending}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
              <button
                className="button"
                disabled={
                  busy ||
                  running ||
                  !!current?.needsResume ||
                  (!!data.latestVersion && !reason.trim() && !pending)
                }
                onClick={() => void start()}
              >
                {busy || running
                  ? t("loading")
                  : pending
                    ? t("retry")
                    : t(
                        data.latestVersion
                          ? "reviseProposal"
                          : "prepareProposal",
                      )}
              </button>
            </div>
          )}
          <p className="procurement-boundary">
            {t("proposalHumanBoundary")}{" "}
            {mode === "live"
              ? t("procurementLiveCost")
              : t("procurementMockCost")}
          </p>
          {current && (
            <div className="procurement-result" aria-live="polite">
              <strong>{t(current.mode === "mock" ? "aDemo" : "aLive")}</strong>
              {running && <p>{t("procurementRunning")}</p>}
              {current.needsResume && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void resume()}
                >
                  {t("aResume")}
                </button>
              )}
              {current.outcome?.message && <p>{current.outcome.message}</p>}
              {current.outcome?.errorCode && (
                <p className="record-warning">
                  {translatedCode(locale, current.outcome.errorCode)}
                </p>
              )}
            </div>
          )}
          {!data.proposals.length ? (
            <p>{t("noProposals")}</p>
          ) : (
            <div className="procurement-drafts">
              {data.proposals.map((proposal) => (
                <article key={proposal.id}>
                  <div className="record-heading">
                    <h4>
                      <FileCheck2 size={18} />
                      {t("purchasingDraft")} · {t("version")} {proposal.version}
                    </h4>
                    <Status value={proposal.effectiveStatus} />
                  </div>
                  <div className="procurement-summary">
                    <strong>{money(locale, proposal.total)}</strong>
                    <span>
                      {proposal.quantity} {t("units")}
                    </span>
                    <span>
                      {t("expiresAt")}: {dateTime(locale, proposal.expiresAt)}
                    </span>
                  </div>
                  <p>{proposal.snapshot.explanation[locale]}</p>
                  {!!proposal.invalidationReasons.length && (
                    <p className="record-warning">
                      {proposal.invalidationReasons
                        .map((code) => translatedCode(locale, code))
                        .join(" ")}
                    </p>
                  )}
                  <details>
                    <summary>{t("proposalEvidence")}</summary>
                    <p>
                      {t("recordId")}: {proposal.id}
                    </p>
                    <p>
                      {t("acceptedSpecs")}:{" "}
                      {JSON.stringify(
                        proposal.snapshot.evidence.requirements.specs,
                      )}
                    </p>
                    <p>
                      {t("remainingQuantity")}:{" "}
                      {proposal.snapshot.evidence.requirements.requiredQuantity}
                      ; {t("reservedForOrder")}:{" "}
                      {
                        proposal.snapshot.evidence.requirements.inventory
                          .reservedForOrder
                      }
                    </p>
                    <p>
                      {t("remainingBudget")}:{" "}
                      {money(
                        locale,
                        proposal.snapshot.evidence.requirements.budget
                          .remaining,
                      )}
                    </p>
                    {proposal.snapshot.revisionReason && (
                      <p>
                        {t("proposalRevisionReason")}:{" "}
                        {proposal.snapshot.revisionReason}
                      </p>
                    )}
                    <p>
                      {t("proposalAgentNote")}:{" "}
                      {proposal.snapshot.modelNote.text}
                    </p>
                  </details>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
