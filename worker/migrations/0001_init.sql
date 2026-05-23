-- Cloudflare Domain Management Panel - initial schema

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cf_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT,
  api_type    TEXT NOT NULL DEFAULT 'token',
  api_token   TEXT NOT NULL, -- never returned to clients
  account_id  TEXT,          -- Cloudflare account id (optional, used for routing destinations)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS domains (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cf_account_id INTEGER NOT NULL,
  zone_id       TEXT NOT NULL UNIQUE,
  domain        TEXT NOT NULL,
  status        TEXT,
  synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cf_account_id) REFERENCES cf_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_domains_account ON domains(cf_account_id);
CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(domain);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cf_account_id INTEGER NOT NULL,
  login_code    TEXT NOT NULL UNIQUE,
  note          TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  expired_at    TEXT,
  is_permanent  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cf_account_id) REFERENCES cf_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(cf_account_id);
CREATE INDEX IF NOT EXISTS idx_users_code ON users(login_code);

CREATE TABLE IF NOT EXISTS user_domains (
  user_id   INTEGER NOT NULL,
  domain_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, domain_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_domains_user   ON user_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_user_domains_domain ON user_domains(domain_id);

CREATE TABLE IF NOT EXISTS permissions (
  user_id              INTEGER PRIMARY KEY,
  can_dns              INTEGER NOT NULL DEFAULT 0,
  can_email            INTEGER NOT NULL DEFAULT 0,
  can_domain_settings  INTEGER NOT NULL DEFAULT 0,
  can_full_access      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cf_account_id INTEGER,
  user_id       INTEGER,
  actor_type    TEXT NOT NULL,        -- 'admin' | 'user'
  action        TEXT NOT NULL,
  target        TEXT,
  ip_address    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_logs(cf_account_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
