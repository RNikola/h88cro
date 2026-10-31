import type { Finding, MarketProfile, PageType } from '@h88cro/core';

/** One exact search-and-replace. `find` must occur exactly once in the file (or `all` is set). */
export type Edit = { find: string; replace: string; all?: boolean; note?: string };

/** Changes for one source file. `path` is relative to the repo root (or the local folder). */
export type FilePatch = { path: string; edits: Edit[] };

export type FixProposal = {
  findingIds: string[];
  /** builtin = deterministic fixer, claude = generated, manual = edited by the user. */
  source: 'builtin' | 'claude' | 'manual';
  summary: string;
  patches: FilePatch[];
  /** Things the user should know (e.g. "inserted a button; check its style"). */
  notes: string[];
};

export type ApplyResult = { text: string; applied: number; failed: { edit: Edit; reason: string }[] };

export type RecheckResult = {
  /** Per finding: still present after the patch? undefined = could not verify. */
  results: { findingId: string; ruleId: string; fixed?: boolean }[];
  /** New Critical/High findings the patch introduced. */
  introduced: Finding[];
  verified: boolean;
  message: string;
};

export type FixContext = {
  /** The page as scanned (snapshot HTML). */
  pageHtml: string;
  url: string;
  lang?: string;
  market?: MarketProfile;
  pageType: PageType;
  now: Date;
};
