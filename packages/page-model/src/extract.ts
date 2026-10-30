import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { clean } from '@h88cro/core';
import type {
  Brand,
  BrandCard,
  BrandTableRow,
  Cta,
  DateMention,
  DeviceLayout,
  FaqItem,
  Heading,
  Image,
  JsonLdBlock,
  Link,
  PageModel,
  ReviewSection,
  TableModel,
  TextBlock,
  Toc,
} from './types.js';
import {
  AFFILIATE_PATH_RE,
  PUBLISHED_RE,
  TESTED_RE,
  UPDATED_RE,
  findStatedRank,
  parseDate,
  parseMoney,
  parseRating,
} from './lexicon.js';

export type ExtractInput = {
  html: string;
  url: string;
  isLocalFile?: boolean;
  layout?: PageModel['layout'];
  responseHeaders?: Record<string, string>;
  statusCode?: number;
};

const BLOCK_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt,summary,td,th';
const CTA_CLASS_RE = /\b(btn|button|cta|play|claim|bonus-?link)\b/i;

/** Build a short, readable CSS selector for evidence. */
export function selectorFor($: CheerioAPI, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.type === 'tag' && parts.length < 5) {
    const name = cur.tagName.toLowerCase();
    if (name === 'html' || name === 'body') break;
    const id = cur.attribs?.id;
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      parts.unshift(`${name}#${id}`);
      break;
    }
    const parent = cur.parent as Element | null;
    if (parent && parent.type === 'tag') {
      const same = (parent.children as AnyNode[]).filter((c): c is Element => c.type === 'tag' && (c as Element).tagName === cur!.tagName);
      parts.unshift(same.length > 1 ? `${name}:nth-of-type(${same.indexOf(cur) + 1})` : name);
    } else parts.unshift(name);
    cur = parent && parent.type === 'tag' ? parent : null;
  }
  return parts.join(' > ');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

