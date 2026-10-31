/**
 * Fix engine in the app: connected sites, fix proposals, preview, apply (pull request, local
 * commit or a saved copy), PR status tracking and the re-scan after a fix is merged.
 */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { getMarket, type Finding, type PageType } from '@h88cro/core';
import type { SiteRow } from '@h88cro/db';
import {
  GitHubClient,
  applyEdits,
  applyLocal,
  fixBranchName,
  listLocalFiles,
  mergeProposals,
  proposeFix,
  readLocalFile,
  recheck,
  suggestFilesForPage,
  unifiedDiff,
  visibleText,
  type FixContext,
  type FixProposal,
  type ScanResult,
} from '@h88cro/engine';
import { FixLlm } from '@h88cro/llm';
import { extractPageModel, type PageModel } from '@h88cro/page-model';
import type { FixChange, FixSession, FixTarget, Site } from '../shared/ipc';
import { getSecret } from './secrets';
import { CLAUDE_KEY, type Services } from './services';

export const GITHUB_TOKEN = 'github-token';
export const GITHUB_LOGIN = 'github-login';

type Session = {
  id: string;
  scanId: string;
  target: FixTarget;
  ctx: FixContext;
  page: PageModel;
  /** Original texts by path. */
  files: Record<string, string>;
  proposals: FixProposal[];
  view: FixSession;
};

const toSite = (r: SiteRow): Site => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  urlPrefix: r.urlPrefix,
  repo: r.repo ?? undefined,
  baseBranch: r.baseBranch ?? undefined,
  localPath: r.localPath ?? undefined,
  autoMerge: r.autoMerge,
  pushBranch: r.pushBranch,
  createdAt: r.createdAt,
});

const stripH88 = (html: string) => html.replace(/\sdata-h88="[^"]*"/g, '');

export class FixService {
  private sessions = new Map<string, Session>();
  private timer?: NodeJS.Timeout;
  private rescans = new Set<string>();

  constructor(
    private readonly svc: Services,
    private readonly emit: (event: 'fix:changed', data: { scanId?: string | null }) => void,
    private readonly rescan: (scanId: string) => Promise<string>,
    private readonly renderPreview: (msg: { url: string; beforeHtml: string; afterHtml: string; focusText: string[]; device: 'mobile' | 'desktop'; outDir: string }) => Promise<{ before: string; after: string; focused: boolean }>,
    private readonly assetUrl: (path: string) => string,
  ) {}

