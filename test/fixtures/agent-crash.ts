// Child-process recovery fixture. Exit after a real SQLite commit, bypassing cleanup.
import { Store } from "../../src/db/database.js";
import { DEMO_PASSWORD, seed } from "../../src/db/seed.js";
import { Auth } from "../../src/domain/auth.js";
import { Business } from "../../src/domain/business.js";
import { FIXTURE_TIME } from "../../src/shared/time.js";
import { ToolDispatcher } from "../../src/agent/tools.js";
import { Conversations } from "../../src/agent/conversations.js";
import { MockModel } from "../../src/model/mock.js";
import type { RunState } from "../../src/agent/loop.js";

const store = new Store(process.argv[2]!);
store.migrate();
seed(store);
const auth = new Auth(store),
  token = auth.login({
    email: "customer-a@relayops.example",
    password: DEMO_PASSWORD,
  }).token;
const scenario = process.argv[3];
const first =
  scenario === "confirmation"
    ? {
        id: "pending",
        type: "function" as const,
        function: {
          name: "cancelOrder",
          arguments: JSON.stringify({
            orderId: "demo-delivered-order",
            reason: "fixture",
            key: "crash-confirm",
          }),
        },
      }
    : {
        id: "prepare",
        type: "function" as const,
        function: {
          name: "prepareOrder",
          arguments: JSON.stringify({
            productId: "PC-MINI-16",
            quantity: 1,
            deadline: "2026-10-20",
            destination: "baku",
            allowPartial: false,
            allowSubstitution: false,
          }),
        },
      };
const source = [
  {
    content: null,
    finishReason: "tool_calls" as const,
    toolCalls: [
      first,
      {
        id: "catalog",
        type: "function" as const,
        function: {
          name: "searchProducts",
          arguments: '{"query":"RelaySwitch","locale":"en"}',
        },
      },
    ],
  },
];
const model = new MockModel(source);
const original = store.transaction.bind(store);
let depth = 0;
store.transaction = <T>(action: () => T): T => {
  depth++;
  let result: T;
  try {
    result = original(action);
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
        (scenario === "model" && state.phase === "model_pending") ||
        (scenario !== "model" &&
          state.phase === "tools" &&
          state.toolIndex === 1)
      )
        process.exit(0);
    }
  }
  return result;
};
await new Conversations(
  store,
  new ToolDispatcher(new Business(store, { now: () => FIXTURE_TIME }), auth),
  { mode: "mock", id: "relayops/deterministic-mock", adapter: model },
).start(
  { agent: "customer", sessionToken: token },
  { userText: "Recovery fixture", maxRetries: 0 },
);
throw new Error("Recovery fixture did not exit at its checkpoint");