function resolve(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function hostOf(u: string | undefined): string | undefined {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

export function extractPageModel(input: ExtractInput): PageModel {
  const $ = cheerio.load(input.html);
  const base = input.url;
  const pageHost = input.isLocalFile ? undefined : hostOf(base);
  const h88 = (el: Element) => el.attribs?.['data-h88'];

  // Drop non-content nodes from text extraction (but keep them for script/style analysis below).
  const scripts = $('script')
    .toArray()
    .filter((el) => !/ld\+json/i.test(el.attribs.type ?? ''))
    .map((el) => {
      const src = el.attribs.src;
      const abs = src ? resolve(src, base) : undefined;
      const host = hostOf(abs);
      return {
        src: abs ?? src,
        async: 'async' in el.attribs,
        defer: 'defer' in el.attribs,
        type: el.attribs.type,
        inHead: $(el).closest('head').length > 0,
        isThirdParty: !!(src && host && host !== pageHost && !/^(file|data):/.test(abs ?? '')),
        inlineLength: src ? 0 : $(el).text().length,
      };
    });

  const stylesheets = $('link[rel~="stylesheet"]')
    .toArray()
    .map((el) => ({ href: el.attribs.href ?? '', media: el.attribs.media, inHead: $(el).closest('head').length > 0 }));

  const preconnects = $('link[rel~="preconnect"], link[rel~="dns-prefetch"]')
    .toArray()
    .map((el) => el.attribs.href ?? '');

  const jsonLd: JsonLdBlock[] = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => {
      const raw = $(el).text();
      try {
        const parsed = JSON.parse(raw) as unknown;
        return { raw, parsed, types: collectTypes(parsed) };
      } catch (e) {
        return { raw, error: (e as Error).message, types: [] };
      }
    });

  const metas = (sel: string) => $(sel).attr('content')?.trim();
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    og[el.attribs.property!] = el.attribs.content ?? '';
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    twitter[el.attribs.name!] = el.attribs.content ?? '';
  });

  $('script, style, noscript, template, svg').remove();

  // Reading-order blocks. Skip containers that hold other blocks (e.g. <li><p>…</p></li>).
  const headings: Heading[] = [];
  const blocks: TextBlock[] = [];
  const blockIndexOf = new Map<Element, number>();
  const blockEls: Element[] = [];
  $(`${BLOCK_SEL},div,span`).each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (!/^h[1-6]$/.test(tag) && $(el).find(BLOCK_SEL).length) return;
    if (tag === 'div' || tag === 'span') {
      // Leaf containers with their own text (e.g. bonus lines in cards), not inside another block.
      if ($(el).find('div,span').length) return;
      if ($(el).parents(BLOCK_SEL).length) return;
      if (!(el.children as AnyNode[]).some((c) => c.type === 'text' && clean((c as unknown as { data: string }).data))) return;
    }
    const text = clean($(el).text());
    if (!text) return;
    const index = blocks.length;
    const selector = selectorFor($, el);
    blocks.push({ tag, text, selector, h88: h88(el), index });
    blockIndexOf.set(el, index);
    blockEls.push(el);
    if (/^h[1-6]$/.test(tag)) headings.push({ level: Number(tag[1]), text, id: el.attribs.id, selector, h88: h88(el), index });
  });

  /** Index of the reading-order block containing or preceding an element. */
  const indexOfEl = (el: Element): number => {
    let cur: Element | null = el;
    while (cur) {
      const i = blockIndexOf.get(cur);
      if (i !== undefined) return i;
      cur = cur.parent && (cur.parent as Element).type === 'tag' ? (cur.parent as Element) : null;
    }
    // Not inside a block: use the last block that comes before it in document order.
    let last = -1;
    const all = $('*').toArray();
    const pos = all.indexOf(el);
    for (const [bEl, i] of blockIndexOf) if (all.indexOf(bEl) < pos && i > last) last = i;
    return last + 0.5;
  };

  const links: Link[] = $('a[href]')
    .toArray()
    .map((el) => {
      const href = el.attribs.href ?? '';
      const abs = resolve(href, base);
      const host = hostOf(abs);
      const rel = (el.attribs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const affMatch = href.match(AFFILIATE_PATH_RE);
      const isExternal = !!host && host !== pageHost && /^https?:/.test(abs ?? '');
      const isAffiliate = !!affMatch || rel.includes('sponsored') || 'data-affiliate' in el.attribs;
      let brandSlug = el.attribs['data-brand'] ? slugify(el.attribs['data-brand']) : affMatch ? slugify(affMatch[2]!) : undefined;
      if (!brandSlug && isAffiliate && host) brandSlug = slugify(host.split('.')[0]!);
      return {
        href,
        absHref: abs,
        text: clean($(el).text()) || clean(el.attribs['aria-label']) || clean($(el).find('img').attr('alt')),
        rel,
        target: el.attribs.target,
        selector: selectorFor($, el),
        h88: h88(el),
        isAffiliate,
        isExternal,
        brandSlug,
        inTable: $(el).closest('table').length > 0,
        index: indexOfEl(el),
        classes: el.attribs.class ?? '',
      };
    });

  const images: Image[] = $('img')
    .toArray()
    .map((el) => ({
      src: resolve(el.attribs.src ?? '', base) ?? el.attribs.src ?? '',
      alt: el.attribs.alt,
      width: el.attribs.width,
      height: el.attribs.height,
      loading: el.attribs.loading,
      fetchpriority: el.attribs.fetchpriority,
      selector: selectorFor($, el),
      h88: h88(el),
      index: indexOfEl(el),
      hasSrcset: !!el.attribs.srcset,
      inPicture: $(el).parent('picture').length > 0,
    }));

  const ctas: Cta[] = $('a[href], button, [role="button"]')
    .toArray()
    .flatMap((el) => {
      const text = clean($(el).text()) || clean(el.attribs['aria-label']);
      const classes = el.attribs.class ?? '';
      const link = el.tagName === 'a' ? links.find((l) => l.h88 ? l.h88 === h88(el) : l.selector === selectorFor($, el)) : undefined;
      const looksLikeCta = CTA_CLASS_RE.test(classes) || el.tagName === 'button' || el.attribs.role === 'button';
      if (!text || text.length > 60) return [];
      if (!link?.isAffiliate && !looksLikeCta) return [];
      if (el.tagName === 'button' && /menu|close|fermer|toggle|search/i.test(text + classes)) return [];
      return [
        {
          text,
          href: link?.href,
          selector: link?.selector ?? selectorFor($, el),
          h88: h88(el),
          index: link?.index ?? indexOfEl(el),
          isAffiliate: !!link?.isAffiliate,
          brandSlug: link?.brandSlug,
          inTable: $(el).closest('table').length > 0,
          tag: el.tagName,
          classes,
        },
      ];
    });

  const tables: TableModel[] = $('table')
    .toArray()
    .map((t) => {
      const headers = $(t)
        .find('thead th, tr:first-child th')
        .toArray()
        .map((th) => clean($(th).text()));
      const rows = $(t)
        .find('tbody tr, tr')
        .toArray()
        .filter((tr, i, arr) => arr.indexOf(tr) === i && $(tr).find('td').length > 0)
        .map((tr) => {
          const linkIdx = $(tr)
            .find('a[href]')
            .toArray()
            .map((a) => links.findIndex((l) => l.selector === selectorFor($, a)))
            .filter((i) => i >= 0);
          return {
            cells: $(tr)
              .find('td, th')
              .toArray()
              .map((c) => clean($(c).text())),
            text: clean($(tr).text()),
            linkIdx,
            selector: selectorFor($, tr),
          };
        });
      return { selector: selectorFor($, t), h88: h88(t), headers, rows };
    });

  const { cards, cardEls } = extractCards($, links, indexOfEl);
  const inCard = new Set<number>();
  blockEls.forEach((el, i) => {
    if (cardEls.some((c) => $(c).find(el).length > 0)) inCard.add(i);
  });
  const brandNames = new Map<string, string>();
  for (const c of cards) brandNames.set(c.slug, c.name);
  for (const l of links) if (l.isAffiliate && l.brandSlug && !brandNames.has(l.brandSlug)) brandNames.set(l.brandSlug, titleCase(l.brandSlug));

  const tableRows = extractTableRows(tables, links, brandNames);
  const reviews = extractReviews(headings.filter((h) => !inCard.has(h.index)), blocks, links, brandNames);
  const schema = schemaBrandFacts(jsonLd, brandNames);

  const brands: Brand[] = [...brandNames.entries()].map(([slug, name]) => ({
    slug,
    name,
    card: cards.find((c) => c.slug === slug),
    table: tableRows.find((r) => r.slug === slug),
    review: reviews.find((r) => r.slug === slug),
    schemaPosition: schema.get(slug)?.position,
    schemaRating: schema.get(slug)?.rating,
  }));

  const bodyText = clean($('body').text());

  return {
    url: input.url,
    isLocalFile: !!input.isLocalFile,
    htmlLang: $('html').attr('lang')?.trim() || undefined,
    title: clean($('title').first().text()) || undefined,
    metaDescription: metas('meta[name="description"]'),
    metaRobots: metas('meta[name="robots"]'),
    canonical: $('link[rel="canonical"]').attr('href'),
    hreflang: $('link[rel="alternate"][hreflang]')
      .toArray()
      .map((el) => ({ lang: el.attribs.hreflang ?? '', href: el.attribs.href ?? '' })),
    og,
    twitter,
    hasFavicon: $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0,
    viewportMeta: metas('meta[name="viewport"]'),
    headings,
    blocks,
    links,
    images,
    scripts,
    stylesheets,
    preconnects,
    jsonLd,
    tables,
    ctas,
    brands,
    cards,
    reviews,
    faq: extractFaq($, headings, blocks),
    toc: extractToc($),
    dates: extractDates($),
    author: extractAuthor($),
    bodyText,
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    layout: input.layout,
    responseHeaders: input.responseHeaders,
    statusCode: input.statusCode,
  };
}

