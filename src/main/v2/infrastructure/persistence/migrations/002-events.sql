CREATE TABLE canonical_events (
  aggregate_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_json TEXT NOT NULL CHECK (json_valid(correlation_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (aggregate_id, sequence)
);

CREATE INDEX canonical_events_event_type_idx ON canonical_events(event_type);

CREATE TABLE import_history (
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  imported_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (source_type, source_key)
);
