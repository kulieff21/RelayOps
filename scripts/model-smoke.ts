import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../src/db/database.js";
import { seed } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { config, projectRoot } from "../src/server/config.js";
import { modelConfig } from "../src/model/config.js";
import { ModelBudget } from "../src/model/budget.js";
import {
  OpenRouter,
  ModelResponseError,
  type CompletionInput,
} from "../src/model/openrouter.js";

let store: Store | undefined, budget: ModelBudget | undefined;
let runId: string | undefined;
try {
  // Paid execution must be intentional. Ordinary check/test/build never enters here.
  if (process.argv.slice(2).join(" ") !== "--live")
    throw new Error("MODEL_SMOKE_REQUIRES_LIVE_FLAG");
  const settings = modelConfig();
  mkdirSync(join(projectRoot, "runtime"), { recursive: true });
  budget = new ModelBudget(
    join(projectRoot, "runtime/model-budget.sqlite"),
    settings.ceilingMicroUsd,
  );
  store = new Store(config().databasePath);
  store.migrate();
  seed(store);
  // Local diagnostic identity is resolved from the server's seeded account, not model text.
  const actor = new Auth(store).actor("owner");
  runId = randomUUID();
  store.run(
    "INSERT INTO agent_runs VALUES(?,NULL,?,'customer','live',?,'adapter_smoke_running',?,?)",
    runId,
    actor.id,
    settings.model,
    JSON.stringify({
      kind: "adapter_connection_smoke",
      businessActions: false,
    }),
    new Date().toISOString(),
  );
  const adapter = new OpenRouter(settings, budget, fetch, (r) =>
    store!.run(
      `INSERT INTO model_usage VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,cost_microusd=excluded.cost_microusd,provider_request_id=excluded.provider_request_id`,
      r.attemptId,
      runId!,
      r.inputTokens,
      r.outputTokens,
      r.costMicroUsd,
      r.providerRequestId,
    ),
  );
  const messages: CompletionInput["messages"] = [
    {
      role: "system",
      content:
        "This is a synthetic API connection diagnostic. Call connectionProbe with nonce relayops. Do not describe or perform any business action.",
    },
    { role: "user", content: "Run the connection probe." },
  ];
  const tools: CompletionInput["tools"] = [
    {
      type: "function",
      function: {
        name: "connectionProbe",
        description:
          "A synthetic local diagnostic; returns an acknowledgement without changing business state.",
        parameters: {
          type: "object",
          properties: { nonce: { type: "string", enum: ["relayops"] } },
          required: ["nonce"],
          additionalProperties: false,
        },
      },
    },
  ];
  const results: Awaited<ReturnType<OpenRouter["complete"]>>[] = [];
  const record = (r: Awaited<ReturnType<OpenRouter["complete"]>>) => {
    results.push(r);
    if (r.usage.costMicroUsd === null || budget!.summary().stopped)
      throw new Error("MODEL_SMOKE_BILLING_NOT_CONFIRMED");
  };
  const first = await adapter.complete({
    messages,
    tools,
    toolChoice: { type: "function", function: { name: "connectionProbe" } },
  });
  record(first);
  if (first.finishReason !== "tool_calls" || first.toolCalls.length !== 1)
    throw new Error("MODEL_SMOKE_TOOL_CALL_INVALID");
  const call = first.toolCalls[0]!;
  let args: { nonce: "relayops" };
  try {
    args = z
      .strictObject({ nonce: z.literal("relayops") })
      .parse(JSON.parse(call.function.arguments));
  } catch {
    throw new Error("MODEL_SMOKE_TOOL_ARGUMENTS_INVALID");
  }
  const result = { mode: "synthetic", status: "ok", nonce: args.nonce };
  store.run(
    "INSERT INTO tool_calls VALUES(?,?,?,?,?,'completed',?)",
    call.id,
    runId,
    call.function.name,
    JSON.stringify(args),
    JSON.stringify(result),
    runId,
  );
  messages.push(
    { role: "assistant", content: first.content, tool_calls: first.toolCalls },
    { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) },
    {
      role: "user",
      content:
        "Reply exactly RELAYOPS_CONNECTION_OK to acknowledge the successful synthetic probe.",
    },
  );
  const second = await adapter.complete({
    messages,
    tools,
    toolChoice: "none",
  });
  record(second);
  if (
    second.finishReason !== "stop" ||
    second.toolCalls.length ||
    second.content?.trim() !== "RELAYOPS_CONNECTION_OK"
  )
    throw new Error("MODEL_SMOKE_ACKNOWLEDGEMENT_INVALID");
  store.run(
    "UPDATE agent_runs SET status='adapter_smoke_completed' WHERE id=?",
    runId,
  );
  const evidence = {
    checkedAt: new Date().toISOString(),
    mode: "live",
    kind: "adapter_connection_smoke",
    model: settings.model,
    provider: settings.provider,
    calls: results.length,
    toolCalls: 1,
    syntheticProbe: true,
    businessActions: false,
    usage: results.map((r) => r.usage),
    budget: budget.summary(),
    agentLoopImplemented: false,
  };
  mkdirSync(join(projectRoot, "artifacts/model"), { recursive: true });
  writeFileSync(
    join(projectRoot, "artifacts/model/live-smoke.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (store && runId)
    store.run(
      "UPDATE agent_runs SET status='adapter_smoke_failed' WHERE id=?",
      runId,
    );
  console.error(
    error instanceof Error && /^MODEL_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "MODEL_SMOKE_FAILED",
  );
  if (error instanceof ModelResponseError)
    console.error(JSON.stringify({ diagnostic: error.diagnostic }));
  if (budget) console.error(JSON.stringify({ budget: budget.summary() }));
  process.exitCode = 1;
} finally {
  store?.close();
  budget?.close();
}
