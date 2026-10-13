import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFrontend } from "../src/server/static.js";

test("same-origin frontend supports deep links without swallowing missing API/assets or escaping root", async () => {
  const root = mkdtempSync(join(tmpdir(), "relayops-static-"));
  writeFileSync(join(root, "index.html"), "<h1>Visitor sandbox</h1>");
  writeFileSync(join(root, "app.js"), "console.log('demo');");
  const app = Fastify();
  app.get("/health", async () => ({ mode: "sandbox" }));
  serveFrontend(app, root);
  try {
    assert.equal(
      (await app.inject("/workspace/procurement?case=fixture-006")).body,
      "<h1>Visitor sandbox</h1>",
    );
    assert.match(
      (await app.inject("/app.js")).headers["content-type"]!,
      /javascript/,
    );
    assert.equal((await app.inject("/missing.js")).statusCode, 404);
    assert.equal((await app.inject("/api/not-a-route")).statusCode, 404);
    assert.equal((await app.inject("/%2e%2e%2fsecret.txt")).statusCode, 404);
    assert.equal((await app.inject("/health")).json().mode, "sandbox");
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
