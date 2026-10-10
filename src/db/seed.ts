import { Store, applicationTables } from "./database.js";
import { hashPassword, Auth } from "../domain/auth.js";
import { Business } from "../domain/business.js";
import {
  FIXTURE_TIME,
  frozenClock,
  addBusinessDays,
  addHours,
  bakuDate,
} from "../shared/time.js";

export const DEMO_PASSWORD = "RelayOps-demo-2026!";
export function seed(store: Store) {
  const marker = store.one<{ value: string }>(
    "SELECT value FROM metadata WHERE key='environment'",
  );
  if (marker) {
    if (marker.value !== "relayops-demo")
      throw new Error("Not a RelayOps demo database");
    if (
      store.one<{ value: string }>(
        "SELECT value FROM metadata WHERE key='seed_status'",
      )?.value !== "complete"
    )
      throw new Error("Interrupted seed; run npm run db:reset");
    return;
  }
  // Refuse to mix fixtures into another database, even if someone removed its marker.
  if (store.one<{ n: number }>("SELECT COUNT(*) n FROM accounts")!.n > 0)
    throw new Error("Unmarked database is not empty");
  store.transaction(() => {
    store.run(
      "INSERT INTO metadata VALUES (?,?)",
      "environment",
      "relayops-demo",
    );
    store.run(
      "INSERT INTO metadata VALUES (?,?)",
      "fixture_time",
      FIXTURE_TIME,
    );
    store.run("INSERT INTO metadata VALUES (?,?)", "seed_status", "pending");
    const categories = [
      ["networking", "Networking", "Şəbəkə avadanlığı"],
      ["computers", "Computers", "Kompüterlər"],
      ["components", "Components", "Komponentlər"],
      ["storage", "Storage", "Yaddaş qurğuları"],
      ["peripherals", "Peripherals", "Periferiya"],
      ["power", "Power and accessories", "Enerji və aksesuarlar"],
    ];
    for (const category of categories)
      store.run("INSERT INTO categories VALUES (?,?,?)", ...category);
    const products = [
      {
        id: "NET-SW-24G",
        category: "networking",
        name: "RelaySwitch 24G",
        az: "RelaySwitch 24G şəbəkə kommutatoru",
        en: "24-port managed gigabit switch; no PoE.",
        description:
          "24 portlu idarə olunan gigabit kommutator; PoE dəstəyi yoxdur.",
        specs: { ports: 24, speedMbps: 1000, managed: true, poe: false },
        price: 22900,
        stock: 8,
      },
      {
        id: "PC-MINI-16",
        category: "computers",
        name: "RelayMini 16",
        az: "RelayMini 16 mini kompüter",
        en: "Mini PC with 16 GB RAM and 512 GB SSD; OS not included.",
        description: "16 GB RAM və 512 GB SSD; əməliyyat sistemi daxil deyil.",
        specs: { ramGb: 16, storageGb: 512, cpu: "Demo six-core", os: "none" },
        price: 85000,
        stock: 5,
      },
      {
        id: "RAM-DDR5-16",
        category: "components",
        name: "RelayMemory 16",
        az: "RelayMemory 16 yaddaş modulu",
        en: "16 GB DDR5 desktop DIMM; confirm motherboard compatibility.",
        description:
          "16 GB DDR5 masaüstü DIMM; ana plata uyğunluğunu yoxlayın.",
        specs: { type: "DDR5", capacityGb: 16, form: "DIMM", speedMTs: 5600 },
        price: 9500,
        stock: 12,
      },
      {
        id: "SSD-EXT-1T",
        category: "storage",
        name: "RelayDrive 1T",
        az: "RelayDrive 1T xarici SSD",
        en: "1 TB external SSD with USB-C 10 Gbps.",
        description: "USB-C 10 Gbps bağlantılı 1 TB xarici SSD.",
        specs: { capacityGb: 1000, interface: "USB-C", speedGbps: 10 },
        price: 15900,
        stock: 9,
      },
      {
        id: "MON-QHD-27",
        category: "peripherals",
        name: "RelayView 27",
        az: "RelayView 27 monitor",
        en: "27-inch QHD monitor with HDMI and DisplayPort.",
        description: "HDMI və DisplayPort bağlantılı 27 düym QHD monitor.",
        specs: {
          inches: 27,
          width: 2560,
          height: 1440,
          inputs: ["HDMI", "DisplayPort"],
        },
        price: 32900,
        stock: 8,
      },
      {
        id: "UPS-900",
        category: "power",
        name: "RelayPower 900",
        az: "RelayPower 900 UPS",
        en: "900 VA / 540 W UPS; runtime depends on connected load.",
        description:
          "900 VA / 540 W UPS; işləmə müddəti qoşulan yükdən asılıdır.",
        specs: { va: 900, watts: 540 },
        price: 18900,
        stock: 4,
      },
    ];
    for (const p of products) {
      store.run(
        "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)",
        p.id,
        p.category,
        p.name,
        p.az,
        p.en,
        p.description,
        JSON.stringify(p.specs),
        p.price,
        p.stock,
        "AZN",
      );
      store.run(
        "INSERT INTO inventory_movements VALUES (?,?,?,?,?)",
        `opening-${p.id}`,
        p.id,
        p.stock,
        `opening:${p.id}`,
        FIXTURE_TIME,
      );
    }
    for (const [id, role, locale] of [
      ["customer-a", "customer", "en"],
      ["customer-b", "customer", "az"],
      ["operator", "operator", "en"],
      ["purchaser", "purchaser", "en"],
      ["owner", "owner", "az"],
    ]) {
      store.run(
        "INSERT INTO accounts VALUES (?,?,?,?)",
        id!,
        `${id}@relayops.example`,
        hashPassword(DEMO_PASSWORD, `fixture-${id}`),
        locale!,
      );
      store.run("INSERT INTO roles VALUES (?,?)", id!, role!);
    }
    const specs = JSON.stringify(products[0]!.specs);
    for (const q of [
      {
        id: "northlink",
        name: "Northlink Demo",
        price: 15500,
        moq: 1,
        stock: 30,
        lead: 1,
        fee: 6000,
      },
      {
        id: "byteharbor",
        name: "ByteHarbor Demo",
        price: 14500,
        moq: 1,
        stock: 30,
        lead: 3,
        fee: 4000,
      },
      {
        id: "circuitdepot",
        name: "CircuitDepot Demo",
        price: 12500,
        moq: 20,
        stock: 40,
        lead: 1,
        fee: 5000,
      },
    ]) {
      store.run(
        "INSERT INTO suppliers (id,name,capabilities) VALUES (?,?,?)",
        q.id,
        q.name,
        JSON.stringify({ categories: ["networking"], zone: "baku" }),
      );
      store.run(
        "INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        `quote-${q.id}-v1`,
        q.id,
        "NET-SW-24G",
        1,
        q.stock,
        q.moq,
        q.price,
        "AZN",
        q.fee,
        0,
        addHours(FIXTURE_TIME, 48),
        addBusinessDays(FIXTURE_TIME, q.lead),
        "baku",
        FIXTURE_TIME,
        specs,
        "Synthetic gross quote; inspection and delivery not included in receipt date.",
        `Fixture offer from ${q.name}; other charges explicitly zero.`,
      );
      store.run(
        "INSERT INTO quote_records VALUES (?,?,?)",
        `quote-${q.id}-v1`,
        FIXTURE_TIME,
        "Seeded synthetic supplier offer.",
      );
    }
    // Historical fulfilled order: opening stock already represents the remaining 8 monitors.
    const delivered = "2026-10-05T08:00:00.000Z";
    const summary = JSON.stringify({
      productId: "MON-QHD-27",
      quantity: 2,
      unitPrice: 32900,
      total: 65800,
      deadline: "2026-10-05",
      destination: "baku",
      allowPartial: false,
      allowSubstitution: false,
    });
    store.run(
      "INSERT INTO order_offers VALUES (?,?,?,?,?,?)",
      "demo-delivered-offer",
      "customer-a",
      1,
      summary,
      delivered,
      "demo-delivered-order",
    );
    store.run(
      "INSERT INTO orders VALUES (?,?, 'delivered',?,?,?,?,?,?,?, ?,?)",
      "demo-delivered-order",
      "customer-a",
      65800,
      "2026-10-05T19:59:59.999Z",
      "baku",
      "demo-delivered-offer",
      1,
      0,
      0,
      "2026-10-01T08:00:00.000Z",
      delivered,
    );
    store.run(
      "INSERT INTO order_lines VALUES (?,?,?,?,?,?)",
      "demo-delivered-line",
      "demo-delivered-order",
      "MON-QHD-27",
      2,
      32900,
      2,
    );
    store.run(
      "INSERT INTO fulfillment_batches VALUES (?,?,?,?, 'delivered',?)",
      "demo-delivered-batch",
      "demo-delivered-line",
      2,
      delivered,
      "Synthetic delivery receipt; serials DEMO-MON-001, DEMO-MON-002.",
    );
    store.run(
      "INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)",
      "demo-delivery-audit",
      "operator",
      "fixture.delivery",
      "demo-delivered-order",
      "demo-delivered-order",
      summary,
      delivered,
    );
  });
  const auth = new Auth(store);
  let counter = 0;
  const business = new Business(
    store,
    frozenClock(),
    () => `fixture-${String(++counter).padStart(3, "0")}`,
  );
  const customer = auth.actor("customer-b");
  const offer = business.prepareOrder(customer, {
    productId: "NET-SW-24G",
    quantity: 20,
    deadline: bakuDate(addBusinessDays(FIXTURE_TIME, 5)),
    destination: "baku",
    allowSubstitution: false,
    allowPartial: false,
  });
  business.confirmOrder(customer, {
    offerId: offer.id,
    version: 1,
    confirmed: true,
    key: "seed-reference-order",
  });
  store.run("UPDATE metadata SET value='complete' WHERE key='seed_status'");
}

export function resetDemo(store: Store, confirmation: string) {
  if (
    confirmation !== "--demo-only" ||
    store.one<{ value: string }>(
      "SELECT value FROM metadata WHERE key='environment'",
    )?.value !== "relayops-demo"
  )
    throw new Error("Reset requires the named RelayOps demo environment");
  // Drop only this connection's application tables, never delete files or directories.
  const tables = store.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const expected = applicationTables();
  if (tables.some((table) => !expected.has(table.name)))
    throw new Error("Unexpected tables; refusing demo reset");
  store.db.exec("PRAGMA foreign_keys=OFF");
  try {
    store.transaction(() => {
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table.name))
          throw new Error("Unexpected table name");
        store.db.exec(`DROP TABLE "${table.name}"`);
      }
    });
  } finally {
    store.db.exec("PRAGMA foreign_keys=ON");
  }
  store.migrate();
  seed(store);
}
