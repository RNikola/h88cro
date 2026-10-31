import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { excerpt, findingId, type Finding, type MarketProfile, type ModuleId } from '@h88cro/core';
import type { PageModel } from '@h88cro/page-model';

/** Model routing (brief §9.1). Stored in config and overridable by admins, never hard-coded elsewhere. */
export type ModelRouting = { classify: string; analysis: string; deep: string };
export const DEFAULT_ROUTING: ModelRouting = {
  classify: 'claude-haiku-5-5',
  analysis: 'claude-sonnet-5-5',
  deep: 'claude-opus-5-5',
};

/** USD per million tokens (input, output). Used for the per-scan budget. */
export const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
};

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

export type LlmOptions = {
  apiKey: string;
  routing?: Partial<ModelRouting>;
  /** Hard ceiling for one scan, in USD (default $1, brief §12). */
  budgetUsd?: number;
  /** Deep "full audit" mode uses the deep model for analysis. */
  deep?: boolean;
  /** UI language for titles/suggestions, and helper language for inline translations. */
  uiLang?: string;
  log?: (entry: { task: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; error?: string }) => void;
};

export class BudgetExceededError extends Error {}

/** Tracks spend across all calls of one scan. */
export class Budget {
  spentUsd = 0;
  constructor(readonly limitUsd: number) {}
  add(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICES[model] ?? PRICES['claude-sonnet-5-5']!;
    const cost = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
    this.spentUsd += cost;
    return cost;
  }
  check() {
    if (this.spentUsd >= this.limitUsd) throw new BudgetExceededError(`Scan budget of $${this.limitUsd} reached`);
  }
}

// The structured output Claude must return. Validated with zod; one retry on schema failure.
const LlmFindingSchema = z.object({
  ruleId: z.string().describe('kebab-case rule id, e.g. "gender-agreement" (module prefix is added by the app)'),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().describe('Plain-language title a content writer understands'),
  explanation: z.string().describe('Why it matters for this market'),
  suggestion: z.string(),
  selector: z.string().describe('Selector of the evidence block from the page model, or empty string'),
  quote: z.string().describe('Exact excerpt from the page, or empty string'),
  suggestedCopy: z.string().describe('Ready-to-paste replacement text in the page language, or empty string'),
  translationForReviewer: z.string().describe('Translation of quote and suggestedCopy into the reviewer language, or empty string'),
  effort: z.enum(['xs', 's', 'm', 'l']),
  impact: z.number().int().describe('1 (minor) to 5 (major)'),
  confidence: z.number().describe('0 to 1'),
});
const LlmFindingsSchema = z.object({ findings: z.array(LlmFindingSchema) });
type LlmFinding = z.infer<typeof LlmFindingSchema>;

/** Stable system prompt: identical bytes across scans so it is prompt-cached. */
function systemPrompt(): string {
  return [
    'You are a senior iGaming CRO specialist and native-speaker editor. You audit affiliate landing pages (casino and sportsbook toplists, brand reviews, bonus pages) for the market given in the request.',
    '',
    'Principles:',
    '- Persuasion, not manipulation. Optimise for clarity, trust and relevance. Never recommend fake urgency (fake countdowns or sign-up counters), fabricated or uniform ratings, hidden bonus terms, or anything aimed at minors or self-excluded people. Flag such patterns as trust risks when you see them.',
    '- Scope: you do not judge legality, licensing or regulatory compliance and you never give legal advice. The legal team owns that.',
    '- Be specific and evidence-based. Quote the exact text you are talking about and give the selector from the page model. Do not invent content that is not in the page model.',
    '- Only report real problems. If nothing is wrong, return an empty findings list. Use confidence below 0.6 when you are unsure.',
    '- Write titles, explanations and suggestions in the reviewer language given in the request, in plain words a content writer understands (no unexplained jargon). Write suggestedCopy in the page language.',
    '',
    'Return JSON matching the provided schema.',
  ].join('\n');
}

function marketBlock(market?: MarketProfile): string {
  return market ? `Market profile (seed hypotheses, validate before relying on them):\n${JSON.stringify(market, null, 2)}` : 'Market: unknown.';
}

export type LlmTask = 'language' | 'consistency' | 'cro-vision';

export class LlmEngine {
  readonly client: Anthropic;
  readonly routing: ModelRouting;
  readonly budget: Budget;
  constructor(private readonly opts: LlmOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
    this.routing = { ...DEFAULT_ROUTING, ...(opts.routing ?? {}) };
    this.budget = new Budget(opts.budgetUsd ?? 1);
  }

