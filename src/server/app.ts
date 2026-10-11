import Fastify from "fastify";
import { z } from "zod";
import { Store } from "../db/database.js";
import { Auth } from "../domain/auth.js";
import { Business } from "../domain/business.js";
import { Views } from "../domain/views.js";
import { Purchasing } from "../domain/purchasing.js";
import { Operations } from "../domain/operations.js";
import {
  CustomerAssistant,
  type CustomerModels,
} from "../agent/customer-assistant.js";
import {
  BusinessError,
  localeSchema,
  id,
  type Actor,
} from "../shared/contracts.js";
import { frozenClock, type Clock } from "../shared/time.js";

export function createApp(
  store: Store,
  clock: Clock = frozenClock(),
  models: CustomerModels = {},
) {
  const app = Fastify({
    bodyLimit: 16384,
    logger: false,
    requestIdHeader: false,
  });
  const auth = new Auth(store);
  const business = new Business(store, clock);
  const views = new Views(business);
  const purchasing = new Purchasing(business);
  const operations = new Operations(business);
  const assistant = new CustomerAssistant(business, auth, models);
  app.addHook("onClose", async () => {
    await assistant.idle();
  });
  const loginAttempts = new Map<string, { count: number; resets: number }>();
  const token = (header?: string) =>
    header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const actor = (header?: string): Actor => auth.authenticate(token(header));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: { code: "INVALID_INPUT", correlationId: request.id } });
    if (error instanceof BusinessError)
      return reply
        .code(error.status)
        .send({ error: { code: error.code, correlationId: request.id } });
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        error: { code: "INVALID_REQUEST", correlationId: request.id },
      });
    return reply
      .code(500)
      .send({ error: { code: "INTERNAL_ERROR", correlationId: request.id } });
  });
  app.get("/health", async () => ({
    status: "ok",
    mode: "sandbox",
    integrations: "not_connected",
    businessClock: clock.now(),
  }));
  app.post("/api/auth/login", async (request, reply) => {
    const now = Date.now();
    for (const [ip, state] of loginAttempts)
      if (state.resets <= now) loginAttempts.delete(ip);
    const current = loginAttempts.get(request.ip) ?? {
      count: 0,
      resets: now + 60000,
    };
    current.count++;
    loginAttempts.set(request.ip, current);
    if (current.count > 10)
      return reply
        .code(429)
        .send({ error: { code: "RATE_LIMITED", correlationId: request.id } });
    return { data: auth.login(request.body) };
  });
  app.get("/api/auth/me", async (request) => ({
    data: actor(request.headers.authorization),
  }));
  app.post("/api/auth/logout", async (request) => {
    actor(request.headers.authorization);
    auth.logout(token(request.headers.authorization)!);
    return { data: { loggedOut: true } };
  });
  app.get("/api/products", async (request) => {
    const query = z
      .strictObject({
        q: z.string().max(100).default(""),
        locale: localeSchema.default("en"),
      })
      .parse(request.query);
    return { data: business.search(query.q, query.locale) };
  });
  app.post("/api/order-offers", async (request) => ({
    data: business.prepareOrder(
      actor(request.headers.authorization),
      request.body,
    ),
  }));
  app.post("/api/orders", async (request) => ({
    data: business.confirmOrder(
      actor(request.headers.authorization),
      request.body,
    ),
  }));
  app.get("/api/orders", async (request) => ({
    data: views.orders(actor(request.headers.authorization)),
  }));
  app.get("/api/returns", async (request) => ({
    data: views.returns(actor(request.headers.authorization)),
  }));
  app.get("/api/workspace", async (request) => ({
    data: views.workspace(actor(request.headers.authorization)),
  }));
  const params = (raw: unknown) => z.strictObject({ id }).parse(raw).id;
  const customerContext = (
    header: string | undefined,
    locale?: "en" | "az",
  ) => ({
    agent: "customer" as const,
    sessionToken: token(header) ?? "",
    ...(locale ? { locale } : {}),
  });
  app.get("/api/assistant/settings", async () => ({
    data: assistant.settings(),
  }));
  app.get("/api/assistant/conversations", async (request) => ({
    data: assistant.list(customerContext(request.headers.authorization)),
  }));
  app.get("/api/assistant/conversations/:id", async (request) => ({
    data: assistant.detail(
      customerContext(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.post("/api/assistant/turns", async (request, reply) =>
    reply.code(202).send({
      data: assistant.send(
        customerContext(request.headers.authorization),
        request.body,
      ),
    }),
  );
  app.get("/api/assistant/turns/:id", async (request) => ({
    data: assistant.turn(
      customerContext(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.post("/api/assistant/turns/:id/resume", async (request, reply) => {
    const input = z.strictObject({ locale: localeSchema }).parse(request.body);
    return reply.code(202).send({
      data: assistant.resume(
        customerContext(request.headers.authorization, input.locale),
        params(request.params),
      ),
    });
  });
  app.post("/api/assistant/turns/:id/decision", async (request) => ({
    data: assistant.decide(
      customerContext(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/assistant/turns/:id/handoff", async (request) => ({
    data: assistant.help(
      customerContext(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.get("/api/assistant/handoffs", async (request) => ({
    data: assistant.staffHandoffs(actor(request.headers.authorization)),
  }));
  app.get("/api/procurement/:id", async (request) => ({
    data: operations.detail(
      actor(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.get("/api/procurement/:id/audit", async (request) => ({
    data: operations.timeline(
      actor(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.get("/api/purchasing-records", async (request) => ({
    data: operations.purchasing(
      actor(request.headers.authorization),
      request.query,
    ),
  }));
  app.get("/api/model-runs", async (request) => ({
    data: operations.runs(actor(request.headers.authorization), request.query),
  }));
  app.get("/api/suppliers", async (request) => ({
    data: purchasing.suppliers(actor(request.headers.authorization)),
  }));
  app.post("/api/suppliers", async (request) => ({
    data: purchasing.saveSupplier(
      actor(request.headers.authorization),
      request.body,
    ),
  }));
  app.post("/api/suppliers/:id", async (request) => ({
    data: purchasing.saveSupplier(
      actor(request.headers.authorization),
      request.body,
      params(request.params),
    ),
  }));
  app.get("/api/quotes", async (request) => ({
    data: purchasing.quotes(
      actor(request.headers.authorization),
      request.query,
    ),
  }));
  app.post("/api/quotes", async (request) => ({
    data: purchasing.saveQuote(
      actor(request.headers.authorization),
      request.body,
    ),
  }));
  app.get("/api/orders/:id", async (request) => ({
    data: business.getOrder(
      actor(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.post("/api/orders/:id/cancel", async (request) => ({
    data: business.cancelOrder(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/orders/:id/transition", async (request) => ({
    data: business.transitionOrder(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/returns", async (request) => ({
    data: business.requestReturn(
      actor(request.headers.authorization),
      request.body,
    ),
  }));
  app.post("/api/returns/:id/transition", async (request) => ({
    data: business.transitionReturn(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/returns/:id/inspect", async (request) => ({
    data: business.inspectReturn(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/returns/:id/resolve", async (request) => ({
    data: business.resolveReturn(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.post("/api/returns/:id/exchange-offer", async (request) => ({
    data: business.prepareExchange(
      actor(request.headers.authorization),
      params(request.params),
      request.body,
    ),
  }));
  app.get("/api/procurement/:id/comparison", async (request) => ({
    data: business.compareQuotes(
      actor(request.headers.authorization),
      params(request.params),
    ),
  }));
  app.post("/api/reservations/expire", async (request) => ({
    data: business.expireReservations(actor(request.headers.authorization)),
  }));
  return app;
}
