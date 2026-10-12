CREATE TABLE receipt_inspections(receipt_id TEXT PRIMARY KEY REFERENCES goods_receipts(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id), outcome TEXT NOT NULL CHECK(outcome IN ('sellable','damaged','incomplete','wrong_item')),
 notes TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE receipt_serials(product_id TEXT NOT NULL REFERENCES products(id), serial TEXT NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES goods_receipts(id), PRIMARY KEY(product_id,serial)) STRICT;
CREATE TABLE receipt_allocations(receipt_id TEXT NOT NULL REFERENCES goods_receipts(id),
 order_line_id TEXT NOT NULL REFERENCES order_lines(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 created_at TEXT NOT NULL, PRIMARY KEY(receipt_id,order_line_id)) STRICT;
CREATE TABLE supplier_events(id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('delay','cancellation')), quantity INTEGER NOT NULL CHECK(quantity>=0),
 released_amount INTEGER NOT NULL CHECK(released_amount>=0), receipt_at TEXT, evidence TEXT NOT NULL,
 created_at TEXT NOT NULL) STRICT;
CREATE TRIGGER receipt_inspection_immutable BEFORE UPDATE ON receipt_inspections
BEGIN SELECT RAISE(ABORT,'Inspection is immutable'); END;
CREATE TRIGGER receipt_inspection_no_delete BEFORE DELETE ON receipt_inspections
BEGIN SELECT RAISE(ABORT,'Inspection is append-only'); END;
CREATE TRIGGER receipt_allocation_immutable BEFORE UPDATE ON receipt_allocations
BEGIN SELECT RAISE(ABORT,'Allocation is immutable'); END;
CREATE TRIGGER receipt_allocation_no_delete BEFORE DELETE ON receipt_allocations
BEGIN SELECT RAISE(ABORT,'Allocation is append-only'); END;
CREATE TRIGGER goods_receipt_binding BEFORE UPDATE OF purchase_order_id,quantity,serials,idempotency_key,created_at ON goods_receipts
BEGIN SELECT RAISE(ABORT,'Receipt binding is immutable'); END;
CREATE TRIGGER goods_receipt_no_delete BEFORE DELETE ON goods_receipts
BEGIN SELECT RAISE(ABORT,'Receipt is append-only'); END;
CREATE TRIGGER goods_inspection_terminal BEFORE UPDATE OF inspection ON goods_receipts WHEN OLD.inspection!='pending'
BEGIN SELECT RAISE(ABORT,'Terminal inspection is immutable'); END;
CREATE TRIGGER receipt_serial_immutable BEFORE UPDATE ON receipt_serials
BEGIN SELECT RAISE(ABORT,'Serial evidence is immutable'); END;
CREATE TRIGGER receipt_serial_no_delete BEFORE DELETE ON receipt_serials
BEGIN SELECT RAISE(ABORT,'Serial evidence is append-only'); END;
CREATE TRIGGER supplier_event_immutable BEFORE UPDATE ON supplier_events
BEGIN SELECT RAISE(ABORT,'Supplier event is immutable'); END;
CREATE TRIGGER supplier_event_no_delete BEFORE DELETE ON supplier_events
BEGIN SELECT RAISE(ABORT,'Supplier event is append-only'); END;
