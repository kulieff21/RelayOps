import test from "node:test";
import assert from "node:assert/strict";
import { messages, money, date } from "../src/web/i18n.js";
import { Store } from "../src/db/database.js";
import { seed } from "../src/db/seed.js";
import { Business } from "../src/domain/business.js";
import { frozenClock } from "../src/shared/time.js";

test("EN/AZ catalogs cover every visible fixture category/spec and format Baku dates/money", (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  t.after(() => store.close());
  const products = new Business(store, frozenClock()).search("");
  for (const product of products) {
    assert.ok(product.category in messages, product.category);
    for (const key of Object.keys(product.specs))
      assert.ok(key in messages, key);
  }
  for (const [key, pair] of Object.entries(messages)) {
    assert.equal(pair.length, 2);
    assert.ok(
      pair.every((value) => value.trim().length),
      key,
    );
  }
  assert.match(money("en", 192000), /1,920/);
  assert.match(money("az", 192000), /1.920/);
  assert.equal(money("az", 192050), "1.920,50 ₼");
  assert.match(date("en", "2026-10-12T22:00:00Z"), /13/);
  assert.match(date("az", "2026-10-12T22:00:00Z"), /13/);
  assert.equal(date("az", "2026-10-12T22:00:00Z"), "13 oktyabr 2026");
  assert.match(messages.heroTitle[1], /ə/);
});
