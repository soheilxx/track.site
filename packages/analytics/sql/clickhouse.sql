-- ClickHouse event store (EU region). Applied manually / via infra tooling; not managed by drizzle-kit.
CREATE TABLE IF NOT EXISTS events
(
  event_id String,
  source_event_id String,
  organization_id UUID,
  site_id UUID,
  site_tracking_id FixedString(6),
  environment_id UUID,
  name LowCardinality(String),
  is_standard Bool,
  category LowCardinality(String),
  client_ts Nullable(DateTime64(3, 'UTC')),
  server_ts DateTime64(3, 'UTC'),
  anonymous_id Nullable(String),
  session_id Nullable(String),
  user_id Nullable(String),
  url Nullable(String),
  host Nullable(String),
  path Nullable(String),
  referrer Nullable(String),
  title Nullable(String),
  utm Nullable(String),
  click_ids Nullable(String),
  vendor_ids Nullable(String),
  consent String,
  consent_snapshot_id Nullable(UUID),
  props Nullable(String),
  commerce Nullable(String),
  user_data Nullable(String),
  ip_truncated Nullable(String),
  ua_family LowCardinality(Nullable(String)),
  locale LowCardinality(Nullable(String)),
  source LowCardinality(String),
  source_verified Bool,
  sdk_version LowCardinality(String),
  config_version Nullable(Int32),
  schema_version LowCardinality(String),
  provenance String,
  processing_state LowCardinality(String),
  drop_reason LowCardinality(Nullable(String)),
  is_billable Bool,
  is_bot Bool,
  deliveries Nullable(String),
  _version UInt64 DEFAULT toUnixTimestamp64Milli(now64(3))
)
ENGINE = ReplacingMergeTree(_version)
PARTITION BY toYYYYMM(server_ts)
ORDER BY (site_id, server_ts, event_id)
TTL toDateTime(server_ts) + INTERVAL 395 DAY
SETTINGS index_granularity = 8192;
