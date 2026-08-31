CREATE TABLE cutover_state (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  completed_at TEXT NOT NULL
);
