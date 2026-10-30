import type { Device, Finding, MarketProfile, ModuleId, PageType } from '@h88cro/core';

export type Rect = { x: number; y: number; w: number; h: number };

/** Element geometry and a few computed styles, captured in the headless browser. */
export type ElementLayout = {
  rect: Rect;
  position?: string;
  visible: boolean;
  color?: string;
  background?: string;
  fontSize?: number;
  zIndex?: number;
};

export type DeviceLayout = {
  device: Device;
  viewport: { width: number; height: number };
  documentHeight: number;
  /** Keyed by the `data-h88` id stamped on each element before HTML was serialised. */
  elements: Record<string, ElementLayout>;
};

export type Heading = { level: number; text: string; id?: string; selector: string; h88?: string; index: number };
export type TextBlock = { tag: string; text: string; selector: string; h88?: string; index: number };

export type Link = {
  href: string;
  absHref?: string;
  text: string;
  rel: string[];
  target?: string;
  selector: string;
  h88?: string;
  isAffiliate: boolean;
  isExternal: boolean;
  brandSlug?: string;
  inTable: boolean;
  /** Index of the closest preceding block in reading order. */
  index: number;
  classes: string;
};

export type Image = {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  loading?: string;
  fetchpriority?: string;
  selector: string;
  h88?: string;
  index: number;
  hasSrcset: boolean;
  inPicture: boolean;
};

export type Script = { src?: string; async: boolean; defer: boolean; type?: string; inHead: boolean; isThirdParty: boolean; inlineLength: number };
export type Stylesheet = { href: string; media?: string; inHead: boolean };

export type JsonLdBlock = { raw: string; parsed?: unknown; error?: string; types: string[] };

export type TableModel = { selector: string; h88?: string; headers: string[]; rows: { cells: string[]; text: string; linkIdx: number[]; selector: string }[] };

export type Cta = { text: string; href?: string; selector: string; h88?: string; index: number; isAffiliate: boolean; brandSlug?: string; inTable: boolean; tag: string; classes: string };

export type BrandCard = {
  slug: string;
  name: string;
  rank: number;
  selector: string;
  h88?: string;
  rating?: number;
  ratingScale?: number;
  ratingText?: string;
  bonusText?: string;
  bonusAmount?: number;
  text: string;
  hasTermsLink: boolean;
  hasCta: boolean;
  index: number;
};

export type BrandTableRow = { slug: string; name: string; rank: number; rating?: number; ratingScale?: number; text: string; hasCta: boolean; selector: string };

export type ReviewSection = {
  slug: string;
  name: string;
  order: number;
  heading: Heading;
  text: string;
  blocks: TextBlock[];
  hasCta: boolean;
  /** Rank stated in the text, e.g. "deuxième place" → 2. */
  statedRank?: { rank: number; phrase: string };
};

export type Brand = {
  slug: string;
  name: string;
  card?: BrandCard;
  table?: BrandTableRow;
  review?: ReviewSection;
  schemaPosition?: number;
  schemaRating?: number;
};

export type FaqItem = { question: string; answer: string; selector: string };
export type Toc = { selector: string; items: { text: string; href: string }[] };

export type DateMention = { text: string; iso?: string; selector: string; kind: 'updated' | 'published' | 'tested' | 'other' };

export type PageModel = {
  url: string;
  finalUrl?: string;
  isLocalFile: boolean;
  htmlLang?: string;
  title?: string;
  metaDescription?: string;
  metaRobots?: string;
  canonical?: string;
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  hasFavicon: boolean;
  viewportMeta?: string;
  headings: Heading[];
  blocks: TextBlock[];
  links: Link[];
  images: Image[];
  scripts: Script[];
  stylesheets: Stylesheet[];
  preconnects: string[];
  jsonLd: JsonLdBlock[];
  tables: TableModel[];
  ctas: Cta[];
  brands: Brand[];
  cards: BrandCard[];
  reviews: ReviewSection[];
  faq: FaqItem[];
  toc?: Toc;
  dates: DateMention[];
  author?: { name: string; byline: string; selector: string; href?: string };
  bodyText: string;
  wordCount: number;
  layout?: Partial<Record<Device, DeviceLayout>>;
  responseHeaders?: Record<string, string>;
  statusCode?: number;
};

/** Optional browser-side measurements (Lighthouse etc.) the performance module can use. */
export type PerfMetrics = {
  device: Device;
  lcpMs?: number;
  cls?: number;
  tbtMs?: number;
  speedIndexMs?: number;
  performanceScore?: number;
  lcpSelector?: string;
};

export type AnalyzerContext = {
  page: PageModel;
  market?: MarketProfile;
  lang?: string;
  pageType: PageType;
  now: Date;
  perf?: PerfMetrics[];
  options: { staleDateDays: number };
};

export type Analyzer = {
  id: ModuleId;
  version: string;
  run(ctx: AnalyzerContext): Finding[] | Promise<Finding[]>;
};
