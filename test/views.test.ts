import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { createApp } from "../src/server/app.js";

test("new collection reads enforce customer privacy and staff scopes over real effects", async (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  const app = createApp(store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  const login = async (account: string) => ({
    authorization: `Bearer ${(await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${account}@relayops.example`, password: DEMO_PASSWORD } })).json().data.token}`,
  });
  const a = await login("customer-a");
  const b = await login("customer-b");
  const purchaser = await login("purchaser");
  const operator = await login("operator");
  const owner = await login("owner");
  for (const url of ["/api/orders", "/api/returns", "/api/workspace"])
    assert.equal((await app.inject(url)).statusCode, 401);
  const list = async (headers: { authorization: string }) =>
    (await app.inject({ url: "/api/orders", headers })).json().data;
  assert.deepEqual(
    (await list(a)).map((o: { id: string }) => o.id),
    ["demo-delivered-order"],
  );
  assert.equal((await list(b)).length, 1);
  assert.notEqual((await list(b))[0].id, "demo-delivered-order");
  assert.equal((await list(purchaser)).length, 1);
  assert.equal((await list(operator)).length, 2);
  const returned = await app.inject({
    method: "POST",
    url: "/api/returns",
    headers: a,
    payload: {
      orderId: "demo-delivered-order",
      quantity: 1,
      reason: "Demo inspection request",
      resolution: "refund",
      key: "view-test-return",
    },
  });
  assert.equal(returned.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/returns", headers: a })).json().data.length,
    1,
  );
  assert.equal(
    (await app.inject({ url: "/api/returns", headers: b })).json().data.length,
    0,
  );
  assert.equal(
    (await app.inject({ url: "/api/returns", headers: purchaser })).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/workspace", headers: a })).statusCode,
    403,
  );
  const purchasing = (
    await app.inject({ url: "/api/workspace", headers: purchaser })
  ).json().data;
  assert.equal(purchasing.suppliers.length, 3);
  assert.equal(purchasing.cases.length, 1);
  assert.equal(purchasing.returns.length, 0);
  assert.equal(purchasing.audit.length, 0);
  const operational = (
    await app.inject({ url: "/api/workspace", headers: operator })
  ).json().data;
  assert.equal(operational.returns.length, 1);
  assert.equal(operational.suppliers.length, 3);
  assert.deepEqual(operational.suppliers[0].capabilities, {
    categories: ["networking"],
    zone: "baku",
  });
  assert.equal(operational.cases.length, 0);
  assert.equal(operational.audit.length, 0);
  const full = (
    await app.inject({ url: "/api/workspace", headers: owner })
  ).json().data;
  assert.equal(full.inventory.length, 6);
  assert.equal(full.movements.length, 6);
  assert.ok(full.audit.length > 0);
  const switchProduct = full.inventory.find(
    (p: { id: string }) => p.id === "NET-SW-24G",
  );
  assert.equal(switchProduct.stock, 8);
  assert.equal(
    (await app.inject("/api/products?q=NET-SW")).json().data[0].available,
    0,
  );
  assert.doesNotMatch(
    JSON.stringify(full),
    /password_hash|token_hash|telegram_user_id|chat_id|checkpoint/,
  );
  assert.ok(
    full.audit.every(
      (row: object) =>
        !Object.hasOwn(row, "data") && !Object.hasOwn(row, "actor_id"),
    ),
  );
});