function collectTypes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectTypes(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const t = o['@type'];
    if (typeof t === 'string') out.push(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.push(x));
    for (const [k, v] of Object.entries(o)) if (k !== '@type') collectTypes(v, out);
  }
  return out;
}

/**
 * Brand cards: for each affiliate link outside tables, climb to the largest ancestor that still
 * contains links to only one brand. The biggest group of sibling cards is the toplist.
 */
function extractCards($: CheerioAPI, links: Link[], indexOfEl: (el: Element) => number): { cards: BrandCard[]; cardEls: Element[] } {
  const anchors = $('a[href]').toArray();
  const byEl = new Map<Element, Link>();
  anchors.forEach((a, i) => byEl.set(a, links[i]!));
  const brandsIn = (el: Element): Set<string> => {
    const s = new Set<string>();
    $(el)
      .find('a[href]')
      .each((_, a) => {
        const l = byEl.get(a as Element);
        if (l?.isAffiliate && l.brandSlug) s.add(l.brandSlug);
      });
    return s;
  };

  const candidates = new Map<Element, string>();
  for (const [a, l] of byEl) {
    if (!l.isAffiliate || !l.brandSlug || l.inTable) continue;
    let card: Element | null = null;
    let cur = a.parent as Element | null;
    while (cur && cur.type === 'tag' && !['body', 'html', 'main'].includes(cur.tagName)) {
      if (brandsIn(cur).size > 1) break;
      card = cur;
      cur = cur.parent as Element | null;
    }
    if (card && clean($(card).text()).length > 20) candidates.set(card, l.brandSlug);
  }

  // Group candidate cards by parent; keep the largest sibling group (the toplist).
  const groups = new Map<AnyNode | null, Element[]>();
  for (const el of candidates.keys()) {
    const p = el.parent;
    groups.set(p, [...(groups.get(p) ?? []), el]);
  }
  let best: Element[] = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;
  if (best.length < 2) best = [...candidates.keys()].slice(0, best.length || 0);
  const all = $('*').toArray();
  best.sort((a, b) => all.indexOf(a) - all.indexOf(b));

  const cards = best.map((el, i) => {
    const slug = candidates.get(el)!;
    const text = clean($(el).text());
    const explicitRank = clean($(el).find('[class*="rank"], [class*="position"], [class*="number"]').first().text()).match(/\d{1,2}/)?.[0];
    const name =
      clean($(el).attr('data-brand')) ||
      clean($(el).find('h2,h3,h4,h5,[class*="name"],[class*="title"]').first().text()) ||
      clean($(el).find('img[alt]').first().attr('alt')).replace(/\s*(logo|casino logo)$/i, '') ||
      titleCase(slug);
    const ratingEl = clean($(el).find('[class*="rating"], [class*="score"], [class*="note"]').first().text());
    const rating = parseRating(ratingEl) ?? parseRating(text) ?? (ratingEl ? { value: Number(ratingEl.replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]), scale: 10, text: ratingEl } : undefined);
    const bonusEl = clean($(el).find('[class*="bonus"], [class*="offer"]').first().text());
    const bonusSrc = bonusEl || (text.match(/[^.]*bonus[^.]*/i)?.[0] ?? '');
    return {
      slug,
      name: name.length > 40 ? titleCase(slug) : name,
      rank: explicitRank ? Number(explicitRank) : i + 1,
      selector: selectorFor($, el),
      h88: el.attribs['data-h88'],
      rating: rating && Number.isFinite(rating.value) ? rating.value : undefined,
      ratingScale: rating?.scale,
      ratingText: rating?.text,
      bonusText: bonusSrc || undefined,
      bonusAmount: bonusSrc ? parseMoney(bonusSrc) : undefined,
      text,
      hasTermsLink: $(el).find('a').toArray().some((a) => /t&c|terms|conditions|cgu|cgv|voorwaarden|villkor|termos/i.test(clean($(a).text()) + (a.attribs.href ?? ''))) || /\b(T&Cs?|conditions s'appliquent|voir conditions|terms apply)\b/i.test(text),
      hasCta: $(el).find('a[href]').toArray().some((a) => byEl.get(a as Element)?.isAffiliate),
      index: indexOfEl(el),
    };
  });
  return { cards, cardEls: best };
}

