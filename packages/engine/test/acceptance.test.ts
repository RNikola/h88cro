import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scan } from '../src/index.js';

const FIXTURES = resolve(__dirname, '../../../fixtures');
const NOW = new Date('2026-10-30T12:00:00Z');

async function staticScan(file: string) {
  return scan({
    target: { kind: 'file', path: join(FIXTURES, file) },
    devices: ['mobile', 'desktop'],
    pageType: 'toplist',
    render: false,
    lighthouse: false,
    outDir: mkdtempSync(join(tmpdir(), 'h88-')),
    now: NOW,
  });
}

const EXPECTED_TOPLIST = [
  'consistency.rank-text-mismatch',
  'consistency.faq-number-one-mismatch',
  'consistency.card-table-rating-mismatch',
  'consistency.superlative-claim-mismatch',
  'consistency.count-word-mismatch',
  'consistency.review-order-mismatch',
  'consistency.toc-heading-mismatch',
  'consistency.stale-date',
  'language.placeholder-text',
  'language.decimal-separator',
  'language.currency-format',
  'language.quote-style',
  'language.borrowed-term',
  'cro.generic-cta-text',
  'cro.missing-cta-after-review',
  'cro.table-row-missing-cta',
  'cro.card-missing-terms',
  'cro.fake-urgency',
  'cro.fake-social-proof',
  'cro.rating-staircase',
  'performance.lcp-image-lazy',
  'performance.img-missing-dimensions',
  'performance.render-blocking-js',
  'seo.affiliate-missing-sponsored',
  'seo.self-serving-rating',
  'seo.faq-schema-mismatch',
  'seo.hreflang-invalid',
  'seo.h1-count',
  'seo.meta-description-missing',
  'eeat.no-responsible-play',
  'eeat.no-affiliate-disclosure',
  'eeat.no-person-schema',
  'eeat.unsupported-testing-claim',
];

describe('acceptance: sample-toplist-fr.html (local file, no network)', () => {
  it('detects every expected deterministic finding', async () => {
    const r = await staticScan('sample-toplist-fr.html');
    const rules = new Set(r.findings.map((f) => f.ruleId));
    const missing = EXPECTED_TOPLIST.filter((id) => !rules.has(id));
    expect(missing).toEqual([]);
    expect(r.marketId).toBe('fr-FR');
    expect(r.scores.overall).toBeLessThan(60);
  });

  it('names the right brands in the rank mismatch', async () => {
    const r = await staticScan('sample-toplist-fr.html');
    const f = r.findings.find((x) => x.ruleId === 'consistency.rank-text-mismatch');
    expect(f?.title).toContain('Mirage Casino');
    expect(f?.title).toContain('#3');
  });
});

describe('acceptance: sample-clean-fr.html', () => {
  it('has no critical or high findings (false-positive guard)', async () => {
    const r = await staticScan('sample-clean-fr.html');
    const serious = r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    expect(serious.map((f) => f.title)).toEqual([]);
    expect(r.scores.overall).toBeGreaterThanOrEqual(90);
  });
});

describe.runIf(!!process.env.H88CRO_CHROMIUM_PATH)('rendered scan (needs H88CRO_CHROMIUM_PATH)', () => {
  it('renders both devices, captures layout and screenshots', async () => {
    const r = await scan({
      target: { kind: 'file', path: join(FIXTURES, 'sample-toplist-fr.html') },
      devices: ['mobile', 'desktop'],
      pageType: 'toplist',
      render: true,
      lighthouse: false,
      outDir: mkdtempSync(join(tmpdir(), 'h88-')),
      chromiumPath: process.env.H88CRO_CHROMIUM_PATH,
      now: NOW,
    });
    expect(r.screenshots.length).toBe(4);
    expect(r.findings.some((f) => f.ruleId === 'cro.cta-low-contrast')).toBe(true);
    expect(r.findings.some((f) => f.ruleId === 'cro.small-tap-targets')).toBe(true);
  }, 60_000);
});

/** Real pages from the brief (§12), seeded with problems. Every Critical/High finding below was checked by hand. */
const REAL_PAGES: { file: string; expected: string[]; titles: string[]; verifiedSerious: string[] }[] = [
  {
    file: 'pooky-fr.html',
    expected: [
      'consistency.rank-text-mismatch',
      'consistency.faq-number-one-mismatch',
      'consistency.superlative-claim-mismatch',
      'consistency.stale-date',
      'language.decimal-separator',
      'language.percent-spacing',
      'cro.generic-cta-text',
      'cro.missing-cta-after-review',
      'cro.card-missing-terms',
      'cro.rating-staircase',
      'performance.img-missing-dimensions',
      'seo.affiliate-missing-sponsored',
      'eeat.no-affiliate-disclosure',
    ],
    titles: ['Tower Casino\'s review says "deuxième place" but it is #1', 'The FAQ names Godz Casino', 'claimed for VipLuck Casino'],
    verifiedSerious: [
      'consistency.rank-text-mismatch',
      'consistency.faq-number-one-mismatch',
      'consistency.superlative-claim-mismatch',
      'cro.missing-cta-after-review',
      'cro.card-missing-terms',
      'seo.affiliate-missing-sponsored',
    ],
  },
  {
    file: 'keira-fr.html',
    expected: [
      'consistency.rank-text-mismatch',
      'consistency.faq-number-one-mismatch',
      'consistency.card-table-rating-mismatch',
      'consistency.superlative-claim-mismatch',
      'consistency.count-word-mismatch',
      'consistency.review-order-mismatch',
      'consistency.toc-heading-mismatch',
      'consistency.stale-date',
      'language.decimal-separator',
      'language.percent-spacing',
      'language.borrowed-term',
      'cro.generic-cta-text',
      'cro.missing-cta-after-review',
      'cro.table-row-missing-cta',
      'cro.card-missing-terms',
      'seo.affiliate-missing-sponsored',
      'eeat.no-person-schema',
    ],
    titles: [
      'Mad Casino\'s review says "médaille d\'argent" but it is #4',
      'VipLuck Casino\'s review says "deuxième marche" but it is #5',
      'The FAQ names Godz Casino',
      'VipLuck Casino is rated 8.7 on its card but 9.6 in the table',
      'The text says "deux plateformes"',
    ],
    verifiedSerious: [
      'consistency.rank-text-mismatch',
      'consistency.faq-number-one-mismatch',
      'consistency.card-table-rating-mismatch',
      'consistency.superlative-claim-mismatch',
      'consistency.count-word-mismatch',
      'cro.missing-cta-after-review',
      'cro.card-missing-terms',
      'seo.affiliate-missing-sponsored',
    ],
  },
];

for (const page of REAL_PAGES) {
  describe(`acceptance: ${page.file} (real page, local file, no network)`, () => {
    it('detects every expected deterministic finding', async () => {
      const r = await staticScan(page.file);
      const rules = new Set(r.findings.map((f) => f.ruleId));
      expect(page.expected.filter((id) => !rules.has(id))).toEqual([]);
      expect(r.marketId).toBe('fr-FR');
      for (const t of page.titles) expect(r.findings.some((f) => f.title.includes(t)), t).toBe(true);
    });

    it('raises no unverified Critical/High findings (false-positive guard)', async () => {
      const r = await staticScan(page.file);
      const unverified = r.findings.filter((f) => (f.severity === 'critical' || f.severity === 'high') && !page.verifiedSerious.includes(f.ruleId));
      expect(unverified.map((f) => `${f.ruleId}: ${f.title}`)).toEqual([]);
    });
  });
}
