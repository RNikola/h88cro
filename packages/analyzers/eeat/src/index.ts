import { finding, type Finding } from '@h88cro/core';
import type { Analyzer, AnalyzerContext } from '@h88cro/page-model';

const DISCLOSURE_RE = /(publicit[ée]|commission|affili[ée]|affiliation|liens? partenaires?|partenariat|sponsoris|advertis|affiliate|we may earn|we earn a|reklam|annonce|samarbete|provisie|comissão|publicidade)/i;
const RESPONSIBLE_RE = /(jeu responsable|jouez (de mani[eè]re )?responsable|joueurs info service|evalujeu|\b18\s?\+|interdit aux mineurs|begambleaware|gamcare|responsible (gambling|gaming)|gamble responsibly|spelpaus|stödlinjen|stopspillet|rofus|agog|jogo respons[aá]vel|loket kansspel|cruks)/i;
const TESTING_CLAIM_RE = /(nous avons test[ée]|test[ée] par notre|nos tests|notre test|we tested|tested by our|our test|hands-on|vi har testat|vi har testet|wij hebben getest|test[ée]e?s? (en|le|sur))/i;
const EVIDENCE_IMG_RE = /(capture|screenshot|retrait|withdrawal|preuve|proof|test|skärmdump|skærmbillede)/i;

function hasPersonSchema(ctx: AnalyzerContext): { found: boolean; sameAs: boolean; dateModified?: string } {
  let found = false;
  let sameAs = false;
  let dateModified: string | undefined;
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o['@type'] === 'Person') {
      found = true;
      if (o.sameAs) sameAs = true;
    }
    if (typeof o.dateModified === 'string') dateModified ??= o.dateModified;
    Object.values(o).forEach(visit);
  };
  ctx.page.jsonLd.forEach((b) => visit(b.parsed));
  return { found, sameAs, dateModified };
}