function extractTableRows(tables: TableModel[], links: Link[], brandNames: Map<string, string>): BrandTableRow[] {
  // The comparison table is the table with the most rows that reference brands.
  let bestRows: BrandTableRow[] = [];
  for (const t of tables) {
    const rows: BrandTableRow[] = [];
    t.rows.forEach((r) => {
      let slug = r.linkIdx.map((i) => links[i]).find((l) => l?.isAffiliate && l.brandSlug)?.brandSlug;
      if (!slug) for (const [s, name] of brandNames) if (r.text.toLowerCase().includes(name.toLowerCase())) slug = s;
      if (!slug) return;
      const explicit = r.cells[0]?.match(/^#?(\d{1,2})\.?$/)?.[1];
      const rating = r.cells.map((c) => parseRating(c)).find(Boolean) ?? parseRating(r.text);
      rows.push({
        slug,
        name: brandNames.get(slug) ?? titleCase(slug),
        rank: explicit ? Number(explicit) : rows.length + 1,
        rating: rating?.value,
        ratingScale: rating?.scale,
        text: r.text,
        hasCta: r.linkIdx.some((i) => links[i]?.isAffiliate),
        selector: r.selector,
      });
    });
    if (rows.length > bestRows.length) bestRows = rows;
  }
  return bestRows.length >= 2 ? bestRows : [];
}

function extractReviews(headings: Heading[], blocks: TextBlock[], links: Link[], brandNames: Map<string, string>): ReviewSection[] {
  const out: ReviewSection[] = [];
  const seen = new Set<string>();
  headings.forEach((h, hi) => {
    if (h.level < 2 || h.level > 3) return;
    const lower = h.text.toLowerCase();
    let slug: string | undefined;
    for (const [s, name] of brandNames) if (lower.includes(name.toLowerCase()) || lower.includes(s.replace(/-/g, ' '))) slug = s;
    if (!slug || seen.has(slug)) return;
    if (/\b(vs|versus|contre)\b/i.test(lower)) return;
    const next = headings.slice(hi + 1).find((n) => n.level <= h.level);
    const end = next ? next.index : blocks.length;
    const secBlocks = blocks.slice(h.index + 1, end);
    const text = secBlocks.map((b) => b.text).join(' ');
    seen.add(slug);
    out.push({
      slug,
      name: brandNames.get(slug)!,
      order: out.length + 1,
      heading: h,
      text,
      blocks: secBlocks,
      hasCta: links.some((l) => l.isAffiliate && l.index > h.index && l.index < end),
      statedRank: findStatedRank(`${h.text}. ${text}`),
    });
  });
  return out.length >= 2 ? out : out.filter((r) => r.statedRank);
}

function schemaBrandFacts(jsonLd: JsonLdBlock[], brandNames: Map<string, string>): Map<string, { position?: number; rating?: number }> {
  const out = new Map<string, { position?: number; rating?: number }>();
  const slugFor = (name: unknown): string | undefined => {
    if (typeof name !== 'string') return undefined;
    const n = name.toLowerCase();
    for (const [s, bn] of brandNames) if (n.includes(bn.toLowerCase()) || n.includes(s.replace(/-/g, ' '))) return s;
    return undefined;
  };
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o['@type'] === 'ListItem') {
      const item = o.item as Record<string, unknown> | undefined;
      const slug = slugFor(o.name ?? item?.name);
      if (slug) out.set(slug, { ...out.get(slug), position: Number(o.position) || undefined });
    }
    const ar = (o.aggregateRating ?? (o.reviewRating as unknown)) as Record<string, unknown> | undefined;
    if (ar && typeof ar === 'object') {
      const slug = slugFor(o.name ?? (o.itemReviewed as Record<string, unknown> | undefined)?.name);
      const v = Number(String(ar.ratingValue ?? '').replace(',', '.'));
      if (slug && Number.isFinite(v)) out.set(slug, { ...out.get(slug), rating: v });
    }
    Object.values(o).forEach(visit);
  };
  jsonLd.forEach((b) => visit(b.parsed));
  return out;
}