  private async call(task: string, model: string, market: MarketProfile | undefined, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<LlmFinding[]> {
    this.budget.check();
    const useFallback = FALLBACK_MODELS.has(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.beta.messages.parse({
          model,
          max_tokens: 16000,
          ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          system: [
            { type: 'text', text: systemPrompt() },
            { type: 'text', text: marketBlock(market), cache_control: { type: 'ephemeral' } },
          ],
          output_config: { effort: this.opts.deep ? 'high' : 'medium', format: betaZodOutputFormat(LlmFindingsSchema) },
          messages: [{ role: 'user', content }],
        });
        const cost = this.budget.add(res.model ?? model, res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0), res.usage.output_tokens);
        this.opts.log?.({ task, model: res.model ?? model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: cost });
        if (res.stop_reason === 'refusal') return [];
        if (res.parsed_output) return res.parsed_output.findings;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw e;
        if (e instanceof BudgetExceededError) throw e;
        this.opts.log?.({ task, model, inputTokens: 0, outputTokens: 0, costUsd: 0, error: (e as Error).message });
        if (attempt === 1) throw e;
      }
    }
    return [];
  }

  private toFindings(module: ModuleId, items: LlmFinding[], lang: string | undefined, market?: MarketProfile): Finding[] {
    return items.map((f) => {
      const ruleId = `${module}.llm-${f.ruleId.replace(/^[a-z]+\./, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
      return {
        id: findingId(ruleId, `${f.selector}|${f.quote}`),
        module,
        ruleId,
        severity: f.severity,
        title: f.title,
        explanation: f.explanation,
        evidence: f.selector || f.quote ? [{ selector: f.selector || undefined, textExcerpt: f.quote ? excerpt(f.quote, 200) : undefined }] : [],
        suggestion: f.suggestion,
        suggestedCopy: f.suggestedCopy ? [{ lang: lang ?? 'und', text: f.suggestedCopy, translationForReviewer: f.translationForReviewer || undefined }] : undefined,
        effort: f.effort,
        impact: Math.min(5, Math.max(1, Math.round(f.impact))) as Finding['impact'],
        confidence: Math.min(1, Math.max(0, f.confidence)),
        source: 'llm',
        marketContextIds: market ? [market.id] : undefined,
      };
    });
  }

  private header(page: PageModel, market: MarketProfile | undefined, lang: string | undefined) {
    return `Page: ${page.url}\nPage language: ${lang ?? page.htmlLang ?? 'unknown'}\nMarket: ${market?.id ?? 'unknown'}\nReviewer language: ${this.opts.uiLang ?? 'en'}`;
  }

  /** Native-fluency pass: literal translations, anglicisms, register, grammatical agreement. */
  async languagePass(page: PageModel, market: MarketProfile | undefined, lang: string | undefined): Promise<Finding[]> {
    const blocks = page.blocks.filter((b) => b.tag !== 'td').slice(0, 250).map((b) => ({ selector: b.selector, tag: b.tag, text: b.text.slice(0, 600) }));
    const items = await this.call('language', this.opts.deep ? this.routing.deep : this.routing.analysis, market, [
      {
        type: 'text',
        text: `${this.header(page, market, lang)}\nAuthor byline: ${page.author?.byline ?? '(none)'}\n\nTask: act as a native ${lang ?? ''} editor for this market. Find: literal translations, anglicisms, unnatural register or inconsistent formality (e.g. tu/vous in FR, du/ni in SE), grammatical agreement errors (e.g. a male name with a feminine job title like "Ethan Walker … Testeuse"), an author name that does not sound native for this market (e.g. an English or Eastern-European name signing a French page), spelling and grammar errors, tone that does not fit the market. Skip number/currency formatting (checked elsewhere).\n\nText blocks (JSON):\n${JSON.stringify(blocks)}`,
      },
    ]);
    return this.toFindings('language', items, lang, market);
  }

  /** Hard consistency reasoning on the structured brand model. */
  async consistencyPass(page: PageModel, market: MarketProfile | undefined, lang: string | undefined): Promise<Finding[]> {
    const model = {
      brands: page.brands.map((b) => ({
        name: b.name,
        cardRank: b.card?.rank,
        cardRating: b.card?.rating,
        bonus: b.card?.bonusText,
        tableRank: b.table?.rank,
        tableRating: b.table?.rating,
        reviewOrder: b.review?.order,
        reviewHeadingSelector: b.review?.heading.selector,
        reviewText: b.review?.text.slice(0, 1500),
      })),
      faq: page.faq,
      intro: page.blocks.slice(0, 15).map((b) => ({ selector: b.selector, text: b.text })),
    };
    const items = await this.call('consistency', this.routing.deep, market, [
      {
        type: 'text',
        text: `${this.header(page, market, lang)}\n\nTask: cross-check every fact about each brand on this page: ranks stated in text vs list position, "best/most/largest" claims vs the actual numbers, game and provider counts, number words vs the number of brands, FAQ answers vs the list. Report only contradictions you can prove from the data below.\n\nBrand model (JSON):\n${JSON.stringify(model)}`,
      },
    ]);
    return this.toFindings('consistency', items, lang, market);
  }

  /** Above-the-fold visual review from screenshots (hierarchy, CTA salience, offer clarity). */
  async aboveFoldVision(page: PageModel, market: MarketProfile | undefined, lang: string | undefined, shots: { device: 'mobile' | 'desktop'; pngBase64: string }[]): Promise<Finding[]> {
    if (!shots.length) return [];
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const s of shots) {
      content.push({ type: 'text', text: `${s.device} above-the-fold screenshot:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: s.pngBase64 } });
    }
    content.push({
      type: 'text',
      text: `${this.header(page, market, lang)}\n\nTask: review the first screen as a visitor from this market. Is the value proposition clear? Is the #1 offer visible with its bonus and a button? Is the main button the most eye-catching element? Is anything confusing, cluttered or untrustworthy? Use selector "" when you cannot map to the page model.`,
    });
    const items = await this.call('cro-vision', this.routing.analysis, market, content);
    return this.toFindings('cro', items, lang, market);
  }
}

