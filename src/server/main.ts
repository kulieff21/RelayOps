import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "../db/database.js";
import { seed } from "../db/seed.js";
import { frozenClock } from "../shared/time.js";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { modelConfig } from "../model/config.js";
import { ModelBudget } from "../model/budget.js";
import { OpenRouter } from "../model/openrouter.js";
import { join } from "node:path";
import { projectRoot } from "./config.js";
import type { CustomerModels } from "../agent/customer-assistant.js";
import { telegramMappingConfig } from "../telegram/setup.js";

const values = config();
mkdirSync(dirname(values.databasePath), { recursive: true });
const store = new Store(values.databasePath);
store.migrate();
seed(store);
let budget: ModelBudget | undefined;
const models: CustomerModels = {};
// Starting the server never invokes a provider. Browser live mode is opt-in.
if (process.env.ASSISTANT_LIVE_ENABLED === "true") {
  const settings = modelConfig();
  models.live = {
    id: settings.model,
    create: () => {
      budget ??= new ModelBudget(
        join(projectRoot, "runtime/model-budget.sqlite"),
        settings.ceilingMicroUsd,
      );
      return new OpenRouter(settings, budget);
    },
  };
}
const approvalOptions = process.env.TELEGRAM_APPROVER_ACCOUNT_ID?.trim()
  ? {
      mapping: telegramMappingConfig(),
      liveEnabled: process.env.TELEGRAM_APPROVALS_ENABLED === "true",
    }
  : undefined;
const app = createApp(
  store,
  frozenClock(values.DEMO_CLOCK),
  models,
  { live: models.live },
  approvalOptions,
);
await app.listen({ host: values.HOST, port: values.PORT });
console.log(
  `RelayOps sandbox API: http://${values.HOST}:${values.PORT} (frozen business clock ${values.DEMO_CLOCK})`,
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  store.close();
  budget?.close();
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
