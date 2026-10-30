/**
 * Seed market profiles (brief §7). These are starting hypotheses only:
 * market owners must validate them before go-live. Phase 3 moves them into
 * the editable, versioned knowledge base.
 */
export type MarketProfile = {
  id: string; // e.g. 'fr-FR'
  market: string; // ISO country
  languages: string[];
  currency: string;
  /** Example of the correct local currency format, shown in suggestions. */
  currencyExample: string;
  decimalSeparator: ',' | '.';
  thousandsSeparator: string;
  quoteStyle: { open: string; close: string };
  paymentMethods: string[];
  playerMotivations: string[];
  toneAndRegister: string;
  colourNotes?: string;
  trustSignals: string[];
  /** Preferred local term → borrowed/avoided terms. */
  glossary: { prefer: string; avoid: string[] }[];
  notes: string;
  version: number;
};

export const SEED_MARKETS: MarketProfile[] = [
  {
    id: 'fr-FR',
    market: 'FR',
    languages: ['fr'],
    currency: 'EUR',
    currencyExample: '2 000 €',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    quoteStyle: { open: '« ', close: ' »' },
    paymentMethods: ['CB', 'Visa', 'Mastercard', 'Paysafecard', 'Skrill', 'Neteller', 'Crypto'],
    playerMotivations: ['transparency of terms', 'bonus value', 'withdrawal speed', 'trust'],
    toneAndRegister: 'Formal "vous"; clear, precise, transparent about fine print.',
    trustSignals: ['clear wagering terms', 'French-language support', 'tested withdrawals'],
    glossary: [
      { prefer: 'tours gratuits', avoid: ['free spins'] },
      { prefer: 'machines à sous', avoid: ['slots'] },
      { prefer: 'conditions de mise', avoid: ['wagering'] },
      { prefer: 'dépôt minimum', avoid: ['min deposit'] },
    ],
    notes: 'Values clarity and fine-print transparency.',
    version: 1,
  },
  {
    id: 'fr-BE',
    market: 'BE',
    languages: ['fr', 'nl'],
    currency: 'EUR',
    currencyExample: '2 000 €',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    quoteStyle: { open: '« ', close: ' »' },
    paymentMethods: ['Bancontact', 'Visa', 'Mastercard', 'Skrill', 'Neteller'],
    playerMotivations: ['trust', 'local payment methods', 'bonus value'],
    toneAndRegister: 'Bilingual market: language must match the URL; avoid FR-France idioms.',
    trustSignals: ['Bancontact support', 'local-language support'],
    glossary: [{ prefer: 'tours gratuits', avoid: ['free spins'] }],
    notes: 'Language must match the URL.',
    version: 1,
  },
  {
    id: 'en-GB',
    market: 'GB',
    languages: ['en'],
    currency: 'GBP',
    currencyExample: '£2,000',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    quoteStyle: { open: '‘', close: '’' },
    paymentMethods: ['Debit card', 'PayPal', 'Apple Pay', 'Trustly'],
    playerMotivations: ['trust', 'withdrawal speed', 'fair terms'],
    toneAndRegister: 'Understated; strong scepticism of hype.',
    trustSignals: ['clear terms', 'responsible-play messaging', 'real testing evidence'],
    glossary: [],
    notes: 'Use "free spins".',
    version: 1,
  },
  {
    id: 'en-IE',
    market: 'IE',
    languages: ['en'],
    currency: 'EUR',
    currencyExample: '€2,000',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    quoteStyle: { open: '‘', close: '’' },
    paymentMethods: ['Debit card', 'PayPal', 'Apple Pay'],
    playerMotivations: ['trust', 'withdrawal speed'],
    toneAndRegister: 'Similar to UK, with euro formatting.',
    trustSignals: ['clear terms'],
    glossary: [],
    notes: '',
    version: 1,
  },
  {
    id: 'sv-SE',
    market: 'SE',
    languages: ['sv'],
    currency: 'SEK',
    currencyExample: '2 000 kr',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    quoteStyle: { open: '”', close: '”' },
    paymentMethods: ['Trustly', 'Swish', 'BankID'],
    playerMotivations: ['speed', 'simplicity (Pay n Play)', 'trust'],
    toneAndRegister: 'Informal "du".',
    trustSignals: ['BankID login', 'fast payouts'],
    glossary: [{ prefer: 'free spins', avoid: [] }],
    notes: 'Speed and simplicity first.',
    version: 1,
  },
  {
    id: 'da-DK',
    market: 'DK',
    languages: ['da'],
    currency: 'DKK',
    currencyExample: '2.000 kr.',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    quoteStyle: { open: '»', close: '«' },
    paymentMethods: ['MobilePay', 'Dankort', 'Visa', 'Mastercard'],
    playerMotivations: ['transparency', 'trust'],
    toneAndRegister: 'Informal tone.',
    trustSignals: ['transparency'],
    glossary: [],
    notes: '',
    version: 1,
  },
  {
    id: 'nl-NL',
    market: 'NL',
    languages: ['nl'],
    currency: 'EUR',
    currencyExample: '€ 2.000',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    quoteStyle: { open: '‘', close: '’' },
    paymentMethods: ['iDEAL', 'Visa', 'Mastercard'],
    playerMotivations: ['facts', 'trust'],
    toneAndRegister: 'Direct, factual; dislikes exaggerated claims.',
    trustSignals: ['iDEAL', 'factual comparisons'],
    glossary: [],
    notes: '',
    version: 1,
  },
  {
    id: 'pt-PT',
    market: 'PT',
    languages: ['pt'],
    currency: 'EUR',
    currencyExample: '2000 €',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    quoteStyle: { open: '«', close: '»' },
    paymentMethods: ['MB Way', 'Multibanco', 'Visa', 'Mastercard'],
    playerMotivations: ['trust', 'local payments'],
    toneAndRegister: 'European Portuguese (not Brazilian).',
    trustSignals: ['MB Way'],
    glossary: [{ prefer: 'telemóvel', avoid: ['celular'] }],
    notes: 'Watch for Brazilian vocabulary.',
    version: 1,
  },
  {
    id: 'en-AU',
    market: 'AU',
    languages: ['en'],
    currency: 'AUD',
    currencyExample: 'A$2,000',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    quoteStyle: { open: '‘', close: '’' },
    paymentMethods: ['PayID', 'Visa', 'Mastercard', 'Neosurf', 'Crypto'],
    playerMotivations: ['game variety', 'fast payouts'],
    toneAndRegister: 'Casual tone.',
    trustSignals: ['PayID payouts'],
    glossary: [{ prefer: 'pokies', avoid: ['slots'] }],
    notes: '"Pokies" vocabulary.',
    version: 1,
  },
  {
    id: 'th-TH',
    market: 'TH',
    languages: ['th'],
    currency: 'THB',
    currencyExample: '฿2,000',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    quoteStyle: { open: '“', close: '”' },
    paymentMethods: ['PromptPay', 'TrueMoney', 'Bank transfer'],
    playerMotivations: ['trust', 'local payments'],
    toneAndRegister: 'Thai script quality matters.',
    colourNotes: 'Colour and number connotations matter.',
    trustSignals: ['PromptPay'],
    glossary: [],
    notes: '',
    version: 1,
  },
];

