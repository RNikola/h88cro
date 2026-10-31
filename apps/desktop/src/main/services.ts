import { statfs } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { LocalDb } from '@h88cro/db';
import { verifyChromium } from '@h88cro/engine';
import { SettingsSchema, type AppState, type EngineState, type Settings, type UpdateState } from '../shared/ipc';
import { getSecret, hint } from './secrets';

export const CLAUDE_KEY = 'anthropic-api-key';

export class Services {
  readonly dataDir = app.getPath('userData');
  readonly scansDir = join(this.dataDir, 'scans');
  readonly enginesDir = join(this.dataDir, 'engines');
  readonly db: LocalDb;
  unlocked = false;
  engine: EngineState = { installed: false, installing: false };
  update: () => UpdateState = () => ({ status: 'unsupported', current: app.getVersion() });

  constructor() {
    mkdirSync(this.scansDir, { recursive: true });
    mkdirSync(this.enginesDir, { recursive: true });
    this.db = new LocalDb(join(this.dataDir, 'h88cro.sqlite'));
  }

  async init() {
    const row = await this.db.getEngine('chromium');
    if (row) {
      const verified = await verifyChromium({ executablePath: row.path, sha256: row.checksum }).catch(() => false);
      this.engine = { installed: true, version: row.version, verified, installing: false, error: verified ? undefined : 'The scan engine changed or is missing. Reinstall it in Settings.' };
    }
    if (process.env.H88CRO_CHROMIUM_PATH) this.engine = { installed: true, version: 'custom (H88CRO_CHROMIUM_PATH)', verified: true, installing: false };
  }

  async chromiumPath(): Promise<string | undefined> {
    if (process.env.H88CRO_CHROMIUM_PATH) return process.env.H88CRO_CHROMIUM_PATH;
    return (await this.db.getEngine('chromium'))?.path;
  }

  async settings(): Promise<Settings> {
    const raw = ((await this.db.getProfile())?.settings ?? {}) as Record<string, unknown>;
    return SettingsSchema.parse(raw);
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = SettingsSchema.parse({ ...(await this.settings()), ...patch });
    await this.db.updateProfile({ settings: next, uiLang: next.uiLang, helperLang: next.helperLang });
    return next;
  }

  async state(): Promise<AppState> {
    const profile = await this.db.getProfile();
    let freeDiskBytes: number | undefined;
    try {
      const s = await statfs(this.dataDir);
      freeDiskBytes = s.bavail * s.bsize;
    } catch {
      /* not supported */
    }
    return {
      mode: profile ? 'solo' : 'none',
      profileName: profile?.name,
      unlocked: this.unlocked,
      engine: this.engine,
      claudeKeyHint: this.unlocked ? hint(getSecret(CLAUDE_KEY)) : undefined,
      settings: profile ? await this.settings() : SettingsSchema.parse({}),
      platform: process.platform,
      version: app.getVersion(),
      freeDiskBytes,
      update: this.update(),
    };
  }
}
