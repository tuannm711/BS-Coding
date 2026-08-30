CREATE TABLE provider_accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  vault_ref TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE INDEX provider_accounts_provider_idx ON provider_accounts(provider_id, id);
