-- ═══════════════════════════════════════════════════════════════════════════
--  NEMO SPORTS · SDL SEED  (idempotent — safe to re-run)
--  Provider priority (§3.5), rate limits (§3.8), conflict rules (§3.9), sports
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── sports ────────────────────────────────────────────────────────────────
INSERT INTO sports (id, slug, name_ar, name_en, short_name_ar, short_name_en, display_order, config) VALUES
  (gen_random_uuid(), 'football',   'كرة القدم',      'Football',   'قدم',   'FB',  1, '{"periods":[{"label":"1H"},{"label":"2H"}],"scoringUnit":"goal","maxPeriods":2}'),
  (gen_random_uuid(), 'basketball', 'كرة السلة',      'Basketball', 'سلة',   'BB',  2, '{"periods":[{"label":"Q1"},{"label":"Q2"},{"label":"Q3"},{"label":"Q4"}],"scoringUnit":"point","maxPeriods":4}'),
  (gen_random_uuid(), 'tennis',     'التنس',          'Tennis',     'تنس',   'TN',  3, '{"scoringUnit":"game","sets":3}'),
  (gen_random_uuid(), 'volleyball', 'الكرة الطائرة',  'Volleyball', 'طائرة', 'VB',  4, '{"scoringUnit":"point","maxSets":5}'),
  (gen_random_uuid(), 'handball',   'كرة اليد',       'Handball',   'يد',    'HB',  5, '{"periods":[{"label":"1H"},{"label":"2H"}],"maxPeriods":2}'),
  (gen_random_uuid(), 'hockey',     'هوكي الجليد',    'Ice Hockey', 'هوكي',  'HK',  6, '{"periods":[{"label":"P1"},{"label":"P2"},{"label":"P3"}],"maxPeriods":3}'),
  (gen_random_uuid(), 'baseball',   'البيسبول',       'Baseball',   'بيسبول','BS',  7, '{"scoringUnit":"run","maxInnings":9}'),
  (gen_random_uuid(), 'boxing',     'الملاكمة',       'Boxing',     'ملاكمة','BX',  8, '{"scoringUnit":"point","rounds":12,"roundMinutes":3}')
ON CONFLICT (slug) DO NOTHING;

-- ─── provider priority (§3.5) ──────────────────────────────────────────────
-- Sportradar first for live data (premium accuracy), Sportmonks for breadth,
-- API-Football last (cheap but 100 req/day on the free tier), TheSportsDB only
-- for artwork — never for scores.
INSERT INTO provider_priority (sport, competition, data_type, provider, role) VALUES
  -- Football-Data.org: free, reliable, official — it leads the *static*
  -- football surfaces (tables, scorers, the day's fixtures/results) and is
  -- deliberately only a live-data fallback, because the free plan's scores are
  -- delayed. Registered only when FOOTBALL_DATA_API_KEY is configured.
  ('football','*','live_matches',       'sportradar',  'primary'),
  ('football','*','live_matches',       'sportmonks',  'secondary'),
  ('football','*','live_matches',       'api_football','fallback'),
  ('football','*','live_matches',       'football_data','fallback'),

  ('football','*','match_events',       'sportradar',  'primary'),
  ('football','*','match_events',       'sportmonks',  'secondary'),
  ('football','*','match_events',       'api_football','fallback'),

  ('football','*','match_stats',        'sportradar',  'primary'),
  ('football','*','match_stats',        'api_football','secondary'),
  ('football','*','match_lineups',      'sportradar',  'primary'),
  ('football','*','match_detail',       'sportradar',  'primary'),
  ('football','*','match_detail',       'sportmonks',  'secondary'),
  ('football','*','match_detail',       'football_data','fallback'),

  ('football','*','results',            'football_data','primary'),
  ('football','*','results',            'sportscore',  'secondary'),
  ('football','*','team',               'sportmonks',  'primary'),
  ('football','*','team',               'thesportsdb', 'secondary'),
  ('football','*','player',             'sportmonks',  'primary'),
  ('football','*','player_stats',       'sportmonks',  'primary'),
  ('football','*','player_stats',       'api_football','secondary'),
  ('football','*','competition',        'sportmonks',  'primary'),
  ('football','*','competition_seasons','sportmonks',  'primary'),
  ('football','*','venue',              'api_football','primary'),
  ('football','*','venue',              'thesportsdb', 'secondary'),

  ('*','*','images',                    'thesportsdb', 'primary'),
  ('*','*','images',                    'sportmonks',  'secondary'),

  -- competition-specific override: the Premier League is on a premium tier,
  -- so live data never falls through to the free-tier provider
  ('football','premier-league','live_matches','sportradar','primary'),
  ('football','premier-league','live_matches','sportmonks', 'fallback'),
  ('football','premier-league','match_events','api_football','disabled')
ON CONFLICT (sport, competition, data_type, provider) DO UPDATE
  SET role = EXCLUDED.role, enabled = true, updated_at = now();

-- ─── rate limits (§3.8) — published limits, throttle at 85% ────────────────
INSERT INTO provider_rate_limits (provider, per_second, per_minute, per_hour, per_day, per_month, concurrency, throttle_at) VALUES
  ('sportradar',   2,    60,   3000, 50000, NULL,    2, 0.85),
  ('sportmonks',   NULL, 3000, NULL, NULL,  500000, 4, 0.85),
  ('api_football', 1,    10,   50,   100,   3000,   1, 0.85),
  ('football_data',1,    8,    NULL, NULL,  NULL,   2, 0.85),
  ('thesportsdb',  1,    30,   500,  5000,  NULL,   1, 0.85),
  ('demo',         100,  NULL, NULL, NULL,  NULL,   NULL, 0.85)
ON CONFLICT (provider) DO UPDATE SET
  per_second = EXCLUDED.per_second, per_minute = EXCLUDED.per_minute, per_hour = EXCLUDED.per_hour,
  per_day = EXCLUDED.per_day, per_month = EXCLUDED.per_month, concurrency = EXCLUDED.concurrency,
  throttle_at = EXCLUDED.throttle_at, updated_at = now();

-- ─── conflict rules (§3.9) ─────────────────────────────────────────────────
INSERT INTO conflict_rules (field, severity, strategy) VALUES
  ('score',     'critical', 'primary_provider_wins'),
  ('status',    'high',     'primary_provider_wins'),
  ('standings', 'high',     'primary_provider_wins'),
  ('event',     'high',     'most_recent_wins'),
  ('kickoff',   'medium',   'primary_provider_wins'),
  ('lineup',    'medium',   'most_recent_wins'),
  ('stat',      'low',      'most_recent_wins'),
  ('metadata',  'low',      'most_recent_wins')
ON CONFLICT (field) DO UPDATE SET severity = EXCLUDED.severity, strategy = EXCLUDED.strategy, updated_at = now();

-- ─── health rows (one per registered provider) ─────────────────────────────
INSERT INTO provider_health (provider) VALUES
  ('sportradar'), ('sportmonks'), ('api_football'), ('thesportsdb'), ('football_data'), ('sportscore'), ('demo')
ON CONFLICT (provider) DO NOTHING;