export function runEeat(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const { page } = ctx;
  const text = page.bodyText;
  const linkText = page.links.map((l) => `${l.text} ${l.href}`).join(' ');
  const schema = hasPersonSchema(ctx);

  if (!page.author) {
    out.push(finding({ ruleId: 'eeat.no-author', severity: 'high', title: 'No author is shown', explanation: 'Players and Google trust reviews more when a named, real expert stands behind them.', suggestion: 'Show the author\'s name and photo near the title, linked to an author page with their experience.', effort: 's', impact: 3, confidence: 0.8 }));
  } else {
    if (!page.author.href) {
      out.push(finding({ ruleId: 'eeat.author-no-page', severity: 'medium', title: `Author "${page.author.name}" has no author page`, explanation: 'A linked author page with credentials and other articles is a strong expertise signal.', suggestion: 'Link the author name to a dedicated author page.', evidence: [{ selector: page.author.selector, textExcerpt: page.author.byline }], effort: 's', impact: 2, confidence: 0.8 }));
    }
    if (!schema.found) {
      out.push(finding({ ruleId: 'eeat.no-person-schema', severity: 'medium', title: 'Author is not marked up with Person schema', explanation: 'Person markup with sameAs links connects the author to their profiles, which helps Google recognise expertise.', suggestion: 'Add a Person object (name, url, sameAs) as the author of the Article/Review schema.', evidence: [{ selector: page.author.selector, textExcerpt: page.author.name }], effort: 'xs', impact: 2, confidence: 0.85, fix: { type: 'schema-replace', available: false } }));
    } else if (!schema.sameAs) {
      out.push(finding({ ruleId: 'eeat.person-no-same-as', severity: 'low', title: 'Author schema has no sameAs links', explanation: 'sameAs links (LinkedIn, X, other publications) help verify the author is real.', suggestion: 'Add sameAs URLs to the Person schema.', effort: 'xs', impact: 1, confidence: 0.85 }));
    }
  }

  const updated = page.dates.find((d) => d.kind === 'updated');
  if (!updated) {
    out.push(finding({ ruleId: 'eeat.no-updated-date', severity: 'medium', title: 'No visible "last updated" date', explanation: 'Bonus offers change often. A visible, recent date reassures players the information is current.', suggestion: 'Show "Updated on <date>" near the title, and keep dateModified in the schema in sync.', effort: 'xs', impact: 2, confidence: 0.8 }));
  } else if (updated.iso && schema.dateModified && schema.dateModified.slice(0, 10) !== updated.iso) {
    out.push(finding({ ruleId: 'eeat.date-modified-mismatch', severity: 'medium', title: `Visible date (${updated.iso}) differs from dateModified in the schema (${schema.dateModified.slice(0, 10)})`, explanation: 'Mismatched dates look like date manipulation to search engines.', suggestion: 'Set both from the same value when the page is updated.', evidence: [{ selector: updated.selector, textExcerpt: updated.text }], effort: 'xs', impact: 2, confidence: 0.85 }));
  }

  if (!DISCLOSURE_RE.test(text)) {
    out.push(finding({ ruleId: 'eeat.no-affiliate-disclosure', severity: 'medium', title: 'No affiliate disclosure near the list', explanation: 'Being open about commissions is a trust signal: readers and partners trust a transparent site more. (Treated as a quality signal, not a legal check.)', suggestion: 'Add a short line above the list, e.g. "We earn a commission when you sign up through our links. This does not affect our ranking."', effort: 'xs', impact: 2, confidence: 0.75 }));
  }
  if (!RESPONSIBLE_RE.test(text)) {
    out.push(finding({ ruleId: 'eeat.no-responsible-play', severity: 'high', title: 'No responsible-play message', explanation: 'An 18+ and responsible-play message is expected by players, partners and search engines on gambling pages; its absence looks low-quality. (Quality signal, not a legal check.)', suggestion: 'Add an 18+ notice and a link to the local support service near the list and in the footer.', effort: 'xs', impact: 2, confidence: 0.8 }));
  }

  const missingPages = [
    ['methodology', /m[ée]thodolog|methodology|how we (rate|review|test)|comment nous|notre processus|metod/i],
    ['about', /[àa][- ]propos|about|qui sommes|om oss|over ons|sobre n[óo]s/i],
    ['contact', /contact|kontakt|contacto/i],
  ].filter(([, re]) => !(re as RegExp).test(linkText)) as [string, RegExp][];
  if (missingPages.length) {
    out.push(finding({ ruleId: 'eeat.missing-trust-pages', severity: missingPages.some(([n]) => n === 'methodology') ? 'medium' : 'low', title: `No link to ${missingPages.map(([n]) => n).join(', ')} page${missingPages.length > 1 ? 's' : ''}`, explanation: 'Methodology, about and contact pages show there is a real, accountable team behind the ranking.', suggestion: 'Link these pages from the page (near the list or in the footer).', effort: 's', impact: 2, confidence: 0.7 }));
  }

  if (TESTING_CLAIM_RE.test(text)) {
    const testedDates = page.dates.some((d) => d.kind === 'tested') || page.reviews.some((r) => /\b\d{1,2}\s+[a-zéû]+\s+\d{4}\b|\d{1,2}\/\d{1,2}\/\d{4}/i.test(r.text));
    const evidenceImgs = page.images.some((i) => EVIDENCE_IMG_RE.test(`${i.alt ?? ''} ${i.src}`) && !/logo/i.test(i.alt ?? ''));
    if (!testedDates && !evidenceImgs) {
      out.push(finding({ ruleId: 'eeat.unsupported-testing-claim', severity: 'medium', title: 'The page claims hands-on testing but shows no evidence', explanation: 'Claims like "tested by our team" without screenshots, dates or results read as boilerplate. Real evidence is one of the strongest trust signals.', suggestion: 'Add proof per brand: screenshots of deposits/withdrawals, test dates and measured payout times.', effort: 'm', impact: 3, confidence: 0.7 }));
    }
  }

  const citations = page.links.filter((l) => l.isExternal && !l.isAffiliate);
  if (!citations.length && page.wordCount > 400) {
    out.push(finding({ ruleId: 'eeat.no-external-citations', severity: 'low', title: 'No links to outside sources', explanation: 'Citing authoritative sources (regulators, help services, studies) supports claims and signals expertise.', suggestion: 'Link to the relevant regulator and player-support sites where you mention them.', effort: 'xs', impact: 1, confidence: 0.7 }));
  }

  return out;
}

export const eeatAnalyzer: Analyzer = { id: 'eeat', version: '0.1.0', run: runEeat };
export default eeatAnalyzer;
