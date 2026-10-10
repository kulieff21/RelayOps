import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";

// Public metadata only. This verifier never sends an Authorization header or runs inference.
const pricing = z
  .object({ prompt: z.string(), completion: z.string() })
  .passthrough();
const model = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().int().positive(),
  supported_parameters: z.array(z.string()),
  pricing,
});
const endpoint = z.object({
  provider_name: z.string(),
  tag: z.string(),
  context_length: z.number().int().positive(),
  supported_parameters: z.array(z.string()),
  pricing,
});
async function read(path: string): Promise<unknown> {
  const response = await fetch(`https://openrouter.ai/api/v1/${path}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`MODEL_METADATA_HTTP_${response.status}`);
  return response.json();
}
try {
  const modelId = z
    .string()
    .regex(/^[a-z0-9-]+\/[a-z0-9._:-]+$/)
    .parse(process.env.OPENROUTER_MODEL ?? "openai/gpt-6-luna");
  const catalogue = z
    .object({ data: z.array(model) })
    .parse(await read("models"));
  const selected = catalogue.data.find((row) => row.id === modelId);
  if (!selected) throw new Error("MODEL_NOT_LISTED");
  const providers = z
    .object({
      data: z.object({ id: z.string(), endpoints: z.array(endpoint) }),
    })
    .parse(await read(`models/${modelId}/endpoints`)).data;
  if (providers.id !== selected.id) throw new Error("MODEL_ID_MISMATCH");
  const supportsTools = (row: { supported_parameters: string[] }) =>
    ["tools", "tool_choice"].every((name) =>
      row.supported_parameters.includes(name),
    );
  if (!supportsTools(selected) || !providers.endpoints.some(supportsTools))
    throw new Error("MODEL_TOOL_SUPPORT_MISSING");
  const evidence = {
    checkedAt: new Date().toISOString(),
    sources: [
      "https://openrouter.ai/api/v1/models",
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
    ],
    model: selected,
    endpoints: providers.endpoints.filter(supportsTools),
    inferencePerformed: false,
    credentialsSent: false,
  };
  mkdirSync("artifacts/model", { recursive: true });
  writeFileSync(
    "artifacts/model/catalogue-verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        model: selected.id,
        context: selected.context_length,
        pricingPerToken: selected.pricing,
        toolProviders: evidence.endpoints.map((row) => row.tag),
        evidence: "artifacts/model/catalogue-verification.json",
        inferencePerformed: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  // Provider body, environment and credentials never enter error output.
  console.error(
    error instanceof z.ZodError
      ? "Invalid model metadata or model ID"
      : error instanceof Error && /^MODEL_[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "Model metadata verification failed",
  );
  process.exitCode = 1;
}
