import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import {
  CASES,
  PROTOCOL,
  PROTOCOL_HASH,
  hash,
  caseFixture,
} from "../src/evaluation/cases.js";
import {
  agentTrial,
  fixedTrial,
  type TrialRecord,
} from "../src/evaluation/trial.js";
import { summarize, markdownReport } from "../src/evaluation/report.js";
import { ProcurementMock } from "../src/model/procurement-mock.js";
import { OpenRouter } from "../src/model/openrouter.js";
import { ModelBudget } from "../src/model/budget.js";
import { modelConfig } from "../src/model/config.js";

const flag = process.argv.slice(2).join(" ");
if (!["--freeze", "--pilot", "--fixed", "--live", "--report"].includes(flag))
  throw new Error("EVALUATION_EXPLICIT_MODE_REQUIRED");
const root = resolve("artifacts/evaluation"),
  main = resolve(root, "main");
mkdirSync(main, { recursive: true });
type Manifest = {
  protocol: typeof PROTOCOL;
  protocolHash: string;
  sourceHashes: Record<string, string>;
  inputHashes: Record<string, string>;
  model: {
    id: string;
    provider: string;
    maxOutputTokens: number;
    timeoutMs: number;
  };
  frozenAt: string;
};
function sources() {
  const out: Record<string, string> = {};
  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      const p = resolve(directory, name);
      if (name.endsWith(".ts") || name.endsWith(".sql"))
        out[relative(process.cwd(), p).replaceAll("\\", "/")] = hash(
          readFileSync(p, "utf8"),
        );
      else if (!name.includes(".")) walk(p);
    }
  }
  for (const d of [
    "src/evaluation",
    "src/agent",
    "src/model",
    "src/domain",
    "src/db",
    "src/shared",
    "migrations",
  ])
    walk(resolve(d));
  for (const name of [
    "scripts/evaluation.ts",
    "scripts/evaluation-manual.ts",
    "package.json",
    "package-lock.json",
  ])
    out[name] = hash(readFileSync(name, "utf8"));
  return out;
}
const manifestFile = resolve(main, "frozen.json");
let ledger: ModelBudget | undefined;
try {
  if (flag === "--freeze") {
    if (existsSync(manifestFile)) throw new Error("EVALUATION_ALREADY_FROZEN");
    const inputHashes: Record<string, string> = {};
    for (const spec of CASES) {
      const f = caseFixture(spec);
      inputHashes[spec.id] = f.inputHash;
      f.store.close();
    }
    const settings = modelConfig();
    if (
      settings.model !== "openai/gpt-6-luna" ||
      settings.provider !== "openai"
    )
      throw new Error("EVALUATION_MODEL_CONFIGURATION_CONFLICT");
    const manifest: Manifest = {
      protocol: PROTOCOL,
      protocolHash: PROTOCOL_HASH,
      sourceHashes: sources(),
      inputHashes,
      model: {
        id: settings.model,
        provider: settings.provider,
        maxOutputTokens: Math.min(settings.maxOutputTokens, 1024),
        timeoutMs: settings.timeoutMs,
      },
      frozenAt: new Date().toISOString(),
    };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        frozen: true,
        protocolHash: PROTOCOL_HASH,
        cases: CASES.length,
        repetitions: 5,
        capMicroUsd: 500000,
      }),
    );
  } else if (flag === "--report") {
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
    const records: TrialRecord[] = [];
    for (const arm of ["manual", "fixed", "agent-live"]) {
      const d = resolve(main, arm);
      if (!existsSync(d)) continue;
      for (const n of readdirSync(d).filter(
        (n) => n.endsWith(".json") && n !== "records.json",
      ))
        records.push(
          JSON.parse(readFileSync(resolve(d, n), "utf8")) as TrialRecord,
        );
    }
    const summary = summarize(records);
    const result = {
      protocolHash: manifest.protocolHash,
      model: manifest.model,
      summary,
      trialSummaries: records.map(({ trace: _trace, ...r }) => {
        void _trace;
        return r;
      }),
    };
    writeFileSync(
      resolve(main, "results.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    writeFileSync(
      resolve(main, "results.md"),
      markdownReport(summary, manifest.protocolHash),
    );
    console.log(JSON.stringify(summary.groups));
  } else {
    const pilot = flag === "--pilot",
      dir = resolve(
        pilot ? resolve(root, "pilot") : main,
        flag === "--fixed" ? "fixed" : pilot ? "agent-mock" : "agent-live",
      );
    mkdirSync(dir, { recursive: true });
    let manifest: Manifest | undefined;
    if (!pilot) {
      manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
      if (
        manifest.protocolHash !== PROTOCOL_HASH ||
        JSON.stringify(manifest.sourceHashes) !== JSON.stringify(sources())
      )
        throw new Error("EVALUATION_FROZEN_SOURCE_CONFLICT");
    }
    let adapter: OpenRouter | undefined;
    if (flag === "--live") {
      const settings = modelConfig();
      if (
        settings.model !== manifest!.model.id ||
        settings.provider !== manifest!.model.provider ||
        Math.min(settings.maxOutputTokens, 1024) !==
          manifest!.model.maxOutputTokens ||
        settings.timeoutMs !== manifest!.model.timeoutMs
      )
        throw new Error("EVALUATION_MODEL_CONFIGURATION_CONFLICT");
      ledger = new ModelBudget(
        resolve("runtime/model-budget.sqlite"),
        settings.ceilingMicroUsd,
      );
      if (ledger.summary().heldMicroUsd || ledger.summary().stopped)
        throw new Error("EVALUATION_BUDGET_UNAVAILABLE");
      const pool = ledger.pool("phase16-v1", 500000, hash(manifest));
      if (pool.summary().heldMicroUsd)
        throw new Error("EVALUATION_UNCERTAIN_BILLING_STOP");
      adapter = new OpenRouter(settings, pool);
    }
    // Round-robin case order spreads five repetitions across time. A pending
    // marker stops crash recovery instead of silently paying for a replay.
    for (
      let repetition = 1;
      repetition <= (pilot || flag === "--fixed" ? 1 : 5);
      repetition++
    )
      for (const spec of CASES) {
        const file = resolve(dir, `${spec.id}-${repetition}.json`),
          pending = resolve(dir, `${spec.id}-${repetition}.pending`);
        if (existsSync(file)) {
          const prior = JSON.parse(
            readFileSync(file, "utf8"),
          ) as TrialRecord & { protocolHash: string };
          if (prior.protocolHash !== PROTOCOL_HASH)
            throw new Error("EVALUATION_RECORD_CONFLICT");
          continue;
        }
        if (existsSync(pending))
          throw new Error("EVALUATION_INTERRUPTED_TRIAL_REVIEW_REQUIRED");
        writeFileSync(
          pending,
          JSON.stringify({
            caseId: spec.id,
            repetition,
            protocolHash: PROTOCOL_HASH,
            startedAt: new Date().toISOString(),
          }) + "\n",
          { flag: "wx" },
        );
        const record =
          flag === "--fixed"
            ? fixedTrial(spec, repetition)
            : await agentTrial(
                spec,
                repetition,
                adapter ??
                  new ProcurementMock("fixture-006", {
                    mode: "mock",
                    locale: spec.locale,
                    key: "evaluation-pilot",
                    expectedVersion: 0,
                    revisionReason: null,
                  }),
                !pilot,
              );
        if (manifest && record.inputHash !== manifest.inputHashes[spec.id])
          throw new Error("EVALUATION_FROZEN_INPUT_CONFLICT");
        writeFileSync(
          file,
          JSON.stringify({ protocolHash: PROTOCOL_HASH, ...record }, null, 2) +
            "\n",
          { flag: "wx" },
        );
        // Retain the start marker as provenance. Existing COMPLETE records skip it.
        console.log(
          JSON.stringify({
            case: spec.id,
            repetition,
            status: record.status,
            success: record.taskSuccess,
            costMicroUsd: record.usage.reduce(
              (n, u) => n + (u.costMicroUsd ?? 0),
              0,
            ),
            unknownCharges: record.usage.filter((u) => u.costMicroUsd === null)
              .length,
          }),
        );
        if (
          ledger &&
          (ledger.summary().heldMicroUsd || ledger.summary().stopped)
        )
          throw new Error("EVALUATION_UNCERTAIN_BILLING_STOP");
      }
    console.log(
      JSON.stringify({
        finished: true,
        mode: flag,
        ...(ledger ? { sharedBudget: ledger.summary() } : {}),
      }),
    );
  }
} catch (error) {
  console.error(
    error instanceof Error &&
      /^(?:EVALUATION|MODEL)_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "EVALUATION_RUN_FAILED",
  );
  process.exitCode = 1;
} finally {
  ledger?.close();
}
