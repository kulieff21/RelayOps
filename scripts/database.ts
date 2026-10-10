import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "../src/db/database.js";
import { seed, resetDemo } from "../src/db/seed.js";
import { config } from "../src/server/config.js";

const values = config();
const command = process.argv[2];
if (!["migrate", "seed", "reset"].includes(command ?? ""))
  throw new Error("Expected migrate, seed or reset");
mkdirSync(dirname(values.databasePath), { recursive: true });
const store = new Store(values.databasePath);
try {
  if (command === "reset") resetDemo(store, process.argv[3] ?? "");
  else {
    store.migrate();
    if (command === "seed") seed(store);
  }
  console.log(`Demo database ${command} complete.`);
} finally {
  store.close();
}
