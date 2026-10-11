-- NEMO Sports · migration 0005 (2026-10-11) — additive only, idempotent.
-- Nothing is dropped or rewritten; existing rows keep every value.
--
-- 1) News moderation provenance: an auto- or editor-quarantined article keeps
--    its record, its previous status, why and by whom it was moderated.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS moderated_by TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 2) Broadcast rights evidence: a stream is public only with an approval
--    status AND documented rights (holder + licence reference / official URL).
--    Existing streams read as "no evidence" until an editor records it.
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS rights_holder TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS rights_evidence TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS rights_checked_at TIMESTAMPTZ;
