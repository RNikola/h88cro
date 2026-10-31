import type { Device, Finding, ModuleId, PageType, ScoreSummary } from '@h88cro/core';
import type { PerfMetrics } from '@h88cro/page-model';
import type { RenderTarget } from './render.js';

export type ScanRequest = {
  target: RenderTarget;
  /** Market id like 'fr-FR'. Auto-detected when omitted. */
  marketId?: string;
  lang?: string;
  devices: Device[];
  pageType: PageType;
  /** Render in headless Chromium (screenshots, layout). When false, the HTML is analysed statically. */
  render: boolean;
  lighthouse: boolean;
  /** Directory for screenshots and the HTML snapshot. */
  outDir: string;
  chromiumPath?: string;
  staleDateDays?: number;
  now?: Date;
  llm?: { apiKey: string; deep?: boolean; budgetUsd?: number; uiLang?: string; routing?: { classify?: string; analysis?: string; deep?: string } };
  languageTool?: { url: string; apiKey?: string; username?: string };
};

export type ScanProgress = { stage: 'render' | 'extract' | 'analyze' | 'lighthouse' | 'languagetool' | 'llm' | 'score' | 'done'; message: string; pct: number };

export type ScanResult = {
  id: string;
  url: string;
  finalUrl?: string;
  isLocalFile: boolean;
  title?: string;
  startedAt: string;
  finishedAt: string;
  marketId?: string;
  marketSignals: string[];
  lang?: string;
  pageType: PageType;
  devices: Device[];
  scores: ScoreSummary;
  findings: Finding[];
  priority: string[];
  modulesRun: ModuleId[];
  screenshots: { device: Device; kind: 'fold' | 'full'; path: string }[];
  snapshotPath?: string;
  perf: PerfMetrics[];
  warnings: string[];
  llmCostUsd: number;
  engineVersion: string;
};
