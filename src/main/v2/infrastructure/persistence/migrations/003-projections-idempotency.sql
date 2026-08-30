CREATE INDEX work_sessions_project_updated_idx ON work_sessions(project_id, id);
CREATE INDEX workflow_runs_work_session_idx ON workflow_runs(work_session_id, id);
CREATE INDEX tasks_workflow_run_idx ON tasks(workflow_run_id, id);
CREATE INDEX task_runs_workflow_run_idx ON task_runs(workflow_run_id, id);
CREATE INDEX agent_definitions_project_idx ON agent_definitions(project_id, id);
CREATE INDEX agent_runs_task_run_idx ON agent_runs(task_run_id, id);
CREATE INDEX runtime_epochs_agent_run_idx ON runtime_epochs(agent_run_id, id);
CREATE INDEX reviews_workflow_run_idx ON reviews(workflow_run_id, id);
CREATE INDEX findings_review_idx ON findings(review_id, id);

CREATE TABLE command_idempotency (
  request_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY(request_id, command_name)
);
