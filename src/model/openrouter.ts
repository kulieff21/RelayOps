import { z } from "zod";
import type { ModelConfig } from "./config.js";
import { ModelBudget } from "./budget.js";
import { toolCallSchema as call } from "../shared/tool-call.js";
// Providers may add indexes/signatures. Normalize response metadata, keeping only
// validated function fields; outgoing application messages remain strict.
const responseCall = call
  .extend({ function: call.shape.function.strip() })
  .strip();
const message = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.enum(["system", "user"]),
    content: z.string().max(16000),
  }),
  z.strictObject({
    role: z.literal("assistant"),
    content: z.string().max(16000).nullable(),
    tool_calls: z.array(call).max(8).optional(),
  }),
  z.strictObject({
    role: z.literal("tool"),
    content: z.string().max(16000),
    tool_call_id: z.string().min(1).max(200),
  }),
]);
const tool = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    description: z.string().max(1000),
    parameters: z.record(z.string(), z.unknown()),
  }),
});
export const completionInput = z.strictObject({
  messages: z.array(message).min(1).max(32),
  tools: z.array(tool).max(16).optional(),
  toolChoice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.strictObject({
        type: z.literal("function"),
        function: z.strictObject({ name: z.string() }),
      }),
    ])
    .optional(),
});
export type CompletionInput = z.infer<typeof completionInput>;
export type UsageObservation = {
  attemptId: string;
  providerRequestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicroUsd: number | null;
};
export class ModelResponseError extends Error {
  constructor(
    readonly diagnostic: {
      issues?: string[];
      reportedModel?: string;
      finishReason?: string;
      toolCount?: number;
    },
  ) {
    super("MODEL_RESPONSE_INVALID");
  }
}
const usage = z.object({
  prompt_tokens: z.number().int().nonnegative().nullable().optional(),
  completion_tokens: z.number().int().nonnegative().nullable().optional(),
  cost: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
});
const envelope = z.object({
  id: z.string().min(1).max(200),
  model: z.string(),
  usage: usage.nullable().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.enum([
          "stop",
          "length",
          "tool_calls",
          "content_filter",
          "error",
        ]),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().max(64000).nullable().optional(),
          tool_calls: z.array(responseCall).max(8).optional(),
        }),
      }),
    )
    .length(1),
  error: z.unknown().optional(),
});
const rate = z
  .string()
  .max(32)
  .regex(/^\d+(?:\.\d{1,12})?$/);
const price = z.object({
  prompt: rate,
  completion: rate,
  input_cache_read: rate.optional(),
  input_cache_write: rate.optional(),
  request: rate.optional(),
  internal_reasoning: rate.optional(),
});
const endpoint = z.object({
  tag: z.string(),
  context_length: z.number().int().positive().max(2_000_000),
  supported_parameters: z.array(z.string()),
  pricing: price.extend({ overrides: z.array(price.partial()).optional() }),
});

function pico(value = "0") {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, "0"));
}
function reservation(e: z.infer<typeof endpoint>, maxOutput: number) {
  const tiers = [e.pricing, ...(e.pricing.overrides ?? [])];
  const max = (keys: (keyof z.infer<typeof price>)[]) =>
    tiers.reduce(
      (n, t) => keys.reduce((m, k) => (pico(t[k]) > m ? pico(t[k]) : m), n),
      0n,
    );
  // Full context, all advertised cache/long-context rates, output cap and 10% margin.
  // This deliberately avoids claiming byte counts are exact tokenizer estimates.
  const base =
    BigInt(e.context_length) *
      max(["prompt", "input_cache_read", "input_cache_write"]) +
    BigInt(maxOutput) * (max(["completion"]) + max(["internal_reasoning"])) +
    max(["request"]);
  const micro = (base * 11n + 9_999_999n) / 10_000_000n;
  if (micro < 1n || micro > 300_000n)
    throw new Error("MODEL_PRICING_OUTSIDE_BUDGET_POLICY");
  return Number(micro);
}

