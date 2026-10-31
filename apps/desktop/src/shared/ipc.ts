/**
 * Typed IPC contract shared by main, preload and renderer.
 * Every invoke channel is allow-listed here and its payload is validated with zod in main.
 */
import { z } from 'zod';
import type { Finding, ScoreSummary } from '@h88cro/core';

export const ScanTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.string().url().max(2048) }),
  z.object({ kind: z.literal('file'), path: z.string().min(1).max(4096) }),
]);

export const StartScanSchema = z.object({
  targets: z.array(ScanTargetSchema).min(1).max(20),
  marketId: z.string().max(10).optional(),
  devices: z.array(z.enum(['mobile', 'desktop'])).min(1),
  pageType: z.enum(['toplist', 'brand-review', 'bonus', 'slot', 'sportsbook', 'other']),
  deep: z.boolean().default(false),
  lighthouse: z.boolean().default(true),
  useClaude: z.boolean().default(true),
});
export type StartScanInput = z.infer<typeof StartScanSchema>;

export const SettingsSchema = z.object({
  languageToolUrl: z.string().max(500).default(''),
  staleDateDays: z.number().int().min(1).max(3650).default(45),
  budgetUsd: z.number().min(0.05).max(50).default(1),
  concurrency: z.number().int().min(1).max(4).default(1),
  routing: z
    .object({ classify: z.string().max(80), analysis: z.string().max(80), deep: z.string().max(80) })
    .default({ classify: 'claude-haiku-5-5', analysis: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' }),
  uiLang: z.string().max(10).default('en'),
  helperLang: z.string().max(10).default('en'),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ChannelSchemas = {
  'app:state': z.void(),
  'profile:create': z.object({ name: z.string().min(1).max(80), password: z.string().min(8).max(200) }),
  'profile:unlock': z.object({ password: z.string().min(1).max(200) }),
  'profile:lock': z.void(),
  'engine:install': z.void(),
  'settings:get': z.void(),
  'settings:update': SettingsSchema.partial(),
  'secrets:setClaudeKey': z.object({ key: z.string().min(10).max(300) }),
  'secrets:clearClaudeKey': z.void(),
  'scan:start': StartScanSchema,
  'scan:list': z.void(),
  'scan:get': z.object({ id: z.string().max(64) }),
  'scan:cancel': z.object({ id: z.string().max(64) }),
  'scan:delete': z.object({ id: z.string().max(64) }),
  'finding:action': z.object({ scanId: z.string().max(64), findingId: z.string().max(200), type: z.enum(['ignore', 'comment']), text: z.string().max(2000) }),
  'export:report': z.object({ scanId: z.string().max(64), format: z.enum(['pdf', 'csv', 'json', 'html']) }),
  'dialog:pickFiles': z.void(),
  'storage:info': z.void(),
  'storage:clear': z.void(),
  'shell:openExternal': z.object({ url: z.string().url() }),
  'update:check': z.void(),
  'update:install': z.void(),
} as const;
export type Channel = keyof typeof ChannelSchemas;

export type EngineState = { installed: boolean; version?: string; verified?: boolean; installing: boolean; progress?: number; error?: string };

export type UpdateState = {
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported';
  current: string;
  version?: string;
  progress?: number;
  /** macOS unsigned builds: the user downloads the new .dmg from `url`. */
  manual?: boolean;
  url?: string;
  error?: string;
  checkedAt?: string;
};

export type AppState = {
  mode: 'none' | 'solo';
  profileName?: string;
  unlocked: boolean;
  engine: EngineState;
  claudeKeyHint?: string;
  settings: Settings;
  platform: string;
  version: string;
  freeDiskBytes?: number;
  update: UpdateState;
};

export type ScanListItem = {
  id: string;
  url: string;
  title?: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  overallScore?: number | null;
  previousScore?: number | null;
  market?: string | null;
  pageType: string;
  createdAt: string;
  error?: string | null;
  progress?: { pct: number; message: string };
};

export type ScanDetail = ScanListItem & {
  scores?: ScoreSummary;
  findings: Finding[];
  priority: string[];
  screenshots: { device: 'mobile' | 'desktop'; kind: 'fold' | 'full'; url: string }[];
  warnings: string[];
  actions: { findingId: string; type: string; payload: Record<string, unknown>; createdAt: string }[];
  diff?: { previousId: string; scoreDelta: number; added: string[]; resolved: string[] };
  llmCostUsd: number;
  lang?: string | null;
  marketSignals: string[];
  devices: string[];
};

export type ChannelResult = {
  'app:state': AppState;
  'profile:create': AppState;
  'profile:unlock': { ok: boolean };
  'profile:lock': void;
  'engine:install': EngineState;
  'settings:get': Settings;
  'settings:update': Settings;
  'secrets:setClaudeKey': { ok: boolean; error?: string; hint?: string };
  'secrets:clearClaudeKey': void;
  'scan:start': { ids: string[] };
  'scan:list': ScanListItem[];
  'scan:get': ScanDetail | null;
  'scan:cancel': void;
  'scan:delete': void;
  'finding:action': void;
  'export:report': { saved: boolean; path?: string };
  'dialog:pickFiles': string[];
  'storage:info': { cacheBytes: number; scansBytes: number; enginesBytes: number; dataDir: string };
  'storage:clear': void;
  'shell:openExternal': void;
  'update:check': UpdateState;
  'update:install': void;
};

export type Events = {
  'scan:progress': { id: string; pct: number; message: string };
  'scan:updated': { id: string; status: ScanListItem['status'] };
  'engine:progress': EngineState;
  'menu:navigate': { to: 'new-scan' | 'dashboard' | 'settings' | 'palette' };
  'update:status': UpdateState;
};
export type EventName = keyof Events;
export const EVENT_NAMES: EventName[] = ['scan:progress', 'scan:updated', 'engine:progress', 'menu:navigate', 'update:status'];
