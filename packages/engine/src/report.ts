import { readFile } from 'node:fs/promises';
import { MODULE_LABELS, POSSIBLE_CONFIDENCE_THRESHOLD, SEVERITIES, type Finding } from '@h88cro/core';
import type { ScanResult } from './types.js';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SEV_COLOR: Record<string, string> = { critical: '#d92d20', high: '#f79009', medium: '#2e90fa', low: '#667085' };

export function findingsToCsv(findings: Finding[]): string {
  const cols = ['id', 'module', 'ruleId', 'severity', 'title', 'explanation', 'suggestion', 'evidence', 'effort', 'impact', 'confidence', 'source'] as const;
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = findings.map((f) =>
    cols
      .map((c) =>
        c === 'evidence'
          ? cell(f.evidence.map((e) => [e.selector, e.textExcerpt, e.metric && `${e.metric.name}=${e.metric.value} (target ${e.metric.target})`].filter(Boolean).join(' | ')).join(' || '))
          : cell(f[c]),
      )
      .join(','),
  );
  return `﻿${cols.join(',')}\n${rows.join('\n')}\n`;
}

export type FindingDiff = { added: Finding[]; resolved: Finding[]; unchanged: Finding[]; scoreDelta: number };

/** Diff vs the previous scan of the same URL. Finding ids are stable across scans. */
export function diffScans(prev: ScanResult, curr: ScanResult): FindingDiff {
  const prevIds = new Set(prev.findings.map((f) => f.id));
  const currIds = new Set(curr.findings.map((f) => f.id));
  return {
    added: curr.findings.filter((f) => !prevIds.has(f.id)),
    resolved: prev.findings.filter((f) => !currIds.has(f.id)),
    unchanged: curr.findings.filter((f) => prevIds.has(f.id)),
    scoreDelta: curr.scores.overall - prev.scores.overall,
  };
}

/** Self-contained HTML report (used for the PDF export and for sharing). */
export async function renderReportHtml(r: ScanResult, opts: { embedScreenshots?: boolean } = {}): Promise<string> {
  const shots: string[] = [];
  if (opts.embedScreenshots !== false) {
    for (const s of r.screenshots.filter((s) => s.kind === 'fold')) {
      try {
        const b64 = (await readFile(s.path)).toString('base64');
        shots.push(`<figure><img src="data:image/png;base64,${b64}" alt="${esc(s.device)} screenshot"><figcaption>${esc(s.device)}</figcaption></figure>`);
      } catch {
        /* screenshot missing */
      }
    }
  }
  const byId = new Map(r.findings.map((f) => [f.id, f]));
  const sev = (f: Finding) => `<span class="sev" style="background:${SEV_COLOR[f.severity]}">${esc(f.severity)}</span>`;
  const card = (f: Finding) => `
    <article class="finding">
      <h4>${sev(f)} ${esc(f.title)}${f.source === 'llm' && f.confidence < POSSIBLE_CONFIDENCE_THRESHOLD ? ' <em>(possible)</em>' : ''}</h4>
      <p>${esc(f.explanation)}</p>
      <p><strong>Suggestion:</strong> ${esc(f.suggestion)}</p>
      ${f.suggestedCopy?.length ? `<p><strong>Suggested copy:</strong> ${f.suggestedCopy.map((c) => `<code>${esc(c.text)}</code>${c.translationForReviewer ? ` <span class="muted">(${esc(c.translationForReviewer)})</span>` : ''}`).join(', ')}</p>` : ''}
      ${f.evidence.length ? `<ul class="evidence">${f.evidence.slice(0, 4).map((e) => `<li>${e.textExcerpt ? `“${esc(e.textExcerpt)}”` : ''} ${e.selector ? `<code>${esc(e.selector)}</code>` : ''} ${e.metric ? `${esc(e.metric.name)}: ${e.metric.value} (target ${e.metric.target})` : ''}</li>`).join('')}</ul>` : ''}
      <p class="muted">Effort ${esc(f.effort)} · impact ${f.impact}/5 · ${esc(f.source)} · ${esc(f.ruleId)}</p>
    </article>`;
  const modules = r.scores.modules
    .map((m) => `<div class="mod"><div class="score">${m.score}</div><div>${esc(MODULE_LABELS[m.module])}</div><div class="muted">${m.findingCount} findings</div></div>`)
    .join('');
  const sections = r.modulesRun
    .map((m) => {
      const fs = r.findings.filter((f) => f.module === m).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
      return `<section><h3>${esc(MODULE_LABELS[m])} (${fs.length})</h3>${fs.map(card).join('') || '<p class="muted">No issues found.</p>'}</section>`;
    })
    .join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>H88CRO report – ${esc(r.title ?? r.url)}</title>
<style>
body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#101828;margin:32px;}
h1{font-size:22px;margin:0}h2{margin-top:28px}h3{border-bottom:2px solid #7c3aed;padding-bottom:4px;margin-top:28px}
.top{display:flex;gap:24px;align-items:center}.overall{font-size:48px;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;color:transparent}
.mods{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:16px}.mod{border:1px solid #e4e7ec;border-radius:8px;padding:8px;text-align:center}.score{font-size:20px;font-weight:700}
.finding{border:1px solid #e4e7ec;border-radius:8px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}.finding h4{margin:0 0 6px}
.sev{color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;text-transform:uppercase;margin-right:6px}
.muted{color:#667085;font-size:12px}code{background:#f2f4f7;padding:1px 4px;border-radius:3px;font-size:11px;word-break:break-all}
.shots{display:flex;gap:16px}.shots img{max-height:420px;border:1px solid #e4e7ec;border-radius:6px}figure{margin:0}
ol li{margin:4px 0}
</style></head><body>
<div class="top"><div class="overall">${r.scores.overall}</div><div><h1>${esc(r.title ?? r.url)}</h1>
<div class="muted">${esc(r.url)}<br>Market ${esc(r.marketId ?? 'unknown')} · ${esc(r.pageType)} · scanned ${esc(new Date(r.finishedAt).toLocaleString('en-GB'))} · H88CRO ${esc(r.engineVersion)}</div></div></div>
<div class="mods">${modules}</div>
${shots.length ? `<h2>First screen</h2><div class="shots">${shots.join('')}</div>` : ''}
<h2>Fix these first</h2><ol>${r.priority.map((id) => byId.get(id)).filter(Boolean).map((f) => `<li>${sev(f!)} ${esc(f!.title)}</li>`).join('')}</ol>
${sections}
</body></html>`;
}
