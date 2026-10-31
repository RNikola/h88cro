import { excerpt, finding, type Finding } from '@h88cro/core';
import type { Analyzer, AnalyzerContext } from '@h88cro/page-model';

const GENERIC_CTA = new Set([
  'jouer', 'jouez', 'jouer maintenant', 'jouez maintenant', 'cliquez ici', 'ici', 'visiter', 'visitez', 'voir', 'en savoir plus', "s'inscrire", 'inscription', 'go',
  'play', 'play now', 'click here', 'visit', 'visit site', 'learn more', 'more', 'sign up', 'join', 'join now',
  'spela', 'spela nu', 'spil', 'spil nu', 'speel', 'speel nu', 'jogar', 'jogar agora', 'more info',
]);

const SPECIFIC_CTA_BY_LANG: Record<string, (brand: string) => string> = {
  fr: (b) => `Obtenir le bonus ${b}`,
  en: (b) => `Get the ${b} bonus`,
  sv: (b) => `Hämta bonusen hos ${b}`,
  da: (b) => `Få bonussen hos ${b}`,
  nl: (b) => `Claim de bonus bij ${b}`,
  pt: (b) => `Obter o bónus ${b}`,
};

const FAKE_TIMER_RE = /(expire|expires|ends|termine|se termine|fin de l'offre|offer ends|nur noch|slutar)\D{0,30}\d{1,2}\s?:\s?\d{2}(\s?:\s?\d{2})?/i;
const FAKE_COUNTER_RE = /\b\d[\d\s  ,.]*\s+(joueurs|personnes|players|people|users|spelare|spillere)\b.{0,40}\b(inscrits?|inscrit|signed up|joined|registered|ont rejoint|en ligne|online)\b.{0,20}(aujourd'hui|today|ce jour|cette heure|this hour|right now|maintenant)?/i;

function parseRgb(c?: string): [number, number, number, number] | undefined {
  const m = c?.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  return m ? [+m[1]!, +m[2]!, +m[3]!, m[4] !== undefined ? +m[4] : 1] : undefined;
}
function luminance([r, g, b]: [number, number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(fg?: string, bg?: string): number | undefined {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || b[3] === 0) return undefined;
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export function runCro(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const { page } = ctx;
  const lang = ctx.lang ?? page.htmlLang?.split('-')[0] ?? 'en';
  const affCtas = page.ctas.filter((c) => c.isAffiliate);
  const isListPage = page.cards.length >= 2 || ctx.pageType === 'toplist';

  if (!affCtas.length && (isListPage || ctx.pageType === 'brand-review' || ctx.pageType === 'bonus')) {
    out.push(
      finding({
        ruleId: 'cro.no-cta',
        severity: 'critical',
        title: 'No call-to-action links to an operator',
        explanation: 'Without a clear button to the offer, interested visitors have no next step.',
        suggestion: 'Add a clear, specific button to the offer near the top and after each review.',
        effort: 's',
        impact: 5,
        confidence: 0.8,
      }),
    );
  }

  // Generic CTA text.
  const generic = affCtas.filter((c) => GENERIC_CTA.has(c.text.toLowerCase().replace(/[!.→›»]/g, '').trim()));
  if (generic.length) {
    const brand = page.brands.find((b) => b.slug === generic[0]!.brandSlug)?.name ?? 'Casino';
    const make = SPECIFIC_CTA_BY_LANG[lang] ?? SPECIFIC_CTA_BY_LANG.en!;
    out.push(
      finding({
        ruleId: 'cro.generic-cta-text',
        severity: 'medium',
        title: `${generic.length} of ${affCtas.length} buttons use generic text like "${generic[0]!.text}"`,
        explanation: 'Buttons that name the benefit ("Get the bonus") usually earn more clicks than generic ones ("Play"), because they remind the visitor what they get.',
        suggestion: `Use specific button text that names the brand and the benefit, e.g. "${make(brand)}".`,
        suggestedCopy: [{ lang, text: make(brand) }],
        evidence: generic.slice(0, 5).map((c) => ({ selector: c.selector, textExcerpt: c.text })),
        effort: 'xs',
        impact: 3,
        confidence: 0.85,
        fix: { type: 'copy-replace', available: false },
      }),
    );
  }

  // CTA after each review. When every review lacks one it is a template problem: report it once.
  const noCta = page.reviews.filter((r) => !r.hasCta);
  if (noCta.length >= 3 && noCta.length === page.reviews.length) {
    out.push(
      finding({
        ruleId: 'cro.missing-cta-after-review',
        severity: 'high',
        title: `None of the ${noCta.length} reviews ends with a button`,
        explanation: "Readers decide while reading a review. Without a button at the end, they must scroll back up to the list, and many won't.",
        suggestion: `Add a button to the brand's offer at the end of every review section (${noCta.map((r) => r.name).join(', ')}).`,
        suggestedCopy: [{ lang, text: (SPECIFIC_CTA_BY_LANG[lang] ?? SPECIFIC_CTA_BY_LANG.en!)(noCta[0]!.name) }],
        evidence: noCta.slice(0, 5).map((r) => ({ selector: r.heading.selector, textExcerpt: r.heading.text })),
        effort: 's',
        impact: 4,
        confidence: 0.85,
        key: 'all',
        fix: { type: 'html-patch', available: false },
      }),
    );
  }
  for (const r of noCta.length >= 3 && noCta.length === page.reviews.length ? [] : noCta) {
    out.push(
      finding({
        ruleId: 'cro.missing-cta-after-review',
        severity: 'high',
        title: `No button after the ${r.name} review`,
        explanation: 'Readers decide while reading a review. Without a button at the end, they must scroll back up to the list, and many won\'t.',
        suggestion: `Add a button to ${r.name}'s offer at the end of its review.`,
        suggestedCopy: [{ lang, text: (SPECIFIC_CTA_BY_LANG[lang] ?? SPECIFIC_CTA_BY_LANG.en!)(r.name) }],
        evidence: [{ selector: r.heading.selector, textExcerpt: r.heading.text }],
        effort: 'xs',
        impact: 4,
        confidence: 0.85,
        key: r.slug,
        fix: { type: 'html-patch', available: false },
      }),
    );
  }

  // Table rows without CTA.
  const rows = page.brands.filter((b) => b.table && !b.table.hasCta);
  if (rows.length) {
    out.push(
      finding({
        ruleId: 'cro.table-row-missing-cta',
        severity: 'medium',
        title: `${rows.length} comparison-table row${rows.length > 1 ? 's have' : ' has'} no button`,
        explanation: 'The comparison table is where many visitors make their choice; each row should let them act on it.',
        suggestion: `Add a button to the rows for ${rows.map((b) => b.name).join(', ')}.`,
        evidence: rows.map((b) => ({ selector: b.table!.selector, textExcerpt: excerpt(b.table!.text, 80) })),
        effort: 'xs',
        impact: 3,
        confidence: 0.85,
      }),
    );
  }

  // Offer clarity on each card. When no card has terms it is a template problem: report it once.
  const noTerms = page.cards.filter((c) => !c.hasTermsLink);
  if (noTerms.length >= 3 && noTerms.length === page.cards.length) {
    out.push(
      finding({
        ruleId: 'cro.card-missing-terms',
        severity: 'high',
        title: `None of the ${noTerms.length} brand cards links to the bonus terms`,
        explanation: 'Hidden bonus terms are a trust risk. Players who discover the conditions only after signing up feel misled and churn.',
        suggestion: 'Add a short terms line (wagering, minimum deposit) and a link to the full conditions to the card template.',
        evidence: noTerms.slice(0, 5).map((c) => ({ selector: c.selector, textExcerpt: excerpt(c.text, 100) })),
        effort: 's',
        impact: 3,
        confidence: 0.8,
        key: 'all',
      }),
    );
  }
  for (const c of noTerms.length >= 3 && noTerms.length === page.cards.length ? [] : page.cards) {
    if (!c.hasTermsLink) {
      out.push(
        finding({
          ruleId: 'cro.card-missing-terms',
          severity: 'high',
          title: `${c.name}'s card has no link to the bonus terms`,
          explanation: 'Hidden bonus terms are a trust risk. Players who discover the conditions only after signing up feel misled and churn.',
          suggestion: 'Add a short terms line (wagering, minimum deposit) and a link to the full conditions on the card.',
          evidence: [{ selector: c.selector, textExcerpt: excerpt(c.text, 100) }],
          effort: 'xs',
          impact: 3,
          confidence: 0.8,
          key: c.slug,
        }),
      );
    }
  }
  const unclear = page.cards.filter((c) => !/(x\s?\d{1,2}\b|\b\d{1,2}\s?x\b|mise|wager|omsättning|omsætning|inzet|apostas?)/i.test(c.text) || !/(d[ée]p[oô]t min|min(imum)?\.? (deposit|d[ée]p[oô]t)|minsta insättning|mindste indbetaling|minimale storting|dep[oó]sito m[ií]nimo)/i.test(c.text));
  if (unclear.length) {
    out.push(
      finding({
        ruleId: 'cro.card-offer-clarity',
        severity: 'medium',
        title: `${unclear.length} brand card${unclear.length > 1 ? 's don\'t' : ' doesn\'t'} show wagering or minimum deposit`,
        explanation: 'Experienced players compare offers on wagering and minimum deposit. Showing them up front builds trust and pre-qualifies clicks.',
        suggestion: 'Add a one-line summary under each bonus, e.g. "Wagering x35 · Min. deposit 10 € · Payment methods".',
        evidence: unclear.slice(0, 5).map((c) => ({ selector: c.selector, textExcerpt: c.name })),
        effort: 's',
        impact: 3,
        confidence: 0.75,
      }),
    );
  }

  if (page.cards.length >= 3 && !page.brands.some((b) => b.table)) {
    out.push(
      finding({
        ruleId: 'cro.no-comparison-table',
        severity: 'low',
        title: 'No comparison table',
        explanation: 'A compact table lets visitors compare bonus, wagering and payout speed at a glance.',
        suggestion: 'Add a comparison table with one clickable row per brand.',
        effort: 'm',
        impact: 2,
        confidence: 0.7,
      }),
    );
  }

  if (page.wordCount > 1500 && !page.toc) {
    out.push(
      finding({
        ruleId: 'cro.no-toc',
        severity: 'low',
        title: 'Long page without a table of contents',
        explanation: `The page has about ${page.wordCount} words. Jump links help readers reach the review they care about.`,
        suggestion: 'Add a table of contents with jump links to each review and the FAQ.',
        effort: 's',
        impact: 2,
        confidence: 0.75,
      }),
    );
  }

  // Dark patterns (flagged as trust risks, never recommended).
  for (const b of page.blocks) {
    if (FAKE_TIMER_RE.test(b.text)) {
      out.push(
        finding({
          ruleId: 'cro.fake-urgency',
          severity: 'high',
          title: 'Countdown timer creates artificial urgency',
          explanation: 'Fake countdowns are a dark pattern. Players and partners recognise them, which damages trust, and they can hurt rankings.',
          suggestion: 'Remove the timer. If an offer really ends, state the real end date instead.',
          evidence: [{ selector: b.selector, textExcerpt: excerpt(b.text) }],
          effort: 'xs',
          impact: 3,
          confidence: 0.8,
          key: b.selector,
        }),
      );
    }
    if (FAKE_COUNTER_RE.test(b.text)) {
      out.push(
        finding({
          ruleId: 'cro.fake-social-proof',
          severity: 'high',
          title: 'Unverifiable sign-up counter',
          explanation: '"X players signed up today" counters are a common fake social-proof pattern and a trust risk.',
          suggestion: 'Remove the counter, or replace it with real, verifiable proof (e.g. your own test results).',
          evidence: [{ selector: b.selector, textExcerpt: excerpt(b.text) }],
          effort: 'xs',
          impact: 3,
          confidence: 0.75,
          key: b.selector,
        }),
      );
    }
  }

  // Uniform rating staircase (9.9, 9.8, 9.7…).
  const ratings = page.cards.map((c) => c.rating).filter((r): r is number => r !== undefined);
  if (ratings.length >= 4 && ratings.length === page.cards.length) {
    const steps = ratings.slice(1).map((r, i) => Math.round((ratings[i]! - r) * 100) / 100);
    if (steps.every((s) => s === steps[0]) && steps[0]! > 0 && steps[0]! <= 0.2) {
      out.push(
        finding({
          ruleId: 'cro.rating-staircase',
          severity: 'medium',
          title: `Ratings drop by exactly ${steps[0]} per position (${ratings.join(', ')})`,
          explanation: 'Perfectly even scores look assigned to fit the order rather than earned in testing, which undermines the credibility of the ranking.',
          suggestion: 'Show scores from your real scoring method, with a breakdown (bonus, payouts, games, support).',
          evidence: page.cards.map((c) => ({ selector: c.selector, textExcerpt: `${c.name}: ${c.ratingText ?? c.rating}` })),
          effort: 'm',
          impact: 3,
          confidence: 0.8,
        }),
      );
    }
  }

  // Layout-based checks (only when the page was rendered).
  for (const device of ['mobile', 'desktop'] as const) {
    const layout = page.layout?.[device];
    if (!layout) continue;
    const vh = layout.viewport.height;
    const ctaRects = affCtas
      .map((c) => ({ c, l: c.h88 ? layout.elements[c.h88] : undefined }))
      .filter((x): x is { c: (typeof affCtas)[number]; l: NonNullable<typeof x.l> } => !!x.l && x.l.visible);
    const firstCta = ctaRects.sort((a, b) => a.l.rect.y - b.l.rect.y)[0];
    if (affCtas.length && (!firstCta || firstCta.l.rect.y + firstCta.l.rect.h > vh)) {
      out.push(
        finding({
          ruleId: 'cro.cta-below-fold',
          severity: device === 'mobile' ? 'high' : 'medium',
          title: `No offer button is visible without scrolling on ${device}`,
          explanation: `The first button appears ${firstCta ? Math.round(firstCta.l.rect.y) + 'px' : 'nowhere'} down; the screen is ${vh}px tall. Visitors who are ready to act should see the #1 offer immediately.`,
          suggestion: 'Show the #1 offer with its button in the first screen, above long intros.',
          evidence: firstCta
            ? [{ selector: firstCta.c.selector, screenshotRegion: { ...firstCta.l.rect, device }, metric: { name: 'first CTA top (px)', value: Math.round(firstCta.l.rect.y), target: vh } }]
            : [],
          effort: 'm',
          impact: 5,
          confidence: 0.9,
          key: device,
        }),
      );
    }
    if (device === 'mobile') {
      const small = ctaRects.filter((x) => x.l.rect.h < 44 || x.l.rect.w < 44);
      if (small.length) {
        out.push(
          finding({
            ruleId: 'cro.small-tap-targets',
            severity: 'medium',
            title: `${small.length} offer button${small.length > 1 ? 's are' : ' is'} smaller than 44 px on mobile`,
            explanation: 'Small buttons are easy to miss with a thumb, which loses clicks from mobile visitors.',
            suggestion: 'Make buttons at least 44×44 px with comfortable padding.',
            evidence: small.slice(0, 5).map((x) => ({ selector: x.c.selector, screenshotRegion: { ...x.l.rect, device }, metric: { name: 'height (px)', value: Math.round(x.l.rect.h), target: 44 } })),
            effort: 'xs',
            impact: 3,
            confidence: 0.9,
          }),
        );
      }
      const sticky = Object.values(layout.elements).some((e) => (e.position === 'fixed' || e.position === 'sticky') && e.visible && e.rect.y + e.rect.h >= vh - 120 && e.rect.h < 200);
      if (!sticky && isListPage) {
        out.push(
          finding({
            ruleId: 'cro.no-sticky-mobile-cta',
            severity: 'low',
            title: 'No sticky offer bar on mobile',
            explanation: 'A slim sticky bar with the #1 offer keeps the main action one tap away while visitors read.',
            suggestion: 'Add a small, dismissible sticky bar at the bottom of the mobile screen with the #1 offer.',
            effort: 's',
            impact: 2,
            confidence: 0.6,
          }),
        );
      }
    }
    const lowContrast = ctaRects
      .map((x) => ({ ...x, ratio: contrastRatio(x.l.color, x.l.background) }))
      .filter((x) => x.ratio !== undefined && x.ratio < 4.5);
    if (lowContrast.length) {
      out.push(
        finding({
          ruleId: 'cro.cta-low-contrast',
          severity: 'high',
          title: `Offer buttons have low text contrast on ${device} (${lowContrast[0]!.ratio!.toFixed(1)}:1)`,
          explanation: 'Low-contrast buttons blend into the page, so fewer visitors notice them. WCAG asks for at least 4.5:1.',
          suggestion: 'Use a bright, high-contrast button colour that is used for nothing else on the page.',
          evidence: lowContrast.slice(0, 3).map((x) => ({ selector: x.c.selector, screenshotRegion: { ...x.l.rect, device }, metric: { name: 'contrast ratio', value: Math.round(x.ratio! * 10) / 10, target: 4.5 } })),
          effort: 'xs',
          impact: 4,
          confidence: 0.85,
          key: device,
          fix: { type: 'css-patch', available: false },
        }),
      );
    }
  }

  // Without layout: the first offer button comes after a long intro.
  if (!page.layout && affCtas.length) {
    const firstIdx = Math.min(...affCtas.map((c) => c.index));
    const wordsBefore = page.blocks.filter((b) => b.index < firstIdx).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
    if (wordsBefore > 250) {
      out.push(
        finding({
          ruleId: 'cro.cta-below-fold',
          severity: 'medium',
          title: `About ${wordsBefore} words come before the first offer button`,
          explanation: 'Visitors who are ready to act should see the #1 offer without reading a long intro.',
          suggestion: 'Move the toplist (or at least the #1 offer) above the intro text.',
          effort: 'm',
          impact: 4,
          confidence: 0.6,
          key: 'static',
        }),
      );
    }
  }

  // The #1 pick should stand out: a badge or label tells undecided visitors which one to choose.
  const top = [...page.cards].sort((a, b) => a.rank - b.rank)[0];
  if (top && page.cards.length >= 3) {
    const badge = /(top\s?(choix|pick|1)\b|n[°º]\s?1\b|#1\b|num[ée]ro\s?(1|un)\b|meilleur choix|choix de la r[ée]daction|notre (choix|favori|recommandation)|recommand[ée]|editor'?s (choice|pick)|best overall|our pick|winner|gagnant|b[äa]sta valet|redaktionens val|vores favorit|beste keuze|escolha (do editor|da reda[çc][ãa]o)|melhor escolha)/i;
    if (!badge.test(top.text.replace(/^\s*\d{1,2}\s+/, ''))) {
      out.push(
        finding({
          ruleId: 'cro.top-pick-not-highlighted',
          severity: 'medium',
          title: `The #1 pick (${top.name}) looks the same as the others`,
          explanation: 'Visitors who don\'t want to compare click the recommended option. Without a visible "top pick" label or a highlighted card, they hesitate or leave.',
          suggestion: `Give ${top.name}'s card a badge like "${lang === 'fr' ? 'Notre choix n°1' : 'Our #1 pick'}" and a stronger frame or background.`,
          suggestedCopy: [{ lang, text: lang === 'fr' ? 'Notre choix n°1' : 'Our #1 pick' }],
          evidence: [{ selector: top.selector, textExcerpt: excerpt(top.text, 100) }],
          effort: 'xs',
          impact: 3,
          confidence: 0.7,
          fix: { type: 'html-patch', available: false },
        }),
      );
    }
  }

  // Reviews without pros and cons: the fastest way for a reader to decide.
  if (page.reviews.length >= 2) {
    const prosCons = /(avantages|inconv[ée]nients|points? forts?|points? faibles?|on aime|on aime moins|\bpros\b|\bcons\b|strengths|weaknesses|f[öo]rdelar|nackdelar|fordele|ulemper|voordelen|nadelen|vantagens|desvantagens|pontos (fortes|fracos))/i;
    const without = page.reviews.filter((r) => !prosCons.test(r.text) && r.blocks.filter((b) => b.tag === 'li').length < 3);
    if (without.length === page.reviews.length) {
      out.push(
        finding({
          ruleId: 'cro.review-no-pros-cons',
          severity: 'medium',
          title: `None of the ${without.length} reviews has a pros and cons list`,
          explanation: 'Most visitors skim. A short pros/cons list lets them compare brands in seconds; long paragraphs hide the reasons to click.',
          suggestion: 'Add 3 pros and 1–2 cons as bullet points at the top of each review, followed by the offer button.',
          suggestedCopy: lang === 'fr' ? [{ lang, text: 'Points forts / Points faibles' }] : [{ lang, text: 'Pros / Cons' }],
          evidence: without.slice(0, 3).map((r) => ({ selector: r.heading.selector, textExcerpt: r.heading.text })),
          effort: 's',
          impact: 3,
          confidence: 0.75,
        }),
      );
    }
  }

  // Walls of text: very long paragraphs get skipped, and the reader drifts away from the offer.
  const walls = page.blocks.filter((b) => b.tag === 'p' && b.text.split(/\s+/).length > 120);
  if (walls.length) {
    out.push(
      finding({
        ruleId: 'cro.wall-of-text',
        severity: 'low',
        title: `${walls.length} paragraph${walls.length > 1 ? 's are' : ' is'} over 120 words`,
        explanation: 'On a phone a 120-word paragraph fills the whole screen. Readers skim past it and miss the argument for the offer.',
        suggestion: 'Split long paragraphs into 2–3 sentence chunks, and turn lists of facts (payment methods, providers) into bullets.',
        evidence: walls.slice(0, 3).map((b) => ({ selector: b.selector, textExcerpt: excerpt(b.text, 100), metric: { name: 'words', value: b.text.split(/\s+/).length, target: 120 } })),
        effort: 's',
        impact: 2,
        confidence: 0.8,
      }),
    );
  }

  return out;
}

export const croAnalyzer: Analyzer = { id: 'cro', version: '0.2.0', run: runCro };
export default croAnalyzer;
