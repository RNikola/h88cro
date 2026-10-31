import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Ban, Copy, Download, Eye, MessageSquare, Sparkles, Wand2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { MODULE_LABELS, POSSIBLE_CONFIDENCE_THRESHOLD, SEVERITIES, type Finding, type ModuleId } from '@h88cro/core';
import { Badge, Button, Card, ScoreRing, SeverityBadge, Spinner, cx, inputClass, scoreColor } from '@h88cro/ui';
import type { ScanDetail } from '../../../shared/ipc';
import type { Navigate } from '../App';
import { invoke, useScan } from '../api';
import { FixBar } from '../components/FixBar';
import { FixModal } from '../components/FixModal';

type Alternatives = { loading?: boolean; items?: { text: string; why: string; translationForReviewer: string }[]; error?: string };

function AlternativesPanel({ a }: { a: Alternatives }) {
  if (a.loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-3 w-3" /> Claude is writing alternatives…
      </div>
    );
  return (
    <div className="space-y-2">
      {a.error && <p className="text-xs text-muted">{a.error}</p>}
      {a.items?.length === 0 && !a.error && <p className="text-xs text-muted">No alternatives for this issue.</p>}
      {a.items?.map((c, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-accent-1/30 bg-accent-1/5 px-3 py-2 text-sm">
          <div className="flex-1">
            <div>{c.text}</div>
            {c.translationForReviewer && <div className="mt-1 text-xs text-muted">{c.translationForReviewer}</div>}
            <div className="mt-1 text-xs text-muted">{c.why}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(c.text)} aria-label="Copy">
            <Copy size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}

const VIEWPORT_W = { mobile: 390, desktop: 1440 } as const;
const EFFORT_LABEL = { xs: 'a few minutes', s: 'under an hour', m: 'a few hours', l: 'a day or more' } as const;

type Region = NonNullable<Finding['evidence'][number]['screenshotRegion']>;

function RegionViewer({ scan, region, onClose }: { scan: ScanDetail; region: Region; onClose: () => void }) {
  const shot = scan.screenshots.find((s) => s.device === region.device && s.kind === 'full') ?? scan.screenshots.find((s) => s.device === region.device);
  const [size, setSize] = useState<{ w: number; h: number }>();
  const dsf = size ? size.w / VIEWPORT_W[region.device] : 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={onClose}>
      <div className="max-h-full max-w-4xl overflow-auto rounded-xl bg-panel p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span className="capitalize">{region.device}</span>
          <button onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {shot ? (
          <div className="relative">
            <img src={shot.url} alt="" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} className="block max-w-full" />
            {size && region.w > 0 && (
              <div
                className="pointer-events-none absolute rounded border-2 border-sev-critical shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{ left: `${((region.x * dsf) / size.w) * 100}%`, top: `${((region.y * dsf) / size.h) * 100}%`, width: `${((region.w * dsf) / size.w) * 100}%`, height: `${((region.h * dsf) / size.h) * 100}%` }}
              />
            )}
          </div>
        ) : (
          <p className="p-6 text-sm text-muted">Screenshot not available.</p>
        )}
      </div>
    </div>
  );
}

function FindingCard({ f, scan, ignored, comments, onAction, onShowRegion, selected, onSelect, onFix }: { f: Finding; scan: ScanDetail; ignored?: string; comments: string[]; onAction: () => void; onShowRegion: (r: Region) => void; selected: boolean; onSelect: (on: boolean) => void; onFix: () => void }) {
  const [mode, setMode] = useState<'ignore' | 'comment'>();
  const [alts, setAlts] = useState<Alternatives>();
  const suggest = async () => {
    setAlts({ loading: true });
    try {
      const r = await invoke('suggest:alternatives', { scanId: scan.id, findingId: f.id });
      setAlts({ items: r.alternatives, error: r.error });
    } catch (e) {
      setAlts({ error: (e as Error).message });
    }
  };
  const [text, setText] = useState('');
  const possible = f.source === 'llm' && f.confidence < POSSIBLE_CONFIDENCE_THRESHOLD;
  const region = f.evidence.find((e) => e.screenshotRegion)?.screenshotRegion;
  const isNew = scan.diff?.added.includes(f.id);
  return (
    <Card className={cx('space-y-3', ignored && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1.5" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select for batch fix" />
        <SeverityBadge severity={f.severity} />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium leading-snug">
            {f.title}
            {possible && <span className="ml-2 text-xs font-normal text-muted">(possible)</span>}
            {isNew && <Badge className="ml-2 bg-accent-1/20 text-accent-1">new</Badge>}
          </h3>
          <p className="mt-1 text-sm text-muted">{f.explanation}</p>
        </div>
      </div>

      {f.evidence.length > 0 && (
        <ul className="space-y-1.5">
          {f.evidence.slice(0, 5).map((e, i) => (
            <li key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-xs">
              {e.textExcerpt && <div className="text-fg">“{e.textExcerpt}”</div>}
              {e.metric && (
                <div className="text-fg">
                  {e.metric.name}: <strong>{e.metric.value}</strong> <span className="text-muted">(target {e.metric.target})</span>
                </div>
              )}
              {e.selector && <code className="text-muted">{e.selector}</code>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-accent-2/30 bg-accent-2/5 px-3 py-2 text-sm">
        <span className="font-medium text-accent-2">Suggestion: </span>
        {f.suggestion}
      </div>
      {f.suggestedCopy?.map((c, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-sm">
          <div className="flex-1">
            <div className="font-mono">{c.text}</div>
            {c.translationForReviewer && <div className="mt-1 text-xs text-muted">{c.translationForReviewer}</div>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(c.text)} aria-label="Copy suggested text">
            <Copy size={14} />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Effort: {EFFORT_LABEL[f.effort]}</span>
        <span>Impact: {f.impact}/5</span>
        <span>{f.source === 'deterministic' ? 'Automatic check' : f.source === 'llm' ? `Claude review (${Math.round(f.confidence * 100)}% sure)` : 'Hybrid'}</span>
        {f.marketContextIds?.length ? <span>Market: {f.marketContextIds.join(', ')}</span> : null}
      </div>

      {ignored && <p className="text-xs text-muted">Ignored: {ignored}</p>}
      {comments.map((c, i) => (
        <p key={i} className="flex gap-2 text-xs text-muted">
          <MessageSquare size={12} className="mt-0.5 shrink-0" /> {c}
        </p>
      ))}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {region && (
          <Button variant="secondary" size="sm" onClick={() => onShowRegion(region)}>
            <Eye size={14} /> Show on screenshot
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={alts?.loading} onClick={() => void suggest()}>
          <Sparkles size={14} /> Suggest alternatives
        </Button>
        <Button variant="secondary" size="sm" onClick={onFix}>
          <Wand2 size={14} /> Fix
        </Button>
        {!ignored && (
          <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'ignore' ? undefined : 'ignore')}>
            <Ban size={14} /> Ignore
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'comment' ? undefined : 'comment')}>
          <MessageSquare size={14} /> Comment
        </Button>
      </div>
      {alts && <AlternativesPanel a={alts} />}
      {mode && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await invoke('finding:action', { scanId: scan.id, findingId: f.id, type: mode, text });
            setMode(undefined);
            setText('');
            onAction();
          }}
        >
          <input className={inputClass} autoFocus placeholder={mode === 'ignore' ? 'Why are you ignoring this? (required)' : 'Add a comment'} value={text} onChange={(e) => setText(e.target.value)} />
          <Button size="sm" className="h-auto" disabled={!text.trim()}>
            Save
          </Button>
        </form>
      )}
    </Card>
  );
}

export function Report({ id, navigate }: { id: string; navigate: Navigate }) {
  const { data: scan, isLoading } = useScan(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'priority' | ModuleId>('priority');
  const [showIgnored, setShowIgnored] = useState(false);
  const [region, setRegion] = useState<Region>();
  const [exporting, setExporting] = useState<string>();
  const [exportMsg, setExportMsg] = useState<string>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState<string[]>();

  const actions = useMemo(() => {
    const ignored = new Map<string, string>();
    const comments = new Map<string, string[]>();
    for (const a of scan?.actions ?? []) {
      const t = String(a.payload.text ?? '');
      if (a.type === 'ignore') ignored.set(a.findingId, t);
      else comments.set(a.findingId, [...(comments.get(a.findingId) ?? []), t]);
    }
    return { ignored, comments };
  }, [scan?.actions]);

  if (isLoading || !scan)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  const byId = new Map(scan.findings.map((f) => [f.id, f]));
  const visible = (fs: Finding[]) => fs.filter((f) => showIgnored || !actions.ignored.has(f.id));
  const list =
    tab === 'priority'
      ? visible(scan.priority.map((pid) => byId.get(pid)).filter((f): f is Finding => !!f))
      : visible(scan.findings.filter((f) => f.module === tab)).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const folds = scan.screenshots.filter((s) => s.kind === 'fold');

  const doExport = async (format: 'pdf' | 'csv' | 'json') => {
    setExporting(format);
    setExportMsg(undefined);
    try {
      const r = await invoke('export:report', { scanId: scan.id, format });
      if (r.saved) setExportMsg(`Saved to ${r.path}`);
    } catch (e) {
      setExportMsg((e as Error).message);
    } finally {
      setExporting(undefined);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <button onClick={() => navigate({ name: 'dashboard' })} className="flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft size={14} /> Dashboard
      </button>

      <Card className="flex items-center gap-6">
        <ScoreRing score={scan.overallScore ?? 0} size={104} label="Overall score" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="truncate text-xl font-semibold">{scan.title ?? scan.url}</h1>
          <div className="truncate text-sm text-muted">{scan.url}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-accent-1/20 text-fg" >{scan.market ?? 'Market unknown'}</Badge>
            <Badge>{scan.pageType}</Badge>
            <Badge>{scan.devices.join(' + ')}</Badge>
            <span className="text-muted">Scanned {new Date(scan.createdAt).toLocaleString()}</span>
            {scan.llmCostUsd > 0 && <span className="text-muted">· Claude cost ${scan.llmCostUsd.toFixed(3)}</span>}
          </div>
          {scan.diff && (
            <div className="flex items-center gap-3 text-xs">
              <span className={cx('flex items-center gap-0.5 font-medium', scan.diff.scoreDelta >= 0 ? 'text-good' : 'text-sev-critical')}>
                {scan.diff.scoreDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {scan.diff.scoreDelta >= 0 ? '+' : ''}
                {scan.diff.scoreDelta} vs previous scan
              </span>
              <span className="text-muted">
                {scan.diff.added.length} new · {scan.diff.resolved.length} resolved
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {(['pdf', 'csv', 'json'] as const).map((fmt) => (
            <Button key={fmt} variant="secondary" size="sm" disabled={!!exporting} onClick={() => void doExport(fmt)}>
              {exporting === fmt ? <Spinner className="h-3 w-3" /> : <Download size={14} />} Export {fmt.toUpperCase()}
            </Button>
          ))}
        </div>
      </Card>
      {exportMsg && <p className="text-xs text-muted">{exportMsg}</p>}

      {scan.status === 'done' && <FixBar scanId={scan.id} navigate={navigate} />}

      <div className="grid grid-cols-6 gap-3">
        {scan.scores?.modules.map((m) => (
          <button key={m.module} onClick={() => setTab(m.module)} className={cx('rounded-xl border bg-panel p-3 text-left transition hover:border-accent-2/60', tab === m.module ? 'border-accent-2' : 'border-line')}>
            <div className="text-2xl font-bold" style={{ color: scoreColor(m.score) }}>
              {m.score}
            </div>
            <div className="text-xs text-fg">{MODULE_LABELS[m.module]}</div>
            <div className="text-[11px] text-muted">{m.findingCount} findings</div>
          </button>
        ))}
      </div>

      {folds.length > 0 && (
        <div className="flex gap-3">
          {folds.map((s) => (
            <button
              key={s.url}
              onClick={() => setRegion({ device: s.device, x: 0, y: 0, w: 0, h: 0 })}
              className={cx('group relative h-56 overflow-hidden rounded-xl border border-line bg-panel text-left', s.device === 'mobile' ? 'w-32' : 'w-[22rem]')}
              title="Open the full-page screenshot"
            >
              <img src={s.url} alt={`${s.device} first screen`} className="block w-full object-cover object-top" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[11px] text-white">
                {s.device === 'mobile' ? 'Mobile' : 'Desktop'} · first screen
              </span>
            </button>
          ))}
        </div>
      )}

      {scan.warnings.length > 0 && (
        <details className="rounded-xl border border-line bg-panel px-4 py-2 text-xs text-muted">
          <summary className="cursor-pointer">{scan.warnings.length} scan note{scan.warnings.length > 1 ? 's' : ''}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {scan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex items-center gap-1 border-b border-line">
        {(['priority', ...(scan.scores?.modules.map((m) => m.module) ?? [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm', tab === t ? 'border-accent-2 text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t === 'priority' ? 'Fix these first' : MODULE_LABELS[t]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} /> Show ignored
        </label>
      </div>

      <div className="space-y-3">
        {list.length === 0 && <p className="py-8 text-center text-sm text-muted">No issues here.</p>}
        {list.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            scan={scan}
            ignored={actions.ignored.get(f.id)}
            comments={actions.comments.get(f.id) ?? []}
            onAction={() => void qc.invalidateQueries({ queryKey: ['scan:get', id] })}
            onShowRegion={setRegion}
            selected={selected.has(f.id)}
            onSelect={(on) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (on) next.add(f.id);
                else next.delete(f.id);
                return next;
              })
            }
            onFix={() => setFixing([f.id])}
          />
        ))}
      </div>
      {region && <RegionViewer scan={scan} region={region} onClose={() => setRegion(undefined)} />}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto flex w-fit items-center gap-3 rounded-xl border border-accent-2/50 bg-panel-2 px-4 py-2 shadow-lg">
          <span className="text-sm">{selected.size} selected</span>
          <Button size="sm" onClick={() => setFixing([...selected])}>
            <Wand2 size={14} /> Fix selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(list.map((f) => f.id)))}>
            Select all in this tab
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {fixing && (
        <FixModal
          scanId={scan.id}
          findingIds={fixing}
          onClose={() => setFixing(undefined)}
          onApplied={() => {
            setSelected(new Set());
            void qc.invalidateQueries({ queryKey: ['fix:changes', scan.id] });
          }}
        />
      )}
    </div>
  );
}
