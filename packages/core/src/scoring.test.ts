import { describe, expect, it } from 'vitest';
import { finding } from './build.js';
import { detectMarket } from './markets.js';
import { priorityList, scoreModule, scoreReport } from './scoring.js';
import { parseLooseNumber } from './text.js';

const f = (ruleId: string, severity: 'critical' | 'high' | 'medium' | 'low', extra: Partial<Parameters<typeof finding>[0]> = {}) =>
  finding({ ruleId, severity, title: ruleId, explanation: '', suggestion: '', key: Math.random().toString(), ...extra });

describe('scoring', () => {
  it('starts at 100 and deducts by severity × confidence', () => {
    expect(scoreModule('cro', [])).toBe(100);
    expect(scoreModule('cro', [f('cro.a', 'high', { confidence: 1 })])).toBe(88);
    expect(scoreModule('cro', [f('cro.a', 'high', { confidence: 0.5 })])).toBe(94);
  });
  it('caps deductions per rule', () => {
    const many = Array.from({ length: 10 }, () => f('cro.a', 'critical', { confidence: 1 }));
    expect(scoreModule('cro', many)).toBe(70);
  });
  it('weights the overall score by module weights', () => {
    const s = scoreReport([f('cro.a', 'critical', { confidence: 1 })], ['cro', 'links']);
    // cro 75 × 28 + links 100 × 1 = 2200 / 29 ≈ 76
    expect(s.overall).toBe(76);
  });
  it('ranks by impact × severity × confidence ÷ effort', () => {
    const quick = f('cro.quick', 'high', { impact: 4, effort: 'xs' });
    const slow = f('cro.slow', 'critical', { impact: 4, effort: 'l' });
    expect(priorityList([slow, quick])[0]!.ruleId).toBe('cro.quick');
  });
});

describe('helpers', () => {
  it('parses both decimal conventions', () => {
    expect(parseLooseNumber('9,8')).toBe(9.8);
    expect(parseLooseNumber('2 000')).toBe(2000);
    expect(parseLooseNumber('2,000')).toBe(2000);
    expect(parseLooseNumber('2.000')).toBe(2000);
  });
  it('detects the market from lang and URL', () => {
    expect(detectMarket({ htmlLang: 'fr', url: 'https://x.best/fr/' }).marketId).toBe('fr-FR');
    expect(detectMarket({ htmlLang: 'en', url: 'https://x.best/uk/' }).marketId).toBe('en-GB');
    expect(detectMarket({ htmlLang: 'sv-SE' }).marketId).toBe('sv-SE');
  });
});
