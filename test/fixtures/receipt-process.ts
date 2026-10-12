import { Store } from "../../src/db/database.js";
import { Auth } from "../../src/domain/auth.js";
import { Business } from "../../src/domain/business.js";
import { Fulfillment } from "../../src/domain/fulfillment.js";
import { BusinessError } from "../../src/shared/contracts.js";
import { frozenClock } from "../../src/shared/time.js";
const [path, receiptId, key, mode] = process.argv.slice(2);
const store = new Store(path!);
try {
  new Fulfillment(new Business(store, frozenClock())).inspect(
    new Auth(store).actor("operator"),
    receiptId!,
    { outcome: "sellable", notes: "Process inspection", key },
  );
  if (mode === "crash") process.exit(32);
} catch (error) {
  if (
    !(error instanceof BusinessError) ||
    error.code !== "INSPECTION_ALREADY_RECORDED"
  )
    throw error;
} finally {
  store.close();
}
