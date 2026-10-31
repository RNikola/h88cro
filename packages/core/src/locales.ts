/**
 * Every language and country a scan can target. Seeded markets (markets.ts) carry hand-written
 * profiles; any other language–country pair gets a generic profile built from Intl data.
 */

/** ISO 639-1 language codes. */
export const LANGUAGE_CODES = (
  'aa ab af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu ' +
  'fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km ' +
  'kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om ' +
  'or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ' +
  'ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
).split(' ');

/** ISO 3166-1 alpha-2 country → ISO 4217 currency. */
const COUNTRY_CURRENCY = Object.fromEntries(
  (
    'AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN BA:BAM BB:BBD ' +
    'BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN ' +
    'BZ:BZD CA:CAD CC:AUD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:ANG ' +
    'CX:AUD CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP EH:MAD ER:ERN ES:EUR ET:ETB FI:EUR ' +
    'FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR ' +
    'GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IQ:IQD ' +
    'IR:IRR IS:ISK IT:EUR JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD ' +
    'KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MF:EUR ' +
    'MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR ' +
    'MZ:MZN NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD OM:OMR PA:PAB PE:PEN PF:XPF ' +
    'PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PN:NZD PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF ' +
    'SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD ' +
    'SX:ANG SY:SYP SZ:SZL TC:USD TD:XAF TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD ' +
    'TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF WS:WST XK:EUR YE:YER ' +
    'YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG'
  )
    .split(' ')
    .map((p) => p.split(':') as [string, string]),
);
export const COUNTRY_CODES = Object.keys(COUNTRY_CURRENCY);

export function currencyForCountry(country: string): string | undefined {
  return COUNTRY_CURRENCY[country.toUpperCase()];
}

/** Opening/closing quotes by language (CLDR primary quotes). Languages not listed use “ ”. */
const QUOTES: Record<string, [string, string]> = {
  fr: ['« ', ' »'], de: ['„', '“'], nl: ['“', '”'], sv: ['”', '”'], fi: ['”', '”'], da: ['“', '”'], nb: ['«', '»'], no: ['«', '»'], nn: ['«', '»'],
  it: ['«', '»'], es: ['«', '»'], pt: ['«', '»'], ru: ['«', '»'], uk: ['«', '»'], pl: ['„', '”'], cs: ['„', '“'], sk: ['„', '“'], sl: ['„', '“'],
  hr: ['„', '“'], sr: ['„', '“'], bs: ['„', '“'], bg: ['„', '“'], ro: ['„', '”'], hu: ['„', '”'], lt: ['„', '“'], lv: ['«', '»'], et: ['„', '“'],
  el: ['«', '»'], tr: ['“', '”'], ja: ['「', '」'], zh: ['“', '”'], ko: ['“', '”'], he: ['”', '”'], ar: ['”', '“'], fa: ['«', '»'],
};

export type LocaleOption = { id: string; label: string; lang: string; country: string; search: string };

const langNames = () => new Intl.DisplayNames(['en'], { type: 'language' });
const regionNames = () => new Intl.DisplayNames(['en'], { type: 'region' });

export function languageName(code: string): string {
  try {
    return langNames().of(code) ?? code;
  } catch {
    return code;
  }
}
export function countryName(code: string): string {
  try {
    return regionNames().of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** All languages, sorted by English name, for a searchable picker. */
export function languageOptions(): { code: string; name: string; native: string }[] {
  return LANGUAGE_CODES.map((code) => {
    let native = '';
    try {
      native = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? '';
    } catch {
      /* no data for this language */
    }
    return { code, name: languageName(code), native: native && native !== languageName(code) ? native : '' };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** All countries, sorted by English name. */
export function countryOptions(): { code: string; name: string; currency: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code), currency: COUNTRY_CURRENCY[code]! })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Number format facts for a locale, from Intl. */
export function numberFormat(locale: string): { decimal: ',' | '.'; group: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const decimal = parts.find((p) => p.type === 'decimal')?.value === ',' ? ',' : '.';
    return { decimal, group: parts.find((p) => p.type === 'group')?.value ?? ',' };
  } catch {
    return { decimal: '.', group: ',' };
  }
}

export function currencyExample(locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(2000);
  } catch {
    return `${currency} 2,000`;
  }
}

export function quotesFor(lang: string): { open: string; close: string } {
  const q = QUOTES[lang] ?? ['“', '”'];
  return { open: q[0], close: q[1] };
}
