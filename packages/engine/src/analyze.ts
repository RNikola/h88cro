import { consistencyAnalyzer } from '@h88cro/analyzer-consistency';
import { croAnalyzer } from '@h88cro/analyzer-cro';
import { eeatAnalyzer } from '@h88cro/analyzer-eeat';
import { languageAnalyzer } from '@h88cro/analyzer-language';
import { performanceAnalyzer } from '@h88cro/analyzer-performance';
import { seoAnalyzer } from '@h88cro/analyzer-seo';
import { FindingSchema, type Finding, type ModuleId } from '@h88cro/core';
import type { Analyzer, AnalyzerContext } from '@h88cro/page-model';

/** Phase 1 modules (brief §14): 5.1, 5.2, 5.3, 5.5, 5.6, 5.7. */
export const PHASE1_ANALYZERS: Analyzer[] = [languageAnalyzer, consistencyAnalyzer, croAnalyzer, performanceAnalyzer, seoAnalyzer, eeatAnalyzer];

export async function runAnalyzers(ctx: AnalyzerContext, analyzers: Analyzer[] = PHASE1_ANALYZERS): Promise<{ findings: Finding[]; modulesRun: ModuleId[]; errors: string[] }> {
  const findings: Finding[] = [];
  const errors: string[] = [];
  for (const a of analyzers) {
    try {
      for (const f of await a.run(ctx)) {
        const parsed = FindingSchema.safeParse(f);
        if (parsed.success) findings.push(parsed.data);
        else errors.push(`${a.id}: invalid finding ${f.ruleId}: ${parsed.error.message}`);
      }
    } catch (e) {
      errors.push(`${a.id} failed: ${(e as Error).message}`);
    }
  }
  return { findings: dedupe(findings), modulesRun: analyzers.map((a) => a.id), errors };
}

export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) if (!seen.has(f.id)) seen.set(f.id, f);
  return [...seen.values()];
}
