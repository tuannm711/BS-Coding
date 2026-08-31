CREATE TABLE update_preferences (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  channel TEXT NOT NULL CHECK (channel IN ('STABLE', 'BETA')),
  updated_at TEXT NOT NULL
);