async function boundedJson(response: Response) {
  if (!response.body) throw new Error("MODEL_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1_000_000) throw new Error("MODEL_RESPONSE_TOO_LARGE");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export class OpenRouter {
  constructor(
    private settings: ModelConfig,
    private budget: ModelBudget,
    private transport: typeof fetch = fetch,
    private observeUsage: (usage: UsageObservation) => void = () => {},
  ) {}
  async complete(raw: CompletionInput) {
    const parsed = completionInput.safeParse(raw);
    if (!parsed.success) throw new Error("MODEL_INPUT_INVALID");
    const input = parsed.data;
    if (Buffer.byteLength(JSON.stringify(input)) > 16000)
      throw new Error("MODEL_INPUT_TOO_LARGE");
    const names = input.tools?.map((t) => t.function.name) ?? [];
    if (
      new Set(names).size !== names.length ||
      (input.toolChoice && input.toolChoice !== "none" && names.length === 0) ||
      (typeof input.toolChoice === "object" &&
        !names.includes(input.toolChoice.function.name))
    )
      throw new Error("MODEL_TOOLS_INVALID");
    // One deadline covers catalogue and completion. Never automatically retry an ambiguous billable call.
    const signal = AbortSignal.timeout(this.settings.timeoutMs);
    let metadata: unknown;
    try {
      const r = await this.transport(
        `https://openrouter.ai/api/v1/models/${this.settings.model}/endpoints`,
        { signal, redirect: "error" },
      );
      if (!r.ok) {
        await r.body?.cancel().catch(() => {});
        throw new Error();
      }
      metadata = await boundedJson(r);
    } catch {
      throw new Error("MODEL_CATALOGUE_UNAVAILABLE");
    }
    const catalog = z
      .object({
        data: z.object({ id: z.string(), endpoints: z.array(endpoint) }),
      })
      .safeParse(metadata);
    if (!catalog.success || catalog.data.data.id !== this.settings.model)
      throw new Error("MODEL_CATALOGUE_INVALID");
    const endpoints = catalog.data.data.endpoints;
    const selected = endpoints.find((e) => e.tag === this.settings.provider);
    if (
      !selected ||
      endpoints.filter((e) => e.tag === this.settings.provider).length !== 1 ||
      !["tools", "tool_choice"].every((p) =>
        selected.supported_parameters.includes(p),
      )
    )
      throw new Error("MODEL_PROVIDER_UNSUPPORTED");
    const outputParameter = selected.supported_parameters.includes(
      "max_completion_tokens",
    )
      ? "max_completion_tokens"
      : "max_tokens";
    if (!selected.supported_parameters.includes(outputParameter))
      throw new Error("MODEL_PROVIDER_UNSUPPORTED");
    if (
      pico(selected.pricing.prompt) > pico("0.0000001") ||
      pico(selected.pricing.completion) > pico("0.0000005") ||
      pico(selected.pricing.request) > 0n
    )
      throw new Error("MODEL_PRICE_CAP_EXCEEDED");
    const request = {
      model: this.settings.model,
      messages: input.messages,
      tools: input.tools,
      tool_choice: input.toolChoice,
      stream: false,
      [outputParameter]: this.settings.maxOutputTokens,
      provider: {
        order: [selected.tag],
        only: [selected.tag],
        ignore: endpoints
          .filter(
            (e) =>
              e.tag !== selected.tag && e.tag.startsWith(`${selected.tag}/`),
          )
          .map((e) => e.tag),
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 0.1, completion: 0.5, request: 0 },
      },
      ...(this.settings.model.startsWith("openai/")
        ? { prompt_cache_options: { mode: "explicit" } }
        : {}),
    };
    const body = JSON.stringify(request);
    const reserved = reservation(selected, this.settings.maxOutputTokens);
    signal.throwIfAborted();
    const attemptId = this.budget.reserve(this.settings.model, reserved);
    this.observeUsage({
      attemptId,
      providerRequestId: null,
      inputTokens: null,
      outputTokens: null,
      costMicroUsd: null,
    });
    let response: Response;
    try {
      response = await this.transport(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            Authorization: `Bearer ${this.settings.apiKey}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "RelayOps",
          },
          body,
        },
      );
    } catch {
      throw new Error("MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      // Even error responses stay held: only explicit billing evidence can release funds.
      throw new Error(
        response.status === 401 || response.status === 403
          ? "MODEL_AUTHENTICATION_FAILED"
          : response.status === 402
            ? "MODEL_CREDITS_UNAVAILABLE"
            : "MODEL_PROVIDER_FAILED_CHARGE_UNKNOWN",
      );
    }
    let data: unknown;
    try {
      data = await boundedJson(response);
    } catch {
      throw new Error("MODEL_RESPONSE_INVALID_CHARGE_UNKNOWN");
    }
    // Billing evidence is independent of model prose/tool validity.
    const billing = z
      .object({ usage: usage.nullable().optional() })
      .safeParse(data);
    const knownUsage = billing.success ? billing.data.usage : null;
    const costMicroUsd =
      knownUsage?.cost == null ? null : Math.ceil(knownUsage.cost * 1_000_000);
    if (costMicroUsd !== null) this.budget.settle(attemptId, costMicroUsd);
    const providerId = z
      .object({ id: z.string().min(1).max(200) })
      .safeParse(data);
    this.observeUsage({
      attemptId,
      providerRequestId: providerId.success ? providerId.data.id : null,
      inputTokens: knownUsage?.prompt_tokens ?? null,
      outputTokens: knownUsage?.completion_tokens ?? null,
      costMicroUsd,
    });
    const result = envelope.safeParse(data);
    if (!result.success)
      throw new ModelResponseError({
        issues: result.error.issues.map((i) => `${i.code}:${i.path.join(".")}`),
      });
    if (result.data.error || result.data.model !== this.settings.model) {
      const safeModel = z
        .string()
        .max(200)
        .regex(/^[a-z0-9-]+\/[a-z0-9._:-]+$/)
        .safeParse(result.data.model);
      throw new ModelResponseError({
        reportedModel: safeModel.success ? safeModel.data : "invalid",
      });
    }
    const choice = result.data.choices[0]!;
    const calls = choice.message.tool_calls ?? [];
    const forcedName =
      typeof input.toolChoice === "object"
        ? input.toolChoice.function.name
        : null;
    if (
      (choice.finish_reason === "tool_calls") !== calls.length > 0 ||
      new Set(calls.map((c) => c.id)).size !== calls.length ||
      calls.some((c) => !names.includes(c.function.name)) ||
      (input.toolChoice === "none" && calls.length > 0) ||
      (input.toolChoice === "required" && calls.length === 0) ||
      (forcedName !== null &&
        calls.some((c) => c.function.name !== forcedName)) ||
      ["error", "content_filter"].includes(choice.finish_reason)
    )
      throw new ModelResponseError({
        finishReason: choice.finish_reason,
        toolCount: calls.length,
      });
    return {
      mode: "live" as const,
      attemptId,
      providerRequestId: result.data.id,
      model: result.data.model,
      content: choice.message.content ?? null,
      toolCalls: calls,
      finishReason: choice.finish_reason,
      usage: {
        inputTokens: knownUsage?.prompt_tokens ?? null,
        outputTokens: knownUsage?.completion_tokens ?? null,
        costMicroUsd,
      },
    };
  }
}
