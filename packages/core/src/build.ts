import type { Effort, Evidence, Finding, ModuleId, Severity } from './finding.js';
import { findingId } from './text.js';

export type FindingInput = {
  ruleId: string;
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
  evidence?: Evidence[];
  effort?: Effort;
  impact?: Finding['impact'];
  confidence?: number;
  key?: string;
  suggestedCopy?: Finding['suggestedCopy'];
  fix?: Finding['fix'];
  source?: Finding['source'];
  marketContextIds?: string[];
};

/** Small builder so analyzers stay terse. The module is taken from the ruleId prefix. */
export function finding(f: FindingInput): Finding {
  const module = f.ruleId.split('.')[0] as ModuleId;
  const evidence = f.evidence ?? [];
  return {
    id: findingId(f.ruleId, f.key ?? JSON.stringify(evidence.map((e) => e.selector ?? e.textExcerpt ?? ''))),
    module,
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    explanation: f.explanation,
    evidence,
    suggestion: f.suggestion,
    suggestedCopy: f.suggestedCopy,
    fix: f.fix,
    effort: f.effort ?? 's',
    impact: f.impact ?? 3,
    confidence: f.confidence ?? 0.9,
    source: f.source ?? 'deterministic',
    marketContextIds: f.marketContextIds,
  };
}
