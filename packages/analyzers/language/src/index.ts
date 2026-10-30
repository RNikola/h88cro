import { excerpt, finding, type Finding } from '@h88cro/core';
import type { Analyzer, AnalyzerContext, TextBlock } from '@h88cro/page-model';

/** Languages that write decimals with a comma. */
const COMMA_DECIMAL = new Set(['fr', 'sv', 'da', 'nl', 'pt', 'de', 'es', 'it', 'pl', 'sr', 'fi', 'nb', 'no']);

const PLACEHOLDER_RES: [RegExp, string][] = [
  [/\{\{\s*[\w.-]+\s*\}\}/, 'template variable'],
  [/\[(brand|casino|name|bonus|amount|date|year)\]/i, 'placeholder in brackets'],
  [/\blorem ipsum\b/i, 'Lorem ipsum'],
  [/\b(TODO|FIXME|TBD|XXX)\b/, 'TODO marker'],
  [/%(?:brand|s|d)%?\b/, 'format placeholder'],
];

function textBlocks(ctx: AnalyzerContext): TextBlock[] {
  return ctx.page.blocks.filter((b) => b.tag !== 'td' && b.tag !== 'th');
}

export function runLanguage(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const lang = ctx.lang ?? ctx.page.htmlLang?.split('-')[0];
  const market = ctx.market;
  const mctx = market ? [market.id] : undefined;
  const blocks = textBlocks(ctx);

  // Leftover template / placeholder text.
  for (const b of ctx.page.blocks) {
    for (const [re, label] of PLACEHOLDER_RES) {
      const m = b.text.match(re);
      if (m) {
        out.push(
          finding({
            ruleId: 'language.placeholder-text',
            severity: 'high',
            title: `Leftover ${label} on the page: "${m[0]}"`,
            explanation: 'Template or placeholder text tells visitors the page is unfinished, which undermines trust right before they decide whether to click.',
            suggestion: `Replace "${m[0]}" with the real content, or remove it.`,
            evidence: [{ selector: b.selector, textExcerpt: excerpt(b.text) }],
            effort: 'xs',
            impact: 3,
            confidence: 0.95,
            key: `${b.selector}|${m[0]}`,
            fix: { type: 'copy-replace', available: false },
          }),
        );
      }
    }
  }

  // Duplicate consecutive words ("le le", "the the").
  for (const b of blocks) {
    const m = b.text.match(/\b([\p{L}]{2,})\s+\1\b/iu);
    if (m && !/^(nous|vous|très|so|bye|ha|da)$/i.test(m[1]!)) {
      out.push(
        finding({
          ruleId: 'language.duplicate-word',
          severity: 'low',
          title: `Repeated word: "${m[0]}"`,
          explanation: 'Typos make a review look careless and reduce perceived expertise.',
          suggestion: `Remove the duplicated "${m[1]}".`,
          evidence: [{ selector: b.selector, textExcerpt: excerpt(b.text) }],
          effort: 'xs',
          impact: 1,
          confidence: 0.8,
        }),
      );
    }
  }

  if (lang && COMMA_DECIMAL.has(lang)) {
    // Decimal points where the language uses commas (9.8/10 → 9,8/10).
    const hits = ctx.page.blocks.filter((b) => /(?<![\d.])\d{1,2}\.\d{1,2}(?=\s*\/\s*(?:10|5)\b|\s*(?:%|\s?sur\s10))/.test(b.text));
    if (hits.length) {
      const sample = hits[0]!.text.match(/\d{1,2}\.\d{1,2}/)?.[0] ?? '9.8';
      out.push(
        finding({
          ruleId: 'language.decimal-separator',
          severity: 'medium',
          title: `Decimal point used instead of a comma (${hits.length} place${hits.length > 1 ? 's' : ''})`,
          explanation: `In ${lang.toUpperCase()} numbers are written with a decimal comma. "${sample}" reads as a translated or foreign page to local players.`,
          suggestion: `Write ratings and decimals with a comma, e.g. "${sample.replace('.', ',')}".`,
          evidence: hits.slice(0, 5).map((b) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 80) })),
          effort: 'xs',
          impact: 2,
          confidence: 0.9,
          marketContextIds: mctx,
          suggestedCopy: [{ lang, text: sample.replace('.', ',') }],
        }),
      );
    }
  }

  if (lang === 'fr') {
    // Currency: "2000€" / "€2000" / "2000 €" → "2 000 €" (narrow no-break space before €).
    const bad: { b: TextBlock; m: string }[] = [];
    for (const b of ctx.page.blocks) {
      const m = b.text.match(/\d€|€\s?\d|(?<![\d\s  ])\d{4,}\s?€/);
      if (m) bad.push({ b, m: m[0] });
    }
    if (bad.length) {
      out.push(
        finding({
          ruleId: 'language.currency-format',
          severity: 'medium',
          title: `Euro amounts not in French format (${bad.length} place${bad.length > 1 ? 's' : ''})`,
          explanation: 'French readers expect "2 000 €": the euro sign after the number, a space before it, and a space as the thousands separator. Other formats look translated.',
          suggestion: 'Write amounts as "2 000 €" (narrow no-break space as the thousands separator and before €).',
          evidence: bad.slice(0, 5).map(({ b }) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 100) })),
          effort: 'xs',
          impact: 2,
          confidence: 0.9,
          marketContextIds: mctx,
          suggestedCopy: [{ lang: 'fr', text: '2 000 €' }],
        }),
      );
    }

    // Straight quotes instead of « ».
    const quoted = blocks.filter((b) => /"[^"]{2,80}"/.test(b.text));
    if (quoted.length) {
      out.push(
        finding({
          ruleId: 'language.quote-style',
          severity: 'low',
          title: 'English-style quotation marks in French text',
          explanation: 'French typography uses « guillemets » with spaces inside. Straight quotes are a common sign of machine translation.',
          suggestion: 'Replace "…" with « … ».',
          evidence: quoted.slice(0, 3).map((b) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 100) })),
          effort: 'xs',
          impact: 1,
          confidence: 0.85,
          marketContextIds: mctx,
        }),
      );
    }

    // Missing space before ? ! ;
    const punct = blocks.filter((b) => /[\p{L}\d][?!;](?:\s|$)/u.test(b.text));
    if (punct.length) {
      out.push(
        finding({
          ruleId: 'language.fr-punctuation-spacing',
          severity: 'low',
          title: `Missing space before ? ! ; (${punct.length} place${punct.length > 1 ? 's' : ''})`,
          explanation: 'French puts a (narrow no-break) space before ? ! ; and :. Missing spaces look like English typing habits.',
          suggestion: 'Add a narrow no-break space before ? ! ; and :.',
          evidence: punct.slice(0, 3).map((b) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 100) })),
          effort: 'xs',
          impact: 1,
          confidence: 0.7,
        }),
      );
    }
  }

  // Market glossary: borrowed terms where a local term is preferred ("free spins" on FR pages).
  if (market) {
    for (const g of market.glossary) {
      for (const avoid of g.avoid) {
        const re = new RegExp(`\\b${avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const hits = ctx.page.blocks.filter((b) => re.test(b.text));
        if (!hits.length) continue;
        out.push(
          finding({
            ruleId: 'language.borrowed-term',
            severity: 'medium',
            title: `"${avoid}" used instead of the local term "${g.prefer}"`,
            explanation: `Players in ${market.market} search for and expect "${g.prefer}". Borrowed terms read as translated content and can miss local search queries.`,
            suggestion: `Replace "${avoid}" with "${g.prefer}".`,
            evidence: hits.slice(0, 3).map((b) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 100) })),
            suggestedCopy: [{ lang: market.languages[0]!, text: g.prefer }],
            effort: 'xs',
            impact: 2,
            confidence: 0.85,
            key: `${avoid}`,
            marketContextIds: mctx,
          }),
        );
      }
    }
  }

  // Readability: very long sentences.
  const sentences = blocks
    .filter((b) => b.tag === 'p' || b.tag === 'li')
    .flatMap((b) => b.text.split(/(?<=[.!?])\s+/).map((s) => ({ s, b })));
  const long = sentences.filter(({ s }) => s.split(/\s+/).length > 35);
  if (long.length) {
    out.push(
      finding({
        ruleId: 'language.long-sentences',
        severity: 'low',
        title: `${long.length} very long sentence${long.length > 1 ? 's' : ''} (over 35 words)`,
        explanation: 'Long sentences are hard to scan on mobile, where most players read these pages.',
        suggestion: 'Split long sentences into two, and lead with the key fact.',
        evidence: long.slice(0, 3).map(({ s, b }) => ({ selector: b.selector, textExcerpt: excerpt(s, 120) })),
        effort: 's',
        impact: 1,
        confidence: 0.8,
      }),
    );
  }

  return out;
}

export const languageAnalyzer: Analyzer = { id: 'language', version: '0.1.0', run: runLanguage };
export default languageAnalyzer;
