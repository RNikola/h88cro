/**
 * Embedded SQL migrations (kept in code so they ship inside app.asar).
 * Applied in order; PRAGMA user_version records the current version.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    ui_lang TEXT NOT NULL DEFAULT 'en',
    helper_lang TEXT NOT NULL DEFAULT 'en',
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_market TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE scan (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    devices TEXT NOT NULL,
    page_type TEXT NOT NULL,
    market TEXT,
    lang TEXT,
    overall_score INTEGER,
    scores TEXT,
    result TEXT,
    request TEXT NOT NULL,
    error TEXT,
    llm_cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    started_at TEXT,
    finished_at TEXT,
    shared_at TEXT
  );
  CREATE INDEX scan_url_idx ON scan(url);
  CREATE INDEX scan_created_idx ON scan(created_at);
  CREATE TABLE scan_artifact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_key TEXT
  );
  CREATE TABLE finding (
    scan_id TEXT NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    module TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (scan_id, id)
  );
  CREATE INDEX finding_scan_idx ON finding(scan_id);
  CREATE TABLE finding_action (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE engine_install (
    name TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    path TEXT NOT NULL,
    installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE usage_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
  `
  CREATE TABLE site (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    url_prefix TEXT NOT NULL,
    repo TEXT,
    base_branch TEXT,
    local_path TEXT,
    auto_merge INTEGER NOT NULL DEFAULT 0,
    push_branch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE page_map (
    site_id TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    url_path TEXT NOT NULL,
    file_path TEXT NOT NULL,
    PRIMARY KEY (site_id, url_path)
  );
  CREATE TABLE fix_change (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES site(id) ON DELETE SET NULL,
    scan_id TEXT,
    finding_ids TEXT NOT NULL,
    summary TEXT NOT NULL,
    kind TEXT NOT NULL,
    pr_number INTEGER,
    url TEXT,
    branch TEXT,
    state TEXT NOT NULL,
    message TEXT,
    rescan_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX fix_change_scan_idx ON fix_change(scan_id);
  `,
];