  /** Poll open fix pull requests every minute. */
  start() {
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), 60_000);
    void this.refresh().catch(() => undefined);
  }
  stop() {
    clearInterval(this.timer);
  }

  github(): GitHubClient | undefined {
    const t = getSecret(GITHUB_TOKEN);
    return t ? new GitHubClient(t) : undefined;
  }
  private requireGithub(): GitHubClient {
    const gh = this.github();
    if (!gh) throw new Error('Connect GitHub first: Settings → GitHub.');
    return gh;
  }

  // ── Sites ────────────────────────────────────────────────────────────────
  async listSites(): Promise<Site[]> {
    return (await this.svc.db.listSites()).map(toSite);
  }

  async saveSite(input: Omit<Site, 'id' | 'createdAt'> & { id?: string }): Promise<Site> {
    const id = input.id ?? randomUUID();
    let baseBranch = input.baseBranch;
    if (input.kind === 'github') {
      const repo = await this.requireGithub().getRepo(input.repo!);
      if (!repo.canPush) throw new Error(`Your GitHub token cannot write to ${repo.fullName}. Give it Contents and Pull requests "Read and write" access to this repository.`);
      baseBranch ||= repo.defaultBranch;
    } else {
      await listLocalFiles(input.localPath!, 1);
    }
    const urlPrefix = input.urlPrefix.replace(/\/+$/, '');
    await this.svc.db.upsertSite({ id, name: input.name, kind: input.kind, urlPrefix, repo: input.repo ?? null, baseBranch: baseBranch ?? null, localPath: input.localPath ?? null, autoMerge: input.autoMerge, pushBranch: input.pushBranch });
    return toSite((await this.svc.db.getSite(id))!);
  }

  // ── Target: which file a page's fix goes to ──────────────────────────────
  private async scanInfo(scanId: string) {
    const row = await this.svc.db.getScan(scanId);
    if (!row?.result) throw new Error('Scan not found or not finished.');
    const result = row.result as Omit<ScanResult, 'findings'>;
    const req = row.request as { target: { kind: 'url'; url: string } | { kind: 'file'; path: string } };
    const snapshotPath = (await this.svc.db.listArtifacts(scanId)).find((a) => a.type === 'snapshot')?.localPath;
    const url = req.target.kind === 'url' ? (result.finalUrl ?? row.url) : row.url;
    return { row, result, req, snapshotPath, url };
  }

  private async loadFile(site: Site, path: string): Promise<string> {
    if (site.kind === 'github') return (await this.requireGithub().getFile(site.repo!, path, site.baseBranch!)).text;
    return readLocalFile(site.localPath!, path);
  }

  async target(scanId: string, suggest = true): Promise<FixTarget> {
    const { req, url } = await this.scanInfo(scanId);
    const hasClaudeKey = !!getSecret(CLAUDE_KEY);
    if (req.target.kind === 'file') return { mode: 'file', urlPath: '', filePath: req.target.path, suggestions: [], hasClaudeKey };
    const urlPath = new URL(url).pathname || '/';
    const row = await this.svc.db.siteForUrl(url);
    if (!row) return { mode: 'page', urlPath, suggestions: [], hasClaudeKey };
    const site = toSite(row);
    const filePath = await this.svc.db.getPageMap(site.id, urlPath);
    if (filePath || !suggest) return { mode: 'site', site, urlPath, filePath, suggestions: [], hasClaudeKey };
    try {
      const { snapshotPath } = await this.scanInfo(scanId);
      const html = snapshotPath ? await readFile(snapshotPath, 'utf8') : '';
      const page = extractPageModel({ html, url });
      const gh = site.kind === 'github' ? this.requireGithub() : undefined;
      const files = gh ? await gh.listFiles(site.repo!, site.baseBranch!) : await listLocalFiles(site.localPath!);
      const suggestions = await suggestFilesForPage({
        url,
        page: { title: page.title, headings: page.headings, bodyText: page.bodyText },
        files,
        load: (p) => this.loadFile(site, p),
        search: gh ? (t) => gh.searchText(site.repo!, t) : undefined,
        maxLoads: gh ? 15 : 40,
      });
      return { mode: 'site', site, urlPath, suggestions, hasClaudeKey };
    } catch (e) {
      return { mode: 'site', site, urlPath, suggestions: [], error: (e as Error).message, hasClaudeKey };
    }
  }

  async setFile(scanId: string, filePath: string): Promise<FixTarget> {
    const t = await this.target(scanId, false);
    if (t.mode !== 'site' || !t.site) throw new Error('This page is not connected to a site.');
    await this.loadFile(t.site, filePath); // must exist
    await this.svc.db.setPageMap(t.site.id, t.urlPath, filePath);
    return { ...t, filePath };
  }

  // ── Propose ──────────────────────────────────────────────────────────────
  private llm(onCost: (usd: number) => void) {
    const key = getSecret(CLAUDE_KEY);
    if (!key) return undefined;
    return this.svc.settings().then(
      (s) =>
        new FixLlm({
          apiKey: key,
          model: s.routing.analysis,
          budgetUsd: s.budgetUsd,
          log: (u) => {
            onCost(u.costUsd);
            void this.svc.db.addUsage({ model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd });
          },
        }),
    );
  }

  async propose(scanId: string, findingIds: string[]): Promise<FixSession> {
    const { row, snapshotPath, url, req } = await this.scanInfo(scanId);
    const target = await this.target(scanId, false);
    const findings = (await this.svc.db.listFindings(scanId)).filter((f) => findingIds.includes(f.id));
    if (!findings.length) throw new Error('Nothing to fix.');

    const snapshot = snapshotPath ? stripH88(await readFile(snapshotPath, 'utf8').catch(() => '')) : '';
    let path: string;
    let source: string;
    if (target.mode === 'site') {
      if (!target.filePath) throw new Error('Choose the file that renders this page first.');
      path = target.filePath;
      source = await this.loadFile(target.site!, path);
    } else if (target.mode === 'file') {
      path = (req.target as { path: string }).path;
      source = await readFile(path, 'utf8');
    } else {
      if (!snapshot) throw new Error('The saved copy of this page was cleared. Re-scan the page to fix it.');
      path = 'page.html';
      source = snapshot;
    }

    const isHtml = /\.html?$/i.test(path);
    const ctx: FixContext = {
      pageHtml: isHtml ? source : snapshot || source,
      url,
      lang: row.lang ?? undefined,
      market: getMarket(row.market ?? undefined),
      pageType: row.pageType as PageType,
      now: new Date(),
    };
    const page = extractPageModel({ html: snapshot || source, url });
    let cost = 0;
    const llm = await this.llm((c) => (cost += c));
    const settings = await this.svc.settings();

    const proposals: FixProposal[] = [];
    const items: FixSession['items'] = [];
    let text = source;
    for (const f of findings) {
      try {
        const p = await proposeFix({ finding: f, path, fileText: text, ctx, llm, uiLang: settings.uiLang, page });
        if ('error' in p) {
          items.push({ findingId: f.id, title: f.title, ok: false, error: p.error });
          continue;
        }
        text = applyEdits(text, p.patches[0]!.edits).text;
        proposals.push(p);
        items.push({ findingId: f.id, title: f.title, ok: true, source: p.source, summary: p.summary });
      } catch (e) {
        items.push({ findingId: f.id, title: f.title, ok: false, error: (e as Error).message });
      }
    }

    const id = randomUUID();
    const s: Session = { id, scanId, target, ctx, page, files: { [path]: source }, proposals, view: undefined as never };
    s.view = await this.view(s, items, cost, target.site?.autoMerge ?? false);
    this.sessions.set(id, s);
    return s.view;
  }

  private async view(s: Session, items: FixSession['items'], costUsd: number, autoMerge: boolean): Promise<FixSession> {
    const merged = s.proposals.length ? mergeProposals(s.proposals) : undefined;
    const patches: FixSession['patches'] = [];
    let after: Record<string, string> = {};
    for (const p of merged?.patches ?? []) {
      const before = s.files[p.path]!;
      const r = applyEdits(before, p.edits);
      after[p.path] = r.text;
      patches.push({ path: p.path, diff: unifiedDiff(p.path, before, r.text), edits: p.edits.map((e) => ({ find: e.find, replace: e.replace, note: e.note })), failed: r.failed.map((x) => x.reason) });
    }

    // Re-check: on the patched file when it is the page's HTML, else on the page copy with the same edits.
    let recheckView: FixSession['recheck'];
    const fixedTargets = items.filter((i) => i.ok).map((i) => ({ id: i.findingId, ruleId: i.findingId.split(':')[0]! }));
    if (merged && fixedTargets.length) {
      const path = merged.patches[0]!.path;
      let patchedPage: string | undefined;
      if (s.ctx.pageHtml === s.files[path]) patchedPage = after[path];
      else {
        const r = applyEdits(s.ctx.pageHtml, merged.patches.flatMap((p) => p.edits));
        if (!r.failed.length) patchedPage = r.text;
      }
      if (patchedPage) {
        const rc = await recheck({ ctx: s.ctx, patchedHtml: patchedPage, targets: fixedTargets });
        recheckView = { message: rc.message, verified: rc.verified, results: rc.results.map((r) => ({ findingId: r.findingId, fixed: r.fixed })), introduced: rc.introduced.map((f) => f.title) };
      } else {
        recheckView = { message: 'This file is a template, so the result will be checked by a re-scan after the change is published.', verified: false, results: [], introduced: [] };
      }
    }
    return {
      id: s.id,
      scanId: s.scanId,
      target: s.target,
      items,
      patches,
      recheck: recheckView,
      summary: merged?.summary ?? 'No changes',
      notes: merged?.notes ?? [],
      canApply: patches.some((p) => p.diff.includes('\n+') || p.diff.includes('\n-')),
      autoMerge,
      costUsd,
    };
  }

  async edit(sessionId: string, patch: number, edit: number, replace: string): Promise<FixSession> {
    const s = this.session(sessionId);
    // Edits are flattened in view order; map back to the proposal that owns them.
    const merged = mergeProposals(s.proposals);
    const target = merged.patches[patch]?.edits[edit];
    if (!target) throw new Error('Change not found.');
    for (const p of s.proposals)
      for (const fp of p.patches)
        for (const e of fp.edits)
          if (e === target) {
            e.replace = replace;
            p.source = 'manual';
          }
    s.view = await this.view(s, s.view.items, s.view.costUsd, s.view.autoMerge);
    return s.view;
  }

  private session(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error('This fix expired. Open it again.');
    return s;
  }

  private patched(s: Session): { path: string; text: string }[] {
    const merged = mergeProposals(s.proposals);
    return merged.patches.map((p) => ({ path: p.path, text: applyEdits(s.files[p.path]!, p.edits).text }));
  }

  async preview(sessionId: string, device: 'mobile' | 'desktop') {
    const s = this.session(sessionId);
    const merged = mergeProposals(s.proposals);
    const r = applyEdits(s.ctx.pageHtml, merged.patches.flatMap((p) => p.edits));
    if (r.applied === 0) throw new Error('A preview is only available when the change can be applied to the page itself. Publish it and re-scan to see it.');
    const focusText = merged.patches
      .flatMap((p) => p.edits)
      .map((e) => visibleText(e.replace))
      .filter((t) => t.length >= 4)
      .map((t) => t.split(/(?<=[.!?])\s/)[0]!.slice(0, 80));
    const out = await this.renderPreview({ url: s.ctx.url, beforeHtml: s.ctx.pageHtml, afterHtml: r.text, focusText, device, outDir: join(this.svc.scansDir, s.scanId, 'fix-preview', s.id) });
    return { before: this.assetUrl(out.before) + `?t=${Date.now()}`, after: this.assetUrl(out.after) + `?t=${Date.now()}`, focused: out.focused };
  }

  // ── Apply ────────────────────────────────────────────────────────────────
  async apply(sessionId: string, autoMergeOverride: boolean | undefined, win?: BrowserWindow): Promise<FixChange> {
    const s = this.session(sessionId);
    const files = this.patched(s);
    if (!files.length) throw new Error('There is nothing to apply.');
    const summary = s.view.summary;
    const findingIds = s.view.items.filter((i) => i.ok).map((i) => i.findingId);
    const findingList = s.view.items.filter((i) => i.ok).map((i) => `- ${i.title}${i.summary ? `: ${i.summary}` : ''}`).join('\n');
    const id = randomUUID();
    const base = { id, scanId: s.scanId, findingIds, summary, siteId: s.target.site?.id ?? null };

    if (s.target.mode === 'page' || s.target.mode === 'file') {
      const isFile = s.target.mode === 'file';
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        title: 'Save the fixed page',
        defaultPath: isFile ? s.target.filePath!.replace(/(\.html?)$/i, '-fixed$1') : 'page-fixed.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (canceled || !filePath) throw new Error('Not saved.');
      await writeFile(filePath, files[0]!.text, 'utf8');
      await this.svc.db.addFixChange({ ...base, kind: 'file', state: 'saved', url: null, message: `Saved to ${filePath}` });
    } else if (s.target.site!.kind === 'github') {
      const site = s.target.site!;
      const gh = this.requireGithub();
      const branch = fixBranchName(summary);
      const body = [
        `Fixes from an H88CRO scan of ${s.ctx.url}`,
        '',
        findingList,
        '',
        s.view.recheck ? `Re-check before publishing: ${s.view.recheck.message}` : '',
        s.view.notes.length ? `\nNotes:\n${s.view.notes.map((n) => `- ${n}`).join('\n')}` : '',
      ].join('\n');
      const pr = await gh.openFixPr({ fullName: site.repo!, base: site.baseBranch!, branch, files, message: `${summary}\n\n${findingList}`, title: `H88CRO: ${summary}`, body });
      let state = 'open';
      let message = 'Pull request opened.';
      if (autoMergeOverride ?? site.autoMerge) {
        const m = await gh.mergePr(site.repo!, pr.number, `H88CRO: ${summary}`);
        state = m.merged ? 'merged' : m.autoMerge ? 'auto-merge' : 'open';
        message = m.message;
      }
      await this.svc.db.addFixChange({ ...base, kind: 'pr', prNumber: pr.number, url: pr.url, branch, state, message });
      if (state === 'merged') this.scheduleRescan(id, s.scanId);
    } else {
      const site = s.target.site!;
      const branch = fixBranchName(summary);
      const r = await applyLocal({ root: site.localPath!, branch, files, message: `${summary}\n\n${findingList}`, push: site.pushBranch });
      await this.svc.db.addFixChange({ ...base, kind: 'local', branch: r.branch ?? null, state: r.branch ? 'committed' : 'saved', message: r.message });
    }
    this.sessions.delete(sessionId);
    this.emit('fix:changed', { scanId: s.scanId });
    return toChange((await this.svc.db.listFixChanges([s.scanId])).find((c) => c.id === id)!);
  }

  async changes(scanId: string): Promise<FixChange[]> {
    return (await this.svc.db.listFixChanges([scanId])).map(toChange);
  }

  /** Update open pull requests; re-scan the page a few minutes after one is merged. */
  async refresh() {
    const open = await this.svc.db.openFixPrs();
    if (!open.length) return;
    const gh = this.github();
    if (!gh) return;
    for (const c of open) {
      const site = c.siteId ? await this.svc.db.getSite(c.siteId) : undefined;
      if (!site?.repo || !c.prNumber) continue;
      try {
        const pr = await gh.getPr(site.repo, c.prNumber);
        const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : c.state;
        if (state !== c.state) {
          await this.svc.db.updateFixChange(c.id, { state, message: pr.merged ? 'Merged. Re-scanning the page after the site deploys.' : pr.state === 'closed' ? 'Closed without merging.' : c.message });
          if (pr.merged) this.scheduleRescan(c.id, c.scanId!);
          this.emit('fix:changed', { scanId: c.scanId });
        }
      } catch {
        /* try again next time */
      }
    }
  }

  /** Give the host (Netlify, Vercel, Pages…) a few minutes to deploy, then re-scan. */
  private scheduleRescan(changeId: string, scanId: string, delayMs = 3 * 60_000) {
    if (this.rescans.has(changeId)) return;
    this.rescans.add(changeId);
    setTimeout(async () => {
      try {
        const id = await this.rescan(scanId);
        await this.svc.db.updateFixChange(changeId, { rescanId: id, message: 'Merged and re-scanned.' });
        this.emit('fix:changed', { scanId });
      } catch {
        /* the user can re-scan by hand */
      }
    }, delayMs);
  }

  async alternatives(scanId: string, findingId: string) {
    const key = getSecret(CLAUDE_KEY);
    const f = (await this.svc.db.listFindings(scanId)).find((x) => x.id === findingId);
    if (!f) throw new Error('Finding not found.');
    if (!key) return { alternatives: fallbackAlternatives(f), error: 'Add a Claude API key in Settings to get rewrites written for this page.' };
    const { row, snapshotPath, url } = await this.scanInfo(scanId);
    const html = snapshotPath ? await readFile(snapshotPath, 'utf8').catch(() => '') : '';
    const page = extractPageModel({ html, url });
    const needle = f.evidence.find((e) => e.textExcerpt)?.textExcerpt?.slice(0, 40);
    const at = needle ? page.bodyText.indexOf(needle) : -1;
    const context = at >= 0 ? page.bodyText.slice(Math.max(0, at - 1500), at + 3000) : page.bodyText.slice(0, 4500);
    const llm = (await this.llm(() => undefined))!;
    const settings = await this.svc.settings();
    try {
      const alternatives = await llm.suggestAlternatives({ finding: f, context, market: getMarket(row.market ?? undefined), lang: row.lang ?? undefined, uiLang: settings.uiLang });
      return { alternatives };
    } catch (e) {
      return { alternatives: fallbackAlternatives(f), error: (e as Error).message };
    }
  }
}

function fallbackAlternatives(f: Finding) {
  return (f.suggestedCopy ?? []).map((c) => ({ text: c.text, why: 'Suggested by the scan.', translationForReviewer: c.translationForReviewer ?? '' }));
}

const toChange = (c: Awaited<ReturnType<Services['db']['listFixChanges']>>[number]): FixChange => ({
  id: c.id,
  findingIds: c.findingIds,
  summary: c.summary,
  kind: c.kind,
  url: c.url,
  prNumber: c.prNumber,
  branch: c.branch,
  state: c.state,
  message: c.message,
  createdAt: c.createdAt,
  rescanId: c.rescanId,
});
