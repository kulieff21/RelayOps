import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Procurement } from "../src/domain/procurement.js";
import { Approvals } from "../src/domain/approvals.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import {
  TelegramApprovalApi,
  TelegramApprovalWorker,
} from "../src/telegram/approvals.js";
import { telegramTokenConfig } from "../src/telegram/setup.js";
import { createApp } from "../src/server/app.js";
import { frozenClock } from "../src/shared/time.js";
import { translate, money } from "../src/web/i18n.js";

for (const locale of ["en", "az"] as const) {
  for (const decision of ["approved", "rejected"] as const) {
    test(`${locale}: customer consent, localized Telegram ${decision}, website agreement and final business state`, async (t) => {
      const store = new Store();
      store.migrate();
      seed(store);
      const auth = new Auth(store),
        business = new Business(store, frozenClock());
      const owner = auth.actor("owner");
      business.cancelOrder(owner, "fixture-003", {
        reason: "Isolated bilingual review",
        key: randomUUID(),
      });
      store.run("UPDATE accounts SET locale=? WHERE id='customer-a'", locale);
      const mapping = {
        botId: 123456,
        userId: 222333,
        chatId: 222333,
        accountId: "owner",
        locale,
      };
      const options = { mapping, liveEnabled: true };
      const app = createApp(store, frozenClock(), {}, {}, options);
      const headers = (id: string) => ({
        authorization: `Bearer ${auth.login({ email: `${id}@relayops.example`, password: DEMO_PASSWORD }).token}`,
      });
      const customerHeaders = headers("customer-a"),
        ownerHeaders = headers("owner");
      const post = async (
        url: string,
        payload: Record<string, unknown>,
        customer = false,
      ) => {
        const result = await app.inject({
          method: "POST",
          url,
          headers: customer ? customerHeaders : ownerHeaders,
          payload,
        });
        assert.equal(result.statusCode, 200, result.body);
        return result.json().data;
      };
      t.after(async () => {
        await app.close();
        store.close();
      });
      const catalog = await app.inject({
        url: `/api/products?locale=${locale}`,
      });
      assert.match(
        catalog.body,
        locale === "az" ? /şəbəkə kommutatoru/ : /managed gigabit switch/,
      );
      const offer = await post(
        "/api/order-offers",
        {
          productId: "NET-SW-24G",
          quantity: 20,
          deadline: "2026-10-19",
          destination: "baku",
          allowPartial: false,
          allowSubstitution: false,
        },
        true,
      );
      const consent = {
        offerId: offer.id,
        version: offer.version,
        confirmed: true,
        key: randomUUID(),
      };
      const order = await post("/api/orders", consent, true);
      assert.equal((await post("/api/orders", consent, true)).id, order.id);
      const caseId = store.one<{ id: string }>(
        "SELECT id FROM procurement_cases WHERE order_id=?",
        order.id,
      )!.id;
      const procurement = new Procurement(business),
        evidence = procurement.evidence(owner, caseId);
      const proposal = procurement.prepare(owner, caseId, {
        expectedVersion: 0,
        evidenceFingerprint: evidence.fingerprint,
        rationale: "Bilingual review",
        revisionReason: null,
      });
      const request = await post(
        `/api/procurement/${caseId}/proposals/${proposal.id}/approval`,
        { mode: "live", expectedVersion: 1, key: randomUUID() },
      );
      const approvals = new Approvals(business, auth, options);
      const calls: { method: string; body: Record<string, unknown> }[] = [];
      let updatesReturned = false;
      const api = new TelegramApprovalApi(
        telegramTokenConfig({
          TELEGRAM_BOT_TOKEN: "123456:synthetic_private_token_value",
        }),
        async (url, init) => {
          const method = String(url).split("/").at(-1)!;
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          calls.push({ method, body });
          let result: unknown = true;
          if (method === "sendMessage")
            result = { message_id: 88, chat: { id: mapping.chatId } };
          if (method === "getUpdates") {
            result = updatesReturned
              ? []
              : [
                  {
                    update_id: 7,
                    callback_query: {
                      id: "bilingual-callback",
                      from: { id: mapping.userId, is_bot: false },
                      message: {
                        message_id: 88,
                        from: { id: mapping.botId, is_bot: true },
                        chat: { id: mapping.chatId, type: "private" },
                      },
                      data: `r:${request.id}:${decision === "approved" ? "a" : "r"}`,
                    },
                  },
                ];
            updatesReturned = true;
          }
          return Response.json({ ok: true, result });
        },
      );
      const worker = new TelegramApprovalWorker(approvals, api);
      try {
        await worker.tick();
        await worker.tick();
      } finally {
        worker.release();
      }
      const sent = calls.find((c) => c.method === "sendMessage")!.body;
      assert.match(
        String(sent.text),
        locale === "az" ? /SATINALMA TƏSDİQİ/ : /PURCHASING APPROVAL/,
      );
      assert.match(String(sent.text), /1920\.00 AZN/);
      assert.match(
        JSON.stringify(sent.reply_markup),
        locale === "az" ? /Təsdiq et.*Rədd et/ : /Approve.*Reject/,
      );
      const edited = calls.find((c) => c.method === "editMessageText")!.body;
      const terminal =
        locale === "az"
          ? decision === "approved"
            ? "TƏSDİQLƏNDİ"
            : "RƏDD EDİLDİ"
          : decision.toUpperCase();
      assert.ok(String(edited.text).startsWith(`[${terminal}]`));
      assert.deepEqual(edited.reply_markup, { inline_keyboard: [] });
      assert.equal(calls.filter((c) => c.method === "sendMessage").length, 1);
      const web = await app.inject({
        url: `/api/procurement/${caseId}/approvals`,
        headers: ownerHeaders,
      });
      const displayed = web
        .json()
        .data.requests.find((r: { id: string }) => r.id === request.id);
      assert.equal(displayed.effectiveStatus, decision);
      assert.equal(displayed.decision.decision, decision);
      assert.equal(
        store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_decisions")!
          .n,
        1,
      );
      assert.equal(business.product("NET-SW-24G").stock, 8);
      assert.equal(
        store.one<{ n: number }>("SELECT COUNT(*) n FROM goods_receipts")!.n,
        0,
      );
      assert.ok(translate(locale, decision).trim());
      assert.match(
        money(locale, proposal.total),
        locale === "az" ? /1\.920/ : /1,920/,
      );
      if (decision === "rejected") {
        assert.equal(
          store.one<{ n: number }>("SELECT COUNT(*) n FROM purchase_orders")!.n,
          0,
        );
        assert.equal(
          business.getOrder(owner, order.id).status,
          "awaiting_supply",
        );
        return;
      }
      const execution = new PurchaseExecution(approvals);
      const poId = execution.purchase(request.id).purchaseOrderId!;
      assert.equal(execution.purchase(request.id).purchaseOrderId, poId);
      for (const quantity of [5, 7]) {
        const receipt = await post(`/api/purchase-orders/${poId}/receipts`, {
          quantity,
          evidence: "Isolated physical evidence",
          key: randomUUID(),
        });
        const inspection = {
          outcome: "sellable",
          notes: "Isolated inspection",
          key: randomUUID(),
        };
        await post(`/api/goods-receipts/${receipt.id}/inspect`, inspection);
        await post(`/api/goods-receipts/${receipt.id}/inspect`, inspection);
      }
      for (const status of ["processing", "shipped", "delivered"]) {
        const transition = {
          status,
          evidence: `Isolated ${status}`,
          key: randomUUID(),
        };
        await post(`/api/orders/${order.id}/transition`, transition);
        await post(`/api/orders/${order.id}/transition`, transition);
      }
      const progress = await app.inject({
        url: `/api/orders/${order.id}/progress`,
        headers: customerHeaders,
      });
      assert.equal(progress.statusCode, 200);
      assert.equal(progress.json().data.required, 0);
      assert.ok(
        progress
          .json()
          .data.notifications.every(
            (n: { locale: string }) => n.locale === locale,
          ),
      );
      const final = business.getOrder(owner, order.id);
      assert.equal(final.status, "delivered");
      assert.equal(final.lines[0]!.delivered_quantity, 20);
      assert.equal(business.product("NET-SW-24G").stock, 0);
      assert.equal(
        store.one<{ n: number }>("SELECT COUNT(*) n FROM goods_receipts")!.n,
        2,
      );
    });
  }
}
