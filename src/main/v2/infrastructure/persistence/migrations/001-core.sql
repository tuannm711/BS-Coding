CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE work_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL REFERENCES work_sessions(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE agent_definitions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE agent_versions (
  id TEXT PRIMARY KEY,
  agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  task_run_id TEXT NOT NULL REFERENCES task_runs(id),
  agent_version_id TEXT NOT NULL REFERENCES agent_versions(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE runtime_epochs (
  id TEXT PRIMARY KEY,
  agent_run_id TEXT NOT NULL REFERENCES agent_runs(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  sha256 TEXT
);
