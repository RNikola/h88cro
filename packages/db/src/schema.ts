import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Local (Solo mode) schema. Phase 2 adds the Postgres dialect of the same tables for Supabase
 * (brief §4.2: one Drizzle schema shared by SQLite and Postgres). Secrets are never stored here:
 * API keys and tokens live in OS secure storage (safeStorage).
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  /** scrypt hash of the local password: `scrypt$N$r$p$salt$hash` */
  passwordHash: text('password_hash').notNull(),
  uiLang: text('ui_lang').notNull().default('en'),
  helperLang: text('helper_lang').notNull().default('en'),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text('created_at').notNull().default(now),
});

export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultMarket: text('default_market'),
  createdAt: text('created_at').notNull().default(now),
});

export const scan = sqliteTable(
  'scan',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => project.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    title: text('title'),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'cancelled'] }).notNull(),
    devices: text('devices', { mode: 'json' }).$type<string[]>().notNull(),
    pageType: text('page_type').notNull(),
    market: text('market'),
    lang: text('lang'),
    overallScore: integer('overall_score'),
    scores: text('scores', { mode: 'json' }).$type<unknown>(),
    /** Full ScanResult minus findings (screenshots, perf, warnings, priority…). */
    result: text('result', { mode: 'json' }).$type<unknown>(),
    request: text('request', { mode: 'json' }).$type<unknown>().notNull(),
    error: text('error'),
    llmCostUsd: real('llm_cost_usd').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    sharedAt: text('shared_at'),
  },
  (t) => [index('scan_url_idx').on(t.url), index('scan_created_idx').on(t.createdAt)],
);

export const scanArtifact = sqliteTable('scan_artifact', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull().references(() => scan.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // screenshot-mobile-fold, snapshot, pdf…
  localPath: text('local_path').notNull(),
  remoteKey: text('remote_key'),
});

export const finding = sqliteTable(
  'finding',
  {
    scanId: text('scan_id').notNull().references(() => scan.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    module: text('module').notNull(),
    ruleId: text('rule_id').notNull(),
    severity: text('severity').notNull(),
    data: text('data', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (t) => [index('finding_scan_idx').on(t.scanId)],
);

export const findingAction = sqliteTable('finding_action', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull(),
  findingId: text('finding_id').notNull(),
  type: text('type', { enum: ['ignore', 'comment', 'fix', 'pr'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: text('created_at').notNull().default(now),
});

export const engineInstall = sqliteTable('engine_install', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  checksum: text('checksum').notNull(),
  path: text('path').notNull(),
  installedAt: text('installed_at').notNull().default(now),
});

export const usageLedger = sqliteTable('usage_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
  createdAt: text('created_at').notNull().default(now),
});

/** A website connected to its source: a GitHub repository or a local folder. */
export const site = sqliteTable('site', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['github', 'local'] }).notNull(),
  /** e.g. https://keira.best — scans of URLs under this prefix use this connection. */
  urlPrefix: text('url_prefix').notNull(),
  /** owner/name */
  repo: text('repo'),
  baseBranch: text('base_branch'),
  localPath: text('local_path'),
  /** Merge fix pull requests automatically so changes go live without a manual review. */
  autoMerge: integer('auto_merge', { mode: 'boolean' }).notNull().default(false),
  /** Local folders: push the fix branch to origin. */
  pushBranch: integer('push_branch', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(now),
});

/** Which source file renders which page (URL path). */
export const pageMap = sqliteTable('page_map', {
  siteId: text('site_id').notNull().references(() => site.id, { onDelete: 'cascade' }),
  urlPath: text('url_path').notNull(),
  filePath: text('file_path').notNull(),
});

/** An applied fix: a pull request, a local commit, or a saved file. */
export const fixChange = sqliteTable(
  'fix_change',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').references(() => site.id, { onDelete: 'set null' }),
    scanId: text('scan_id'),
    findingIds: text('finding_ids', { mode: 'json' }).$type<string[]>().notNull(),
    summary: text('summary').notNull(),
    kind: text('kind', { enum: ['pr', 'local', 'file'] }).notNull(),
    prNumber: integer('pr_number'),
    url: text('url'),
    branch: text('branch'),
    /** open | merged | closed | auto-merge | committed | saved | failed */
    state: text('state').notNull(),
    message: text('message'),
    rescanId: text('rescan_id'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [index('fix_change_scan_idx').on(t.scanId)],
);