function extractFaq($: CheerioAPI, headings: Heading[], blocks: TextBlock[]): FaqItem[] {
  const faq: FaqItem[] = [];
  $('details').each((_, el) => {
    const q = clean($(el).find('summary').first().text());
    const a = clean($(el).clone().find('summary').remove().end().text());
    if (q) faq.push({ question: q, answer: a, selector: selectorFor($, el) });
  });
  if (faq.length) return faq;
  const faqHeading = headings.find((h) => /faq|questions fr[ée]quentes|foire aux questions|frequently asked|vanliga frågor|perguntas frequentes/i.test(h.text));
  if (!faqHeading) return faq;
  const end = headings.find((h) => h.index > faqHeading.index && h.level <= faqHeading.level)?.index ?? blocks.length;
  const sec = blocks.slice(faqHeading.index + 1, end).filter((b) => !/(^|\s)footer\b/.test(b.selector));
  for (let i = 0; i < sec.length; i++) {
    const b = sec[i]!;
    if (b.text.trim().endsWith('?')) {
      const answer: string[] = [];
      for (let j = i + 1; j < sec.length && !sec[j]!.text.trim().endsWith('?'); j++) answer.push(sec[j]!.text);
      faq.push({ question: b.text, answer: answer.join(' '), selector: b.selector });
    }
  }
  return faq;
}

