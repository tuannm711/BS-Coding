ALTER TABLE usage_records ADD COLUMN cost_known INTEGER NOT NULL DEFAULT 1
  CHECK(cost_known IN (0, 1));

CREATE TABLE budget_policies (
  scope_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
  updated_at TEXT NOT NULL
);
