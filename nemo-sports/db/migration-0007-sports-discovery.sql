-- Additive source-provenanced read model. Never deletes/modifies old entities or streams.
CREATE TABLE IF NOT EXISTS sports_sync_records (
  kind text NOT NULL, provider text NOT NULL, source_key text NOT NULL,
  payload jsonb NOT NULL, PRIMARY KEY (kind, provider, source_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS sports_sync_unique_slug ON sports_sync_records(kind, (payload->>'slug'));
CREATE INDEX IF NOT EXISTS sports_sync_competition ON sports_sync_records(provider, (payload->>'competitionKey'));
CREATE TABLE IF NOT EXISTS sports_sync_state (job text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sports_sync_runs (id text PRIMARY KEY, started_at timestamptz NOT NULL, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sports_sync_lease (id text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS sports_sync_issues (id bigserial PRIMARY KEY, observed_at timestamptz NOT NULL DEFAULT now(), code text NOT NULL, detail text NOT NULL);
