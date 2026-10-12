import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { manualApp } from "../src/evaluation/manual.js";
import { PROTOCOL_HASH, hash } from "../src/evaluation/cases.js";
import type { TrialRecord } from "../src/evaluation/trial.js";

const practice = process.argv.slice(2).join(" ") === "--practice";
if (!practice && process.argv.length !== 2)
  throw new Error("EVALUATION_MANUAL_FLAGS_INVALID");
if (!practice) {
  const manifest = JSON.parse(
    readFileSync("artifacts/evaluation/main/frozen.json", "utf8"),
  ) as { protocolHash: string; sourceHashes: Record<string, string> };
  if (
    manifest.protocolHash !== PROTOCOL_HASH ||
    Object.entries(manifest.sourceHashes).some(
      ([name, digest]) => hash(readFileSync(name, "utf8")) !== digest,
    )
  )
    throw new Error("EVALUATION_FROZEN_SOURCE_CONFLICT");
}
const directory = resolve(
  `artifacts/evaluation/${practice ? "practice" : "main"}/manual`,
);
mkdirSync(directory, { recursive: true });
const indexFile = resolve(directory, "records.json");
const prior = existsSync(indexFile)
  ? (JSON.parse(readFileSync(indexFile, "utf8")) as {
      protocolHash: string;
      records: TrialRecord[];
    })
  : { protocolHash: PROTOCOL_HASH, records: [] };
if (prior.protocolHash !== PROTOCOL_HASH)
  throw new Error("EVALUATION_MANUAL_PROTOCOL_CONFLICT");
const records = [...prior.records];
const app = manualApp((record) => {
  writeFileSync(
    resolve(directory, `${record.caseId}.json`),
    JSON.stringify(
      {
        protocolHash: PROTOCOL_HASH,
        operator: practice
          ? "synthetic UI verification"
          : "human operator, single participant",
        ...record,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  records.push(record);
  writeFileSync(
    indexFile,
    JSON.stringify({ protocolHash: PROTOCOL_HASH, records }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      completed: records.length,
      case: record.caseId,
      operator: practice ? "practice" : "human",
      recorded: true,
    }),
  );
}, prior.records);
await app.listen({ host: "127.0.0.1", port: practice ? 5176 : 5175 });
console.log(
  JSON.stringify({
    url: `http://127.0.0.1:${practice ? 5176 : 5175}`,
    mode: practice ? "practice" : "human-main",
    completed: records.length,
    protocolHash: PROTOCOL_HASH,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit());
  });
