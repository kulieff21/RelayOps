import { randomUUID } from "node:crypto";
import { Business } from "./business.js";
import { quoteSchema } from "./quotes.js";
import { BusinessError, requireRole, type Actor } from "../shared/contracts.js";
import {
  supplierInput,
  quoteInput,
  quoteQuery,
  capabilitiesSchema,
  type Supplier,
  type QuoteFields,
  type QuoteRecord,
} from "../shared/purchasing.js";

type SupplierRow = Omit<Supplier, "capabilities"> & { capabilities: string };
type QuoteRow = Omit<QuoteFields, "specs"> & {
  specs: string | null;
  id: string;
  version: number;
  recorded_at: string | null;
  revision_reason: string | null;
  current_version: number;
};

export class Purchasing {
  constructor(private business: Business) {}
  suppliers(actor: Actor): Supplier[] {
    requireRole(actor, "operator", "purchaser", "owner");
    return this.business.store
      .all<SupplierRow>(
        "SELECT id,name,capabilities,version,updated_at FROM suppliers ORDER BY name,id",
      )
      .map((row) => ({
        ...row,
        capabilities: capabilitiesSchema.parse(JSON.parse(row.capabilities)),
      }));
  }
  private supplier(id: string): Supplier {
    const row = this.business.store.one<SupplierRow>(
      "SELECT * FROM suppliers WHERE id=?",
      id,
    );
    if (!row) throw new BusinessError("SUPPLIER_NOT_FOUND", 404);
    return {
      ...row,
      capabilities: capabilitiesSchema.parse(JSON.parse(row.capabilities)),
    };
  }
  saveSupplier(actor: Actor, raw: unknown, supplierId?: string) {
    requireRole(actor, "purchaser", "owner");
    const input = supplierInput.parse(raw);
    input.capabilities.categories.sort();
    return this.business.effect(
      actor,
      "supplier.save",
      input.key,
      { ...input, supplierId: supplierId ?? null },
      () => {
        const current = supplierId ? this.supplier(supplierId) : null;
        if (input.expectedVersion !== (current?.version ?? 0))
          throw new BusinessError("SUPPLIER_VERSION_CONFLICT");
        const id = supplierId ?? randomUUID();
        const version = (current?.version ?? 0) + 1;
        const now = this.business.clock.now();
        const caps = JSON.stringify(input.capabilities);
        if (current)
          this.business.store.run(
            "UPDATE suppliers SET name=?,capabilities=?,version=?,updated_at=? WHERE id=?",
            input.name,
            caps,
            version,
            now,
            id,
          );
        else
          this.business.store.run(
            "INSERT INTO suppliers (id,name,capabilities,version,updated_at) VALUES (?,?,?,?,?)",
            id,
            input.name,
            caps,
            version,
            now,
          );
        this.business.audit(
          actor,
          current ? "supplier.updated" : "supplier.created",
          id,
          { version, name: input.name, capabilities: input.capabilities },
        );
        return this.supplier(id);
      },
    );
  }
  quotes(actor: Actor, raw: unknown = {}): QuoteRecord[] {
    requireRole(actor, "operator", "purchaser", "owner");
    const query = quoteQuery.parse(raw);
    const operatorOnly = !actor.roles.some(
      (role) => role === "purchaser" || role === "owner",
    );
    const rows = this.business.store.all<QuoteRow>(
      `SELECT q.*,r.recorded_at,r.revision_reason,
       (SELECT MAX(v.version) FROM quotes v WHERE v.supplier_id=q.supplier_id AND v.product_id=q.product_id) current_version
       FROM quotes q LEFT JOIN quote_records r ON r.quote_id=q.id
       WHERE (? IS NULL OR q.supplier_id=?) AND (? IS NULL OR q.product_id=?)
       ${operatorOnly ? "AND EXISTS (SELECT 1 FROM procurement_cases c WHERE c.product_id=q.product_id AND c.status!='closed')" : ""}
       ORDER BY q.supplier_id,q.product_id,q.version DESC`,
      query.supplier ?? null,
      query.supplier ?? null,
      query.product ?? null,
      query.product ?? null,
    );
    return rows.map((row) => {
      const { recorded_at, revision_reason, current_version, ...rawQuote } =
        row;
      const complete = quoteSchema.safeParse(rawQuote).success;
      const isCurrent = row.version === current_version;
      const status = !isCurrent
        ? "superseded"
        : !complete
          ? "incomplete"
          : Date.parse(row.valid_until!) <=
              Date.parse(this.business.clock.now())
            ? "expired"
            : "current";
      return {
        ...rawQuote,
        specs: row.specs === null ? null : JSON.parse(row.specs),
        recorded_at,
        revision_reason,
        isCurrent,
        status,
      };
    });
  }
  saveQuote(actor: Actor, raw: unknown) {
    requireRole(actor, "purchaser", "owner");
    const input = quoteInput.parse(raw);
    if (input.specs)
      input.specs = Object.fromEntries(
        Object.entries(input.specs).sort(([a], [b]) => a.localeCompare(b)),
      );
    return this.business.effect(actor, "quote.save", input.key, input, () => {
      const supplier = this.supplier(input.supplier_id);
      const product = this.business.product(input.product_id);
      if (
        !supplier.capabilities.categories.includes(
          product.category_id as Supplier["capabilities"]["categories"][number],
        ) ||
        (input.destination && input.destination !== supplier.capabilities.zone)
      )
        throw new BusinessError("SUPPLIER_CAPABILITY_MISMATCH");
      const latest = this.business.store.one<{ version: number }>(
        "SELECT COALESCE(MAX(version),0) version FROM quotes WHERE supplier_id=? AND product_id=?",
        input.supplier_id,
        input.product_id,
      )!.version;
      if (latest !== input.expectedVersion)
        throw new BusinessError("QUOTE_VERSION_CONFLICT");
      const id = randomUUID();
      const version = latest + 1;
      this.business.store.run(
        "INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        input.supplier_id,
        input.product_id,
        version,
        input.available,
        input.moq,
        input.unit_price,
        input.currency,
        input.delivery_fee,
        input.other_fees,
        input.valid_until,
        input.receipt_at,
        input.destination,
        input.availability_at,
        input.specs === null ? null : JSON.stringify(input.specs),
        input.terms,
        input.evidence,
      );
      this.business.store.run(
        "INSERT INTO quote_records VALUES (?,?,?)",
        id,
        this.business.clock.now(),
        input.revisionReason,
      );
      this.business.audit(actor, "quote.version_recorded", id, {
        supplierId: input.supplier_id,
        productId: input.product_id,
        version,
        revisionReason: input.revisionReason,
      });
      return this.quotes(actor, {
        supplier: input.supplier_id,
        product: input.product_id,
      }).find((quote) => quote.id === id)!;
    });
  }
}
