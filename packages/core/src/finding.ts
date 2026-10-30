import { z } from 'zod';

/** Module ids, one per analysis area (brief §5). */
export const MODULE_IDS = [
  'language',
  'consistency',
  'cro',
  'design',
  'performance',
  'seo',
  'eeat',
  'a11y',
  'links',
  'market',
  'benchmark',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EFFORTS = ['xs', 's', 'm', 'l'] as const;
export type Effort = (typeof EFFORTS)[number];

export const DEVICES = ['mobile', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export const ScreenshotRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  device: z.enum(DEVICES),
});

export const EvidenceSchema = z.object({
  selector: z.string().optional(),
  textExcerpt: z.string().optional(),
  screenshotRegion: ScreenshotRegionSchema.optional(),
  metric: z.object({ name: z.string(), value: z.number(), target: z.number() }).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FIX_TYPES = ['html-patch', 'css-patch', 'copy-replace', 'schema-replace', 'asset'] as const;

/** The one finding schema every module returns (brief §6). */
export const FindingSchema = z.object({
  id: z.string(),
  module: z.enum(MODULE_IDS),
  ruleId: z.string(),
  severity: z.enum(SEVERITIES),
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(EvidenceSchema),
  suggestion: z.string(),
  suggestedCopy: z
    .array(z.object({ lang: z.string(), text: z.string(), translationForReviewer: z.string().optional() }))
    .optional(),
  fix: z.object({ type: z.enum(FIX_TYPES), available: z.boolean() }).optional(),
  effort: z.enum(EFFORTS),
  impact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  confidence: z.number().min(0).max(1),
  source: z.enum(['deterministic', 'llm', 'hybrid']),
  marketContextIds: z.array(z.string()).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** LLM findings below this confidence are shown as "possible". */
export const POSSIBLE_CONFIDENCE_THRESHOLD = 0.6;

export const PAGE_TYPES = ['toplist', 'brand-review', 'bonus', 'slot', 'sportsbook', 'other'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const MODULE_LABELS: Record<ModuleId, string> = {
  language: 'Language & copy',
  consistency: 'Consistency & facts',
  cro: 'CRO & UX',
  design: 'Design & colour',
  performance: 'Speed',
  seo: 'Technical SEO',
  eeat: 'E-E-A-T & trust',
  a11y: 'Accessibility',
  links: 'Affiliate links',
  market: 'Market fit',
  benchmark: 'Competitors',
};
