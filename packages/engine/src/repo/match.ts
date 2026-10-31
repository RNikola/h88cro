import { rankFilesForPage } from '../fix/index.js';

/**
 * Suggest which source files render a page. First narrows by the URL path (fr/index.html,
 * src/pages/fr.astro, content/fr/_index.md…), then ranks by how many of the page's headings
 * each file contains.
 */
export async function suggestFilesForPage(o: {
  url: string;
  page: { title?: string; headings: { text: string }[]; bodyText: string };
  files: { path: string; size: number }[];
  load: (path: string) => Promise<string>;
  search?: (text: string) => Promise<string[]>;
  maxLoads?: number;
}): Promise<{ path: string; score: number }[]> {
  const segs = new URL(o.url).pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s).replace(/\.(html?|php)$/i, '').toLowerCase());
  const last = segs.at(-1) ?? 'index';
  const pathScore = (p: string) => {
    const lower = p.toLowerCase();
    const parts = lower.split('/');
    const file = parts.at(-1)!.replace(/\.[^.]+$/, '');
    let s = 0;
    for (const seg of segs) if (parts.includes(seg) || file === seg) s += 2;
    if (file === last) s += 3;
    if (file === 'index' || file === '_index' || file === 'page' || file === '+page') s += segs.length ? 1 : 3;
    if (/\.(html?|md|mdx|astro|njk|liquid|php|vue|svelte|tsx|jsx)$/i.test(lower)) s += 1;
    if (/(^|\/)(test|tests|__tests__|fixtures?|examples?)\//.test(lower)) s -= 3;
    return s;
  };
  const candidates = o.files
    .filter((f) => f.size < 2_000_000)
    .map((f) => ({ ...f, s: pathScore(f.path) }))
    .filter((f) => f.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, o.maxLoads ?? 25);
  const searchHits = new Set<string>();
  const h1 = o.page.headings[0]?.text ?? o.page.title;
  if (o.search && h1 && h1.length >= 12) for (const p of await o.search(h1.slice(0, 80))) searchHits.add(p);
  for (const p of searchHits) if (!candidates.some((c) => c.path === p)) candidates.push({ path: p, size: 0, s: 1 });

  const loaded: { path: string; text: string }[] = [];
  for (const c of candidates) {
    try {
      loaded.push({ path: c.path, text: await o.load(c.path) });
    } catch {
      /* unreadable */
    }
  }
  return rankFilesForPage({ title: o.page.title ?? '', headings: o.page.headings as never, bodyText: o.page.bodyText }, loaded, 5);
}