/** Check an API key with a tiny request. */
export async function verifyApiKey(apiKey: string, model = DEFAULT_ROUTING.classify): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 0 });
    await client.messages.create({ model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Fix engine and suggestions (brief §10) ─────────────────────────────────────

const FixEditsSchema = z.object({
  summary: z.string().describe('One short sentence describing the change, in the reviewer language'),
  edits: z
    .array(
      z.object({
        find: z.string().describe('Exact text copied from the file, long enough to occur exactly once'),
        replace: z.string().describe('The full replacement for that text'),
      }),
    )
    .describe('Minimal search/replace edits. Empty if the issue cannot be fixed in this file.'),
  notes: z.array(z.string()).describe('Anything a developer should check, in the reviewer language'),
});
export type FixEdits = z.infer<typeof FixEditsSchema>;

const AlternativesSchema = z.object({
  alternatives: z
    .array(
      z.object({
        text: z.string().describe('Ready-to-use replacement in the page language'),
        why: z.string().describe('Why this works better, one sentence, in the reviewer language'),
        translationForReviewer: z.string().describe('Translation into the reviewer language, or empty string if the same language'),
      }),
    )
    .describe('Exactly 3 alternatives, best first'),
});
export type Alternatives = z.infer<typeof AlternativesSchema>['alternatives'];

const FIX_SYSTEM = [
  'You are a careful front-end developer and native-speaker copy editor fixing iGaming affiliate landing pages.',
  'You receive one audit finding and the source of the file that renders the page (HTML, a template, Markdown or a data file such as JSON).',
  'Return the smallest set of exact search/replace edits that fixes the finding in this file.',
  'Rules:',
  '- Each `find` must be copied verbatim from the file and must occur exactly once in it. Include a little surrounding text if needed to make it unique.',
  '- Change only what the finding needs. Keep the existing formatting, indentation, quotes and markup style.',
  '- Write any page copy in the page language and the market\'s conventions (number, currency and quote formats).',
  '- Persuasion, not manipulation: never add fake urgency, invented ratings, invented people or hidden terms. If a fix would need facts you do not have (a real author, real bonus terms), leave a placeholder only if unavoidable and say so in notes.',
  '- If the issue cannot be fixed in this file, return no edits and explain why in notes.',
].join('\n');

const SUGGEST_SYSTEM = [
  'You are a senior iGaming conversion copywriter and native speaker of the page language.',
  'Given one audit finding and the relevant page text, write 3 alternative versions of the affected text that fix the problem and convert better.',
  'Persuasion, not manipulation: clear benefits, honest claims, visible terms. No fake urgency, no invented numbers or ratings.',
  'Match the market\'s register, number, currency and quote formats. Keep each alternative about the same length as the original unless the finding is about length.',
].join('\n');

export type FixRequest = {
  finding: Pick<Finding, 'ruleId' | 'title' | 'explanation' | 'suggestion' | 'evidence' | 'suggestedCopy'>;
  path: string;
  fileText: string;
  market?: MarketProfile;
  lang?: string;
  uiLang?: string;
};

/** Cut a large file down to the region around the evidence, so the request stays small. */
export function fileWindow(fileText: string, needles: string[], max = 24_000): string {
  if (fileText.length <= max) return fileText;
  const hit = needles.map((n) => (n ? fileText.indexOf(n.slice(0, 60)) : -1)).find((i) => i >= 0) ?? 0;
  const start = Math.max(0, hit - max / 2);
  return fileText.slice(start, start + max);
}

export class FixLlm {
  private readonly client: Anthropic;
  readonly budget: Budget;
  constructor(private readonly opts: { apiKey: string; model?: string; budgetUsd?: number; log?: LlmOptions['log'] }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
    this.budget = new Budget(opts.budgetUsd ?? 1);
  }
  private get model() {
    return this.opts.model ?? DEFAULT_ROUTING.analysis;
  }

  private async parse<S extends z.ZodTypeAny>(task: string, system: string, schema: S, user: string, market?: MarketProfile): Promise<z.infer<S> | undefined> {
    this.budget.check();
    const model = this.model;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.beta.messages.parse({
          model,
          max_tokens: 16000,
          ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          system: [
            { type: 'text', text: system },
            { type: 'text', text: marketBlock(market), cache_control: { type: 'ephemeral' } },
          ],
          output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
          messages: [{ role: 'user', content: user }],
        });
        const cost = this.budget.add(res.model ?? model, res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0), res.usage.output_tokens);
        this.opts.log?.({ task, model: res.model ?? model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: cost });
        if (res.stop_reason === 'refusal') return undefined;
        if (res.parsed_output) return res.parsed_output as z.infer<S>;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof BudgetExceededError) throw e;
        if (attempt === 1) throw e;
      }
    }
    return undefined;
  }

  /** Search/replace edits that fix one finding in one source file. */
  async fixEdits(req: FixRequest): Promise<FixEdits | undefined> {
    const needles = req.finding.evidence.map((e) => e.textExcerpt ?? '').filter(Boolean);
    const text = fileWindow(req.fileText, needles);
    const user = [
      `Page language: ${req.lang ?? 'unknown'}. Reviewer language: ${req.uiLang ?? 'en'}.`,
      `Finding (${req.finding.ruleId}): ${req.finding.title}`,
      `Why: ${req.finding.explanation}`,
      `Suggested fix: ${req.finding.suggestion}`,
      req.finding.suggestedCopy?.length ? `Suggested copy: ${req.finding.suggestedCopy.map((c) => c.text).join(' | ')}` : '',
      `Evidence: ${JSON.stringify(req.finding.evidence.slice(0, 5))}`,
      '',
      `File: ${req.path}${text.length < req.fileText.length ? ' (excerpt around the evidence)' : ''}`,
      '<file>',
      text,
      '</file>',
    ].join('\n');
    return this.parse('fix', FIX_SYSTEM, FixEditsSchema, user, req.market);
  }

  /** Three better versions of the text a finding is about. */
  async suggestAlternatives(req: { finding: FixRequest['finding']; context: string; market?: MarketProfile; lang?: string; uiLang?: string }): Promise<Alternatives> {
    const user = [
      `Page language: ${req.lang ?? 'unknown'}. Reviewer language: ${req.uiLang ?? 'en'}.`,
      `Finding (${req.finding.ruleId}): ${req.finding.title}`,
      `Why: ${req.finding.explanation}`,
      `Current suggestion: ${req.finding.suggestion}`,
      `Affected text: ${req.finding.evidence.map((e) => e.textExcerpt).filter(Boolean).join(' | ') || '(none quoted)'}`,
      '',
      'Page context:',
      req.context.slice(0, 6000),
    ].join('\n');
    return (await this.parse('suggest', SUGGEST_SYSTEM, AlternativesSchema, user, req.market))?.alternatives ?? [];
  }
}
