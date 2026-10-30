import { excerpt, finding, type Finding } from '@h88cro/core';
import { findCountClaims, type Analyzer, type AnalyzerContext, type Brand } from '@h88cro/page-model';

const SUPERLATIVE_BONUS_RE =
  /(bonus le plus (g[ée]n[ée]reux|[ée]lev[ée]|gros|important)|plus (gros|grand|g[ée]n[ée]reux) bonus|meilleur bonus|most generous bonus|biggest bonus|largest bonus|highest bonus|best bonus)/i;
const NUMBER_ONE_RE = /(num[ée]ro\s*1|n[°º]\s?1\b|#1\b|number\s*(one|1)\b|premi[eè]re place|first place|notre (grand )?gagnant|top pick|meilleur casino)/i;

function primaryRank(b: Brand): number | undefined {
  return b.card?.rank ?? b.table?.rank;
}

export function runConsistency(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const { page } = ctx;
  const ranked = page.brands.filter((b) => primaryRank(b) !== undefined).sort((a, b) => primaryRank(a)! - primaryRank(b)!);
  const listCount = page.cards.length || ranked.length;

  // Rank stated in review text vs list position.
  for (const b of page.brands) {
    const r = b.review?.statedRank;
    const listRank = primaryRank(b);
    if (!r || listRank === undefined || r.rank === listRank) continue;
    out.push(
      finding({
        ruleId: 'consistency.rank-text-mismatch',
        severity: 'critical',
        title: `${b.name}'s review says "${r.phrase}" but it is #${listRank} in the list`,
        explanation: 'Visitors compare the list with the reviews. Contradictory rankings make the whole page look careless or manipulated, which hurts trust and clicks.',
        suggestion: `Change the review to match position #${listRank}, or move ${b.name} to #${r.rank} in the list.`,
        evidence: [
          { selector: b.review!.heading.selector, textExcerpt: excerpt(b.review!.text, 140) },
          ...(b.card ? [{ selector: b.card.selector, textExcerpt: `List position #${listRank}` }] : []),
        ],
        effort: 'xs',
        impact: 4,
        confidence: 0.9,
        key: b.slug,
        fix: { type: 'copy-replace', available: false },
      }),
    );
  }

  // FAQ names a different #1 than the list.
  const first = ranked[0];
  if (first) {
    for (const q of page.faq) {
      const qa = `${q.question} ${q.answer}`;
      if (!NUMBER_ONE_RE.test(qa) && !/meilleur|best|top/i.test(q.question)) continue;
      const named = page.brands.filter((b) => q.answer.toLowerCase().includes(b.name.toLowerCase()));
      if (named.length !== 1 || named[0]!.slug === first.slug) continue;
      out.push(
        finding({
          ruleId: 'consistency.faq-number-one-mismatch',
          severity: 'high',
          title: `The FAQ names ${named[0]!.name} as the best, but ${first.name} is #1 in the list`,
          explanation: 'The FAQ is often shown in Google results and read by skimmers. A different winner there contradicts the ranking.',
          suggestion: `Update the FAQ answer to name ${first.name}, the #1 in your list.`,
          evidence: [{ selector: q.selector, textExcerpt: excerpt(qa, 160) }],
          effort: 'xs',
          impact: 4,
          confidence: 0.85,
          key: q.question,
          fix: { type: 'copy-replace', available: false },
        }),
      );
    }
  }

  // Card vs table: rank and rating.
  for (const b of page.brands) {
    if (b.card && b.table && b.card.rank !== b.table.rank) {
      out.push(
        finding({
          ruleId: 'consistency.card-table-rank-mismatch',
          severity: 'high',
          title: `${b.name} is #${b.card.rank} in the cards but #${b.table.rank} in the comparison table`,
          explanation: 'Two different orders on one page make the ranking look arbitrary.',
          suggestion: 'Use one ranking source for both the cards and the table.',
          evidence: [{ selector: b.card.selector }, { selector: b.table.selector, textExcerpt: excerpt(b.table.text, 100) }],
          effort: 'xs',
          impact: 3,
          confidence: 0.85,
          key: b.slug,
        }),
      );
    }
    if (b.card?.rating !== undefined && b.table?.rating !== undefined && (b.card.ratingScale ?? 10) === (b.table.ratingScale ?? 10) && Math.abs(b.card.rating - b.table.rating) > 0.05) {
      out.push(
        finding({
          ruleId: 'consistency.card-table-rating-mismatch',
          severity: 'high',
          title: `${b.name} is rated ${b.card.rating} on its card but ${b.table.rating} in the table`,
          explanation: 'Different scores for the same brand on one page make the ratings look made up.',
          suggestion: `Use the same score in both places.`,
          evidence: [
            { selector: b.card.selector, textExcerpt: b.card.ratingText },
            { selector: b.table.selector, textExcerpt: excerpt(b.table.text, 100) },
          ],
          effort: 'xs',
          impact: 3,
          confidence: 0.9,
          key: b.slug,
          fix: { type: 'copy-replace', available: false },
        }),
      );
    }
    if (b.schemaPosition !== undefined && primaryRank(b) !== undefined && b.schemaPosition !== primaryRank(b)) {
      out.push(
        finding({
          ruleId: 'consistency.schema-rank-mismatch',
          severity: 'medium',
          title: `${b.name} is position ${b.schemaPosition} in the structured data but #${primaryRank(b)} on the page`,
          explanation: 'Search engines may show the structured-data order. It should match what visitors see.',
          suggestion: 'Generate the ItemList schema from the same ranking as the visible list.',
          evidence: [{ selector: 'script[type="application/ld+json"]', textExcerpt: `position: ${b.schemaPosition}` }],
          effort: 'xs',
          impact: 2,
          confidence: 0.85,
          key: b.slug,
        }),
      );
    }
    if (b.schemaRating !== undefined && b.card?.rating !== undefined && b.card.ratingScale === 10 && Math.abs(b.schemaRating - b.card.rating) > 0.05 && b.schemaRating > 5) {
      out.push(
        finding({
          ruleId: 'consistency.schema-rating-mismatch',
          severity: 'medium',
          title: `${b.name}'s rating in structured data (${b.schemaRating}) differs from the card (${b.card.rating})`,
          explanation: 'Mismatched ratings between markup and visible content can be treated as misleading markup.',
          suggestion: 'Use the visible rating in the schema.',
          evidence: [{ selector: b.card.selector, textExcerpt: b.card.ratingText }],
          effort: 'xs',
          impact: 2,
          confidence: 0.8,
          key: b.slug,
        }),
      );
    }
  }

  // "Most generous bonus" claimed for a brand whose bonus is not the largest.
  const withBonus = page.cards.filter((c) => c.bonusAmount !== undefined);
  if (withBonus.length >= 2) {
    const max = Math.max(...withBonus.map((c) => c.bonusAmount!));
    const biggest = withBonus.find((c) => c.bonusAmount === max)!;
    for (const b of page.brands) {
      const r = b.review;
      if (!r || !b.card?.bonusAmount) continue;
      const m = r.text.match(SUPERLATIVE_BONUS_RE);
      if (m && b.card.bonusAmount < max) {
        out.push(
          finding({
            ruleId: 'consistency.superlative-claim-mismatch',
            severity: 'high',
            title: `"${m[0]}" is claimed for ${b.name}, but ${biggest.name} has the larger bonus`,
            explanation: `${b.name}'s bonus (${b.card.bonusAmount}) is smaller than ${biggest.name}'s (${max}). Unsupported superlatives are easy for readers to check and damage credibility.`,
            suggestion: `Remove the superlative or make it specific and true, e.g. "the lowest wagering requirement" if that is the real advantage.`,
            evidence: [{ selector: r.heading.selector, textExcerpt: excerpt(r.text, 140) }],
            effort: 'xs',
            impact: 3,
            confidence: 0.85,
            key: b.slug,
            fix: { type: 'copy-replace', available: false },
          }),
        );
      }
    }
  }

  // Number words that don't match the number of listed brands ("deux plateformes" with 5 brands).
  if (listCount >= 2) {
    for (const blk of page.blocks) {
      if (blk.tag === 'td' || blk.tag === 'th') continue;
      for (const c of findCountClaims(blk.text)) {
        if (c.count === listCount) continue;
        out.push(
          finding({
            ruleId: 'consistency.count-word-mismatch',
            severity: 'high',
            title: `The text says "${c.phrase}" but the page lists ${listCount} brands`,
            explanation: 'A wrong count is an obvious sign of copy-paste content and confuses readers.',
            suggestion: `Change "${c.phrase}" to match the ${listCount} brands listed.`,
            evidence: [{ selector: blk.selector, textExcerpt: excerpt(blk.text, 140) }],
            effort: 'xs',
            impact: 3,
            confidence: 0.75,
            key: `${blk.selector}|${c.phrase}`,
            fix: { type: 'copy-replace', available: false },
          }),
        );
      }
    }
  }

  // Review section order vs ranking.
  const reviewed = page.reviews.filter((r) => primaryRank(page.brands.find((b) => b.slug === r.slug)!) !== undefined);
  if (reviewed.length >= 2) {
    const ranks = reviewed.map((r) => primaryRank(page.brands.find((b) => b.slug === r.slug)!)!);
    const sorted = [...ranks].sort((a, b) => a - b);
    if (ranks.some((r, i) => r !== sorted[i])) {
      out.push(
        finding({
          ruleId: 'consistency.review-order-mismatch',
          severity: 'medium',
          title: 'Review sections are not in the same order as the ranking',
          explanation: `The reviews appear as ${reviewed.map((r) => r.name).join(' → ')}, while the list ranks them ${ranks.join(', ')}. Readers expect the reviews to follow the ranking.`,
          suggestion: 'Reorder the review sections to follow the list.',
          evidence: reviewed.map((r) => ({ selector: r.heading.selector, textExcerpt: r.heading.text })),
          effort: 's',
          impact: 2,
          confidence: 0.85,
        }),
      );
    }
  }

  // Table of contents vs headings.
  if (page.toc) {
    const ids = new Set(page.headings.map((h) => h.id).filter(Boolean));
    const broken = page.toc.items.filter((i) => !ids.has(decodeURIComponent(i.href.slice(1))));
    if (broken.length) {
      out.push(
        finding({
          ruleId: 'consistency.toc-heading-mismatch',
          severity: 'medium',
          title: `Table of contents links to ${broken.length} section${broken.length > 1 ? 's' : ''} that don't exist`,
          explanation: 'Dead jump links frustrate readers who use the table of contents to reach a review quickly.',
          suggestion: `Fix or remove: ${broken.map((b) => `"${b.text}" (${b.href})`).join(', ')}.`,
          evidence: [{ selector: page.toc.selector, textExcerpt: broken.map((b) => b.text).join(' · ') }],
          effort: 'xs',
          impact: 2,
          confidence: 0.9,
        }),
      );
    }
    const tocTargets = new Set(page.toc.items.map((i) => i.href.slice(1)));
    const missing = page.headings.filter((h) => h.level === 2 && h.id && !tocTargets.has(h.id) && page.reviews.some((r) => r.heading.index === h.index));
    if (missing.length) {
      out.push(
        finding({
          ruleId: 'consistency.toc-missing-sections',
          severity: 'low',
          title: `${missing.length} review section${missing.length > 1 ? 's are' : ' is'} missing from the table of contents`,
          explanation: 'An incomplete table of contents hides some reviews from readers who navigate by it.',
          suggestion: `Add: ${missing.map((h) => h.text).join(', ')}.`,
          evidence: missing.map((h) => ({ selector: h.selector, textExcerpt: h.text })),
          effort: 'xs',
          impact: 1,
          confidence: 0.8,
        }),
      );
    }
  }

  // Stale "last updated" date.
  const updated = page.dates.filter((d) => d.kind === 'updated' && d.iso).sort((a, b) => (a.iso! < b.iso! ? 1 : -1))[0];
  if (updated?.iso) {
    const ageDays = Math.floor((ctx.now.getTime() - new Date(updated.iso).getTime()) / 86_400_000);
    if (ageDays > ctx.options.staleDateDays) {
      out.push(
        finding({
          ruleId: 'consistency.stale-date',
          severity: 'medium',
          title: `"Last updated" date is ${ageDays} days old`,
          explanation: `Bonus offers change often. A date older than ${ctx.options.staleDateDays} days tells players (and Google) the offers may be out of date.`,
          suggestion: 'Re-check the offers, then update the date. Only change the date when the content was actually reviewed.',
          evidence: [{ selector: updated.selector, textExcerpt: updated.text, metric: { name: 'age (days)', value: ageDays, target: ctx.options.staleDateDays } }],
          effort: 's',
          impact: 3,
          confidence: 0.95,
          fix: { type: 'copy-replace', available: false },
        }),
      );
    }
  }

  // Brands in the cards but missing from the comparison table.
  if (page.cards.length && page.brands.some((b) => b.table)) {
    const missing = page.brands.filter((b) => b.card && !b.table);
    if (missing.length) {
      out.push(
        finding({
          ruleId: 'consistency.table-missing-brand',
          severity: 'low',
          title: `${missing.map((b) => b.name).join(', ')} ${missing.length > 1 ? 'are' : 'is'} in the list but not in the comparison table`,
          explanation: 'Readers use the table to compare every listed brand.',
          suggestion: 'Add the missing brands to the table.',
          evidence: missing.map((b) => ({ selector: b.card!.selector })),
          effort: 's',
          impact: 1,
          confidence: 0.8,
        }),
      );
    }
  }

  return out;
}

export const consistencyAnalyzer: Analyzer = { id: 'consistency', version: '0.1.0', run: runConsistency };
export default consistencyAnalyzer;
