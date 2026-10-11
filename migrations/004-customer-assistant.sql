CREATE TABLE assistant_requests(actor_id TEXT NOT NULL REFERENCES accounts(id), request_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id),
 conversation_id TEXT NOT NULL REFERENCES agent_conversations(id), mode TEXT NOT NULL CHECK(mode IN ('mock','live')),
 guided_action TEXT CHECK(json_valid(guided_action)), status TEXT NOT NULL CHECK(status IN ('queued','running','done')),
 created_at TEXT NOT NULL, PRIMARY KEY(actor_id,request_key)) STRICT;
CREATE TABLE assistant_confirmations(run_id TEXT PRIMARY KEY REFERENCES agent_runs(id),
 action TEXT NOT NULL CHECK(action IN ('confirmOrder','cancelOrder','requestReturn')),
 input TEXT NOT NULL CHECK(json_valid(input)), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','confirmed','declined')), result TEXT CHECK(json_valid(result)), decided_at TEXT) STRICT;
CREATE TABLE assistant_handoffs(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id), queue TEXT NOT NULL CHECK(queue IN ('customer_support','procurement_review')),
 reason TEXT NOT NULL, case_id TEXT REFERENCES procurement_cases(id), requirements TEXT NOT NULL CHECK(json_valid(requirements)),
 status TEXT NOT NULL CHECK(status IN ('open','closed')), created_at TEXT NOT NULL, UNIQUE(run_id,queue)) STRICT;
CREATE INDEX assistant_requests_rate ON assistant_requests(mode,created_at);
CREATE INDEX assistant_handoffs_account ON assistant_handoffs(actor_id,created_at);
