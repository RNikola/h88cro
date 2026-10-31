import type { Finding, MarketProfile, PageType } from '@h88cro/core';
import { getMarket } from '@h88cro/core';
import type { FixLlm } from '@h88cro/llm';
import { extractPageModel, type PageModel } from '@h88cro/page-model';
import { runAnalyzers } from '../analyze.js';
import { applyEdits, unifiedDiff } from './apply.js';
import { builtinFix, hasBuiltinFix } from './builtin.js';
import type { Edit, FixContext, FixProposal, RecheckResult } from './types.js';

export * from './types.js';
export { applyEdits, unifiedDiff } from './apply.js';
export { hasBuiltinFix, builtinFix, BUILTIN_FIXERS } from './builtin.js';

const SERIOUS = new Set(['critical', 'high']);

/** Run the static (non-rendered) checks on an HTML string. Used to verify a fix before it ships. */
export async function analyzeHtml(opts: { html: string; url: string; lang?: string; market?: MarketProfile; pageType: PageType; now: Date; staleDateDays?: number }) {
  const page = extractPageModel({ html: opts.html, url: opts.url, isLocalFile: opts.url.startsWith('file:') });
  const { findings } = await runAnalyzers({
    page,
    market: opts.market,
    lang: opts.lang,
    pageType: opts.pageType,
    now: opts.now,
    options: { staleDateDays: opts.staleDateDays ?? 45 },
  });
  return { page, findings };
}

export type ProposeOptions = {
  finding: Finding;
  /** The file to change: repo path (or the page itself, e.g. "index.html") and its current text. */
  path: string;
  fileText: string;
  ctx: FixContext;
  /** Needed for findings without a built-in fixer, or when the built-in fixer cannot find its target. */
  llm?: FixLlm;
  uiLang?: string;
  /** Page model of ctx.pageHtml, if already built. */
  page?: PageModel;
};

/** A fix for one finding: the built-in fixer first, then Claude. Never applies anything. */
export async function proposeFix(o: ProposeOptions): Promise<FixProposal | { error: string }> {
  const page = o.page ?? extractPageModel({ html: o.ctx.pageHtml, url: o.ctx.url });
  if (hasBuiltinFix(o.finding.ruleId)) {
    const b = builtinFix(o.finding, o.fileText, page, o.ctx);
    if (b && b.edits.length && applyEdits(o.fileText, b.edits).failed.length === 0) {
      return { findingIds: [o.finding.id], source: 'builtin', summary: b.summary, patches: [{ path: o.path, edits: b.edits }], notes: b.notes ?? [] };
    }
  }
  if (!o.llm) {
    return {
      error: hasBuiltinFix(o.finding.ruleId)
        ? 'The automatic fix could not find this text in the file. Add a Claude API key in Settings to let Claude write the change.'
        : 'This issue needs Claude to write the change. Add a Claude API key in Settings.',
    };
  }
  const r = await o.llm.fixEdits({
    finding: o.finding,
    path: o.path,
    fileText: o.fileText,
    market: o.ctx.market,
    lang: o.ctx.lang,
    uiLang: o.uiLang,
  });
  if (!r) return { error: 'Claude did not return a fix. Try again, or edit the change by hand.' };
  if (!r.edits.length) return { error: r.notes.join(' ') || 'Claude could not fix this in the chosen file.' };
  const edits: Edit[] = r.edits.map((e) => ({ find: e.find, replace: e.replace }));
  const check = applyEdits(o.fileText, edits);
  const notes = [...r.notes];
  if (check.failed.length) notes.push(`${check.failed.length} of ${edits.length} edits do not match the file and will be skipped.`);
  return { findingIds: [o.finding.id], source: 'claude', summary: r.summary, patches: [{ path: o.path, edits }], notes };
}

/** Apply a proposal to file texts. Returns the new texts and a diff per file. */
export function applyProposal(files: Record<string, string>, p: FixProposal) {
  const out: Record<string, { before: string; after: string; diff: string; applied: number; failed: string[] }> = {};
  for (const patch of p.patches) {
    const before = out[patch.path]?.after ?? files[patch.path];
    if (before === undefined) {
      out[patch.path] = { before: '', after: '', diff: '', applied: 0, failed: ['File not loaded.'] };
      continue;
    }
    const r = applyEdits(before, patch.edits);
    out[patch.path] = {
      before: files[patch.path]!,
      after: r.text,
      diff: unifiedDiff(patch.path, files[patch.path]!, r.text),
      applied: r.applied,
      failed: r.failed.map((f) => f.reason),
    };
  }
  return out;
}

