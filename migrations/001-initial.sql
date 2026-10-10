CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE categories(id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_az TEXT NOT NULL) STRICT;
CREATE TABLE products(
 id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id),
 name_en TEXT NOT NULL, name_az TEXT NOT NULL, description_en TEXT NOT NULL, description_az TEXT NOT NULL,
 specs TEXT NOT NULL CHECK(json_valid(specs)), price INTEGER NOT NULL CHECK(price>=0),
 stock INTEGER NOT NULL CHECK(stock>=0), currency TEXT NOT NULL DEFAULT 'AZN' CHECK(currency='AZN')
) STRICT;
CREATE TABLE accounts(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 locale TEXT NOT NULL CHECK(locale IN ('en','az'))) STRICT;
CREATE TABLE roles(account_id TEXT NOT NULL REFERENCES accounts(id),
 role TEXT NOT NULL CHECK(role IN ('customer','operator','purchaser','owner')), PRIMARY KEY(account_id,role)) STRICT;
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
 expires_at TEXT NOT NULL) STRICT;
CREATE TABLE order_offers(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES accounts(id),
 version INTEGER NOT NULL CHECK(version>0), summary TEXT NOT NULL CHECK(json_valid(summary)),
 expires_at TEXT NOT NULL, consumed_order_id TEXT UNIQUE) STRICT;
CREATE TABLE orders(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES accounts(id),
 status TEXT NOT NULL CHECK(status IN ('draft','awaiting_supply','confirmed','processing','cancellation_requested','shipped','delivered','cancelled')),
 total INTEGER NOT NULL CHECK(total>=0), deadline TEXT NOT NULL, destination TEXT NOT NULL,
 consent_offer_id TEXT NOT NULL UNIQUE REFERENCES order_offers(id), consent_version INTEGER NOT NULL,
 allow_partial INTEGER NOT NULL CHECK(allow_partial IN (0,1)), allow_substitution INTEGER NOT NULL CHECK(allow_substitution IN (0,1)),
 created_at TEXT NOT NULL, delivered_at TEXT) STRICT;
CREATE TABLE order_lines(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 unit_price INTEGER NOT NULL CHECK(unit_price>=0), delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0 AND delivered_quantity<=quantity)) STRICT;
CREATE TABLE reservations(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 status TEXT NOT NULL CHECK(status IN ('active','released','expired','consumed')), expires_at TEXT NOT NULL,
 UNIQUE(order_id,product_id)) STRICT;
CREATE TABLE inventory_movements(id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 delta INTEGER NOT NULL, source TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL) STRICT;
CREATE TABLE suppliers(id TEXT PRIMARY KEY, name TEXT NOT NULL,
 capabilities TEXT NOT NULL CHECK(json_valid(capabilities))) STRICT;
-- Nullable fields deliberately preserve incomplete supplier evidence for clarification.
CREATE TABLE quotes(id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
 product_id TEXT NOT NULL REFERENCES products(id), version INTEGER NOT NULL CHECK(version>0),
 available INTEGER CHECK(available>=0), moq INTEGER CHECK(moq>0), unit_price INTEGER CHECK(unit_price>=0),
 currency TEXT, delivery_fee INTEGER CHECK(delivery_fee>=0), other_fees INTEGER CHECK(other_fees>=0),
 valid_until TEXT, receipt_at TEXT, destination TEXT, availability_at TEXT, specs TEXT CHECK(json_valid(specs)),
 terms TEXT, evidence TEXT NOT NULL, UNIQUE(supplier_id,product_id,version)) STRICT;
CREATE TABLE procurement_cases(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 budget INTEGER NOT NULL CHECK(budget>=0), status TEXT NOT NULL CHECK(status IN ('open','waiting','committed','closed','escalated')),
 created_at TEXT NOT NULL, UNIQUE(order_id,product_id)) STRICT;
CREATE TABLE proposals(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES procurement_cases(id),
 version INTEGER NOT NULL CHECK(version>0), quote_id TEXT NOT NULL REFERENCES quotes(id),
 quote_version INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), total INTEGER NOT NULL CHECK(total>=0),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), status TEXT NOT NULL CHECK(status IN ('draft','pending_approval','approved','rejected','expired','superseded','invalidated','executed')),
 expires_at TEXT NOT NULL, UNIQUE(case_id,version)) STRICT;
CREATE TRIGGER submitted_proposal_immutable BEFORE UPDATE OF case_id,version,quote_id,quote_version,quantity,total,snapshot,expires_at ON proposals
WHEN OLD.status!='draft' BEGIN SELECT RAISE(ABORT,'Submitted proposal is immutable'); END;
CREATE TABLE approval_requests(id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
 recipient_id TEXT NOT NULL REFERENCES accounts(id), expires_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','expired','invalidated'))) STRICT;
CREATE TABLE approval_decisions(request_id TEXT PRIMARY KEY REFERENCES approval_requests(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id), decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE telegram_mappings(account_id TEXT PRIMARY KEY REFERENCES accounts(id), telegram_user_id TEXT NOT NULL UNIQUE,
 chat_id TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('en','az'))) STRICT;
CREATE TABLE telegram_updates(update_id TEXT PRIMARY KEY, received_at TEXT NOT NULL, result TEXT CHECK(json_valid(result))) STRICT;
CREATE TABLE budget_allocations(proposal_id TEXT PRIMARY KEY REFERENCES proposals(id), case_id TEXT NOT NULL REFERENCES procurement_cases(id),
 amount INTEGER NOT NULL CHECK(amount>=0), status TEXT NOT NULL CHECK(status IN ('reserved','committed','released'))) STRICT;
CREATE TABLE purchase_orders(id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
 cancelled_quantity INTEGER NOT NULL DEFAULT 0 CHECK(cancelled_quantity>=0),
 status TEXT NOT NULL CHECK(status IN ('created','acknowledged','partially_received','received','cancelled','failed')),
 created_at TEXT NOT NULL, CHECK(received_quantity+cancelled_quantity<=quantity)) STRICT;
CREATE TABLE goods_receipts(id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), inspection TEXT NOT NULL CHECK(inspection IN ('pending','sellable','damaged','incomplete','wrong_item')),
 serials TEXT NOT NULL CHECK(json_valid(serials)), exception_reason TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL) STRICT;
