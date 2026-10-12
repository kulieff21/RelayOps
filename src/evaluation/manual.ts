import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CASES, PROTOCOL_HASH } from "./cases.js";
import { TOOLS, TrialSession, type TrialRecord } from "./trial.js";
import { manualPage } from "./manual-page.js";

export function manualApp(
  save: (record: TrialRecord) => void,
  completed: TrialRecord[] = [],
) {
  const app = Fastify({ logger: false, bodyLimit: 8192 });
  const token = randomUUID();
  let active: TrialSession | null = null;
  let draft = "";
  if (
    completed.some(
      (r, i) => r.approach !== "manual" || r.caseId !== CASES[i]?.id,
    ) ||
    completed.length > CASES.length
  )
    throw new Error("EVALUATION_MANUAL_RECORDS_INVALID");
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" && request.url === "/") return;
    if (request.headers["x-evaluation-session"] !== token)
      return reply.code(403).send({ error: "EVALUATION_SESSION_REQUIRED" });
  });
  app.get("/", async (_, reply) =>
    reply
      .header("cache-control", "no-store")
      .type("text/html")
      .send(manualPage(token)),
  );
  app.get("/state", async () => ({
    completed: completed.length,
    total: CASES.length,
    active: !!active,
    actions: active?.trace.length ?? 0,
    last: active?.trace.at(-1) ?? null,
    rationale: draft,
    protocolHash: PROTOCOL_HASH,
  }));
  app.post("/begin", async () => {
    if (active || completed.length === CASES.length)
      throw new Error("EVALUATION_MANUAL_BUSY_OR_FINISHED");
    active = new TrialSession(CASES[completed.length]!, "manual", 1);
    draft = "";
    return { started: true };
  });
  app.post("/action", async (request) => {
    const input = z
      .strictObject({ name: z.enum(TOOLS), rationale: z.string().max(2000) })
      .parse(request.body);
    if (!active) throw new Error("EVALUATION_MANUAL_NOT_STARTED");
    return active.action(
      input.name,
      input.rationale || "Human review of recorded evidence",
    );
  });
  app.post("/visibility", async (request) => {
    const input = z.strictObject({ active: z.boolean() }).parse(request.body);
    active?.visibility(input.active);
    return { recorded: true };
  });
  app.post("/draft", async (request) => {
    const input = z
      .strictObject({ rationale: z.string().max(2000) })
      .parse(request.body);
    if (!active) throw new Error("EVALUATION_MANUAL_NOT_STARTED");
    draft = input.rationale;
    return { recorded: true };
  });
  app.post("/finish", async (request) => {
    const input = z
      .strictObject({
        status: z.enum(["completion", "escalation"]),
        rationale: z.string().trim().min(1).max(2000),
      })
      .parse(request.body);
    if (!active) throw new Error("EVALUATION_MANUAL_NOT_STARTED");
    // Finalize once, including errors. Do not expose the expected answer or allow
    // correcting a failed main trial after seeing the evaluator's judgement.
    const result = active.finish(input.status);
    result.humanDecisionRationale = input.rationale;
    save(result);
    completed.push(result);
    active.close();
    active = null;
    return { recorded: true, completed: completed.length };
  });
  app.setErrorHandler((error, _, reply) =>
    reply.code(400).send({
      error:
        error instanceof Error && /^EVALUATION_[A-Z_]+$/.test(error.message)
          ? error.message
          : "Geçerli bir karar gerekçesi ve işlem seç.",
    }),
  );
  app.addHook("onClose", async () => {
    active?.close();
  });
  return app;
}
