CREATE TABLE remote_audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE INDEX remote_audit_occurred_idx ON remote_audit_events(occurred_at, id);
