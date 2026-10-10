import { Store } from "../src/db/database.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { frozenClock } from "../src/shared/time.js";
import { BusinessError } from "../src/shared/contracts.js";
const [path, offerId, customer] = process.argv.slice(2);
const store = new Store(path!);
try {
  const order = new Business(store, frozenClock()).confirmOrder(
    new Auth(store).actor(customer!),
    { offerId, version: 1, confirmed: true, key: "process-race" },
  );
  console.log(order.status);
} catch (error) {
  if (!(error instanceof BusinessError)) throw error;
  console.log(error.code);
} finally {
  store.close();
}
