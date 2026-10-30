import { excerpt, finding, type Finding } from '@h88cro/core';
import type { PageModel } from '@h88cro/page-model';

type LtMatch = {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { id: string; description: string; issueType?: string; category: { id: string; name: string } };
};

const SKIP_CATEGORIES = new Set(['TYPOGRAPHY', 'CASING', 'STYLE', 'REDUNDANCY']);

/**
 * Spelling and grammar via LanguageTool: either a local server (optional first-run download)
 * or the LanguageTool HTTP API. Brand names are passed as ignore-words so they are not flagged.
 */
export async function languageToolCheck(page: PageModel, opts: { url: string; lang: string; apiKey?: string; username?: string }): Promise<Finding[]> {
  const blocks = page.blocks.filter((b) => b.tag !== 'td' && b.tag !== 'th' && b.text.length > 3);
  const sep = '\n\n';
  const starts: number[] = [];
  let text = '';
  for (const b of blocks) {
    if (text.length + b.text.length > 18_000) break;
    starts.push(text.length);
    text += b.text + sep;
  }
  const body = new URLSearchParams({ text, language: opts.lang, level: 'default' });
  if (opts.apiKey && opts.username) {
    body.set('apiKey', opts.apiKey);
    body.set('username', opts.username);
  }
  const res = await fetch(`${opts.url.replace(/\/$/, '')}/check`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`LanguageTool ${res.status}`);
  const json = (await res.json()) as { matches: LtMatch[] };
  const brandWords = new Set(page.brands.flatMap((b) => b.name.toLowerCase().split(/\s+/)));
  const out: Finding[] = [];
  for (const m of json.matches) {
    if (SKIP_CATEGORIES.has(m.rule.category.id)) continue;
    const word = text.slice(m.offset, m.offset + m.length);
    if (brandWords.has(word.toLowerCase())) continue;
    let bi = starts.findIndex((s, i) => m.offset >= s && (starts[i + 1] === undefined || m.offset < starts[i + 1]!));
    if (bi < 0) bi = 0;
    const block = blocks[bi]!;
    const spelling = m.rule.issueType === 'misspelling';
    out.push(
      finding({
        ruleId: spelling ? 'language.spelling' : 'language.grammar',
        severity: spelling ? 'medium' : 'medium',
        title: `${spelling ? 'Spelling' : 'Grammar'}: "${word}" (${m.shortMessage || m.rule.description})`,
        explanation: m.message,
        suggestion: m.replacements.length ? `Replace with "${m.replacements[0]!.value}".` : 'Rewrite this phrase.',
        suggestedCopy: m.replacements.length ? [{ lang: opts.lang, text: m.replacements[0]!.value }] : undefined,
        evidence: [{ selector: block.selector, textExcerpt: excerpt(block.text, 160) }],
        effort: 'xs',
        impact: 2,
        confidence: 0.75,
        key: `${block.selector}|${m.offset - starts[bi]!}|${m.rule.id}`,
      }),
    );
  }
  return out;
}
