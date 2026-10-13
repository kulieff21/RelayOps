import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Store } from "../db/database.js";
import { seed } from "../db/seed.js";
import { createApp } from "./app.js";
import { config, projectRoot } from "./config.js";
import { serveFrontend } from "./static.js";
import { visitorApprovalOptions } from "./visitor.js";

// Deliberately does not load .env, live model factories or a Telegram receiver.
const port = Number(process.env.DEMO_PORT ?? "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid DEMO_PORT");
const values = config({});
mkdirSync(dirname(values.databasePath), { recursive: true });
const store = new Store(values.databasePath);
store.migrate();
seed(store);
const app = createApp(store, undefined, {}, {}, visitorApprovalOptions);
serveFrontend(app, join(projectRoot, "dist/web"));
try {
  await app.listen({ host: "127.0.0.1", port });
} catch {
  await app.close();
  store.close();
  console.error(
    "Demo could not start. Check DEMO_PORT; existing listeners are never stopped.",
  );
  process.exit(1);
}
console.log(`RelayOps visitor demo: http://127.0.0.1:${port}`);
console.log(
  "Sandbox · guided assistants · simulated owner approval · no live integrations",
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  store.close();
  if (process.connected) process.disconnect();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void shutdown());
process.on("message", (message) => {
  if (message === "shutdown") void shutdown();
});
process.on("disconnect", () => void shutdown());
