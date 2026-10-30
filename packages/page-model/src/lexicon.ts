import { parseLooseNumber } from '@h88cro/core';

const FR_ORDINALS: Record<string, number> = {
  premier: 1, première: 1, premiere: 1, deuxième: 2, deuxieme: 2, second: 2, seconde: 2, troisième: 3, troisieme: 3,
  quatrième: 4, quatrieme: 4, cinquième: 5, cinquieme: 5, sixième: 6, septième: 7, huitième: 8, neuvième: 9, dixième: 10,
};
const EN_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const MEDALS: [RegExp, number][] = [
  [/médaille d['’]or|gold medal/i, 1],
  [/médaille d['’]argent|silver medal|dauphin(?:e)?\b|runner[- ]up/i, 2],
  [/médaille de bronze|bronze medal/i, 3],
];

/** Find a rank claim in a review text, e.g. "deuxième place", "#2", "n°2", "silver medal". */
export function findStatedRank(text: string): { rank: number; phrase: string } | undefined {
  const t = text;
  let m = t.match(/\b(premi[eè]re|premier|deuxi[eè]me|seconde?|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me)\s+(place|position|rang)\b/i);
  if (m?.[1]) {
    const r = FR_ORDINALS[m[1].toLowerCase()];
    if (r) return { rank: r, phrase: m[0] };
  }
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(place|position|spot)\b/i);
  if (m?.[1]) {
    const r = EN_ORDINALS[m[1].toLowerCase()];
    if (r) return { rank: r, phrase: m[0] };
  }
  m = t.match(/(?:\bn[°º]\s?|#|\bnuméro\s|\bnumber\s|\bno\.\s?)(\d{1,2})\b(?!\s*(?:€|%|\$|£))/i);
  if (m?.[1] && /\b(class|plac|rang|rank|list|top|position|podium|sélection|selection)/i.test(t.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 60))) {
    return { rank: Number(m[1]), phrase: m[0] };
  }
  for (const [re, r] of MEDALS) {
    const mm = t.match(re);
    if (mm) return { rank: r, phrase: mm[0] };
  }
  return undefined;
}

const NUMBER_WORDS: Record<string, number> = {
  // fr
  un: 1, une: 1, deux: 2, duo: 2, trois: 3, trio: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  // en
  one: 1, two: 2, pair: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10,
};
const COUNT_NOUNS = /(plateformes?|casinos?|sites?|op[ée]rateurs?|marques?|bookmakers?|platforms?|brands?|options?|établissements?)/i;

/** Statements like "deux plateformes", "top 3 casinos", "notre duo" that claim how many brands are listed. */
export function findCountClaims(text: string): { count: number; phrase: string }[] {
  const out: { count: number; phrase: string }[] = [];
  const re = new RegExp(String.raw`\b(top\s+(\d{1,2})|(\d{1,2})\s+meilleurs|(\d{1,2})|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|one|two|three|four|five|seven|eight|nine|ten|duo|trio)\s+(?:meilleur(?:e)?s?\s+|best\s+|top\s+)?${COUNT_NOUNS.source}`, 'gi');
  for (const m of text.matchAll(re)) {
    const raw = m[1]!.toLowerCase();
    const n = m[2] ? Number(m[2]) : m[3] ? Number(m[3]) : m[4] ? Number(m[4]) : NUMBER_WORDS[raw];
    if (n && n > 1 && n <= 20) out.push({ count: n, phrase: m[0] });
  }
  for (const m of text.matchAll(/\b(?:notre|ce|le|our|this)\s+(duo|trio)\b/gi)) {
    out.push({ count: NUMBER_WORDS[m[1]!.toLowerCase()]!, phrase: m[0] });
  }
  return out;
}

const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parse the first date in a string (ISO, dd/mm/yyyy, "12 mars 2026", "March 12, 2026", "mars 2026"). */
export function parseDate(text: string): string | undefined {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!); // European order
  m = text.match(/\b(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})\b/i);
  if (m && MONTHS[m[2]!.toLowerCase()]) return iso(+m[3]!, MONTHS[m[2]!.toLowerCase()]!, +m[1]!);
  m = text.match(/\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (m && MONTHS[m[1]!.toLowerCase()]) return iso(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!);
  m = text.match(/\b([a-zéû]+)\s+(\d{4})\b/i);
  if (m && MONTHS[m[1]!.toLowerCase()]) return iso(+m[2]!, MONTHS[m[1]!.toLowerCase()]!, 1);
  return undefined;
}

export const UPDATED_RE = /(derni[eè]re\s+)?mis[e]?\s+à\s+jour|actualis[ée]|updated|last\s+update|révis[ée]|uppdaterad|opdateret|bijgewerkt|atualizado/i;
export const PUBLISHED_RE = /publi[ée]|published|posted/i;
export const TESTED_RE = /test[ée]e?s?\s+(le|en|on)|tested\s+on|date\s+du\s+test/i;

/** Extract the largest money amount from a bonus text: "jusqu'à 2 000 €", "€500", "100%" is ignored. */
export function parseMoney(text: string): number | undefined {
  const amounts: number[] = [];
  const re = /(?:([€£$]|A\$|kr\.?|฿)\s?(\d[\d\s  .,]*\d|\d))|(?:(\d[\d\s  .,]*\d|\d)\s?(€|£|\$|EUR|euros?|kr\.?|SEK|DKK|฿))/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[2] ?? m[3] ?? '').trim();
    const n = parseLooseNumber(raw);
    if (n !== undefined) amounts.push(n);
  }
  return amounts.length ? Math.max(...amounts) : undefined;
}

/** Ratings like "9,8/10", "4.5 / 5", "Note : 9.6". */
export function parseRating(text: string): { value: number; scale: number; text: string } | undefined {
  let m = text.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*\/\s*(10|5|100)\b/);
  if (m) {
    const v = parseLooseNumber(m[1]!);
    if (v !== undefined && v <= Number(m[2])) return { value: v, scale: Number(m[2]), text: m[0] };
  }
  m = text.match(/(?:note|score|rating|betyg|karakter|cijfer|nota)\s*:?\s*(\d{1,2}(?:[.,]\d)?)/i);
  if (m) {
    const v = parseLooseNumber(m[1]!);
    if (v !== undefined && v <= 10) return { value: v, scale: v <= 5 && !/[.,]\d/.test(m[1]!) ? 5 : 10, text: m[0] };
  }
  return undefined;
}

export const AFFILIATE_PATH_RE = /\/(go|out|visit|visiter|casino|recommends|link|aff|play|jouer|redirect|r)\/([\w.-]+)/i;