CREATE TABLE fulfillment_batches(id TEXT PRIMARY KEY, order_line_id TEXT NOT NULL REFERENCES order_lines(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), promised_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planned','shipped','delivered','cancelled')), evidence TEXT) STRICT;
CREATE TABLE returns(id TEXT PRIMARY KEY, order_line_id TEXT NOT NULL REFERENCES order_lines(id),
 customer_id TEXT NOT NULL REFERENCES accounts(id), quantity INTEGER NOT NULL CHECK(quantity>0), reason TEXT NOT NULL,
 resolution TEXT NOT NULL CHECK(resolution IN ('refund','exchange')), status TEXT NOT NULL CHECK(status IN ('requested','authorized','received','inspected','resolved','rejected')),
 outcome TEXT CHECK(outcome IN ('sellable','damaged','incomplete','wrong_item')), inspection_notes TEXT,
 serials TEXT CHECK(json_valid(serials)), replacement_offer_id TEXT REFERENCES order_offers(id), created_at TEXT NOT NULL) STRICT;
CREATE TABLE quarantine(id TEXT PRIMARY KEY, return_id TEXT NOT NULL UNIQUE REFERENCES returns(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 outcome TEXT NOT NULL, notes TEXT NOT NULL) STRICT;
CREATE TABLE refund_ledger(return_id TEXT PRIMARY KEY REFERENCES returns(id), amount INTEGER NOT NULL CHECK(amount>=0), created_at TEXT NOT NULL) STRICT;
CREATE TABLE processes(id TEXT PRIMARY KEY, case_id TEXT REFERENCES procurement_cases(id),
 state TEXT NOT NULL CHECK(state IN ('ready','running','waiting_approval','waiting_supply','completed','escalated','failed')),
 checkpoint TEXT NOT NULL CHECK(json_valid(checkpoint)), version INTEGER NOT NULL CHECK(version>0), updated_at TEXT NOT NULL) STRICT;
CREATE TABLE jobs(id TEXT PRIMARY KEY, process_id TEXT REFERENCES processes(id), kind TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)), available_at TEXT NOT NULL, lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), max_attempts INTEGER NOT NULL CHECK(max_attempts>0),
 status TEXT NOT NULL CHECK(status IN ('ready','leased','done','failed')), dedupe_key TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE agent_runs(id TEXT PRIMARY KEY, process_id TEXT REFERENCES processes(id), actor_id TEXT NOT NULL REFERENCES accounts(id),
 agent TEXT NOT NULL CHECK(agent IN ('customer','procurement')), mode TEXT NOT NULL CHECK(mode IN ('mock','live')),
 model TEXT, status TEXT NOT NULL, checkpoint TEXT NOT NULL CHECK(json_valid(checkpoint)), started_at TEXT NOT NULL) STRICT;
CREATE TABLE tool_calls(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), name TEXT NOT NULL,
 arguments TEXT NOT NULL CHECK(json_valid(arguments)), result TEXT CHECK(json_valid(result)), status TEXT NOT NULL, correlation_id TEXT NOT NULL) STRICT;
CREATE TABLE model_usage(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id),
 input_tokens INTEGER CHECK(input_tokens>=0), output_tokens INTEGER CHECK(output_tokens>=0),
 cost_microusd INTEGER CHECK(cost_microusd>=0), provider_request_id TEXT UNIQUE) STRICT;
CREATE TABLE notifications(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
 message_key TEXT NOT NULL, parameters TEXT NOT NULL CHECK(json_valid(parameters)), locale TEXT NOT NULL CHECK(locale IN ('en','az')), created_at TEXT NOT NULL) STRICT;
CREATE TABLE audit_events(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES accounts(id), action TEXT NOT NULL,
 entity_id TEXT NOT NULL, correlation_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL) STRICT;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
CREATE TABLE idempotency(actor_id TEXT NOT NULL REFERENCES accounts(id), operation TEXT NOT NULL, key TEXT NOT NULL,
 fingerprint TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), PRIMARY KEY(actor_id,operation,key)) STRICT;
CREATE INDEX reservations_active ON reservations(product_id,status,expires_at);
CREATE INDEX orders_customer ON orders(customer_id,created_at);
CREATE INDEX audit_correlation ON audit_events(correlation_id,created_at);
CREATE INDEX jobs_ready ON jobs(status,available_at);
