import type { Effort, Finding, ModuleId, PageType, Severity } from './finding.js';

/** Default module weights (brief §6). Admins can override them per page type. */
export const DEFAULT_WEIGHTS: Record<ModuleId, number> = {
  cro: 22,
  consistency: 14,
  language: 12,
  performance: 12,
  seo: 12,
  eeat: 10,
  design: 8,
  market: 6,
  links: 2,
  a11y: 2,
  benchmark: 0,
};

export type WeightConfig = {
  default: Partial<Record<ModuleId, number>>;
  byPageType?: Partial<Record<PageType, Partial<Record<ModuleId, number>>>>;
};

const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 25, high: 12, medium: 6, low: 2 };
const SEVERITY_FACTOR: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const EFFORT_FACTOR: Record<Effort, number> = { xs: 1, s: 2, m: 3, l: 5 };
/** A single rule can never take more than this many points from its module. */
const PER_RULE_CAP = 30;

export type ModuleScore = { module: ModuleId; score: number; findingCount: number; ran: boolean };
export type ScoreSummary = { overall: number; modules: ModuleScore[] };

/** Each module starts at 100 and loses points weighted by severity × confidence, capped per rule. */
export function scoreModule(module: ModuleId, findings: Finding[]): number {
  const byRule = new Map<string, number>();
  for (const f of findings) {
    if (f.module !== module) continue;
    const d = SEVERITY_DEDUCTION[f.severity] * f.confidence;
    byRule.set(f.ruleId, Math.min(PER_RULE_CAP, (byRule.get(f.ruleId) ?? 0) + d));
  }
  let total = 0;
  for (const d of byRule.values()) total += d;
  return Math.max(0, Math.round(100 - total));
}

export function resolveWeights(pageType: PageType | undefined, config?: WeightConfig): Record<ModuleId, number> {
  const w = { ...DEFAULT_WEIGHTS, ...(config?.default ?? {}) };
  if (pageType && config?.byPageType?.[pageType]) Object.assign(w, config.byPageType[pageType]);
  return w;
}

/** Overall score is the weighted average of the modules that actually ran. */
export function scoreReport(
  findings: Finding[],
  modulesRun: ModuleId[],
  opts: { pageType?: PageType; weights?: WeightConfig } = {},
): ScoreSummary {
  const weights = resolveWeights(opts.pageType, opts.weights);
  const modules: ModuleScore[] = modulesRun.map((m) => ({
    module: m,
    score: scoreModule(m, findings),
    findingCount: findings.filter((f) => f.module === m).length,
    ran: true,
  }));
  let num = 0;
  let den = 0;
  for (const m of modules) {
    const w = weights[m.module] ?? 0;
    num += m.score * w;
    den += w;
  }
  return { overall: den ? Math.round(num / den) : 100, modules };
}

/** Priority = impact × severity × confidence ÷ effort, optionally boosted by proven uplift per rule. */
export function priorityOf(f: Finding, upliftBoost: Record<string, number> = {}): number {
  const base = (f.impact * SEVERITY_FACTOR[f.severity] * f.confidence) / EFFORT_FACTOR[f.effort];
  return base * (1 + (upliftBoost[f.ruleId] ?? 0));
}

export function priorityList(findings: Finding[], n = 10, upliftBoost?: Record<string, number>): Finding[] {
  return [...findings].sort((a, b) => priorityOf(b, upliftBoost) - priorityOf(a, upliftBoost)).slice(0, n);
}
