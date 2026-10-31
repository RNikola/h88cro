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
  return `${ruleId}:${hash53(key).toString(16).padStart(14, '0').slice(0, 12)}`;
}

/** Small, fast, platform-independent string hash (cyrb53). Keeps core free of Node APIs so it also runs in the renderer and a future web app. */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Parse a number written with either decimal convention (9,8 / 9.8 / 2 000 / 2,000). */
export function parseLooseNumber(raw: string): number | undefined {
  let s = raw.replace(/[\s  ]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
