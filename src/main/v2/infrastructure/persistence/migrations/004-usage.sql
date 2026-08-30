CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_session_id TEXT,
  workflow_run_id TEXT,
  task_run_id TEXT,
  agent_run_id TEXT,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK(requests >= 0),
  input_tokens INTEGER NOT NULL CHECK(input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK(output_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL CHECK(cache_read_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL CHECK(cache_write_tokens >= 0),
  cost_usd REAL NOT NULL CHECK(cost_usd >= 0),
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);

CREATE INDEX usage_records_workflow_idx ON usage_records(workflow_run_id);
CREATE INDEX usage_records_provider_account_idx ON usage_records(provider_id, account_id);
