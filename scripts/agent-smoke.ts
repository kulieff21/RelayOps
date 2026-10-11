import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../src/db/database.js";
import { DEMO_PASSWORD, seed } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { ToolDispatcher } from "../src/agent/tools.js";
import { Conversations } from "../src/agent/conversations.js";
import type { AgentModel } from "../src/agent/loop.js";
import { config, projectRoot } from "../src/server/config.js";
import { modelConfig } from "../src/model/config.js";
import { ModelBudget } from "../src/model/budget.js";
import { OpenRouter } from "../src/model/openrouter.js";
import { MockModel } from "../src/model/mock.js";

let store: Store | undefined, budget: ModelBudget | undefined;
let auth: Auth | undefined, token: string | undefined;
try {
  const flag = process.argv.slice(2).join(" ");
  if (flag !== "--mock" && flag !== "--live")
    throw new Error("AGENT_SMOKE_REQUIRES_MODE_FLAG");
  const live = flag === "--live";
  mkdirSync(join(projectRoot, "runtime"), { recursive: true });
  store = new Store(config().databasePath);
  store.migrate();
  seed(store);
  auth = new Auth(store);
  token = auth.login({
    email: "customer-a@relayops.example",
    password: DEMO_PASSWORD,
  }).token;
  const dispatcher = new ToolDispatcher(
    new Business(store, { now: () => config().DEMO_CLOCK }),
    auth,
  );
  let adapter: AgentModel = new MockModel({
    scenario: "catalog",
    query: "RelaySwitch",
  });
  let model = "relayops/deterministic-mock";
  if (live) {
    const settings = modelConfig();
    budget = new ModelBudget(
      join(projectRoot, "runtime/model-budget.sqlite"),
      settings.ceilingMicroUsd,
    );
    if (budget.summary().heldMicroUsd > 0 || budget.summary().stopped)
      throw new Error("AGENT_SMOKE_BUDGET_UNAVAILABLE");
    model = settings.model;
    const router = new OpenRouter(settings, budget);
    let calls = 0;
    adapter = {
      async complete(input, options) {
        if (++calls > 2) throw new Error("AGENT_SMOKE_CALL_LIMIT");
        // This diagnostic has a read-only allowlist even if the model asks otherwise.
        const result = await router.complete(
          {
            ...input,
            tools: input.tools?.filter(
              (t) => t.function.name === "searchProducts",
            ),
            toolChoice:
              calls === 1
                ? { type: "function", function: { name: "searchProducts" } }
                : "none",
          },
          options,
        );
        if (result.usage.costMicroUsd === null)
          throw new Error("AGENT_SMOKE_BILLING_UNKNOWN");
        return result;
      },
    };
  }
  const conversations = new Conversations(store, dispatcher, {
    mode: live ? "live" : "mock",
    id: model,
    adapter,
  });
  const run = await conversations.start(
    { agent: "customer", sessionToken: token, locale: "en" },
    {
      userText:
        'Search the stored catalog for "RelaySwitch" using searchProducts exactly once. Then return a completion JSON with the actual tool call ID and a brief summary of the recorded product and available stock. Do not prepare or change any order.',
      maxIterations: 2,
      maxRetries: 0,
      maxTimeMs: 60000,
      maxTokens: 32000,
      maxOutputTokens: 512,
    },
  );
  const results = run.result.steps.flatMap((s) => s.toolResults);
  if (
    run.result.status !== "completion" ||
    results.length !== 1 ||
    results[0]?.status !== "completed" ||
    results[0].name !== "searchProducts" ||
    !results[0].data.some((p) => p.id === "NET-SW-24G")
  )
    throw new Error("AGENT_SMOKE_RESULT_INVALID");
  const cached = await conversations.resume(
    { agent: "customer", sessionToken: token, locale: "en" },
    run.runId,
  );
  if (JSON.stringify(cached.result) !== JSON.stringify(run.result))
    throw new Error("AGENT_SMOKE_RESUME_INVALID");
  const evidence = {
    checkedAt: new Date().toISOString(),
    mode: live ? "live" : "mock",
    kind: "read_only_business_tool_loop",
    model,
    runId: run.runId,
    conversationId: run.conversationId,
    iterations: run.result.iterations,
    outcome: run.result.status,
    toolCalls: results.length,
    businessMutations: false,
    cachedResume: true,
    usage: run.result.steps.map((s) => s.completion.usage),
    ...(budget ? { budget: budget.summary() } : {}),
  };
  mkdirSync(join(projectRoot, "artifacts/model"), { recursive: true });
  writeFileSync(
    join(
      projectRoot,
      `artifacts/model/agent-${live ? "live" : "mock"}-smoke.json`,
    ),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(
    error instanceof Error && /^(?:AGENT|MODEL)_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "AGENT_SMOKE_FAILED",
  );
  if (budget) console.error(JSON.stringify({ budget: budget.summary() }));
  process.exitCode = 1;
} finally {
  if (auth && token) auth.logout(token);
  store?.close();
  budget?.close();
}
