-- All new proposal versions are immutable, including drafts. Revision inserts a row.
CREATE TRIGGER proposal_version_immutable BEFORE UPDATE OF case_id,version,quote_id,quote_version,quantity,total,snapshot,expires_at ON proposals
BEGIN SELECT RAISE(ABORT,'Proposal version is immutable'); END;
CREATE TABLE procurement_requests(run_id TEXT PRIMARY KEY REFERENCES agent_runs(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id), case_id TEXT NOT NULL REFERENCES procurement_cases(id),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, request TEXT NOT NULL CHECK(json_valid(request)),
 status TEXT NOT NULL CHECK(status IN ('queued','running','done')), created_at TEXT NOT NULL,
 UNIQUE(actor_id,request_key)) STRICT;
CREATE INDEX procurement_requests_case ON procurement_requests(case_id,created_at);
