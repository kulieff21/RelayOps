CREATE TABLE supplier_acknowledgements(purchase_order_id TEXT PRIMARY KEY REFERENCES purchase_orders(id),
 mode TEXT NOT NULL CHECK(mode='mock'), outcome TEXT NOT NULL CHECK(outcome IN ('acknowledged','failed')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TRIGGER supplier_ack_immutable BEFORE UPDATE ON supplier_acknowledgements
BEGIN SELECT RAISE(ABORT,'Supplier acknowledgements are immutable'); END;
CREATE TRIGGER supplier_ack_no_delete BEFORE DELETE ON supplier_acknowledgements
BEGIN SELECT RAISE(ABORT,'Supplier acknowledgements are append-only'); END;
CREATE TRIGGER purchase_binding_immutable BEFORE UPDATE OF proposal_id,quantity,created_at ON purchase_orders
BEGIN SELECT RAISE(ABORT,'Purchase order binding is immutable'); END;