/** Merge several proposals for the same files into one (batch fix). Edits apply in order. */
export function mergeProposals(ps: FixProposal[]): FixProposal {
  const byPath = new Map<string, Edit[]>();
  for (const p of ps) for (const patch of p.patches) byPath.set(patch.path, [...(byPath.get(patch.path) ?? []), ...patch.edits]);
  return {
    findingIds: ps.flatMap((p) => p.findingIds),
    source: ps.every((p) => p.source === 'builtin') ? 'builtin' : ps.some((p) => p.source === 'manual') ? 'manual' : 'claude',
    summary: ps.length === 1 ? ps[0]!.summary : `Fix ${ps.length} issues`,
    patches: [...byPath].map(([path, edits]) => ({ path, edits })),
    notes: ps.flatMap((p) => p.notes),
  };
}

/**
 * Check a patched page against the original with the static checks.
 * A finding counts as fixed when it was found in the original HTML and is gone from the patched HTML.
 * Findings the static checks cannot see (layout, speed, Claude) are reported as "verify after publishing".
 */
export async function recheck(o: { ctx: FixContext; patchedHtml: string; targets: Pick<Finding, 'id' | 'ruleId'>[] }): Promise<RecheckResult> {
  const base = { url: o.ctx.url, lang: o.ctx.lang, market: o.ctx.market ?? (o.ctx.lang ? getMarket(o.ctx.lang) : undefined), pageType: o.ctx.pageType, now: o.ctx.now };
  const [before, after] = await Promise.all([analyzeHtml({ ...base, html: o.ctx.pageHtml }), analyzeHtml({ ...base, html: o.patchedHtml })]);
  const beforeIds = new Set(before.findings.map((f) => f.id));
  const afterIds = new Set(after.findings.map((f) => f.id));
  const countBy = (fs: Finding[], rule: string) => fs.filter((f) => f.ruleId === rule).length;

  const results = o.targets.map((t) => {
    if (!beforeIds.has(t.id)) {
      // Rule may be keyed differently in a static pass; fall back to the rule's count.
      const b = countBy(before.findings, t.ruleId);
      return { findingId: t.id, ruleId: t.ruleId, fixed: b > 0 ? countBy(after.findings, t.ruleId) < b || undefined : undefined };
    }
    return { findingId: t.id, ruleId: t.ruleId, fixed: !afterIds.has(t.id) };
  });
  const introduced = after.findings.filter((f) => !beforeIds.has(f.id) && SERIOUS.has(f.severity) && countBy(after.findings, f.ruleId) > countBy(before.findings, f.ruleId));
  const fixed = results.filter((r) => r.fixed === true).length;
  const open = results.filter((r) => r.fixed === false).length;
  const unknown = results.length - fixed - open;
  const parts = [`${fixed} of ${results.length} fixed`];
  if (open) parts.push(`${open} still present`);
  if (unknown) parts.push(`${unknown} can only be checked after publishing`);
  if (introduced.length) parts.push(`${introduced.length} new serious issue${introduced.length > 1 ? 's' : ''}`);
  return { results, introduced, verified: open === 0 && introduced.length === 0 && fixed > 0, message: parts.join(', ') + '.' };
}

/** Find source files that likely render a page: rank by how many distinctive page strings each contains. */
export function rankFilesForPage(page: Pick<PageModel, 'title' | 'headings'> & { bodyText: string }, files: { path: string; text: string }[], limit = 5) {
  const probes = [page.title, ...page.headings.map((h) => h.text)]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.length >= 12)
    .slice(0, 20);
  const scored = files
    .map((f) => ({ path: f.path, score: probes.reduce((n, p) => n + (f.text.includes(p) || f.text.includes(escapeHtml(p)) ? 1 : 0), 0) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return scored.slice(0, limit).map((s) => ({ path: s.path, score: probes.length ? s.score / probes.length : 0 }));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export { renderFixPreview, visibleText } from './preview.js';
