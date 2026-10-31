import { useEffect, useState } from 'react';
import { ExternalLink, FileCode2, GitBranch, GitMerge, GitPullRequest, Link2, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner, cx, inputClass } from '@h88cro/ui';
import type { FixChange } from '../../../shared/ipc';
import type { Navigate } from '../App';
import { invoke, useEvent } from '../api';

const STATE_LABEL: Record<string, string> = {
  open: 'Waiting for review',
  'auto-merge': 'Merges when checks pass',
  merged: 'Merged',
  closed: 'Closed',
  committed: 'Committed on a branch',
  saved: 'Saved',
};

export function useFixTarget(scanId: string) {
  return useQuery({ queryKey: ['fix:target', scanId], queryFn: () => invoke('fix:target', { scanId }) });
}

export function FixBar({ scanId, navigate }: { scanId: string; navigate: Navigate }) {
  const qc = useQueryClient();
  const target = useFixTarget(scanId);
  const changes = useQuery({ queryKey: ['fix:changes', scanId], queryFn: () => invoke('fix:changes', { scanId }) });
  const [path, setPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  useEvent('fix:changed', () => void qc.invalidateQueries({ queryKey: ['fix:changes', scanId] }));
  useEffect(() => setPath(target.data?.suggestions[0]?.path ?? ''), [target.data]);

  const t = target.data;
  const setFile = async (filePath: string) => {
    setSaving(true);
    setError(undefined);
    try {
      qc.setQueryData(['fix:target', scanId], await invoke('fix:setFile', { scanId, filePath }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <FileCode2 size={18} className="text-accent-2" />
        <div className="min-w-0 flex-1 text-sm">
          {target.isLoading && (
            <span className="flex items-center gap-2 text-muted">
              <Spinner className="h-3 w-3" /> Finding where this page lives…
            </span>
          )}
          {t?.mode === 'page' && (
            <span className="text-muted">
              Fixes are saved as a copy of the page. <strong className="text-fg">Connect this site&apos;s GitHub repository</strong> to publish fixes straight to the live domain.
            </span>
          )}
          {t?.mode === 'file' && <span className="text-muted">Fixes are saved as a fixed copy of {t.filePath}.</span>}
          {t?.mode === 'site' && t.filePath && (
            <span>
              Fixes go to <strong>{t.site?.kind === 'github' ? t.site.repo : t.site?.name}</strong> · <code className="text-xs">{t.filePath}</code>
              {t.site?.kind === 'github' && <span className="text-muted"> · {t.site.autoMerge ? 'merged automatically' : 'as pull requests'}</span>}
              <button className="ml-2 text-xs text-muted underline" onClick={() => qc.setQueryData(['fix:target', scanId], { ...t, filePath: undefined })}>
                change file
              </button>
            </span>
          )}
          {t?.mode === 'site' && !t.filePath && <span>Which file in {t.site?.kind === 'github' ? t.site.repo : t.site?.name} renders this page?</span>}
        </div>
        {t?.mode === 'page' && (
          <Button size="sm" variant="secondary" onClick={() => navigate({ name: 'sites' })}>
            <Link2 size={14} /> Connect site
          </Button>
        )}
      </div>

      {t?.mode === 'site' && !t.filePath && (
        <div className="space-y-2">
          {t.error && <p className="text-xs text-sev-critical">{t.error}</p>}
          {t.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {t.suggestions.map((s) => (
                <button key={s.path} onClick={() => setPath(s.path)} className={cx('rounded-lg border px-2 py-1 font-mono text-xs', path === s.path ? 'border-accent-2 text-fg' : 'border-line text-muted')}>
                  {s.path} <span className="opacity-60">{Math.round(s.score * 100)}%</span>
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void setFile(path.trim());
            }}
          >
            <input className={cx(inputClass, 'font-mono text-xs')} placeholder="e.g. src/pages/fr/index.astro" value={path} onChange={(e) => setPath(e.target.value)} />
            <Button size="sm" className="h-auto" disabled={!path.trim() || saving}>
              {saving ? 'Checking…' : 'Use this file'}
            </Button>
          </form>
          {!t.suggestions.length && !t.error && <p className="text-xs text-muted">No file matched the page text. Type the path of the file (from the repository root).</p>}
          {error && <p className="text-xs text-sev-critical">{error}</p>}
        </div>
      )}

      {!!changes.data?.length && (
        <div className="space-y-1.5 border-t border-line pt-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Fixes applied from this report</span>
            <button className="flex items-center gap-1 hover:text-fg" onClick={async () => (await invoke('fix:refresh'), void changes.refetch())}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {changes.data.map((c) => (
            <ChangeRow key={c.id} c={c} scanId={scanId} navigate={navigate} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ChangeRow({ c, scanId, navigate }: { c: FixChange; scanId: string; navigate: Navigate }) {
  const Icon = c.kind === 'pr' ? (c.state === 'merged' ? GitMerge : GitPullRequest) : GitBranch;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className={c.state === 'merged' ? 'text-good' : 'text-muted'} />
      <span className="min-w-0 flex-1 truncate">{c.summary}</span>
      <Badge className={c.state === 'merged' ? 'bg-good/15 text-good' : ''}>{STATE_LABEL[c.state] ?? c.state}</Badge>
      {c.url && (
        <button className="text-muted hover:text-fg" title="Open on GitHub" onClick={() => void invoke('shell:openExternal', { url: c.url! })}>
          <ExternalLink size={14} />
        </button>
      )}
      {c.rescanId ? (
        <Button size="sm" variant="ghost" onClick={() => navigate({ name: 'report', id: c.rescanId! })}>
          New scan
        </Button>
      ) : (
        c.state === 'merged' && (
          <Button size="sm" variant="ghost" onClick={async () => (await invoke('fix:rescan', { scanId }), navigate({ name: 'dashboard' }))}>
            Re-scan now
          </Button>
        )
      )}
    </div>
  );
}
