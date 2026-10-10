import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { createApp } from "../src/server/app.js";
import { config } from "../src/server/config.js";

test("HTTP startup, localized catalog, trusted session, role denial and errors expose no private fields", async (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  const app = createApp(store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  assert.equal(
    (await app.inject("/health")).json().integrations,
    "not_connected",
  );
  const catalog = await app.inject("/api/products?locale=az&q=NET-SW");
  assert.equal(catalog.statusCode, 200);
  assert.match(catalog.json().data[0].name, /şəbəkə/);
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "customer-b@relayops.example", password: DEMO_PASSWORD },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json().data.token;
  const headers = { authorization: `Bearer ${token}` };
  assert.equal(
    (await app.inject({ url: "/api/auth/me", headers })).json().data.id,
    "customer-b",
  );
  const concealed = await app.inject({
    url: "/api/orders/demo-delivered-order",
    headers,
  });
  assert.equal(concealed.statusCode, 404);
  assert.equal(concealed.json().error.code, "ORDER_NOT_FOUND");
  const escalation = await app.inject({
    method: "POST",
    url: "/api/reservations/expire",
    headers,
  });
  assert.equal(escalation.statusCode, 403);
  const spoof = await app.inject({
    method: "POST",
    url: "/api/order-offers",
    headers,
    payload: { role: "owner", customerId: "owner" },
  });
  assert.equal(spoof.statusCode, 400);
  assert.equal(spoof.json().error.code, "INVALID_INPUT");
  assert.equal(typeof spoof.json().error.correlationId, "string");
  const response = JSON.stringify(spoof.json());
  assert.doesNotMatch(response, /password|stack|node_modules|token/);
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/auth/me", headers })).statusCode,
    401,
  );
});
test("HTTP login is bounded per IP and config refuses arbitrary files or public exposure", async (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  const app = createApp(store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  for (let n = 0; n < 10; n++)
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "unknown@relayops.example", password: "bad" },
        })
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "unknown@relayops.example", password: "bad" },
      })
    ).statusCode,
    429,
  );
  assert.throws(
    () => config({ DATABASE_PATH: "../foreign.sqlite" }),
    /Only runtime/,
  );
  assert.throws(() => config({ HOST: "0.0.0.0" }));
  assert.throws(() => config({ PORT: "not-a-number" }));
  assert.equal(config({}).HOST, "127.0.0.1");
});
