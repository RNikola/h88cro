import { excerpt, finding, type Finding, type PageType } from '@h88cro/core';
import type { Analyzer, AnalyzerContext } from '@h88cro/page-model';

const EXPECTED_SCHEMA: Record<PageType, string[]> = {
  toplist: ['Organization|WebSite', 'BreadcrumbList', 'ItemList'],
  'brand-review': ['Organization|WebSite', 'BreadcrumbList', 'Review'],
  bonus: ['Organization|WebSite', 'BreadcrumbList'],
  slot: ['Organization|WebSite', 'BreadcrumbList'],
  sportsbook: ['Organization|WebSite', 'BreadcrumbList'],
  other: ['Organization|WebSite'],
};

/** BCP 47-ish hreflang check: language (ISO 639-1), optional region (ISO 3166-1 alpha-2), or x-default. */
const HREFLANG_RE = /^([a-z]{2,3})(-[A-Za-z]{4})?(-([A-Z]{2}|\d{3}))?$/i;
const INVALID_REGIONS = new Set(['UK', 'EN', 'EU']);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function runSeo(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const { page } = ctx;

  // Title
  if (!page.title) {
    out.push(finding({ ruleId: 'seo.title-missing', severity: 'high', title: 'The page has no <title>', explanation: 'The title is the headline in Google results and the biggest on-page ranking signal.', suggestion: 'Add a title of 50–60 characters with the main keyword and the year or market.', effort: 'xs', impact: 4 }));
  } else {
    if (page.title.length > 60) {
      out.push(finding({ ruleId: 'seo.title-length', severity: 'medium', title: `Title is ${page.title.length} characters; Google shows about 60`, explanation: 'Long titles get cut off in search results, often losing the most persuasive part.', suggestion: 'Shorten to 50–60 characters and lead with the main keyword.', evidence: [{ selector: 'title', textExcerpt: page.title }], effort: 'xs', impact: 2, confidence: 0.9 }));
    } else if (page.title.length < 25) {
      out.push(finding({ ruleId: 'seo.title-length', severity: 'low', title: `Title is only ${page.title.length} characters`, explanation: 'A short title wastes space that could hold the keyword, year or a reason to click.', suggestion: 'Expand to 50–60 characters.', evidence: [{ selector: 'title', textExcerpt: page.title }], effort: 'xs', impact: 1, confidence: 0.8 }));
    }
    if (/\|\s*[\w-]+\.(best|com|net|org|fr|io|casino)\b/i.test(page.title) && page.title.split('|').length > 2) {
      out.push(finding({ ruleId: 'seo.title-domain-filler', severity: 'low', title: 'Title spends characters on the domain name and filler', explanation: 'Google already shows the site name; repeating it pushes useful words out of view.', suggestion: 'Drop the domain and repeated phrases from the title.', evidence: [{ selector: 'title', textExcerpt: page.title }], effort: 'xs', impact: 1, confidence: 0.75 }));
    }
  }

  // Meta description
  if (!page.metaDescription) {
    out.push(finding({ ruleId: 'seo.meta-description-missing', severity: 'medium', title: 'No meta description', explanation: 'Without one, Google picks a random snippet, which usually converts worse in search results.', suggestion: 'Write a 140–160 character description that names the offer and a reason to click.', effort: 'xs', impact: 2 }));
  } else if (page.metaDescription.length > 165 || page.metaDescription.length < 70) {
    out.push(finding({ ruleId: 'seo.meta-description-length', severity: 'low', title: `Meta description is ${page.metaDescription.length} characters`, explanation: 'About 140–160 characters fit in search results.', suggestion: 'Adjust to 140–160 characters.', evidence: [{ selector: 'meta[name=description]', textExcerpt: page.metaDescription }], effort: 'xs', impact: 1, confidence: 0.8 }));
  }

  // Headings
  const h1s = page.headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    out.push(finding({ ruleId: 'seo.h1-count', severity: 'high', title: 'No H1 heading', explanation: 'The H1 tells visitors and search engines what the page is about.', suggestion: 'Add one H1 containing the main keyword.', effort: 'xs', impact: 3, key: '0' }));
  } else if (h1s.length > 1) {
    out.push(finding({ ruleId: 'seo.h1-count', severity: 'medium', title: `${h1s.length} H1 headings on the page`, explanation: 'Several H1s dilute the main topic signal.', suggestion: 'Keep one H1 and turn the others into H2s.', evidence: h1s.map((h) => ({ selector: h.selector, textExcerpt: h.text })), effort: 'xs', impact: 2, confidence: 0.9, key: 'n' }));
  }
  for (let i = 1; i < page.headings.length; i++) {
    const prev = page.headings[i - 1]!;
    const h = page.headings[i]!;
    if (h.level > prev.level + 1) {
      out.push(finding({ ruleId: 'seo.heading-skip', severity: 'low', title: `Heading level jumps from H${prev.level} to H${h.level}`, explanation: 'Skipped levels make the outline harder for search engines and screen readers to follow.', suggestion: `Use H${prev.level + 1} here.`, evidence: [{ selector: h.selector, textExcerpt: h.text }], effort: 'xs', impact: 1, confidence: 0.8 }));
      break;
    }
  }

  // Indexability
  if (!page.canonical) {
    out.push(finding({ ruleId: 'seo.canonical-missing', severity: 'medium', title: 'No canonical URL', explanation: 'Tracking parameters and duplicates can split ranking signals without a canonical.', suggestion: 'Add <link rel="canonical"> pointing to the clean URL.', effort: 'xs', impact: 2 }));
  }
  if (page.metaRobots && /noindex/i.test(page.metaRobots)) {
    out.push(finding({ ruleId: 'seo.noindex', severity: 'critical', title: 'The page tells search engines not to index it', explanation: 'A noindex tag removes the page from Google entirely.', suggestion: 'Remove noindex if this page should rank.', evidence: [{ selector: 'meta[name=robots]', textExcerpt: page.metaRobots }], effort: 'xs', impact: 5, confidence: 0.95 }));
  }
  if (!page.htmlLang) {
    out.push(finding({ ruleId: 'seo.lang-missing', severity: 'medium', title: 'No language declared on <html>', explanation: 'The lang attribute helps search engines and screen readers serve the page to the right audience.', suggestion: 'Add lang="fr-FR" (or the right locale) to the <html> tag.', effort: 'xs', impact: 2 }));
  }

  // hreflang
  if (page.hreflang.length) {
    const invalid = page.hreflang.filter((h) => h.lang !== 'x-default' && (!HREFLANG_RE.test(h.lang) || INVALID_REGIONS.has(h.lang.split('-')[1]?.toUpperCase() ?? '')));
    if (invalid.length) {
      out.push(finding({ ruleId: 'seo.hreflang-invalid', severity: 'medium', title: `Invalid hreflang code${invalid.length > 1 ? 's' : ''}: ${invalid.map((h) => h.lang).join(', ')}`, explanation: 'Google ignores invalid codes, so the wrong language version may rank. Note: the UK is "GB" (en-GB), not "UK".', suggestion: `Fix the codes, e.g. ${invalid.map((h) => `${h.lang} → ${h.lang.replace(/-uk$/i, '-GB')}`).join(', ')}.`, evidence: invalid.map((h) => ({ selector: `link[hreflang="${h.lang}"]`, textExcerpt: h.href })), effort: 'xs', impact: 2, confidence: 0.95 }));
    }
    if (!page.hreflang.some((h) => h.lang === 'x-default')) {
      out.push(finding({ ruleId: 'seo.hreflang-no-x-default', severity: 'low', title: 'hreflang set has no x-default', explanation: 'x-default tells Google which version to show visitors from other markets.', suggestion: 'Add <link rel="alternate" hreflang="x-default" href="…">.', effort: 'xs', impact: 1, confidence: 0.9 }));
    }
    if (!page.isLocalFile && page.canonical && !page.hreflang.some((h) => h.href === page.canonical)) {
      out.push(finding({ ruleId: 'seo.hreflang-no-self', severity: 'low', title: 'hreflang set does not include this page', explanation: 'Each language version should list itself in its hreflang set.', suggestion: 'Add a self-referencing hreflang entry.', effort: 'xs', impact: 1, confidence: 0.8 }));
    }
  }

  // Structured data
  for (const b of page.jsonLd.filter((b) => b.error)) {
    out.push(finding({ ruleId: 'seo.jsonld-invalid', severity: 'high', title: 'Structured data (JSON-LD) has a syntax error', explanation: 'Google ignores broken JSON-LD completely, so no rich results are possible.', suggestion: `Fix the JSON: ${b.error}`, evidence: [{ selector: 'script[type="application/ld+json"]', textExcerpt: excerpt(b.raw, 120) }], effort: 'xs', impact: 3, confidence: 0.95, key: b.raw.slice(0, 50) }));
  }
  const types = new Set(page.jsonLd.flatMap((b) => b.types));
  const expected = [...EXPECTED_SCHEMA[ctx.pageType]];
  if (page.faq.length >= 2) expected.push('FAQPage');
  if (page.author) expected.push('Person');
  const missing = expected.filter((e) => !e.split('|').some((t) => types.has(t)));
  if (missing.length) {
    out.push(finding({ ruleId: 'seo.schema-missing-types', severity: 'medium', title: `Missing structured data: ${missing.map((m) => m.replace('|', ' or ')).join(', ')}`, explanation: 'Structured data helps Google understand the page and can earn rich results (FAQ, breadcrumbs, author).', suggestion: `Add JSON-LD for ${missing.join(', ').replace(/\|/g, '/')}.`, effort: 's', impact: 2, confidence: 0.85, fix: { type: 'schema-replace', available: false } }));
  }
  const selfServing = page.jsonLd.some((b) => {
    let found = false;
    const visit = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(visit);
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (['Organization', 'WebSite', 'LocalBusiness'].includes(String(o['@type'])) && o.aggregateRating) found = true;
      Object.values(o).forEach(visit);
    };
    visit(b.parsed);
    return found;
  });
  if (selfServing) {
    out.push(finding({ ruleId: 'seo.self-serving-rating', severity: 'high', title: 'The site rates itself with aggregateRating', explanation: 'Self-serving review markup on your own Organization/WebSite violates Google\'s guidelines and can lead to a manual action.', suggestion: 'Remove aggregateRating from the Organization/WebSite schema.', evidence: [{ selector: 'script[type="application/ld+json"]' }], effort: 'xs', impact: 3, confidence: 0.9 }));
  }
  const faqSchemaQs: string[] = [];
  for (const b of page.jsonLd) {
    const visit = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(visit);
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o['@type'] === 'Question' && typeof o.name === 'string') faqSchemaQs.push(o.name);
      Object.values(o).forEach(visit);
    };
    visit(b.parsed);
  }
  if (faqSchemaQs.length) {
    const visible = new Set(page.faq.map((f) => norm(f.question)));
    const notVisible = faqSchemaQs.filter((q) => !visible.has(norm(q)));
    if (notVisible.length) {
      out.push(finding({ ruleId: 'seo.faq-schema-mismatch', severity: 'medium', title: `${notVisible.length} FAQ question${notVisible.length > 1 ? 's' : ''} in the schema ${notVisible.length > 1 ? 'are' : 'is'} not on the page`, explanation: 'FAQ markup must match the visible FAQ, or Google may ignore it or treat it as spam.', suggestion: 'Generate the FAQPage schema from the visible FAQ.', evidence: notVisible.map((q) => ({ textExcerpt: q })), effort: 'xs', impact: 2, confidence: 0.85, fix: { type: 'schema-replace', available: false } }));
    }
  }

  // Affiliate links: rel="sponsored"
  const unsponsored = page.links.filter((l) => l.isAffiliate && !l.rel.includes('sponsored'));
  if (unsponsored.length) {
    out.push(finding({ ruleId: 'seo.affiliate-missing-sponsored', severity: 'high', title: `${unsponsored.length} affiliate link${unsponsored.length > 1 ? 's are' : ' is'} missing rel="sponsored"`, explanation: 'Google asks for paid links to be marked rel="sponsored". Unmarked affiliate links risk a link-scheme penalty for the whole site.', suggestion: 'Add rel="sponsored nofollow" to every affiliate link (ideally in the link template).', evidence: unsponsored.slice(0, 8).map((l) => ({ selector: l.selector, textExcerpt: `${l.text} → ${l.href} (rel="${l.rel.join(' ')}")` })), effort: 'xs', impact: 4, confidence: 0.95, fix: { type: 'html-patch', available: false } }));
  }

  // Social cards, favicon
  const ogMissing = ['og:title', 'og:description', 'og:image'].filter((k) => !page.og[k]);
  if (ogMissing.length) {
    out.push(finding({ ruleId: 'seo.open-graph-missing', severity: 'low', title: `Missing social sharing tags: ${ogMissing.join(', ')}`, explanation: 'Without Open Graph tags, shared links show a random image and text.', suggestion: 'Add og:title, og:description and og:image (and twitter:card).', effort: 'xs', impact: 1, confidence: 0.9 }));
  }
  if (!page.hasFavicon) {
    out.push(finding({ ruleId: 'seo.favicon-missing', severity: 'low', title: 'No favicon declared', explanation: 'Google shows the favicon next to mobile results; a missing one looks unprofessional.', suggestion: 'Add <link rel="icon" href="/favicon.ico">.', effort: 'xs', impact: 1, confidence: 0.8 }));
  }

  return out;
}

export const seoAnalyzer: Analyzer = { id: 'seo', version: '0.1.0', run: runSeo };
export default seoAnalyzer;