function extractToc($: CheerioAPI): Toc | undefined {
  const containers = $('nav, [class*="toc"], [id*="toc"], [class*="sommaire"], [id*="sommaire"], [class*="table-of-contents"]').toArray();
  for (const c of containers) {
    const items = $(c)
      .find('a[href^="#"]')
      .toArray()
      .map((a) => ({ text: clean($(a).text()), href: a.attribs.href ?? '' }))
      .filter((i) => i.text && i.href.length > 1);
    if (items.length >= 3) return { selector: selectorFor($, c as Element), items };
  }
  return undefined;
}

function extractDates($: CheerioAPI): DateMention[] {
  const out: DateMention[] = [];
  const seen = new Set<string>();
  const push = (el: Element, text: string, isoHint?: string) => {
    const kind: DateMention['kind'] = UPDATED_RE.test(text) ? 'updated' : TESTED_RE.test(text) ? 'tested' : PUBLISHED_RE.test(text) ? 'published' : 'other';
    const iso = isoHint ? parseDate(isoHint) : parseDate(text);
    const key = `${kind}|${iso}|${text.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: text.slice(0, 160), iso, selector: selectorFor($, el), kind });
  };
  $('time').each((_, el) => {
    const ctx = clean($(el).parent().text());
    push(el as Element, ctx || clean($(el).text()), el.attribs.datetime);
  });
  $('p, span, div, small, li').each((_, el) => {
    if ($(el).children('p, div, li').length) return;
    const t = clean($(el).text());
    if (t.length < 200 && (UPDATED_RE.test(t) || PUBLISHED_RE.test(t) || TESTED_RE.test(t)) && parseDate(t)) push(el as Element, t);
  });
  return out;
}

function extractAuthor($: CheerioAPI): PageModel['author'] {
  const el = $('[rel="author"], [itemprop="author"], [class*="author"], [class*="byline"]').first();
  if (el.length) {
    const nameEl = el.is('a') ? el : el.find('a').first().length ? el.find('a').first() : el;
    const name = clean(nameEl.text()).replace(/^(par|by|écrit par|written by|auteur\s*:)\s*/i, '').split(/\s*[,|–—]\s*/)[0]!;
    if (name) return { name: name.slice(0, 80), byline: clean(el.text()).slice(0, 200), selector: selectorFor($, el.get(0) as Element), href: nameEl.attr('href') };
  }
  let found: PageModel['author'];
  $('p, span, div, small').each((_, e) => {
    if (found) return;
    const t = clean($(e).text());
    const m = t.match(/^(?:par|by|écrit par|written by|auteur\s*:|testeur\s*:|testeuse\s*:)\s+([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+){0,3})/u);
    if (m && t.length < 200) found = { name: m[1]!, byline: t, selector: selectorFor($, e as Element) };
  });
  return found;
}

/** Visible rect of an element for a device, if layout was captured. */
export function rectOf(layout: DeviceLayout | undefined, h88id: string | undefined) {
  return layout && h88id ? layout.elements[h88id] : undefined;
}

export type { Cheerio };
