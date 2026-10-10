import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { modelConfig } from "../src/model/config.js";
import { ModelBudget } from "../src/model/budget.js";
import { OpenRouter, type CompletionInput } from "../src/model/openrouter.js";
import { Store } from "../src/db/database.js";
import { seed, resetDemo } from "../src/db/seed.js";

const settings = modelConfig({ OPENROUTER_API_KEY: "synthetic-test-key" });
const input: CompletionInput = {
  messages: [{ role: "user", content: "Connection test" }],
  tools: [
    {
      type: "function",
      function: {
        name: "connectionProbe",
        description: "Return a synthetic connection result",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
  ],
  toolChoice: { type: "function", function: { name: "connectionProbe" } },
};
function catalogue(model = settings.model) {
  return {
    data: {
      id: model,
      endpoints: [
        {
          tag: "openai",
          context_length: 1050000,
          supported_parameters: ["tools", "tool_choice", "max_tokens"],
          pricing: {
            prompt: "0.0000001",
            completion: "0.0000005",
            input_cache_write: "0.000000125",
            overrides: [
              {
                min_prompt_tokens: 272000,
                prompt: "0.0000002",
                completion: "0.00000075",
                input_cache_write: "0.00000025",
              },
            ],
          },
        },
        {
          tag: "openai/fast",
          context_length: 1050000,
          supported_parameters: ["tools", "tool_choice", "max_tokens"],
          pricing: { prompt: "0.0000002", completion: "0.000001" },
        },
      ],
    },
  };
}
function completion(cost: number | null = 0.000021, model = settings.model) {
  return {
    id: "synthetic-request",
    model,
    usage: { prompt_tokens: 100, completion_tokens: 22, cost },
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "synthetic-call",
              type: "function",
              function: { name: "connectionProbe", arguments: "{}" },
            },
          ],
        },
      },
    ],
  };
}
function fixture(t: TestContext, reply: unknown = completion()) {
  const budget = new ModelBudget(":memory:", 1_000_000);
  t.after(() => budget.close());
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(requests.length === 1 ? catalogue() : reply);
  };
  return {
    budget,
    requests,
    adapter: new OpenRouter(settings, budget, transport),
  };
}
test("model configuration is bounded, configurable and errors omit secrets", () => {
  assert.equal(
    modelConfig({
      OPENROUTER_API_KEY: "key",
      OPENROUTER_MODEL: "example/another-model",
    }).model,
    "example/another-model",
  );
  for (const patch of [
    { OPENROUTER_BUDGET_USD: "2" },
    { OPENROUTER_EVALUATION_BUDGET_USD: "1" },
    { OPENROUTER_MAX_OUTPUT_TOKENS: "9999" },
    { OPENROUTER_MODEL: "https://invalid" },
  ])
    assert.throws(
      () => modelConfig({ OPENROUTER_API_KEY: "private-value", ...patch }),
      (e) =>
        e instanceof Error &&
        e.message === "MODEL_CONFIGURATION_INVALID" &&
        !e.message.includes("private-value"),
    );
  assert.throws(() => modelConfig({}), /MODEL_CONFIGURATION_INVALID/);
});
test("adapter caps routing/tokens, sends credentials only to completion and records cost", async (t) => {
  const reply = completion();
  Object.assign(reply.choices[0]!.message.tool_calls[0]!, {
    index: 0,
    provider_metadata: "synthetic-extension",
  });
  const f = fixture(t, reply);
  const result = await f.adapter.complete(input);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0]!.init?.headers, undefined);
  const sent = JSON.parse(f.requests[1]!.init!.body as string);
  assert.equal(sent.max_tokens, 512);
  assert.equal(sent.stream, false);
  assert.deepEqual(sent.provider, {
    order: ["openai"],
    only: ["openai"],
    ignore: ["openai/fast"],
    allow_fallbacks: false,
    require_parameters: true,
    max_price: { prompt: 0.1, completion: 0.5, request: 0 },
  });
  assert.equal(f.requests[1]!.init!.redirect, "error");
  assert.equal(result.mode, "live");
  assert.equal(result.toolCalls[0]!.function.name, "connectionProbe");
  assert.deepEqual(Object.keys(result.toolCalls[0]!).sort(), [
    "function",
    "id",
    "type",
  ]);
  assert.equal(result.usage.costMicroUsd, 21);
  assert.equal(f.budget.summary().heldMicroUsd, 0);
  assert.equal(f.budget.summary().knownCostMicroUsd, 21);
});
test("missing usage and unknown costs retain full reservations instead of reporting zero", async (t) => {
  const reply = completion(null);
  delete (reply as { usage?: unknown }).usage;
  const f = fixture(t, reply);
  const result = await f.adapter.complete(input);
  assert.deepEqual(result.usage, {
    inputTokens: null,
    outputTokens: null,
    costMicroUsd: null,
  });
  assert.ok(f.budget.summary().heldMicroUsd > 288_000);
  assert.equal(
    f.budget.store.one<{ cost: null }>("SELECT cost FROM model_spend")!.cost,
    null,
  );
});
test("malformed model output cannot become a tool result; independent known billing is retained", async (t) => {
  const reply = completion();
  reply.choices[0]!.message.tool_calls[0]!.function.name = "purchaseEverything";
  const f = fixture(t, reply);
  await assert.rejects(f.adapter.complete(input), /MODEL_RESPONSE_INVALID/);
  assert.equal(f.budget.summary().knownCostMicroUsd, 21);
  assert.equal(f.budget.summary().heldMicroUsd, 0);
});
test("usage observers persist unknown attempts and independently known costs even for invalid responses", async (t) => {
  const f = fixture(t);
  const reply = completion();
  reply.model = "wrong/model";
  const observations: import("../src/model/openrouter.js").UsageObservation[] =
    [];
  let count = 0;
  const adapter = new OpenRouter(
    settings,
    f.budget,
    async () => Response.json(++count === 1 ? catalogue() : reply),
    (r) => observations.push(r),
  );
  await assert.rejects(adapter.complete(input), /MODEL_RESPONSE_INVALID/);
  assert.equal(observations.length, 2);
  assert.equal(observations[0]!.costMicroUsd, null);
  assert.equal(observations[1]!.costMicroUsd, 21);
  assert.equal(observations[1]!.providerRequestId, "synthetic-request");
});
test("request limits reject unvalidated or oversized input before any network call", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.adapter.complete({
      ...input,
      messages: [{ role: "user", content: "x".repeat(16001) }],
    }),
    /MODEL_INPUT_INVALID/,
  );
  await assert.rejects(
    f.adapter.complete({
      ...input,
      messages: [{ role: "user", content: "ş".repeat(10000) }],
    }),
    /MODEL_INPUT_TOO_LARGE/,
  );
  await assert.rejects(
    f.adapter.complete({ ...input, tools: [] }),
    /MODEL_TOOLS_INVALID/,
  );
  await assert.rejects(
    f.adapter.complete({ ...input, tools: [...input.tools!, ...input.tools!] }),
    /MODEL_TOOLS_INVALID/,
  );
  assert.equal(f.requests.length, 0);
});
test("unverified capability/prices prevent authenticated requests", async (t) => {
  const budget = new ModelBudget(":memory:", 1_000_000);
  t.after(() => budget.close());
  for (const variant of [
    "wrong-model",
    "no-tools",
    "expensive",
    "unbounded-tier",
  ]) {
    const c = catalogue();
    if (variant === "wrong-model") c.data.id = "wrong/model";
    if (variant === "no-tools") c.data.endpoints[0]!.supported_parameters = [];
    if (variant === "expensive") c.data.endpoints[0]!.pricing.prompt = "0.01";
    if (variant === "unbounded-tier")
      c.data.endpoints[0]!.pricing.overrides![0]!.prompt = "0.01";
    let count = 0;
    const adapter = new OpenRouter(settings, budget, async () => {
      count++;
      return Response.json(c);
    });
    await assert.rejects(adapter.complete(input), /MODEL_/);
    assert.equal(count, 1);
  }
  assert.equal(budget.summary().heldMicroUsd, 0);
});
test("authentication/provider/transport failures are sanitized, held and never automatically retried", async (t) => {
  const budget = new ModelBudget(":memory:", 1_000_000);
  t.after(() => budget.close());
  for (const failure of [401, 429, 500]) {
    let calls = 0;
    const adapter = new OpenRouter(settings, budget, async () => {
      calls++;
      return calls === 1
        ? Response.json(catalogue())
        : new Response("private-provider-error", { status: failure });
    });
    await assert.rejects(
      adapter.complete(input),
      (e) =>
        e instanceof Error &&
        /^MODEL_/.test(e.message) &&
        !e.message.includes("private"),
    );
    assert.equal(calls, 2);
  }
  assert.ok(budget.summary().heldMicroUsd > 860_000);
  let authenticated = 0;
  const exhausted = new OpenRouter(settings, budget, async (_url, init) => {
    if (init?.method === "POST") authenticated++;
    return Response.json(catalogue());
  });
  await assert.rejects(exhausted.complete(input), /MODEL_BUDGET_EXHAUSTED/);
  assert.equal(authenticated, 0);
});
test("lost responses preserve reservations across two connections/restart and demo reset", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "relayops-model-budget-"));
  const resources: { reopened?: ModelBudget; demo?: Store } = {};
  t.after(() => {
    resources.reopened?.close();
    resources.demo?.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.match(basename(target), /^relayops-model-budget-/);
    rmSync(target, { recursive: true, force: true });
  });
  const path = join(dir, "budget.sqlite");
  const first = new ModelBudget(path, 1_000_000),
    second = new ModelBudget(path, 1_000_000);
  first.reserve("test/model", 300_000);
  second.reserve("test/model", 300_000);
  first.reserve("test/model", 300_000);
  assert.throws(() => second.reserve("test/model", 300_000), /EXHAUSTED/);
  first.close();
  second.close();
  const reopened = (resources.reopened = new ModelBudget(path, 1_000_000));
  const demo = (resources.demo = new Store());
  demo.migrate();
  seed(demo);
  resetDemo(demo, "--demo-only");
  assert.equal(reopened.summary().heldMicroUsd, 900_000);
  assert.equal(reopened.summary().remainingMicroUsd, 100_000);
  assert.throws(() => reopened.reserve("test/model", 300_000), /EXHAUSTED/);
});
test("transport exceptions and aborted response streams keep charges unknown without leaking details", async (t) => {
  for (const failure of ["transport", "stream"]) {
    const budget = new ModelBudget(":memory:", 1_000_000);
    t.after(() => budget.close());
    let count = 0;
    const adapter = new OpenRouter(settings, budget, async (_url, init) => {
      count++;
      assert.ok(init?.signal instanceof AbortSignal);
      if (count === 1) return Response.json(catalogue());
      if (failure === "transport")
        throw new Error("synthetic-test-key private request details");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private body timeout"));
          },
        }),
      );
    });
    await assert.rejects(
      adapter.complete(input),
      /MODEL_(TRANSPORT_FAILED|RESPONSE_INVALID)_CHARGE_UNKNOWN/,
    );
    assert.equal(count, 2);
    assert.ok(budget.summary().heldMicroUsd > 288_000);
  }
});
test("known zero is distinct from unknown cost; oversized bodies remain held", async (t) => {
  const f = fixture(t, completion(0));
  const r = await f.adapter.complete(input);
  assert.equal(r.usage.costMicroUsd, 0);
  assert.equal(f.budget.summary().heldMicroUsd, 0);
  let count = 0;
  const adapter = new OpenRouter(settings, f.budget, async () =>
    ++count === 1
      ? Response.json(catalogue())
      : new Response("x".repeat(1_000_001)),
  );
  await assert.rejects(
    adapter.complete(input),
    /MODEL_RESPONSE_INVALID_CHARGE_UNKNOWN/,
  );
  assert.ok(f.budget.summary().heldMicroUsd > 288_000);
});
test("a real deadline aborts the billable request and preserves its reservation", async (t) => {
  const budget = new ModelBudget(":memory:", 1_000_000);
  t.after(() => budget.close());
  let count = 0;
  let aborted = false;
  const adapter = new OpenRouter(
    { ...settings, timeoutMs: 1000 },
    budget,
    async (_url, init) => {
      if (++count === 1) return Response.json(catalogue());
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("private timeout"));
          },
          { once: true },
        );
        // AbortSignal.timeout is unref'ed; this mock must keep the event loop alive.
        const keepAlive = setTimeout(
          () => reject(new Error("deadline not enforced")),
          2000,
        );
        init!.signal!.addEventListener("abort", () => clearTimeout(keepAlive), {
          once: true,
        });
      });
    },
  );
  await assert.rejects(
    adapter.complete(input),
    /MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN/,
  );
  assert.equal(aborted, true);
  assert.equal(count, 2);
  assert.ok(budget.summary().heldMicroUsd > 288_000);
});
test("settlement is idempotent, rounds tiny positive charges up and stops on billing overruns", async (t) => {
  const f = fixture(t, completion(0.0000001));
  const r = await f.adapter.complete(input);
  assert.equal(r.usage.costMicroUsd, 1);
  f.budget.settle(r.attemptId, 1);
  assert.throws(() => f.budget.settle(r.attemptId, 2), /CONFLICT/);
  const id = f.budget.reserve("test/model", 100);
  f.budget.settle(id, 101);
  f.budget.settle(id, 101);
  assert.throws(() => f.budget.settle(id, 100), /CONFLICT/);
  assert.equal(f.budget.summary().stopped, true);
  assert.throws(() => f.budget.reserve("test/model", 1), /EXHAUSTED/);
});
test("ceiling reductions survive restart and cannot be silently increased", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "relayops-model-budget-"));
  t.after(() => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.match(basename(dir), /^relayops-model-budget-/);
    rmSync(dir, { recursive: true, force: true });
  });
  const path = join(dir, "budget.sqlite");
  const budget = new ModelBudget(path, 500_000);
  budget.close();
  assert.throws(
    () => new ModelBudget(path, 1_000_000),
    /INCREASE_REQUIRES_REVIEW/,
  );
  const reopened = new ModelBudget(path, 500_000);
  reopened.close();
});
