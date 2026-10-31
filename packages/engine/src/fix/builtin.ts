/**
 * Deterministic fixers: exact, reviewable edits to the page's source HTML for common rules.
 * Each works on the raw source text (not a re-serialised DOM) so the diff only touches what it must.
 */
import type { Finding } from '@h88cro/core';
import { AFFILIATE_PATH_RE, UPDATED_RE, type PageModel } from '@h88cro/page-model';
import type { Edit, FixContext } from './types.js';

type Fixer = (f: Finding, src: string, page: PageModel, ctx: FixContext) => { edits: Edit[]; summary: string; notes?: string[] } | undefined;

/** Grow [start, end) until the surrounding text is unique in `src`, then return an exact edit. */
export function editAt(src: string, start: number, end: number, replacement: string): Edit {
  let a = start;
  let b = end;
  for (let step = 0; step < 60; step++) {
    const piece = src.slice(a, b);
    if (piece && src.indexOf(piece) === src.lastIndexOf(piece)) break;
    a = Math.max(0, a - 12);
    b = Math.min(src.length, b + 12);
  }
  return { find: src.slice(a, b), replace: src.slice(a, start) + replacement + src.slice(end, b) };
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex for page text as it may be written in source: entities, curly/straight apostrophes, any whitespace. */
function sourceTextRe(text: string): RegExp {
  const parts = [...text.trim().replace(/\s+/g, ' ')].map((c) => {
    if (/\s/.test(c)) return '(?:\\s|&nbsp;|&#160;|\u00a0|\u202f)+';
    if (/['’]/.test(c)) return "(?:'|’|&#39;|&#x27;|&apos;|&rsquo;|&#8217;)";
    if (c === '&') return '(?:&|&amp;)';
    if (c === '"') return '(?:"|&quot;|&#34;)';
    return reEsc(c);
  });
  return new RegExp(parts.join(''), 'g');
}

/** First index of page text in source at or after `from`, tolerant of entities and quote styles. */
export function findText(src: string, text: string, from = 0): { index: number; length: number } | undefined {
  if (!text.trim()) return undefined;
  const re = sourceTextRe(text);
  re.lastIndex = Math.max(0, from);
  const m = re.exec(src);
  return m ? { index: m.index, length: m[0].length } : undefined;
}

/** Position of a heading's text inside an actual <h1>–<h6> element (skips tables of contents and links to it). */
function headingAt(src: string, text: string): { index: number; length: number } | undefined {
  for (let from = 0; ; ) {
    const hit = findText(src, text, from);
    if (!hit) return undefined;
    const open = src.lastIndexOf('<h', hit.index);
    const between = open === -1 ? '' : src.slice(open, hit.index);
    if (open !== -1 && /^<h[1-6]\b/i.test(between) && !/<\/h[1-6]>/i.test(between)) return hit;
    from = hit.index + hit.length;
  }
}

/** Index ranges of <script>, <style> and comments, which text fixes must not touch. */
function protectedRanges(src: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of src.matchAll(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

/** Replace inside visible text nodes only. */
function textReplace(src: string, re: RegExp, fn: (m: RegExpExecArray) => string): Edit[] {
  const prot = protectedRanges(src);
  const edits: Edit[] = [];
  for (const seg of src.matchAll(/>([^<]+)</g)) {
    const segStart = seg.index! + 1;
    if (prot.some(([a, b]) => segStart >= a && segStart < b)) continue;
    const text = seg[1]!;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    let replaced = '';
    let last = 0;
    let changed = false;
    while ((m = r.exec(text))) {
      replaced += text.slice(last, m.index) + fn(m);
      last = m.index + m[0].length;
      changed = true;
      if (!m[0].length) r.lastIndex++;
    }
    if (!changed) continue;
    replaced += text.slice(last);
    edits.push(editAt(src, segStart, segStart + text.length, replaced));
  }
  return dedupeEdits(edits);
}

function dedupeEdits(edits: Edit[]): Edit[] {
  const seen = new Set<string>();
  return edits.filter((e) => !seen.has(e.find) && (seen.add(e.find), true));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));

function setAttr(tag: string, name: string, value: string): string {
  const m = attr(tag, name);
  if (m) return tag.replace(m[0], ` ${name}="${value}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end.trim() === '/>' ? ' />' : '>'}`);
}
function removeAttr(tag: string, name: string): string {
  const m = attr(tag, name);
  return m ? tag.replace(m[0], '') : tag;
}

// ── Ordinals for rank phrases ─────────────────────────────────────────────────
const FR_ORD_F = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième'];
const FR_ORD_M = ['premier', ...FR_ORD_F.slice(1)];
const EN_ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const FR_MEDALS = ["médaille d'or", "médaille d'argent", 'médaille de bronze'];
const EN_MEDALS = ['gold medal', 'silver medal', 'bronze medal'];

function correctedRankPhrase(phrase: string, rank: number, lang: string | undefined): string | undefined {
  const cap = (s: string) => (/^\p{Lu}/u.test(phrase) ? s[0]!.toUpperCase() + s.slice(1) : s);
  const i = rank - 1;
  if (i < 0 || i > 9) return undefined;
  let m = phrase.match(/^(\S+)\s+(place|position|rang|marche|spot)$/i);
  if (m) {
    const noun = m[2]!;
    if (/^(place|position|spot)$/i.test(noun) && /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/i.test(m[1]!)) return cap(`${EN_ORD[i]} ${noun}`);
    return cap(`${(noun.toLowerCase() === 'rang' ? FR_ORD_M : FR_ORD_F)[i]} ${noun}`);
  }
  m = phrase.match(/^(#|n[°º]\s?|numéro\s|number\s|no\.\s?)(\d{1,2})$/i);
  if (m) return `${m[1]}${rank}`;
  if (/médaille|medal|dauphin|runner/i.test(phrase)) {
    const fr = /médaille|dauphin/i.test(phrase) || lang === 'fr';
    if (rank <= 3) return cap((fr ? FR_MEDALS : EN_MEDALS)[i]!);
    return cap(fr ? `${FR_ORD_F[i]} place` : `${EN_ORD[i]} place`);
  }
  return undefined;
}

// ── Fixers ────────────────────────────────────────────────────────────────────

const affiliateSponsored: Fixer = (_f, src, page) => {
  const hrefs = new Set(page.links.filter((l) => l.isAffiliate && !l.rel.includes('sponsored')).map((l) => l.href));
  const edits: Edit[] = [];
  const done = new Set<string>();
  for (const m of src.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    const href = attr(tag, 'href');
    const value = href?.[2] ?? href?.[3] ?? href?.[4];
    if (!value || !(hrefs.has(value) || AFFILIATE_PATH_RE.test(value))) continue;
    const rel = (attr(tag, 'rel')?.[2] ?? attr(tag, 'rel')?.[3] ?? '').split(/\s+/).filter(Boolean);
    if (rel.includes('sponsored') || done.has(tag)) continue;
    done.add(tag);
    const next = setAttr(tag, 'rel', [...new Set([...rel, 'sponsored', 'nofollow', 'noopener'])].join(' '));
    edits.push({ find: tag, replace: next, all: true });
  }
  return edits.length ? { edits, summary: `Add rel="sponsored nofollow noopener" to ${edits.length} affiliate link tag${edits.length > 1 ? 's' : ''}` } : undefined;
};

const lcpLazy: Fixer = (_f, src, page, ctx) => {
  const img = page.images.filter((i) => i.index < 6 && i.loading === 'lazy').sort((a, b) => a.index - b.index)[0];
  if (!img) return undefined;
  const abs = (u: string) => {
    try {
      return new URL(u.replace(/&amp;/g, '&'), ctx.url).href;
    } catch {
      return u;
    }
  };
  for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
    const s = attr(m[0], 'src');
    const v = s?.[2] ?? s?.[3] ?? s?.[4];
    if (!v || (abs(v) !== img.src && v !== img.src)) continue;
    let tag = removeAttr(m[0], 'loading');
    if (!attr(tag, 'fetchpriority')) tag = setAttr(tag, 'fetchpriority', 'high');
    return { edits: [editAt(src, m.index!, m.index! + m[0].length, tag)], summary: 'Load the first image eagerly with high priority (remove loading="lazy")' };
  }
  return undefined;
};

const staleDate: Fixer = (_f, src, _page, ctx) => {
  const lang = ctx.lang ?? 'en';
  const prot = protectedRanges(src);
  const months = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)';
  const dateRe = new RegExp(`(\\d{1,2}(?:er)?\\s+${months}\\s+\\d{4}|${months}\\s+\\d{1,2},?\\s+\\d{4}|${months}\\s+\\d{4}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i');
  for (const seg of src.matchAll(/>([^<]+)</g)) {
    const start = seg.index! + 1;
    if (prot.some(([a, b]) => start >= a && start < b)) continue;
    const text = seg[1]!;
    const u = text.match(UPDATED_RE);
    if (!u) continue;
    const d = text.slice(u.index!).match(dateRe);
    if (!d) continue;
    const old = d[0];
    const at = start + u.index! + d.index!;
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, o).format(ctx.now);
    let next: string;
    if (/^\d{4}-/.test(old)) next = ctx.now.toISOString().slice(0, 10);
    else if (/^\d{1,2}[/.]/.test(old)) next = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/[/.]/g, old.match(/[/.]/)![0]);
    else if (/^\d/.test(old)) next = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
    else if (/\d{1,2},?\s+\d{4}$/.test(old)) next = fmt({ month: 'long', day: 'numeric', year: 'numeric' });
    else next = fmt({ month: 'long', year: 'numeric' });
    if (/^\p{Lu}/u.test(old)) next = next[0]!.toUpperCase() + next.slice(1);
    return {
      edits: [editAt(src, at, at + old.length, next)],
      summary: `Update "${old}" to "${next}"`,
      notes: ['Only publish a new date after someone has re-checked the offers on the page.'],
    };
  }
  return undefined;
};

const rankText: Fixer = (f, src, page, ctx) => {
  const m = f.title.match(/^(.+?)'s review says "(.+)" but it is #(\d+)/);
  if (!m) return undefined;
  const [, name, phrase, rankStr] = m;
  const fixed = correctedRankPhrase(phrase!, Number(rankStr), ctx.lang);
  if (!fixed) return undefined;
  const review = page.reviews.find((r) => r.name === name);
  const from = review ? Math.max(0, src.indexOf(review.heading.text)) : 0;
  const at = src.indexOf(phrase!, from);
  if (at === -1) return undefined;
  return { edits: [editAt(src, at, at + phrase!.length, fixed)], summary: `Change "${phrase}" to "${fixed}" in the ${name} review` };
};

const faqNumberOne: Fixer = (f, src, page) => {
  const m = f.title.match(/^The FAQ names (.+?) as the best, but (.+?) is #1/);
  if (!m) return undefined;
  const [, wrong, right] = m;
  const q = page.faq.find((x) => x.answer.includes(wrong!));
  if (!q) return undefined;
  const prot = protectedRanges(src);
  const edits: Edit[] = [];
  // The visible answer: find the question, then the answer text after it, then the brand inside the answer.
  for (let from = 0; ; ) {
    const qHit = findText(src, q.question, from);
    if (!qHit) break;
    from = qHit.index + qHit.length;
    if (prot.some(([a, b]) => qHit.index >= a && qHit.index < b)) continue;
    const before = q.answer.slice(0, q.answer.indexOf(wrong!));
    const lead = before.split(/\s+/).slice(-6).join(' ');
    const aHit = lead.trim() ? findText(src, lead, from) : { index: from, length: 0 };
    if (!aHit) continue;
    const at = src.indexOf(wrong!, aHit.index + aHit.length);
    if (at === -1 || at - (aHit.index + aHit.length) > 40) continue;
    edits.push(editAt(src, at, at + wrong!.length, right!));
    break;
  }
  // The same answer in FAQPage structured data, if any.
  for (const [a, b] of prot) {
    const block = src.slice(a, b);
    if (!/ld\+json/i.test(block) || !/FAQPage/.test(block)) continue;
    const lead = q.answer.slice(0, 30);
    const ai = block.indexOf(lead.replace(/"/g, '\\"'));
    const at = ai === -1 ? -1 : block.indexOf(wrong!, ai);
    if (at !== -1) edits.push(editAt(src, a + at, a + at + wrong!.length, right!));
  }
  return edits.length ? { edits, summary: `Name ${right} (the #1 in the list) in the FAQ answer instead of ${wrong}` } : undefined;
};

const percentSpacing: Fixer = (_f, src) => {
  const edits = textReplace(src, /(\d)%/g, (m) => `${m[1]}\u202f%`);
  return edits.length ? { edits, summary: 'Add a narrow no-break space before "%"' } : undefined;
};

const decimalSeparator: Fixer = (_f, src, _page, ctx) => {
  if (ctx.market && ctx.market.decimalSeparator !== ',') return undefined;
  const edits = [
    ...textReplace(src, /(?<![\d.])(\d{1,2})\.(\d{1,2})(?=\s*\/\s*(?:10|5)\b)/g, (m) => `${m[1]},${m[2]}`),
    ...textReplace(src, /^(\s*)(\d{1,2})\.(\d{1,2})(\s*)$/g, (m) => `${m[1]}${m[2]},${m[3]}${m[4]}`),
  ];
  return edits.length ? { edits: dedupeEdits(edits), summary: 'Write scores with a decimal comma (9,8 instead of 9.8)' } : undefined;
};

const CTA_TEXT: Record<string, (b: string) => string> = {
  fr: (b) => `Obtenir le bonus ${b}`,
  en: (b) => `Get the ${b} bonus`,
  sv: (b) => `Hämta bonusen hos ${b}`,
  da: (b) => `Få bonussen hos ${b}`,
  nl: (b) => `Claim de bonus bij ${b}`,
  pt: (b) => `Obter o bónus ${b}`,
  de: (b) => `Bonus bei ${b} sichern`,
  es: (b) => `Conseguir el bono de ${b}`,
  it: (b) => `Ottieni il bonus ${b}`,
};

const ctaAfterReview: Fixer = (f, src, page, ctx) => {
  const one = f.title.match(/^No button after the (.+) review$/)?.[1];
  const reviews = page.reviews.filter((r) => !r.hasCta && (!one || r.name === one));
  const edits: Edit[] = [];
  const done: string[] = [];
  for (const r of reviews) {
    const cta = page.ctas.find((c) => c.isAffiliate && c.brandSlug === r.slug && c.href);
    if (!cta) continue;
    const h = headingAt(src, r.heading.text);
    if (!h) continue;
    const hAt = h.index;
    const nextHeading = src.slice(hAt + h.length).search(/<h[1-3]\b/i);
    const end = nextHeading === -1 ? src.search(/<\/(main|article|body)>/i) : hAt + h.length + nextHeading;
    if (end <= hAt) continue;
    const region = src.slice(hAt, end);
    const lastClose = Math.max(region.lastIndexOf('</p>'), region.lastIndexOf('</ul>'), region.lastIndexOf('</ol>'));
    if (lastClose === -1) continue;
    const at = hAt + lastClose + (region.slice(lastClose).startsWith('</p>') ? 4 : 5);
    const text = (CTA_TEXT[ctx.lang ?? 'en'] ?? CTA_TEXT.en!)(r.name);
    const cls = cta.classes ? ` class="${esc(cta.classes)}"` : '';
    const snippet = `\n<p class="h88-review-cta"><a href="${esc(cta.href!)}"${cls} rel="sponsored nofollow noopener" target="_blank">${esc(text)}</a></p>`;
    edits.push(editAt(src, at, at, snippet));
    done.push(r.name);
  }
  return edits.length
    ? { edits, summary: `Add an offer button at the end of the ${done.join(', ')} review${done.length > 1 ? 's' : ''}`, notes: ['The buttons reuse the class of the brand\'s existing button; check that they look right.'] }
    : undefined;
};

const topPickBadge: Fixer = (f, src, page, ctx) => {
  const top = [...page.cards].sort((a, b) => a.rank - b.rank)[0];
  if (!top) return undefined;
  const re = new RegExp(`(<h[2-4][^>]*>\\s*)${top.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*</h[2-4]>)`, 'i');
  const m = src.match(re);
  if (!m) return undefined;
  const label = ctx.lang === 'fr' ? 'Notre choix n°1' : (f.suggestedCopy?.[0]?.text ?? 'Our #1 pick');
  const at = m.index! + m[0].length;
  return {
    edits: [editAt(src, at, at, `\n<span class="h88-top-pick">${esc(label)}</span>`)],
    summary: `Add a "${label}" badge to ${top.name}'s card`,
    notes: ['Add a style for .h88-top-pick in your CSS (e.g. a coloured pill) so the badge stands out.'],
  };
};

function jsonLdBefore(src: string, ...data: unknown[]): Edit | undefined {
  const at = src.search(/<\/head>/i);
  if (at === -1) return undefined;
  return editAt(src, at, at, data.map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>\n`).join(''));
}

function personData(page: PageModel) {
  if (!page.author) return undefined;
  const url = page.author.href && /^https?:/.test(page.author.href) ? page.author.href : undefined;
  return { '@context': 'https://schema.org', '@type': 'Person', name: page.author.name, ...(url ? { url } : {}) };
}

const personSchema: Fixer = (_f, src, page) => {
  const d = personData(page);
  const e = d && jsonLdBefore(src, d);
  return e ? { edits: [e], summary: `Add Person structured data for ${page.author!.name}`, notes: ['Add sameAs links (LinkedIn, other publications) to the Person data if you have them.'] } : undefined;
};

const missingSchema: Fixer = (f, src, page, ctx) => {
  const data: unknown[] = [];
  const added: string[] = [];
  const has = new Set(page.jsonLd.flatMap((b) => b.types));
  const want = (t: string) => f.title.includes(t) && !has.has(t);
  let origin = '';
  try {
    origin = new URL(ctx.url).origin;
  } catch {
    /* local file */
  }
  if (want('WebSite') && origin) {
    data.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: new URL(origin).hostname.replace(/^www\./, ''), url: origin + '/' });
    added.push('WebSite');
  }
  if (want('BreadcrumbList') && origin) {
    const h1 = page.headings.find((h) => h.level === 1)?.text ?? page.title ?? '';
    data.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: ctx.lang === 'fr' ? 'Accueil' : 'Home', item: origin + '/' },
        { '@type': 'ListItem', position: 2, name: h1.slice(0, 110), item: ctx.url },
      ],
    });
    added.push('BreadcrumbList');
  }
  if (want('ItemList') && page.cards.length) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: [...page.cards].sort((a, b) => a.rank - b.rank).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name })),
    });
    added.push('ItemList');
  }
  if (want('FAQPage') && page.faq.length) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    });
    added.push('FAQPage');
  }
  const person = want('Person') ? personData(page) : undefined;
  if (person) (data.push(person), added.push('Person'));
  const e = data.length ? jsonLdBefore(src, ...data) : undefined;
  const notes = f.title.includes('Review') && !has.has('Review') ? ['Review structured data needs your real rating data, so it was not added automatically.'] : [];
  return e ? { edits: [e], summary: `Add ${added.join(', ')} structured data`, notes } : undefined;
};

export const BUILTIN_FIXERS: Record<string, Fixer> = {
  'seo.affiliate-missing-sponsored': affiliateSponsored,
  'performance.lcp-image-lazy': lcpLazy,
  'consistency.stale-date': staleDate,
  'consistency.rank-text-mismatch': rankText,
  'consistency.faq-number-one-mismatch': faqNumberOne,
  'language.percent-spacing': percentSpacing,
  'language.decimal-separator': decimalSeparator,
  'cro.missing-cta-after-review': ctaAfterReview,
  'cro.top-pick-not-highlighted': topPickBadge,
  'eeat.no-person-schema': personSchema,
  'seo.schema-missing-types': missingSchema,
};

export function hasBuiltinFix(ruleId: string): boolean {
  return ruleId in BUILTIN_FIXERS;
}

export function builtinFix(f: Finding, src: string, page: PageModel, ctx: FixContext) {
  return BUILTIN_FIXERS[f.ruleId]?.(f, src, page, ctx);
}
