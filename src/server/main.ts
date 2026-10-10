import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "../db/database.js";
import { seed } from "../db/seed.js";
import { frozenClock } from "../shared/time.js";
import { config } from "./config.js";
import { createApp } from "./app.js";

const values = config();
mkdirSync(dirname(values.databasePath), { recursive: true });
const store = new Store(values.databasePath);
store.migrate();
seed(store);
const app = createApp(store, frozenClock(values.DEMO_CLOCK));
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
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
