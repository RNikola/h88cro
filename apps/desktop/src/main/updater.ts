import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../shared/ipc';

const { autoUpdater } = electronUpdater;
const RELEASES_URL = 'https://github.com/RNikola/h88cro/releases';
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/**
 * Updates come from this repo's GitHub Releases (published by the "Build installers" workflow on every merge to main).
 * Windows: download in the background, then "Restart to update". Profile, settings, key and scans live in the
 * user-data folder and are kept.
 * macOS: installing an update in place requires a signed app, so until the builds are signed the app only tells the
 * user a new version exists and opens its download page. Reinstalling the .dmg keeps all data too.
 */
export class Updater {
  state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion() };
  private readonly manual = process.platform === 'darwin';

  constructor(private readonly emit: (s: UpdateState) => void) {
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = !this.manual;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'none', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-available', (i) =>
      this.set({ status: this.manual ? 'available' : 'downloading', version: i.version, manual: this.manual, url: `${RELEASES_URL}/tag/v${i.version}`, progress: 0 }),
    );
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => this.set({ status: 'ready', version: i.version }));
    autoUpdater.on('error', (e) => this.set({ status: 'error', error: friendly(e) }));
  }

  start() {
    if (!app.isPackaged) return;
    setTimeout(() => void this.check(), 10_000);
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref?.();
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state;
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.state;
    await autoUpdater.checkForUpdates().catch((e) => this.set({ status: 'error', error: friendly(e) }));
    return this.state;
  }

  async install() {
    if (this.state.status === 'ready') autoUpdater.quitAndInstall(false, true);
    else if (this.state.url) await shell.openExternal(this.state.url);
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch, current: app.getVersion() };
    if (patch.status && patch.status !== 'error') this.state.error = undefined;
    this.emit(this.state);
  }
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::ERR/i.test(msg)) return 'No connection to the update server. Try again later.';
  if (/404|latest.*\.yml/i.test(msg)) return 'No published release yet.';
  return msg.split('\n')[0]!.slice(0, 200);
}
