import { createHash } from 'node:crypto';

/** Collapse whitespace and trim. */
export function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function excerpt(s: string, max = 160): string {
  const c = clean(s);
  return c.length > max ? `${c.slice(0, max - 1)}…` : c;
}

/** Stable finding id: same rule + same evidence → same id across scans (enables diffs vs previous scan). */
export function findingId(ruleId: string, key: string): string {
  return `${ruleId}:${createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
}

/** Parse a number written with either decimal convention (9,8 / 9.8 / 2 000 / 2,000). */
export function parseLooseNumber(raw: string): number | undefined {
  let s = raw.replace(/[\s  ]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
