import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { and, desc, eq, ne } from 'drizzle-orm';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { Finding } from '@h88cro/core';
import { MIGRATIONS } from './migrations.js';
import * as schema from './schema.js';

export * as schema from './schema.js';
export { MIGRATIONS };

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = await scrypt(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(expected, got);
}

export type ScanRow = typeof schema.scan.$inferSelect;
export type ScanInsert = typeof schema.scan.$inferInsert;

/**
 * Local SQLite database. Uses Node's built-in `node:sqlite` (bundled with Electron), so there is
 * no native module to rebuild per platform/architecture; Drizzle runs on top via its sqlite-proxy driver.
 */
export class LocalDb {
  readonly sqlite: DatabaseSync;
  readonly db: SqliteRemoteDatabase<typeof schema>;

  constructor(path: string) {
    this.sqlite = new DatabaseSync(path);
    if (path !== ':memory:') this.sqlite.exec('PRAGMA journal_mode = WAL');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.migrate();
    this.db = drizzle(
      async (sql, params, method) => {
        const stmt = this.sqlite.prepare(sql);
        if (method === 'run') {
          stmt.run(...(params as never[]));
          return { rows: [] };
        }
        stmt.setReturnArrays(true);
        if (method === 'get') {
          const row = stmt.get(...(params as never[])) as unknown as unknown[] | undefined;
          return { rows: (row ?? undefined) as unknown as unknown[] };
        }
        return { rows: stmt.all(...(params as never[])) as unknown as unknown[][] };
      },
      { schema },
    );
  }

  private migrate() {
    const version = (this.sqlite.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.sqlite.exec('BEGIN');
      try {
        this.sqlite.exec(MIGRATIONS[v]!);
        this.sqlite.exec(`PRAGMA user_version = ${v + 1}`);
        this.sqlite.exec('COMMIT');
      } catch (e) {
        this.sqlite.exec('ROLLBACK');
        throw e;
      }
    }
  }

  close() {
    this.sqlite.close();
  }

  // Profile (Solo mode: one local profile)
  getProfile() {
    return this.db.select().from(schema.profile).where(eq(schema.profile.id, 1)).get();
  }
  async createProfile(name: string, password: string) {
    if (await this.getProfile()) throw new Error('A local profile already exists');
    await this.db.insert(schema.profile).values({ id: 1, name, passwordHash: await hashPassword(password) }).run();
  }
  async checkPassword(password: string) {
    const p = await this.getProfile();
    return !!p && (await verifyPassword(password, p.passwordHash));
  }
  async updateProfile(patch: Partial<Pick<typeof schema.profile.$inferInsert, 'name' | 'uiLang' | 'helperLang' | 'settings'>>) {
    await this.db.update(schema.profile).set(patch).where(eq(schema.profile.id, 1)).run();
  }

  // Scans
  async insertScan(row: ScanInsert) {
    await this.db.insert(schema.scan).values(row).run();
  }
  async updateScan(id: string, patch: Partial<ScanInsert>) {
    await this.db.update(schema.scan).set(patch).where(eq(schema.scan.id, id)).run();
  }
  getScan(id: string) {
    return this.db.select().from(schema.scan).where(eq(schema.scan.id, id)).get();
  }
  listScans(limit = 50) {
    return this.db.select().from(schema.scan).orderBy(desc(schema.scan.createdAt)).limit(limit).all();
  }
  /** Previous finished scan of the same URL (for the diff in the report header). */
  async previousScan(url: string, beforeId: string) {
    const current = await this.getScan(beforeId);
    const rows = await this.db
      .select()
      .from(schema.scan)
      .where(and(eq(schema.scan.url, url), eq(schema.scan.status, 'done'), ne(schema.scan.id, beforeId)))
      .orderBy(desc(schema.scan.createdAt))
      .all();
    return rows.find((s) => !current || s.createdAt <= current.createdAt);
  }
  async deleteScan(id: string) {
    await this.db.delete(schema.scan).where(eq(schema.scan.id, id)).run();
  }

  // Findings
  insertFindings(scanId: string, findings: Finding[]) {
    const stmt = this.sqlite.prepare('INSERT OR IGNORE INTO finding (scan_id, id, module, rule_id, severity, data) VALUES (?, ?, ?, ?, ?, ?)');
    this.sqlite.exec('BEGIN');
    try {
      for (const f of findings) stmt.run(scanId, f.id, f.module, f.ruleId, f.severity, JSON.stringify(f));
      this.sqlite.exec('COMMIT');
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  async listFindings(scanId: string): Promise<Finding[]> {
    const rows = await this.db.select().from(schema.finding).where(eq(schema.finding.scanId, scanId)).all();
    return rows.map((r) => r.data as Finding);
  }
  async addAction(scanId: string, findingId: string, type: 'ignore' | 'comment', payload: Record<string, unknown>) {
    await this.db.insert(schema.findingAction).values({ scanId, findingId, type, payload }).run();
  }
  listActions(scanId: string) {
    return this.db.select().from(schema.findingAction).where(eq(schema.findingAction.scanId, scanId)).all();
  }

  // Artifacts
  async addArtifact(scanId: string, type: string, localPath: string) {
    await this.db.insert(schema.scanArtifact).values({ scanId, type, localPath }).run();
  }
  listArtifacts(scanId: string) {
    return this.db.select().from(schema.scanArtifact).where(eq(schema.scanArtifact.scanId, scanId)).all();
  }

  // Engines
  getEngine(name: string) {
    return this.db.select().from(schema.engineInstall).where(eq(schema.engineInstall.name, name)).get();
  }
  async upsertEngine(row: typeof schema.engineInstall.$inferInsert) {
    await this.db.insert(schema.engineInstall).values(row).onConflictDoUpdate({ target: schema.engineInstall.name, set: row }).run();
  }

  // Usage
  async addUsage(row: typeof schema.usageLedger.$inferInsert) {
    await this.db.insert(schema.usageLedger).values(row).run();
  }
}
