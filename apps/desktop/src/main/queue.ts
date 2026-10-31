import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Notification, utilityProcess, type UtilityProcess } from 'electron';
import PQueue from 'p-queue';
import type { ScanRequest, ScanResult } from '@h88cro/engine';
import type { StartScanInput } from '../shared/ipc';
import { CLAUDE_KEY, type Services } from './services';
import { getSecret } from './secrets';

type Emit = (event: 'scan:progress' | 'scan:updated', data: unknown) => void;

/** What we persist for a queued scan (never includes secrets). */
type StoredRequest = Omit<ScanRequest, 'llm' | 'now' | 'chromiumPath' | 'languageTool'> & { useClaude: boolean; deep: boolean };

export function workerPath() {
  return join(import.meta.dirname, 'scan-worker.js');
}

/**
 * In-process job queue (p-queue) with persistence in SQLite. Each scan runs in its own
 * utilityProcess, so it can be cancelled by killing the process.
 */
export class ScanQueue {
  private queue: PQueue;
  private running = new Map<string, UtilityProcess>();
  readonly progress = new Map<string, { pct: number; message: string }>();

  constructor(private readonly svc: Services, private readonly emit: Emit) {
    this.queue = new PQueue({ concurrency: 1 });
  }

  setConcurrency(n: number) {
    this.queue.concurrency = n;
  }

  /** Re-queue scans that were queued or running when the app closed. */
  async resume() {
    for (const s of await this.svc.db.listScans(200)) {
      if (s.status === 'queued' || s.status === 'running') {
        await this.svc.db.updateScan(s.id, { status: 'queued' });
        this.enqueue(s.id);
      }
    }
  }

  async start(input: StartScanInput): Promise<string[]> {
    const ids: string[] = [];
    const settings = await this.svc.settings();
    for (const target of input.targets) {
      const id = randomUUID();
      const stored: StoredRequest = {
        target,
        marketId: input.marketId,
        devices: input.devices,
        pageType: input.pageType,
        render: true,
        lighthouse: input.lighthouse && target.kind === 'url',
        outDir: join(this.svc.scansDir, id),
        staleDateDays: settings.staleDateDays,
        useClaude: input.useClaude,
        deep: input.deep,
      };
      await this.svc.db.insertScan({
        id,
        url: target.kind === 'url' ? target.url : `file://${target.path}`,
        status: 'queued',
        devices: input.devices,
        pageType: input.pageType,
        market: input.marketId,
        request: stored,
      });
      ids.push(id);
      this.enqueue(id);
    }
    return ids;
  }

  /** Scan the same page again with the same options (e.g. after a fix was published). */
  async rescan(fromId: string): Promise<string | undefined> {
    const row = await this.svc.db.getScan(fromId);
    if (!row) return undefined;
    const r = row.request as StoredRequest;
    const [id] = await this.start({ targets: [r.target], marketId: r.marketId, devices: r.devices, pageType: r.pageType as StartScanInput['pageType'], deep: r.deep ?? false, lighthouse: r.lighthouse, useClaude: r.useClaude ?? false });
    return id;
  }

  async cancel(id: string) {
    const proc = this.running.get(id);
    if (proc) proc.kill();
    await this.svc.db.updateScan(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
    this.emit('scan:updated', { id, status: 'cancelled' });
  }

  private enqueue(id: string) {
    void this.queue.add(() => this.run(id));
  }

  private async run(id: string): Promise<void> {
    const row = await this.svc.db.getScan(id);
    if (!row || row.status !== 'queued') return;
    const stored = row.request as StoredRequest;
    const settings = await this.svc.settings();
    const apiKey = stored.useClaude ? getSecret(CLAUDE_KEY) : undefined;
    const { useClaude: _u, deep, ...base } = stored;
    const request: ScanRequest = {
      ...base,
      chromiumPath: await this.svc.chromiumPath(),
      llm: apiKey ? { apiKey, deep, budgetUsd: settings.budgetUsd, uiLang: settings.uiLang, routing: settings.routing } : undefined,
      languageTool: settings.languageToolUrl ? { url: settings.languageToolUrl } : undefined,
    };

    await this.svc.db.updateScan(id, { status: 'running', startedAt: new Date().toISOString() });
    this.emit('scan:updated', { id, status: 'running' });

    return new Promise<void>((resolve) => {
      const proc = utilityProcess.fork(workerPath(), [], { serviceName: 'h88cro-scan', stdio: 'inherit' });
      this.running.set(id, proc);
      let finished = false;
      const finish = async (status: 'done' | 'failed', patch: Parameters<Services['db']['updateScan']>[1] = {}) => {
        if (finished) return;
        finished = true;
        this.running.delete(id);
        this.progress.delete(id);
        const current = await this.svc.db.getScan(id);
        if (current?.status !== 'cancelled') {
          await this.svc.db.updateScan(id, { status, finishedAt: new Date().toISOString(), ...patch });
          this.emit('scan:updated', { id, status });
        }
        proc.kill();
        resolve();
      };

      proc.on('message', (msg: { type: string; id?: string; pct?: number; message?: string; result?: ScanResult }) => {
        if (msg.type === 'progress') {
          const p = { pct: msg.pct ?? 0, message: msg.message ?? '' };
          this.progress.set(id, p);
          this.emit('scan:progress', { id, ...p });
        } else if (msg.type === 'done' && msg.result) {
          void this.save(id, msg.result).then(() => finish('done'));
          if (Notification.isSupported()) new Notification({ title: 'Scan finished', body: `${msg.result.title ?? msg.result.url}: ${msg.result.scores.overall}/100` }).show();
        } else if (msg.type === 'error') {
          void finish('failed', { error: msg.message });
        }
      });
      proc.on('exit', (code) => {
        // The worker is killed after a successful save; only treat an early exit as a failure.
        setTimeout(() => void finish('failed', { error: `Scan worker exited (code ${code})` }), 500);
      });
      proc.postMessage({ type: 'scan', id, request });
    });
  }

  private async save(id: string, r: ScanResult) {
    const { findings, ...rest } = r;
    await this.svc.db.updateScan(id, {
      title: r.title,
      market: r.marketId,
      lang: r.lang,
      overallScore: r.scores.overall,
      scores: r.scores,
      result: rest,
      llmCostUsd: r.llmCostUsd,
    });
    this.svc.db.insertFindings(id, findings);
    for (const s of r.screenshots) await this.svc.db.addArtifact(id, `screenshot-${s.device}-${s.kind}`, s.path);
    if (r.snapshotPath) await this.svc.db.addArtifact(id, 'snapshot', r.snapshotPath);
    if (r.llmCostUsd > 0) await this.svc.db.addUsage({ scanId: id, model: 'mixed', inputTokens: 0, outputTokens: 0, costUsd: r.llmCostUsd });
  }
}
