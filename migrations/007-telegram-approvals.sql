CREATE TABLE approval_delivery(request_id TEXT PRIMARY KEY REFERENCES approval_requests(id),
 process_id TEXT NOT NULL UNIQUE REFERENCES processes(id), mode TEXT NOT NULL CHECK(mode IN ('mock','live')),
 bot_id TEXT NOT NULL, user_id TEXT NOT NULL, chat_id TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('en','az')),
 summary TEXT NOT NULL, expires_wall INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','sending','sent','unknown','failed')),
 message_id INTEGER, edit_pending INTEGER NOT NULL DEFAULT 0 CHECK(edit_pending IN (0,1)),
 edit_attempts INTEGER NOT NULL DEFAULT 0, error_code TEXT);
CREATE TRIGGER approval_binding_immutable BEFORE UPDATE OF proposal_id,recipient_id,expires_at ON approval_requests
BEGIN SELECT RAISE(ABORT,'Approval binding is immutable'); END;
CREATE TRIGGER approval_delivery_binding_immutable BEFORE UPDATE OF process_id,mode,bot_id,user_id,chat_id,locale,summary,expires_wall ON approval_delivery
BEGIN SELECT RAISE(ABORT,'Delivery binding is immutable'); END;
CREATE TRIGGER approval_decision_immutable BEFORE UPDATE ON approval_decisions
BEGIN SELECT RAISE(ABORT,'Approval decisions are immutable'); END;
CREATE TRIGGER approval_decision_no_delete BEFORE DELETE ON approval_decisions
BEGIN SELECT RAISE(ABORT,'Approval decisions are append-only'); END;
CREATE TABLE telegram_receiver(bot_id TEXT PRIMARY KEY, next_offset INTEGER NOT NULL DEFAULT 0,
 lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0) STRICT;
