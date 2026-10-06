-- ═══════════════════════════════════════════════════════════════════════════
--  NEMO SPORTS · MIGRATION 0002 — automatic news pipeline + broadcast registry
--  Zero-cost edition: RSS ingestion (Google News RSS), dedup, categorization,
--  entity linking, fetch audit log, and the official-broadcasters registry.
-- ═══════════════════════════════════════════════════════════════════════════
--  The app also creates these tables idempotently on first use
--  (lib/news/store.ts, lib/broadcasts.ts) so a fresh free-tier Postgres works
--  with zero manual steps. This file is the reviewed, versioned DDL for
--  `npm run db:setup` / DBA inspection.
--
--  LEGAL: news_articles stores METADATA ONLY (title, source, timestamp, short
--  RSS snippet, category, entities). Full article bodies are NEVER copied.

-- ─── RSS sources configuration (admin-managed) ────────────────────────────

CREATE TABLE IF NOT EXISTS rss_sources (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  country TEXT NOT NULL DEFAULT 'US',
  category TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
  enabled BOOLEAN NOT NULL DEFAULT true,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (refresh_interval_minutes BETWEEN 5 AND 1440),
  last_successful_fetch TIMESTAMPTZ,
  last_failed_fetch TIMESTAMPTZ,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_eligible_fetch TIMESTAMPTZ,
  article_count INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── news articles (ingested metadata) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  publication_date TIMESTAMPTZ NOT NULL,
  fetched_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Sports',
  secondary_categories TEXT[] NOT NULL DEFAULT '{}',
  category_confidence INTEGER NOT NULL DEFAULT 0,
  related_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  rss_source_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  duplicate_of TEXT,
  quality_score INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published','hidden','archived')),
  source_badge TEXT NOT NULL DEFAULT '📰',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_news_status ON news_articles(status);
CREATE INDEX IF NOT EXISTS idx_news_date ON news_articles(publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_domain_date ON news_articles(source_domain, publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_fingerprint ON news_articles(fingerprint);
CREATE INDEX IF NOT EXISTS idx_news_entities ON news_articles USING gin (related_entities);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(rss_source_id);

-- ─── fetch audit log (append-only, pruned to last 2000 rows) ──────────────

CREATE TABLE IF NOT EXISTS news_fetch_log (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fetch_log_day ON news_fetch_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON news_fetch_log(source_id, created_at DESC);

-- ─── official broadcast registry (admin-managed, official ONLY) ───────────

CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  competition_name TEXT NOT NULL,
  broadcaster_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'TV'
    CHECK (platform IN ('TV','Website','Mobile App','Streaming','Other')),
  regions TEXT[] NOT NULL DEFAULT '{}',
  broadcast_website TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  is_official_broadcaster BOOLEAN NOT NULL DEFAULT true,
  requires_subscription BOOLEAN NOT NULL DEFAULT true,
  free_access BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('approved','pending','rejected')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_comp ON broadcasts(competition_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status) WHERE status = 'approved' AND enabled;
