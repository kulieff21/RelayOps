CREATE TABLE agent_conversations(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES accounts(id),
 agent TEXT NOT NULL CHECK(agent IN ('customer','procurement')), case_id TEXT REFERENCES procurement_cases(id),
 locale TEXT NOT NULL CHECK(locale IN ('en','az')), messages TEXT NOT NULL CHECK(json_valid(messages)),
 active_run_id TEXT REFERENCES agent_runs(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((agent='customer' AND case_id IS NULL) OR (agent='procurement' AND case_id IS NOT NULL))) STRICT;
CREATE TABLE agent_execution(run_id TEXT PRIMARY KEY REFERENCES agent_runs(id),
 conversation_id TEXT NOT NULL REFERENCES agent_conversations(id), state TEXT NOT NULL CHECK(json_valid(state)),
 result TEXT CHECK(json_valid(result)), lease_token TEXT, lease_until INTEGER, updated_at TEXT NOT NULL) STRICT;
CREATE INDEX agent_conversations_actor ON agent_conversations(actor_id,updated_at);