export function getMarket(id: string | undefined): MarketProfile | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase();
  return (
    SEED_MARKETS.find((m) => m.id.toLowerCase() === lower) ??
    SEED_MARKETS.find((m) => m.market.toLowerCase() === lower) ??
    SEED_MARKETS.find((m) => m.languages[0] === lower.split('-')[0])
  );
}

export type MarketGuess = { marketId?: string; lang?: string; confidence: number; signals: string[] };

/** Guess the market from html lang, URL path/TLD and currency symbols. */
export function detectMarket(input: { htmlLang?: string; url?: string; text?: string }): MarketGuess {
  const signals: string[] = [];
  let lang = input.htmlLang?.toLowerCase().trim() || undefined;
  if (lang) signals.push(`html lang="${lang}"`);
  let country: string | undefined;
  if (lang?.includes('-')) country = lang.split('-')[1]?.toUpperCase();

  if (input.url) {
    try {
      const u = new URL(input.url);
      const seg = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
      const pathMap: Record<string, string> = { fr: 'FR', be: 'BE', uk: 'GB', gb: 'GB', ie: 'IE', se: 'SE', dk: 'DK', nl: 'NL', pt: 'PT', au: 'AU', th: 'TH' };
      if (seg && pathMap[seg]) {
        country ??= pathMap[seg];
        signals.push(`URL path /${seg}/`);
      }
      const tld = u.hostname.split('.').pop()?.toLowerCase();
      if (tld && pathMap[tld] && !country) {
        country = pathMap[tld];
        signals.push(`TLD .${tld}`);
      }
    } catch {
      /* local files or invalid URLs */
    }
  }
  if (!country && input.text) {
    if (/£\s?\d/.test(input.text)) (country = 'GB'), signals.push('£ amounts');
    else if (/A\$\s?\d/.test(input.text)) (country = 'AU'), signals.push('A$ amounts');
  }
  const baseLang = lang?.split('-')[0];
  if (!country && baseLang) {
    const byLang: Record<string, string> = { fr: 'FR', sv: 'SE', da: 'DK', nl: 'NL', pt: 'PT', th: 'TH', en: 'GB' };
    country = byLang[baseLang];
  }
  const market = SEED_MARKETS.find((m) => m.market === country && (!baseLang || m.languages.includes(baseLang))) ??
    SEED_MARKETS.find((m) => m.market === country);
  if (!lang && market) lang = market.languages[0];
  return { marketId: market?.id, lang: lang?.split('-')[0], confidence: signals.length >= 2 ? 0.9 : signals.length ? 0.6 : 0.2, signals };
}
