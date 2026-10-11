import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Store } from "../src/db/database.js";
import { Auth } from "../src/domain/auth.js";
import { projectRoot } from "../src/server/config.js";
import {
  TelegramSetupApi,
  telegramTokenConfig,
  telegramMappingConfig,
  createTelegramPairing,
  telegramPairing,
  identifyTelegramRecipient,
  validateTelegramApprover,
} from "../src/telegram/setup.js";

const token = "123456:" + "synthetic_private_token_value";
const settings = telegramTokenConfig({ TELEGRAM_BOT_TOKEN: token });
const bot = {
  id: 123456,
  is_bot: true as const,
  username: "relayops_test_bot",
};
const now = 1_800_000_000_000;
const pairing = createTelegramPairing(bot, now);
const env = {
  TELEGRAM_BOT_ID: String(bot.id),
  TELEGRAM_APPROVER_USER_ID: "123000456",
  TELEGRAM_APPROVER_CHAT_ID: "123000456",
  TELEGRAM_APPROVER_ACCOUNT_ID: "owner",
  TELEGRAM_APPROVER_LOCALE: "az",
};
function update(userId = 123000456, text = `/start relayops_${pairing.nonce}`) {
  return {
    update_id: 100,
    message: {
      date: now / 1000,
      from: { id: userId, is_bot: false, username: "display_only" },
      chat: { id: userId, type: "private" },
      text,
    },
  };
}
function fixture(results: unknown[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const api = new TelegramSetupApi(settings, async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return Response.json({ ok: true, result: results.shift() });
  });
  return { api, requests };
}
test("Telegram onboarding configuration fails closed and never includes secrets", () => {
  assert.throws(
    () => telegramTokenConfig({}),
    /^Error: TELEGRAM_TOKEN_REQUIRED$/,
  );
  for (const patch of [
    { TELEGRAM_BOT_TOKEN: "private-value" },
    { TELEGRAM_BOT_TOKEN: token + "/getMe" },
    { TELEGRAM_TIMEOUT_MS: "0" },
    { TELEGRAM_TIMEOUT_MS: "30001" },
  ])
    assert.throws(
      () => telegramTokenConfig({ TELEGRAM_BOT_TOKEN: token, ...patch }),
      /^Error: TELEGRAM_CONFIGURATION_INVALID$/,
    );
  assert.throws(
    () => telegramMappingConfig({}),
    /TELEGRAM_MAPPING_REQUIRED_OR_INVALID/,
  );
  for (const patch of [
    { TELEGRAM_APPROVER_USER_ID: "9007199254740992" },
    { TELEGRAM_APPROVER_USER_ID: "-1" },
    { TELEGRAM_APPROVER_USER_ID: "@somebody" },
    { TELEGRAM_APPROVER_CHAT_ID: "0" },
    { TELEGRAM_APPROVER_LOCALE: "tr" },
    { TELEGRAM_APPROVER_ACCOUNT_ID: "owner;invalid" },
  ])
    assert.throws(
      () => telegramMappingConfig({ ...env, ...patch }),
      /TELEGRAM_MAPPING_REQUIRED_OR_INVALID/,
    );
  assert.throws(
    () => telegramMappingConfig({ ...env, TELEGRAM_APPROVER_CHAT_ID: "123" }),
    /TELEGRAM_PRIVATE_MAPPING_REQUIRED/,
  );
});
test("explicit setup uses only read methods with no acknowledgements, redirects or startup calls", async () => {
  const f = fixture([bot, { url: "", pending_update_count: 2 }, [update()]]);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(await f.api.bot(), bot);
  assert.deepEqual(await f.api.requirePollingAvailable(), {
    pendingUpdates: 2,
  });
  const candidate = identifyTelegramRecipient(
    await f.api.pendingUpdates(),
    pairing,
    bot,
    now,
  );
  assert.deepEqual(candidate, {
    botId: bot.id,
    userId: 123000456,
    chatId: 123000456,
    authorized: false,
  });
  assert.deepEqual(
    f.requests.map((r) => r.url.split("/").at(-1)),
    ["getMe", "getWebhookInfo", "getUpdates"],
  );
  assert.deepEqual(JSON.parse(String(f.requests[2]!.init.body)), {
    timeout: 0,
    limit: 100,
  });
  for (const r of f.requests) {
    assert.equal(
      r.url,
      `https://api.telegram.org/bot${token}/${r.url.split("/").at(-1)}`,
    );
    assert.equal(r.init.method, "POST");
    assert.equal(r.init.redirect, "error");
    assert.ok(r.init.signal instanceof AbortSignal);
  }
});
test("bot/token identity and existing webhook cannot be silently changed", async () => {
  await assert.rejects(
    fixture([{ ...bot, id: 999 }]).api.bot(),
    /TELEGRAM_BOT_MISMATCH/,
  );
  await assert.rejects(
    fixture([{ ...bot, is_bot: false }]).api.bot(),
    /TELEGRAM_RESPONSE_INVALID/,
  );
  const f = fixture([
    { url: "https://private-host.example/secret", pending_update_count: 0 },
  ]);
  await assert.rejects(
    f.api.requirePollingAvailable(),
    /^Error: TELEGRAM_WEBHOOK_ALREADY_CONFIGURED$/,
  );
  assert.equal(f.requests.length, 1);
});
test("pairing rejects expiry, malformed state, a future clock and another bot", () => {
  assert.throws(
    () => telegramPairing({}, bot, now),
    /TELEGRAM_PAIRING_REQUIRED/,
  );
  assert.throws(
    () => telegramPairing(pairing, { ...bot, id: 111 }, now),
    /TELEGRAM_BOT_MISMATCH/,
  );
  assert.throws(
    () => telegramPairing(pairing, bot, now - 1),
    /TELEGRAM_PAIRING_EXPIRED/,
  );
  assert.throws(
    () => telegramPairing(pairing, bot, now + 15 * 60_000),
    /TELEGRAM_PAIRING_EXPIRED/,
  );
  assert.deepEqual(telegramPairing(pairing, bot, now + 14 * 60_000), pairing);
  assert.notEqual(createTelegramPairing(bot, now).nonce, pairing.nonce);
});
test("discovery ignores unrelated, old, bot, group, edited and forged sender updates", () => {
  const group = update();
  group.message.chat.type = "group";
  const forged = update();
  forged.message.chat.id = 111;
  const old = update();
  old.message.date -= 1;
  const future = update();
  future.message.date += 10;
  const senderBot = update();
  senderBot.message.from.is_bot = true;
  const otherNonce = createTelegramPairing(bot, now).nonce;
  const unrelated = [
    update(222, "/start"),
    update(333, `/start relayops_${otherNonce}`),
    group,
    forged,
    old,
    future,
    senderBot,
    { update_id: 3, edited_message: update().message },
    {
      update_id: 4,
      callback_query: { data: `/start relayops_${pairing.nonce}` },
    },
  ];
  assert.throws(
    () => identifyTelegramRecipient(unrelated, pairing, bot, now),
    /TELEGRAM_START_NOT_FOUND/,
  );
  assert.equal(
    identifyTelegramRecipient([...unrelated, update()], pairing, bot, now)
      .userId,
    123000456,
  );
});
test("same recipient repetitions remain a candidate; competing recipients are refused", () => {
  assert.equal(
    identifyTelegramRecipient([update(), update()], pairing, bot, now)
      .authorized,
    false,
  );
  assert.throws(
    () => identifyTelegramRecipient([update(), update(555)], pairing, bot, now),
    /TELEGRAM_RECIPIENT_AMBIGUOUS/,
  );
});
test("owner mapping uses actual current account roles and binds numeric bot identity", (t) => {
  const store = new Store();
  store.migrate();
  t.after(() => store.close());
  store.run(
    "INSERT INTO accounts VALUES ('owner','owner@example.test','unused','en')",
  );
  store.run("INSERT INTO roles VALUES ('owner','owner')");
  const auth = new Auth(store),
    mapping = telegramMappingConfig(env);
  assert.equal(
    validateTelegramApprover(mapping, bot, auth.actor("owner")).locale,
    "az",
  );
  assert.throws(
    () =>
      validateTelegramApprover(
        mapping,
        { ...bot, id: 111 },
        auth.actor("owner"),
      ),
    /TELEGRAM_BOT_MISMATCH/,
  );
  assert.throws(
    () =>
      validateTelegramApprover(
        { ...mapping, accountId: "other" },
        bot,
        auth.actor("owner"),
      ),
    /TELEGRAM_OWNER_REQUIRED/,
  );
  store.run("DELETE FROM roles WHERE account_id='owner'");
  store.run("INSERT INTO roles VALUES ('owner','purchaser')");
  assert.throws(
    () => validateTelegramApprover(mapping, bot, auth.actor("owner")),
    /TELEGRAM_OWNER_REQUIRED/,
  );
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_requests")!.n,
    0,
  );
});
test("transport and provider errors omit token, body, URLs, stack and redirect details", async () => {
  const cases: [typeof fetch, string][] = [
    [
      async () => {
        throw new Error(`https://api.telegram.org/bot${token}/getMe`);
      },
      "TELEGRAM_REQUEST_FAILED",
    ],
    [
      async () =>
        Response.json({ ok: false, description: token }, { status: 401 }),
      "TELEGRAM_HTTP_401",
    ],
    [
      async () => Response.json({ ok: false, description: token }),
      "TELEGRAM_RESPONSE_INVALID",
    ],
    [async () => new Response(token), "TELEGRAM_REQUEST_FAILED"],
    [
      async () =>
        Response.json({ ok: true, result: { ...bot, username: token } }),
      "TELEGRAM_RESPONSE_INVALID",
    ],
    [
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: `https://example.test/${token}` },
        }),
      "TELEGRAM_HTTP_302",
    ],
  ];
  for (const [transport, code] of cases)
    await assert.rejects(
      new TelegramSetupApi(settings, transport).bot(),
      (error) =>
        error instanceof Error &&
        error.message === code &&
        !error.message.includes(token),
    );
});
test("response bounds cover content length and an unadvertised streamed body", async () => {
  for (const transport of [
    async () =>
      new Response("small", { headers: { "content-length": "1000001" } }),
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
            controller.close();
          },
        }),
      ),
  ])
    await assert.rejects(
      new TelegramSetupApi(settings, transport).bot(),
      /TELEGRAM_RESPONSE_TOO_LARGE/,
    );
  await assert.rejects(
    fixture([Array.from({ length: 101 }, () => update())]).api.pendingUpdates(),
    /TELEGRAM_RESPONSE_INVALID/,
  );
});
test("CLI missing-token/invalid-argument paths exit with fixed output before any network", () => {
  for (const [args, code] of [
    [["--prepare"], "TELEGRAM_TOKEN_REQUIRED"],
    [["--invalid"], "TELEGRAM_SETUP_ARGUMENTS_INVALID"],
    [["--prepare", token], "TELEGRAM_SETUP_ARGUMENTS_INVALID"],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/telegram-setup.ts", ...args],
      {
        cwd: projectRoot,
        env: { ...process.env, TELEGRAM_BOT_TOKEN: "" },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr.replace(/^.*ExperimentalWarning.*\n.*\n/gm, "").trim(),
      code,
    );
    assert.ok(!result.stderr.includes(token));
  }
});
