import { CASES } from "./cases.js";
import type { TrialRecord } from "./trial.js";
export function wilson(
  success: number,
  total: number,
): [number, number] | null {
  if (!total) return null;
  const z = 1.959963984540054,
    p = success / total,
    d = 1 + (z * z) / total;
  const mid = (p + (z * z) / (2 * total)) / d,
    half =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}
const median = (numbers: number[]) => {
  const values = [...numbers].sort((a, b) => a - b),
    n = values.length;
  return n
    ? (values[Math.floor((n - 1) / 2)]! + values[Math.floor(n / 2)]!) / 2
    : null;
};
export function summarize(records: TrialRecord[]) {
  const groups = [...new Set(records.map((r) => r.approach))].map(
    (approach) => {
      const rows = records.filter((r) => r.approach === approach),
        succeeded = rows.filter((r) => r.taskSuccess).length;
      const usages = rows.flatMap((r) => r.usage);
      return {
        approach,
        attempted: rows.length,
        succeeded,
        failed: rows.length - succeeded,
        businessStatePass: rows.filter((r) => r.businessStatePass).length,
        escalated: rows.filter((r) => r.status === "escalation").length,
        violationTrials: rows.filter((r) => r.violations.length > 0).length,
        stopped: rows.filter((r) => r.status === "stopped").length,
        // Repeated cases are clustered. This interval describes trial variation
        // only; it is not a population generalization or independent-case CI.
        descriptiveTrialWilson95: wilson(succeeded, rows.length),
        medianPreparationMs: median(rows.map((r) => r.preparationMs)),
        medianModelMs: median(rows.map((r) => r.modelMs)),
        medianHumanForegroundMs: median(
          rows.flatMap((r) =>
            r.humanForegroundMs === null ? [] : [r.humanForegroundMs],
          ),
        ),
        humanActions: rows.reduce((n, r) => n + (r.humanActions ?? 0), 0),
        modelCalls: usages.length,
        knownCostMicroUsd: usages.reduce(
          (n, u) => n + (u.costMicroUsd ?? 0),
          0,
        ),
        unknownCostCalls: usages.filter((u) => u.costMicroUsd === null).length,
        tokens: {
          knownInput: usages.reduce((n, u) => n + (u.inputTokens ?? 0), 0),
          knownOutput: usages.reduce((n, u) => n + (u.outputTokens ?? 0), 0),
          unknownInputCalls: usages.filter((u) => u.inputTokens === null)
            .length,
          unknownOutputCalls: usages.filter((u) => u.outputTokens === null)
            .length,
        },
      };
    },
  );
  const cases = CASES.map((spec) => {
    const rows = records.filter((r) => r.caseId === spec.id);
    const hashes = [...new Set(rows.map((r) => r.inputHash))];
    return {
      id: spec.id,
      title: spec.title,
      locale: spec.locale,
      inputEquality: hashes.length === 1,
      inputHashes: hashes,
      approaches: groups.map((g) => {
        const arm = rows.filter((r) => r.approach === g.approach);
        return {
          approach: g.approach,
          attempted: arm.length,
          succeeded: arm.filter((r) => r.taskSuccess).length,
          terminalCounts: Object.fromEntries(
            [...new Set(arm.map((r) => r.status))].map((s) => [
              s,
              arm.filter((r) => r.status === s).length,
            ]),
          ),
          failedCodes: arm
            .filter((r) => !r.taskSuccess)
            .map(
              (r) =>
                r.errorCode ??
                Object.entries(r.checks)
                  .filter(([, v]) => !v)
                  .map(([k]) => k)
                  .join(","),
            ),
        };
      }),
    };
  });
  return {
    groups,
    cases,
    allInputEquality: cases.every((c) => c.inputEquality),
    humanParticipants: records.some((r) => r.approach === "manual") ? 1 : 0,
    limitations: [
      "Eight purposively selected synthetic procurement cases, one human participant; no population generalization.",
      "Five agent repetitions reuse each case; trials are clustered, not forty independent business cases.",
      "The deterministic comparison and proposal service selects the supplier in every arm; this evaluates tool orchestration, not free-form model arithmetic or supplier selection.",
      "Scheduled owner decisions and supplier/inspection/delivery events are identical synthetic fixtures. Their waiting times, wages, real logistics and payments are not measured.",
      "Foreground duration is observed UI time, not a direct measure of cognitive effort. Manual interface familiarity, learning and fixed case order may affect timing.",
      "No randomized counterbalanced human trial or statistical causal estimate of employee productivity.",
      "Mock pilots verify the protocol and are excluded from live-model results. All stopped, failed and escalated live trials remain in the denominator.",
      "The provider uses its default sampling; model ID/configuration are frozen but service behavior can change.",
    ],
  };
}
export function markdownReport(
  result: ReturnType<typeof summarize>,
  protocolHash: string,
) {
  const lines = [
    "# Comparative experiment results",
    "",
    `Protocol SHA-256: \`${protocolHash}\`.`,
    "",
    "This is a bounded comparison of procurement tool orchestration over the same deterministic business services. Human approvals and supplier fulfillment are simulated shared environment events.",
    "",
    "| Approach | Attempts | Task success | Final state passes | Escalations | Violation trials | Median preparation (s) | Known model cost (USD) | Unknown cost calls |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const g of result.groups)
    lines.push(
      `| ${g.approach} | ${g.attempted} | ${g.succeeded}/${g.attempted} | ${g.businessStatePass} | ${g.escalated} | ${g.violationTrials} | ${g.medianPreparationMs === null ? "unknown" : (g.medianPreparationMs / 1000).toFixed(3)} | ${(g.knownCostMicroUsd / 1000000).toFixed(6)} | ${g.unknownCostCalls} |`,
    );
  lines.push(
    "",
    "Manual elapsed time includes foreground/reading/input and observed service response. Agent preparation includes inference and tool execution; the fixed arm records machine execution only. These are different quantities: do not report a human productivity speedup ratio.",
    "",
    "| Case | Locale | Equal initial inputs | Outcome by approach |",
    "| --- | --- | --- | --- |",
  );
  for (const c of result.cases)
    lines.push(
      `| ${c.id}: ${c.title} | ${c.locale} | ${c.inputEquality} | ${c.approaches.map((a) => `${a.approach}: ${a.succeeded}/${a.attempted}`).join("; ")} |`,
    );
  lines.push("", "## Sampling and uncertainty", "");
  for (const g of result.groups) {
    const ci = g.descriptiveTrialWilson95;
    if (ci)
      lines.push(
        `${g.approach}: descriptive trial-level Wilson 95% interval ${(ci[0] * 100).toFixed(1)}–${(ci[1] * 100).toFixed(1)}%. Repeated-case clustering and purposeful case selection prevent treating this as a population performance estimate.`,
      );
  }
  lines.push(
    "",
    "## Limits",
    "",
    ...result.limitations.map((l) => `- ${l}`),
    "",
    "Representative presentation examples and the conclusions below must use the actually recorded outcomes, including failures.",
    "",
  );
  return lines.join("\n");
}
