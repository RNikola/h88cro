import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getMarket } from '@h88cro/core';
import { describe, expect, it } from 'vitest';
import { analyzeHtml, applyEdits, hasBuiltinFix, mergeProposals, proposeFix, recheck, type FixContext, type FixProposal } from '../src/index.js';

const FIXTURES = resolve(__dirname, '../../../fixtures');
const NOW = new Date('2026-10-30T12:00:00Z');

async function setup(file: string) {
  const html = readFileSync(join(FIXTURES, file), 'utf8');
  const ctx: FixContext = { pageHtml: html, url: 'https://example.com/fr/', lang: 'fr', market: getMarket('fr-FR'), pageType: 'toplist', now: NOW };
  const { findings, page } = await analyzeHtml({ ...ctx, html });
  return { html, ctx, findings, page };
}

for (const file of ['sample-toplist-fr.html', 'keira-fr.html', 'pooky-fr.html']) {
  describe(`built-in fixes: ${file}`, () => {
    it('each built-in fix applies cleanly and removes its finding', async () => {
      const { html, ctx, findings, page } = await setup(file);
      const fixable = findings.filter((f) => hasBuiltinFix(f.ruleId));
      expect(fixable.length).toBeGreaterThan(0);
      const report: Record<string, string> = {};
      for (const f of fixable) {
        const p = await proposeFix({ finding: f, path: 'index.html', fileText: html, ctx, page });
        if ('error' in p) {
          report[f.ruleId] = `no fix: ${p.error}`;
          continue;
        }
        const r = applyEdits(html, p.patches[0]!.edits);
        expect(r.failed).toEqual([]);
        const rc = await recheck({ ctx, patchedHtml: r.text, targets: [f] });
        report[f.ruleId] = rc.results[0]!.fixed ? 'fixed' : `not fixed (${rc.message})`;
        expect(rc.introduced.map((x) => x.title)).toEqual([]);
      }
      const notFixed = Object.entries(report).filter(([, v]) => v !== 'fixed');
      expect(notFixed).toEqual([]);
    });

    it('batch fix applies all built-in fixes together', async () => {
      const { html, ctx, findings, page } = await setup(file);
      let text = html;
      const ps: FixProposal[] = [];
      for (const f of findings.filter((x) => hasBuiltinFix(x.ruleId))) {
        const p = await proposeFix({ finding: f, path: 'index.html', fileText: text, ctx, page });
        if ('error' in p) continue;
        text = applyEdits(text, p.patches[0]!.edits).text;
        ps.push(p);
      }
      const merged = mergeProposals(ps);
      const r = applyEdits(html, merged.patches[0]!.edits);
      expect(r.failed).toEqual([]);
      expect(r.text).toBe(text);
      const rc = await recheck({ ctx, patchedHtml: text, targets: findings.filter((x) => hasBuiltinFix(x.ruleId)) });
      expect(rc.results.filter((x) => x.fixed === false)).toEqual([]);
    });
  });
}

it('without a Claude key, a rule with no built-in fix explains what is needed', async () => {
  const { html, ctx, findings } = await setup('sample-toplist-fr.html');
  const f = findings.find((x) => !hasBuiltinFix(x.ruleId))!;
  const p = await proposeFix({ finding: f, path: 'index.html', fileText: html, ctx });
  expect('error' in p && p.error).toMatch(/Claude API key/);
});
