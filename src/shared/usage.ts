import type { RunRecord } from "./operations.js";
export function usageSummary(
  rows: RunRecord["usage"],
  field: "input_tokens" | "output_tokens" | "cost_microusd",
) {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is number => value !== null);
  return {
    known: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
    knownEntries: values.length,
    entries: rows.length,
  };
}
