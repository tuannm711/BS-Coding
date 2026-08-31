CREATE TABLE historical_quota_snapshots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE INDEX historical_quota_provider_account_idx
  ON historical_quota_snapshots(provider_id, account_id, captured_at);
