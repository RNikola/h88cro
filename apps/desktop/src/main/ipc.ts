import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell, utilityProcess, type IpcMainInvokeEvent } from 'electron';
import { diffScans, findingsToCsv, renderReportHtml, type ScanResult } from '@h88cro/engine';
import { verifyApiKey } from '@h88cro/llm';
import { GitHubClient } from '@h88cro/engine';
import type { Finding } from '@h88cro/core';
import { ChannelSchemas, type Channel, type ChannelResult, type ScanDetail, type ScanListItem } from '../shared/ipc';
import { workerPath, type ScanQueue } from './queue';
import { deleteSecret, getSecret, hint, setSecret } from './secrets';
import { CLAUDE_KEY, type Services } from './services';
import type { Updater } from './updater';
import { FixService, GITHUB_LOGIN, GITHUB_TOKEN } from './fixes';

type Handler<C extends Channel> = (payload: unknown, e: IpcMainInvokeEvent) => Promise<ChannelResult[C]> | ChannelResult[C];

/** Channels that work before the local profile is unlocked. */
const PUBLIC = new Set<Channel>(['app:state', 'profile:create', 'profile:unlock', 'update:check', 'update:install']);

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
    }
  } catch {
    /* missing */
  }
  return total;
}

export function registerIpc(svc: Services, queue: ScanQueue, updater: Updater, getWindow: () => BrowserWindow | undefined, isTrustedSender: (e: IpcMainInvokeEvent) => boolean) {
  const send = (event: string, data: unknown) => getWindow()?.webContents.send(event, data);

  const assetUrl = (path: string) => `h88-asset://scans/${relative(svc.scansDir, path).split(/[\\/]/).map(encodeURIComponent).join('/')}`;

  type ScanRow = NonNullable<Awaited<ReturnType<Services['db']['getScan']>>>;
  async function listItem(row: ScanRow): Promise<ScanListItem> {
    const prev = row.status === 'done' ? await svc.db.previousScan(row.url, row.id) : undefined;
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      status: row.status,
      overallScore: row.overallScore,
      previousScore: prev?.overallScore,
      market: row.market,
      pageType: row.pageType,
      createdAt: row.createdAt,
      error: row.error,
      progress: queue.progress.get(row.id),
    };
  }

  async function loadResult(id: string): Promise<ScanResult | undefined> {
    const row = await svc.db.getScan(id);
    if (!row?.result) return undefined;
    const ignored = new Set((await svc.db.listActions(id)).filter((a) => a.type === 'ignore').map((a) => a.findingId));
    return { ...(row.result as Omit<ScanResult, 'findings'>), findings: (await svc.db.listFindings(id)).filter((f) => !ignored.has(f.id)) };
  }

  function runWorker<T>(msg: unknown, onMessage: (m: Record<string, unknown>, done: (v: T) => void, fail: (e: Error) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const proc = utilityProcess.fork(workerPath(), [], { serviceName: 'h88cro-task' });
      let settled = false;
      const done = (v: T) => {
        settled = true;
        proc.kill();
        resolve(v);
      };
      const fail = (e: Error) => {
        settled = true;
        proc.kill();
        reject(e);
      };
      proc.on('message', (m: Record<string, unknown>) => {
        if (m.type === 'error') fail(new Error(String(m.message)));
        else onMessage(m, done, fail);
      });
      proc.on('exit', () => !settled && reject(new Error('Worker exited')));
      proc.postMessage(msg);
    });
  }

  const fixes = new FixService(
    svc,
    (event, data) => send(event, data),
    async (scanId) => (await queue.rescan(scanId))!,
    async (msg) =>
      runWorker<{ before: string; after: string; focused: boolean }>({ type: 'fix-preview', ...msg, chromiumPath: await svc.chromiumPath() }, (m, done) => {
        if (m.type === 'preview-done') done(m.result as { before: string; after: string; focused: boolean });
      }),
    assetUrl,
  );
  const win = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined;

  const handlers: { [C in Channel]: Handler<C> } = {
    'app:state': () => svc.state(),
    'profile:create': async (p) => {
      const { name, password } = ChannelSchemas['profile:create'].parse(p);
      await svc.db.createProfile(name, password);
      svc.unlocked = true;
      return svc.state();
    },
    'profile:unlock': async (p) => {
      const { password } = ChannelSchemas['profile:unlock'].parse(p);
      const ok = await svc.db.checkPassword(password);
      if (ok) svc.unlocked = true;
      return { ok };
    },
    'profile:lock': () => {
      svc.unlocked = false;
    },
    'engine:install': async () => {
      if (svc.engine.installing) return svc.engine;
      svc.engine = { ...svc.engine, installing: true, progress: 0, error: undefined };
      send('engine:progress', svc.engine);
      try {
        const info = await runWorker<{ version: string; executablePath: string; sha256: string }>({ type: 'install-chromium', cacheDir: svc.enginesDir }, (m, done) => {
          if (m.type === 'install-progress') {
            svc.engine = { ...svc.engine, progress: Number(m.pct) };
            send('engine:progress', svc.engine);
          } else if (m.type === 'installed') done(m.info as { version: string; executablePath: string; sha256: string });
        });
        await svc.db.upsertEngine({ name: 'chromium', version: info.version, checksum: info.sha256, path: info.executablePath });
        svc.engine = { installed: true, version: info.version, verified: true, installing: false, progress: 100 };
      } catch (e) {
        svc.engine = { ...svc.engine, installing: false, error: (e as Error).message };
      }
      send('engine:progress', svc.engine);
      return svc.engine;
    },
    'settings:get': () => svc.settings(),
    'settings:update': async (p) => {
      const next = await svc.updateSettings(ChannelSchemas['settings:update'].parse(p));
      queue.setConcurrency(next.concurrency);
      return next;
    },
    'secrets:setClaudeKey': async (p) => {
      const { key } = ChannelSchemas['secrets:setClaudeKey'].parse(p);
      const check = await verifyApiKey(key.trim(), (await svc.settings()).routing.classify);
      if (!check.ok) return { ok: false, error: check.error };
      setSecret(CLAUDE_KEY, key.trim());
      return { ok: true, hint: hint(key.trim()) };
    },
    'secrets:clearClaudeKey': () => deleteSecret(CLAUDE_KEY),
    'scan:start': async (p) => {
      const input = ChannelSchemas['scan:start'].parse(p);
      if (!(await svc.chromiumPath())) throw new Error('The scan engine is not installed yet. Finish setup first.');
      if (input.useClaude && !getSecret(CLAUDE_KEY)) input.useClaude = false;
      return { ids: await queue.start(input) };
    },
    'scan:list': async () => Promise.all((await svc.db.listScans(100)).map(listItem)),
    'scan:get': async (p) => {
      const { id } = ChannelSchemas['scan:get'].parse(p);
      const row = await svc.db.getScan(id);
      if (!row) return null;
      const result = row.result as Omit<ScanResult, 'findings'> | null;
      const findings: Finding[] = await svc.db.listFindings(id);
      const prevRow = row.status === 'done' ? await svc.db.previousScan(row.url, id) : undefined;
      const prev = prevRow ? await loadResult(prevRow.id) : undefined;
      const curr = result ? { ...result, findings } : undefined;
      const diff = prev && curr ? diffScans(prev, curr as ScanResult) : undefined;
      const detail: ScanDetail = {
        ...(await listItem(row)),
        scores: result?.scores,
        findings,
        priority: result?.priority ?? [],
        screenshots: (result?.screenshots ?? []).map((s) => ({ device: s.device, kind: s.kind, url: assetUrl(s.path) })),
        warnings: result?.warnings ?? [],
        actions: (await svc.db.listActions(id)).map((a) => ({ findingId: a.findingId, type: a.type, payload: a.payload, createdAt: a.createdAt })),
        diff: diff && prevRow ? { previousId: prevRow.id, scoreDelta: diff.scoreDelta, added: diff.added.map((f) => f.id), resolved: diff.resolved.map((f) => f.title) } : undefined,
        llmCostUsd: row.llmCostUsd,
        lang: row.lang,
        marketSignals: result?.marketSignals ?? [],
        devices: row.devices,
      };
      return detail;
    },
    'scan:cancel': (p) => queue.cancel(ChannelSchemas['scan:cancel'].parse(p).id),
    'scan:delete': async (p) => {
      const { id } = ChannelSchemas['scan:delete'].parse(p);
      await queue.cancel(id);
      await svc.db.deleteScan(id);
      await rm(join(svc.scansDir, id), { recursive: true, force: true });
    },
    'finding:action': async (p) => {
      const a = ChannelSchemas['finding:action'].parse(p);
      await svc.db.addAction(a.scanId, a.findingId, a.type, { text: a.text });
    },
    'export:report': async (p, e) => {
      const { scanId, format } = ChannelSchemas['export:report'].parse(p);
      const result = await loadResult(scanId);
      if (!result) throw new Error('Scan not found');
      const safe = (result.title ?? 'report').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: `H88CRO-${safe}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (canceled || !filePath) return { saved: false };
      if (format === 'csv') await writeFile(filePath, findingsToCsv(result.findings));
      else if (format === 'json') await writeFile(filePath, JSON.stringify(result, null, 2));
      else if (format === 'html') await writeFile(filePath, await renderReportHtml(result));
      else await runWorker<void>({ type: 'export-pdf', result, outPath: filePath, chromiumPath: await svc.chromiumPath() }, (m, done) => m.type === 'pdf-done' && done());
      return { saved: true, path: filePath };
    },
    'dialog:pickFiles': async (_p, e) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] });
      return r.canceled ? [] : r.filePaths;
    },
    'storage:info': async () => ({
      cacheBytes: 0,
      scansBytes: await dirSize(svc.scansDir),
      enginesBytes: await dirSize(svc.enginesDir),
      dataDir: svc.dataDir,
    }),
    'storage:clear': async () => {
      // Keep reports and first-screen screenshots; drop the bulky full-page shots and HTML snapshots.
      for (const d of await readdir(svc.scansDir).catch(() => [] as string[])) {
        for (const f of ['mobile-full.png', 'desktop-full.png', 'snapshot.html']) await rm(join(svc.scansDir, d, f), { force: true });
      }
    },
    'update:check': () => updater.check(),
    'update:install': () => updater.install(),
    'github:setToken': async (p) => {
      const { token } = ChannelSchemas['github:setToken'].parse(p);
      try {
        const me = await new GitHubClient(token.trim()).whoami();
        setSecret(GITHUB_TOKEN, token.trim());
        setSecret(GITHUB_LOGIN, me.login);
        return { ok: true, login: me.login };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    'github:clearToken': () => {
      deleteSecret(GITHUB_TOKEN);
      deleteSecret(GITHUB_LOGIN);
    },
    'github:repos': async () => {
      const gh = fixes.github();
      if (!gh) return [];
      return (await gh.listRepos()).map((r) => ({ fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private, canPush: r.canPush }));
    },
    'site:list': () => fixes.listSites(),
    'site:save': (p) => fixes.saveSite(ChannelSchemas['site:save'].parse(p)),
    'site:delete': async (p) => svc.db.deleteSite(ChannelSchemas['site:delete'].parse(p).id),
    'site:pickFolder': async (_p, e) => {
      const r = await dialog.showOpenDialog(win(e)!, { title: 'Choose the folder with the website source', properties: ['openDirectory'] });
      return r.canceled ? undefined : r.filePaths[0];
    },
    'fix:target': (p) => fixes.target(ChannelSchemas['fix:target'].parse(p).scanId),
    'fix:setFile': (p) => {
      const { scanId, filePath } = ChannelSchemas['fix:setFile'].parse(p);
      return fixes.setFile(scanId, filePath);
    },
    'fix:propose': (p) => {
      const { scanId, findingIds } = ChannelSchemas['fix:propose'].parse(p);
      return fixes.propose(scanId, findingIds);
    },
    'fix:edit': (p) => {
      const a = ChannelSchemas['fix:edit'].parse(p);
      return fixes.edit(a.sessionId, a.patch, a.edit, a.replace);
    },
    'fix:preview': async (p) => {
      if (!(await svc.chromiumPath())) throw new Error('The scan engine is not installed.');
      const { sessionId, device } = ChannelSchemas['fix:preview'].parse(p);
      return fixes.preview(sessionId, device);
    },
    'fix:apply': (p, e) => {
      const { sessionId, autoMerge } = ChannelSchemas['fix:apply'].parse(p);
      return fixes.apply(sessionId, autoMerge, win(e));
    },
    'fix:changes': (p) => fixes.changes(ChannelSchemas['fix:changes'].parse(p).scanId),
    'fix:refresh': () => fixes.refresh(),
    'fix:rescan': async (p) => ({ id: (await queue.rescan(ChannelSchemas['fix:rescan'].parse(p).scanId))! }),
    'suggest:alternatives': (p) => {
      const { scanId, findingId } = ChannelSchemas['suggest:alternatives'].parse(p);
      return fixes.alternatives(scanId, findingId);
    },
    'shell:openExternal': async (p) => {
      const { url } = ChannelSchemas['shell:openExternal'].parse(p);
      if (/^https:\/\//.test(url)) await shell.openExternal(url);
    },
  };

  for (const channel of Object.keys(handlers) as Channel[]) {
    ipcMain.handle(channel, async (e, payload) => {
      if (!isTrustedSender(e)) throw new Error('Untrusted sender');
      if (!PUBLIC.has(channel) && !svc.unlocked && (await svc.db.getProfile())) throw new Error('Locked');
      return (handlers[channel] as Handler<typeof channel>)(payload, e);
    });
  }

  return { send, fixes };
}

