import { describe, expect, it } from 'vitest';
import { findCountClaims, findStatedRank, parseDate, parseMoney, parseRating } from './lexicon.js';

describe('lexicon', () => {
  it('finds stated ranks in FR and EN', () => {
    expect(findStatedRank('Mirage décroche la deuxième place')?.rank).toBe(2);
    expect(findStatedRank('il remporte la médaille d’argent')?.rank).toBe(2);
    expect(findStatedRank('takes first place in our list')?.rank).toBe(1);
    expect(findStatedRank('notre n°3 du classement')?.rank).toBe(3);
    expect(findStatedRank('bonus de 300 €')).toBeUndefined();
  });
  it('finds count claims', () => {
    expect(findCountClaims('Nous avons comparé deux plateformes')[0]?.count).toBe(2);
    expect(findCountClaims('notre duo gagnant')[0]?.count).toBe(2);
    expect(findCountClaims('our top 5 casinos')[0]?.count).toBe(5);
    expect(findCountClaims('3 000 jeux')).toEqual([]);
  });
  it('parses dates, money and ratings', () => {
    expect(parseDate('Mis à jour le 3 janvier 2026')).toBe('2026-01-03');
    expect(parseDate('Updated March 12, 2026')).toBe('2026-03-12');
    expect(parseDate('12/03/2026')).toBe('2026-03-12');
    expect(parseMoney("jusqu'à 2 000 € + 100 tours")).toBe(2000);
    expect(parseMoney('Get £500 bonus')).toBe(500);
    expect(parseRating('9,8/10')).toMatchObject({ value: 9.8, scale: 10 });
  });
});
