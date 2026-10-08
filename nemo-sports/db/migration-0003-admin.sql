-- ═══════════════════════════════════════════════════════════════════════════
--  NEMO Sports · Migration 0003 — admin panel
--  Idempotent: safe to run more than once. The application also creates these
--  tables on first use; running this file up-front lets operators review the
--  schema and apply it as a deliberate deployment step.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── operators & roles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,                       -- bcrypt, never plaintext
  role          TEXT NOT NULL DEFAULT 'editor'
                CHECK (role IN ('super_admin','admin','editor')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- ─── matches managed from the panel ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_matches (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  sport            TEXT NOT NULL DEFAULT 'football',
  competition_slug TEXT NOT NULL,
  competition_name TEXT NOT NULL DEFAULT '',
  season           TEXT NOT NULL DEFAULT '',
  home_name        TEXT NOT NULL,
  home_name_en     TEXT NOT NULL DEFAULT '',
  home_logo        TEXT NOT NULL DEFAULT '',
  away_name        TEXT NOT NULL,
  away_name_en     TEXT NOT NULL DEFAULT '',
  away_logo        TEXT NOT NULL DEFAULT '',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming','live','finished','postponed','cancelled')),
  home_score       INTEGER,
  away_score       INTEGER,
  venue            TEXT NOT NULL DEFAULT '',
  referee          TEXT NOT NULL DEFAULT '',
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_matches_scheduled ON admin_matches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_admin_matches_competition ON admin_matches(competition_slug);
CREATE INDEX IF NOT EXISTS idx_admin_matches_status ON admin_matches(status);
CREATE INDEX IF NOT EXISTS idx_admin_matches_published ON admin_matches(is_published);

-- ─── live streams (lifecycle columns on the existing match_streams table) ──
CREATE TABLE IF NOT EXISTS match_streams (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'البث المباشر',
  embed_url TEXT NOT NULL,
  slugs TEXT[] NOT NULL DEFAULT '{}',
  home_aliases TEXT[] NOT NULL DEFAULT '{}',
  away_aliases TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS stream_type TEXT NOT NULL DEFAULT 'embed';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS match_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS home_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS away_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS competition_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS kickoff_at TIMESTAMPTZ;
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_match_streams_enabled ON match_streams(enabled);
CREATE INDEX IF NOT EXISTS idx_match_streams_status ON match_streams(status);
CREATE INDEX IF NOT EXISTS idx_match_streams_match_slug ON match_streams(match_slug);

-- ─── teams, players, competitions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_teams (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name_ar          TEXT NOT NULL,
  name_en          TEXT NOT NULL DEFAULT '',
  short_name       TEXT NOT NULL DEFAULT '',
  sport            TEXT NOT NULL DEFAULT 'football',
  country          TEXT NOT NULL DEFAULT '',
  logo_url         TEXT NOT NULL DEFAULT '',
  competition_slug TEXT NOT NULL DEFAULT '',
  stadium          TEXT NOT NULL DEFAULT '',
  coach            TEXT NOT NULL DEFAULT '',
  founded_year     INTEGER,
  primary_color    TEXT NOT NULL DEFAULT '',
  secondary_color  TEXT NOT NULL DEFAULT '',
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_players (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  full_name_ar  TEXT NOT NULL,
  full_name_en  TEXT NOT NULL DEFAULT '',
  team_slug     TEXT NOT NULL DEFAULT '',
  team_name     TEXT NOT NULL DEFAULT '',
  position      TEXT NOT NULL DEFAULT '',
  nationality   TEXT NOT NULL DEFAULT '',
  jersey_number INTEGER,
  photo_url     TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  height_cm     INTEGER,
  weight_kg     INTEGER,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_competitions (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL DEFAULT '',
  sport        TEXT NOT NULL DEFAULT 'football',
  country      TEXT NOT NULL DEFAULT '',
  season       TEXT NOT NULL DEFAULT '',
  logo_url     TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'دوري',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── editorial news ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manual_news (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  title_en            TEXT NOT NULL DEFAULT '',
  image_url           TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  content             TEXT NOT NULL DEFAULT '',          -- plain text only
  source_name         TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  category            TEXT NOT NULL DEFAULT 'أخبار',
  related_team        TEXT NOT NULL DEFAULT '',
  related_competition TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','hidden')),
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_news_status ON manual_news(status);
CREATE INDEX IF NOT EXISTS idx_manual_news_published ON manual_news(published_at DESC);

-- ─── site settings (non-secret key/value) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT ''
);
