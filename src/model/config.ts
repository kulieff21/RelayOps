import { z } from "zod";

export function modelConfig(env = process.env) {
  const result = z
    .object({
      OPENROUTER_API_KEY: z.string().trim().min(1).max(512),
      OPENROUTER_MODEL: z
        .string()
        .regex(/^[a-z0-9-]+\/[a-z0-9._-]+$/)
        .default("openai/gpt-6-luna"),
      OPENROUTER_PROVIDER: z
        .string()
        .regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/)
        .default("openai"),
      OPENROUTER_BUDGET_USD: z
        .string()
        .regex(/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/)
        .default("1"),
      OPENROUTER_EVALUATION_BUDGET_USD: z.literal("0").default("0"),
      OPENROUTER_MAX_OUTPUT_TOKENS: z.coerce
        .number()
        .int()
        .min(64)
        .max(2048)
        .default(512),
      OPENROUTER_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(60000)
        .default(30000),
    })
    .safeParse(env);
  // Zod errors can include input values. Never expose configuration contents.
  if (!result.success) throw new Error("MODEL_CONFIGURATION_INVALID");
  const v = result.data;
  return {
    apiKey: v.OPENROUTER_API_KEY,
    model: v.OPENROUTER_MODEL,
    provider: v.OPENROUTER_PROVIDER,
    ceilingMicroUsd: Math.round(Number(v.OPENROUTER_BUDGET_USD) * 1_000_000),
    maxOutputTokens: v.OPENROUTER_MAX_OUTPUT_TOKENS,
    timeoutMs: v.OPENROUTER_TIMEOUT_MS,
  };
}
export type ModelConfig = ReturnType<typeof modelConfig>;
