import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectMarket, getMarket, priorityList, scoreReport, type Finding } from '@h88cro/core';
import { LlmEngine } from '@h88cro/llm';
import { extractPageModel, type PerfMetrics } from '@h88cro/page-model';
import { runAnalyzers, dedupe } from './analyze.js';
import { languageToolCheck } from './languagetool.js';
import { runLighthouse } from './lighthouse.js';
import { renderPage, type RenderOutput } from './render.js';
import type { ScanProgress, ScanRequest, ScanResult } from './types.js';

export const ENGINE_VERSION = '0.1.0';

export async function scan(req: ScanRequest, onProgress: (p: ScanProgress) => void = () => {}): Promise<ScanResult> {
  const startedAt = new Date();
  const warnings: string[] = [];
  const url = req.target.kind === 'url' ? req.target.url : pathToFileURL(req.target.path).toString();
  const isLocalFile = req.target.kind === 'file';

  // 1. Render (or read the file statically).
  let rendered: RenderOutput | undefined;
  let html: string;
  if (req.render) {
    onProgress({ stage: 'render', message: `Rendering ${req.devices.join(' + ')}…`, pct: 5 });
    rendered = await renderPage({ target: req.target, devices: req.devices, outDir: req.outDir, executablePath: req.chromiumPath });
    warnings.push(...rendered.warnings);
    if (rendered.unstyled) {
      warnings.push(
        `The page's stylesheet did not load, so it rendered without its styles. Layout and above-the-fold checks were skipped. For a saved page, save it as "Webpage, Complete" or scan the live URL.`,
      );
    }
    html = rendered.html;
  } else if (req.target.kind === 'file') {
    html = await readFile(req.target.path, 'utf8');
  } else {
    onProgress({ stage: 'render', message: 'Fetching HTML…', pct: 5 });
    const res = await fetch(req.target.url, { redirect: 'follow', headers: { 'user-agent': 'H88CRO/0.1 (+desktop audit)' } });
    html = await res.text();
    warnings.push('Static scan: page was not rendered, so screenshots and layout checks were skipped.');
  }

  // 2. Page model.
  onProgress({ stage: 'extract', message: 'Building the page model…', pct: 35 });
  const page = extractPageModel({
    html,
    url: rendered?.finalUrl ?? url,
    isLocalFile,
    layout: rendered && !rendered.unstyled ? rendered.layout : undefined,
    responseHeaders: rendered?.responseHeaders,
    statusCode: rendered?.statusCode,
  });

  const guess = detectMarket({ htmlLang: page.htmlLang, url: isLocalFile ? undefined : page.url, text: page.bodyText.slice(0, 5000) });
  const market = getMarket(req.marketId ?? guess.marketId);
  const lang = req.lang ?? guess.lang ?? market?.languages[0];

  // 3. Lighthouse (URLs only).
  let perf: PerfMetrics[] = [];
  if (req.lighthouse && !isLocalFile && req.render) {
    onProgress({ stage: 'lighthouse', message: 'Measuring speed with Lighthouse…', pct: 45 });
    try {
      perf = await runLighthouse(page.url, req.devices, req.chromiumPath);
    } catch (e) {
      warnings.push(`Lighthouse failed: ${(e as Error).message}`);
    }
  }

  // 4. Deterministic analyzers.
  onProgress({ stage: 'analyze', message: 'Running checks…', pct: 60 });
  const ctx = { page, market, lang, pageType: req.pageType, now: req.now ?? new Date(), perf, options: { staleDateDays: req.staleDateDays ?? 45 } };
  const det = await runAnalyzers(ctx);
  warnings.push(...det.errors);
  let findings: Finding[] = det.findings;

  // 5. LanguageTool (optional).
  if (req.languageTool && lang) {
    onProgress({ stage: 'languagetool', message: 'Checking spelling and grammar…', pct: 68 });
    try {
      findings.push(...(await languageToolCheck(page, { ...req.languageTool, lang: market?.id.startsWith(lang) ? market.id : lang })));
    } catch (e) {
      warnings.push(`LanguageTool unavailable: ${(e as Error).message}`);
    }
  }

  // 6. Claude passes (optional; needs a key).
  let llmCostUsd = 0;
  if (req.llm?.apiKey) {
    onProgress({ stage: 'llm', message: 'Claude is reviewing language, facts and the first screen…', pct: 75 });
    const llm = new LlmEngine({ apiKey: req.llm.apiKey, deep: req.llm.deep, budgetUsd: req.llm.budgetUsd, uiLang: req.llm.uiLang, routing: req.llm.routing });
    const shots = await Promise.all(
      (rendered?.screenshots ?? [])
        .filter((s) => s.kind === 'fold')
        .map(async (s) => ({ device: s.device, pngBase64: (await readFile(s.path)).toString('base64') })),
    );
    const results = await Promise.allSettled([
      llm.languagePass(page, market, lang),
      llm.consistencyPass(page, market, lang),
      rendered?.unstyled ? Promise.resolve([]) : llm.aboveFoldVision(page, market, lang, shots),
    ]);
    for (const r of results) {
      if (r.status === 'fulfilled') findings.push(...r.value);
      else warnings.push(`Claude check failed: ${(r.reason as Error).message}`);
    }
    llmCostUsd = llm.budget.spentUsd;
  }

  // 7. Score.
  onProgress({ stage: 'score', message: 'Scoring…', pct: 95 });
  findings = dedupe(findings);
  const scores = scoreReport(findings, det.modulesRun, { pageType: req.pageType });
  const priority = priorityList(findings, 10).map((f) => f.id);

  const result: ScanResult = {
    id: randomUUID(),
    url: req.target.kind === 'url' ? req.target.url : url,
    finalUrl: rendered?.finalUrl,
    isLocalFile,
    title: page.title,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    marketId: market?.id,
    marketSignals: guess.signals,
    lang,
    pageType: req.pageType,
    devices: req.devices,
    scores,
    findings,
    priority,
    modulesRun: det.modulesRun,
    screenshots: rendered?.screenshots ?? [],
    snapshotPath: rendered ? join(req.outDir, 'snapshot.html') : undefined,
    perf,
    warnings,
    llmCostUsd,
    engineVersion: ENGINE_VERSION,
  };
  onProgress({ stage: 'done', message: 'Done', pct: 100 });
  return result;
}
