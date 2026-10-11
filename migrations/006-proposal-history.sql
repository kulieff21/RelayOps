-- Preserve applied migration 005; add deletion protection separately.
CREATE TRIGGER proposal_no_delete BEFORE DELETE ON proposals
BEGIN SELECT RAISE(ABORT,'Proposal history cannot be deleted'); END;
