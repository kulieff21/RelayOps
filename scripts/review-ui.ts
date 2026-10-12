import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Store } from "../src/db/database.js";
import { seed } from "../src/db/seed.js";
import { createApp } from "../src/server/app.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Approvals } from "../src/domain/approvals.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import { frozenClock } from "../src/shared/time.js";
import { Procurement } from "../src/domain/procurement.js";
import { randomUUID } from "node:crypto";

// Explicit, loopback-only UI review. No .env, named database, or live integration.
const store = new Store();
store.migrate();
seed(store);
const approvalOptions = {
  mapping: {
    botId: 123456,
    userId: 222333,
    chatId: 222333,
    accountId: "owner",
    locale: "az" as const,
  },
  liveEnabled: false,
};
if (process.argv.slice(2).some((argument) => argument !== "--purchase"))
  throw new Error("Only --purchase is supported by the isolated UI review");
if (process.argv.includes("--purchase")) {
  const business = new Business(store, frozenClock()),
    auth = new Auth(store);
  const owner = auth.actor("owner"),
    procurement = new Procurement(business);
  const evidence = procurement.evidence(owner, "fixture-006");
  const proposal = procurement.prepare(owner, "fixture-006", {
    expectedVersion: 0,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Isolated UI review fixture",
    revisionReason: null,
  });
  const approvals = new Approvals(business, auth, approvalOptions);
  const request = approvals.submit(owner, "fixture-006", proposal.id, {
    mode: "mock",
    expectedVersion: 1,
    key: randomUUID(),
  });
  approvals.decide(owner, "fixture-006", request.id, {
    decision: "approved",
    reason: "Isolated simulated owner decision",
    key: randomUUID(),
  });
  new PurchaseExecution(approvals).purchase(request.id);
}
const app = createApp(store, undefined, {}, {}, approvalOptions);
const root = resolve("dist/web");
const control = resolve("artifacts/ui/phase15-control.json");
app.addHook("onRequest", async (request, reply) => {
  if (!request.url.startsWith("/api/")) return;
  const state = existsSync(control)
    ? (JSON.parse(readFileSync(control, "utf8")) as {
        fail?: boolean;
        delayMs?: number;
      })
    : {};
  if (state.delayMs)
    await new Promise((done) =>
      setTimeout(done, Math.min(state.delayMs!, 5000)),
    );
  if (state.fail)
    return reply.code(503).send({ error: { code: "CONNECTION_ERROR" } });
});
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
app.get("/*", async (request, reply) => {
  const path = resolve(root, `.${request.url.split("?")[0]}`);
  if (path !== root && !path.startsWith(root + sep))
    return reply.code(404).send();
  const asset =
    extname(path) && existsSync(path) ? path : resolve(root, "index.html");
  reply.header("Cache-Control", "no-store");
  // The embedded browser does not expose media emulation. This explicit fixture
  // exercises the actual preference hook and compiled CSS without altering the OS.
  if (
    extname(asset) === ".html" &&
    new URL(request.url, "http://127.0.0.1").searchParams.get("__review") ===
      "reduce"
  ) {
    const fixture = `<script>
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => query === '(prefers-reduced-motion: reduce)'
        ? { media: query, matches: true, onchange: null,
            addEventListener() {}, removeEventListener() {},
            addListener() {}, removeListener() {}, dispatchEvent() { return true; } }
        : originalMatchMedia(query);
      const applyMediaFixture = () => {
        const visit = (rules) => { for (const rule of rules) {
          if (rule instanceof CSSMediaRule && rule.conditionText === '(prefers-reduced-motion: reduce)')
            rule.media.mediaText = 'all';
          if (rule.cssRules) visit(rule.cssRules);
        }};
        for (const sheet of document.styleSheets) visit(sheet.cssRules);
      };
      document.addEventListener('DOMContentLoaded', applyMediaFixture);
    </script>`;
    return reply
      .type("text/html")
      .send(readFileSync(asset, "utf8").replace("<head>", "<head>" + fixture));
  }
  return reply
    .type(types[extname(asset)] ?? "application/octet-stream")
    .send(readFileSync(asset));
});
await app.listen({ host: "127.0.0.1", port: 4315 });
console.log("Isolated in-memory UI review: http://127.0.0.1:4315");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      store.close();
      process.exit(0);
    });
  });
