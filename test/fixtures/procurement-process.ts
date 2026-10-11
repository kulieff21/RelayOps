import { Store } from "../../src/db/database.js";
import { Auth } from "../../src/domain/auth.js";
import { Business } from "../../src/domain/business.js";
import { Procurement } from "../../src/domain/procurement.js";
import { ProcurementAssistant } from "../../src/agent/procurement-assistant.js";
import { seed, DEMO_PASSWORD } from "../../src/db/seed.js";
import { FIXTURE_TIME } from "../../src/shared/time.js";
import { BusinessError } from "../../src/shared/contracts.js";
import type { RunState } from "../../src/agent/loop.js";

const store = new Store(process.argv[2]!);
store.migrate();
seed(store);
const auth = new Auth(store),
  business = new Business(store, { now: () => FIXTURE_TIME });
if (process.argv[3] === "save") {
  try {
    const p = new Procurement(business).prepare(
      auth.actor(process.argv[4]!),
      "fixture-006",
      JSON.parse(process.argv[5]!),
    );
    console.log(JSON.stringify({ id: p.id, version: p.version }));
  } catch (error) {
    if (!(error instanceof BusinessError)) throw error;
    console.log(JSON.stringify({ error: error.code }));
  } finally {
    store.close();
  }
} else {
  const original = store.transaction.bind(store);
  let depth = 0;
  store.transaction = <T>(action: () => T): T => {
    depth++;
    let value: T;
    try {
      value = original(action);
    } finally {
      depth--;
    }
    if (depth === 0) {
      const row = store.one<{ state: string }>(
        "SELECT state FROM agent_execution LIMIT 1",
      );
      if (row) {
        const state = JSON.parse(row.state) as RunState;
        if (
          state.steps.some((step) =>
            step.toolResults.some(
              (result) =>
                result.status === "completed" &&
                result.name === "preparePurchaseProposal",
            ),
          )
        )
          process.exit(0);
      }
    }
    return value;
  };
  const assistant = new ProcurementAssistant(business, auth);
  assistant.send(
    {
      agent: "procurement",
      caseId: "fixture-006",
      sessionToken: auth.login({
        email: "purchaser@relayops.example",
        password: DEMO_PASSWORD,
      }).token,
    },
    {
      mode: "mock",
      locale: "en",
      key: "procurement-real-crash",
      expectedVersion: 0,
      revisionReason: null,
    },
  );
  await assistant.idle();
  throw new Error("Expected committed-proposal crash checkpoint");
}
