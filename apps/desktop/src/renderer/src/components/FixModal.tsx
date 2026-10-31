import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, GitPullRequest, Monitor, Pencil, Save, Smartphone, X } from 'lucide-react';
import { Button, Spinner, cx, inputClass } from '@h88cro/ui';
import type { FixChange, FixSession } from '../../../shared/ipc';
import { invoke } from '../api';

function Diff({ diff }: { diff: string }) {
  const all = diff.split('\n');
  const lines = all.slice(Math.max(0, all.findIndex((l) => l.startsWith('@@')))); // drop the file header
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-bg p-3 text-[11px] leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            'whitespace-pre-wrap break-all',
            l.startsWith('+') && 'bg-good/10 text-good',
            l.startsWith('-') && 'bg-sev-critical/10 text-sev-critical',
            l.startsWith('@@') && 'text-accent-2',
          )}
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

const external = (url: string) => void invoke('shell:openExternal', { url });

export function FixModal({ scanId, findingIds, onClose, onApplied }: { scanId: string; findingIds: string[]; onClose: () => void; onApplied: () => void }) {
  const [session, setSession] = useState<FixSession>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<{ device: 'mobile' | 'desktop'; before?: string; after?: string; loading?: boolean; error?: string; focused?: boolean }>();
  const [autoMerge, setAutoMerge] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<FixChange>();

  useEffect(() => {
    let live = true;
    invoke('fix:propose', { scanId, findingIds })
      .then((s) => {
        if (!live) return;
        setSession(s);
        setAutoMerge(s.autoMerge);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [scanId, findingIds]);

  const showPreview = async (device: 'mobile' | 'desktop') => {
    if (!session) return;
    setPreview({ device, loading: true });
    try {
      const r = await invoke('fix:preview', { sessionId: session.id, device });
      setPreview({ device, ...r });
    } catch (e) {
      setPreview({ device, error: (e as Error).message });
    }
  };

  const apply = async () => {
    if (!session) return;
    setApplying(true);
    setError(undefined);
    try {
      setDone(await invoke('fix:apply', { sessionId: session.id, autoMerge }));
      onApplied();
    } catch (e) {
      if ((e as Error).message !== 'Not saved.') setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const t = session?.target;
  const applyLabel =
    t?.mode === 'site'
      ? t.site?.kind === 'github'
        ? autoMerge
          ? 'Publish the fix'
          : 'Open pull request'
        : 'Commit to a new branch'
      : 'Save fixed page';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line bg-panel" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-semibold">{findingIds.length > 1 ? `Fix ${findingIds.length} issues` : 'Fix'}</h2>
            {t && (
              <p className="text-xs text-muted">
                {t.mode === 'site' ? `${t.site?.name} · ${t.site?.kind === 'github' ? t.site.repo : t.site?.localPath} · ${t.filePath}` : t.mode === 'file' ? t.filePath : 'Not connected to a site: the fix is saved as a copy of the page'}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!session && !error && (
            <div className="flex items-center gap-3 py-10 text-sm text-muted">
              <Spinner /> Writing the fix and checking it…
            </div>
          )}
          {error && <p className="rounded-lg bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">{error}</p>}

          {session && (
            <>
              <ul className="space-y-1.5">
                {session.items.map((i) => (
                  <li key={i.findingId} className="flex items-start gap-2 text-sm">
                    {i.ok ? <Check size={15} className="mt-0.5 shrink-0 text-good" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-sev-medium" />}
                    <div>
                      <div>{i.title}</div>
                      <div className="text-xs text-muted">
                        {i.ok ? `${i.summary} · ${i.source === 'builtin' ? 'automatic fix' : i.source === 'claude' ? 'written by Claude' : 'edited by you'}` : i.error}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {session.recheck && (
                <div className={cx('rounded-lg px-3 py-2 text-sm', session.recheck.verified ? 'bg-good/10 text-good' : 'bg-panel-2 text-muted')}>
                  <strong>Re-check: </strong>
                  {session.recheck.message}
                  {session.recheck.introduced.length > 0 && <div className="mt-1 text-sev-critical">New issues: {session.recheck.introduced.join('; ')}</div>}
                </div>
              )}

              {session.notes.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                  {session.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}

              {session.patches.map((p, pi) => (
                <div key={p.path} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-muted">{p.path}</code>
                  </div>
                  <Diff diff={p.diff} />
                  {p.failed.length > 0 && <p className="text-xs text-sev-medium">{p.failed.length} change(s) could not be placed: {p.failed[0]}</p>}
                  <details className="text-xs">
                    <summary className="flex cursor-pointer items-center gap-1 text-muted hover:text-fg">
                      <Pencil size={12} /> Edit the changes ({p.edits.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {p.edits.map((e, ei) => {
                        const key = `${pi}:${ei}`;
                        return (
                          <div key={key} className="space-y-1 rounded-lg bg-panel-2 p-2">
                            <div className="truncate font-mono text-muted" title={e.find}>
                              − {e.find.slice(0, 160)}
                            </div>
                            {editing === key ? (
                              <div className="space-y-1">
                                <textarea className={cx(inputClass, 'h-28 font-mono text-xs')} value={draft} onChange={(x) => setDraft(x.target.value)} />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      setSession(await invoke('fix:edit', { sessionId: session.id, patch: pi, edit: ei, replace: draft }));
                                      setEditing(undefined);
                                      setPreview(undefined);
                                    }}
                                  >
                                    Save change
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="block w-full truncate text-left font-mono text-good hover:underline"
                                title="Click to edit"
                                onClick={() => {
                                  setEditing(key);
                                  setDraft(e.replace);
                                }}
                              >
                                + {e.replace.slice(0, 160)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ))}

              {session.canApply && t?.mode !== 'file' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Before / after:</span>
                    <Button size="sm" variant="secondary" disabled={preview?.loading} onClick={() => void showPreview('mobile')}>
                      <Smartphone size={14} /> Mobile
                    </Button>
                    <Button size="sm" variant="secondary" disabled={preview?.loading} onClick={() => void showPreview('desktop')}>
                      <Monitor size={14} /> Desktop
                    </Button>
                    {preview?.loading && <Spinner className="h-4 w-4" />}
                  </div>
                  {preview?.error && <p className="text-xs text-muted">{preview.error}</p>}
                  {preview?.before && preview.after && (
                    <div className="grid grid-cols-2 gap-3">
                      {(['before', 'after'] as const).map((k) => (
                        <figure key={k} className="space-y-1">
                          <figcaption className="text-xs capitalize text-muted">{k}</figcaption>
                          <img src={preview[k]} alt={k} className="w-full rounded-lg border border-line" />
                        </figure>
                      ))}
                      {!preview.focused && <p className="col-span-2 text-xs text-muted">The change is not visible on screen (for example structured data or link attributes).</p>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {done && (
            <div className="space-y-1 rounded-lg bg-good/10 px-3 py-2 text-sm text-good">
              <div className="flex items-center gap-2">
                <Check size={16} /> {done.message}
              </div>
              {done.url && (
                <button className="flex items-center gap-1 underline" onClick={() => external(done.url!)}>
                  <ExternalLink size={13} /> {done.prNumber ? `Pull request #${done.prNumber}` : 'Open'}
                </button>
              )}
            </div>
          )}
        </div>

        {session && !done && (
          <footer className="flex items-center gap-3 border-t border-line px-5 py-3">
            {t?.mode === 'site' && t.site?.kind === 'github' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoMerge} onChange={(e) => setAutoMerge(e.target.checked)} />
                Merge automatically <span className="text-xs text-muted">(goes live after your site deploys)</span>
              </label>
            )}
            {session.costUsd > 0 && <span className="text-xs text-muted">Claude cost ${session.costUsd.toFixed(3)}</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!session.canApply || applying} onClick={() => void apply()}>
                {applying ? <Spinner className="h-4 w-4" /> : t?.mode === 'site' ? <GitPullRequest size={16} /> : <Save size={16} />} {applyLabel}
              </Button>
            </div>
          </footer>
        )}
        {done && (
          <footer className="flex justify-end border-t border-line px-5 py-3">
            <Button onClick={onClose}>Done</Button>
          </footer>
        )}
      </div>
    </div>
  );
}
