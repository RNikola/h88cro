/**
 * Headless scan from the command line (dev/QA tool; the desktop app uses the same engine).
 *   pnpm scan <url | path/to/file.html> [--market fr-FR] [--type toplist] [--static] [--lighthouse] [--pdf] [--out dir]
 * Uses ANTHROPIC_API_KEY for the Claude passes when set, and H88CRO_CHROMIUM_PATH for the browser.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PAGE_TYPES, type PageType } from '@h88cro/core';
import { exportPdf, findingsToCsv, renderReportHtml, scan } from './index.js';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--') ) ?? args[0];
if (!target) {
  console.error('Usage: pnpm scan <url|file> [--market fr-FR] [--type toplist] [--static] [--lighthouse] [--pdf] [--out dir]');
  process.exit(1);
}
const pageType = (opt('type') ?? 'toplist') as PageType;
if (!PAGE_TYPES.includes(pageType)) throw new Error(`--type must be one of ${PAGE_TYPES.join(', ')}`);
const outDir = resolve(opt('out') ?? '.scan-output');
await mkdir(outDir, { recursive: true });
const isFile = existsSync(target);

const result = await scan(
  {
    target: isFile ? { kind: 'file', path: resolve(target) } : { kind: 'url', url: target },
    marketId: opt('market'),
    devices: ['mobile', 'desktop'],
    pageType,
    render: !flag('static'),
    lighthouse: flag('lighthouse'),
    outDir,
    chromiumPath: process.env.H88CRO_CHROMIUM_PATH || undefined,
    llm: process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : undefined,
    languageTool: process.env.H88CRO_LANGUAGETOOL_URL ? { url: process.env.H88CRO_LANGUAGETOOL_URL } : undefined,
  },
  (p) => console.error(`[${p.pct}%] ${p.message}`),
);

await writeFile(join(outDir, 'report.json'), JSON.stringify(result, null, 2));
await writeFile(join(outDir, 'findings.csv'), findingsToCsv(result.findings));
await writeFile(join(outDir, 'report.html'), await renderReportHtml(result));
if (flag('pdf')) await exportPdf(result, join(outDir, 'report.pdf'), process.env.H88CRO_CHROMIUM_PATH || undefined);

console.log(`\nOverall score: ${result.scores.overall}/100  (market ${result.marketId ?? '?'}, ${result.findings.length} findings)`);
for (const m of result.scores.modules) console.log(`  ${m.module.padEnd(12)} ${String(m.score).padStart(3)}  (${m.findingCount})`);
console.log('\nFix these first:');
for (const id of result.priority) {
  const f = result.findings.find((x) => x.id === id)!;
  console.log(`  [${f.severity}] ${f.title}`);
}
if (result.warnings.length) console.log(`\nWarnings:\n  ${result.warnings.join('\n  ')}`);
console.log(`\nReport written to ${outDir}`);
