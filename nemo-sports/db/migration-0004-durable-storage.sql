-- Additive/idempotent: create existing runtime-managed storage before traffic.
-- No row insert, update, delete or destructive rollback. Retain these tables on rollback.


CREATE TABLE IF NOT EXISTS match_overrides (
  slug TEXT PRIMARY KEY,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  competition_name TEXT NOT NULL,
  broadcaster_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'TV',
  regions TEXT[] NOT NULL DEFAULT '{}',
  broadcast_website TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  is_official_broadcaster BOOLEAN NOT NULL DEFAULT true,
  requires_subscription BOOLEAN NOT NULL DEFAULT true,
  free_access BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_comp ON broadcasts(competition_id);

