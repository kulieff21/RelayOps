ALTER TABLE suppliers ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
CREATE TABLE quote_records(
 quote_id TEXT PRIMARY KEY REFERENCES quotes(id), recorded_at TEXT NOT NULL,
 revision_reason TEXT NOT NULL CHECK(length(revision_reason)>0)
) STRICT;
CREATE TRIGGER quotes_no_update BEFORE UPDATE ON quotes BEGIN SELECT RAISE(ABORT,'Quotes are append-only; record a new version'); END;
CREATE TRIGGER quotes_no_delete BEFORE DELETE ON quotes BEGIN SELECT RAISE(ABORT,'Quote history cannot be deleted'); END;
CREATE TRIGGER quote_records_no_update BEFORE UPDATE ON quote_records BEGIN SELECT RAISE(ABORT,'Quote evidence is immutable'); END;
CREATE TRIGGER quote_records_no_delete BEFORE DELETE ON quote_records BEGIN SELECT RAISE(ABORT,'Quote evidence is immutable'); END;
