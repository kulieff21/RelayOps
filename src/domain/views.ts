import { Business } from "./business.js";
import { requireRole, type Actor } from "../shared/contracts.js";

// Read models enforce the same actor scope as mutations; no raw table endpoints.
export class Views {
  constructor(private business: Business) {}

  orders(actor: Actor) {
    requireRole(actor, "customer", "operator", "purchaser", "owner");
    const staff =
      actor.roles.includes("operator") || actor.roles.includes("owner");
    const purchasing = actor.roles.includes("purchaser");
    const rows = this.business.store.all<{ id: string }>(
      staff
        ? "SELECT id FROM orders ORDER BY created_at DESC,id"
        : purchasing
          ? "SELECT o.id FROM orders o WHERE EXISTS (SELECT 1 FROM procurement_cases c WHERE c.order_id=o.id) ORDER BY o.created_at DESC,o.id"
          : "SELECT id FROM orders WHERE customer_id=? ORDER BY created_at DESC,id",
      ...(!staff && !purchasing ? [actor.id] : []),
    );
    return rows.map((row) => this.business.getOrder(actor, row.id));
  }

  returns(actor: Actor) {
    requireRole(actor, "customer", "operator", "owner");
    const staff =
      actor.roles.includes("operator") || actor.roles.includes("owner");
    return this.business.store.all<{
      id: string;
      order_id: string;
      product_id: string;
      customer_id: string;
      quantity: number;
      reason: string;
      resolution: string;
      status: string;
      outcome: string | null;
      created_at: string;
    }>(
      `SELECT r.id,l.order_id,l.product_id,r.customer_id,r.quantity,r.reason,
       r.resolution,r.status,r.outcome,r.created_at FROM returns r
       JOIN order_lines l ON l.id=r.order_line_id ${staff ? "" : "WHERE r.customer_id=?"}
       ORDER BY r.created_at DESC,r.id`,
      ...(!staff ? [actor.id] : []),
    );
  }

  workspace(actor: Actor) {
    requireRole(actor, "operator", "purchaser", "owner");
    const store = this.business.store;
    const purchasing =
      actor.roles.includes("purchaser") || actor.roles.includes("owner");
    const operations =
      actor.roles.includes("operator") || actor.roles.includes("owner");
    return {
      orders: this.orders(actor),
      returns: operations ? this.returns(actor) : [],
      inventory: store.all<{ id: string; stock: number }>(
        "SELECT id,stock FROM products ORDER BY id",
      ),
      movements: store.all<{
        id: string;
        product_id: string;
        delta: number;
        source: string;
        created_at: string;
      }>(
        "SELECT id,product_id,delta,source,created_at FROM inventory_movements ORDER BY created_at DESC,id LIMIT 200",
      ),
      cases: purchasing
        ? store.all<{
            id: string;
            order_id: string;
            product_id: string;
            quantity: number;
            budget: number;
            status: string;
            created_at: string;
          }>("SELECT * FROM procurement_cases ORDER BY created_at DESC,id")
        : [],
      suppliers: purchasing
        ? store.all<{ id: string; name: string }>(
            "SELECT id,name FROM suppliers ORDER BY name",
          )
        : [],
      // Actor identities, arbitrary payloads and unrelated customer data are not exposed.
      audit: actor.roles.includes("owner")
        ? store.all<{
            id: string;
            action: string;
            entity_id: string;
            created_at: string;
          }>(
            "SELECT id,action,entity_id,created_at FROM audit_events ORDER BY created_at DESC,id LIMIT 200",
          )
        : [],
      approvals: purchasing
        ? store.all<{ id: string; status: string; expires_at: string }>(
            "SELECT id,status,expires_at FROM approval_requests ORDER BY expires_at DESC LIMIT 200",
          )
        : [],
    };
  }
}
