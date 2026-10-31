import { useState } from 'react';
import { FolderOpen, GitBranch as Github, Plus, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Spinner, cx, inputClass } from '@h88cro/ui';
import type { AppState, Site, SiteInput } from '../../../shared/ipc';
import type { Navigate } from '../App';
import { invoke } from '../api';
import { SearchSelect } from '../components/SearchSelect';

const EMPTY: SiteInput = { name: '', kind: 'github', urlPrefix: 'https://', autoMerge: false, pushBranch: false };

function SiteForm({ initial, state, onDone, navigate }: { initial: SiteInput; state: AppState; onDone: () => void; navigate: Navigate }) {
  const [s, setS] = useState<SiteInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const repos = useQuery({ queryKey: ['github:repos'], queryFn: () => invoke('github:repos'), enabled: !!state.github && s.kind === 'github' });

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await invoke('site:save', s);
      onDone();
    } catch (e) {
      setError((e as Error).message.replace(/^\[.*?"message":\s*"([^"]+)".*$/s, '$1'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex gap-2">
        {(['github', 'local'] as const).map((k) => (
          <button key={k} onClick={() => setS({ ...s, kind: k })} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', s.kind === k ? 'border-accent-2 text-fg' : 'border-line text-muted')}>
            {k === 'github' ? <Github size={16} /> : <FolderOpen size={16} />} {k === 'github' ? 'GitHub repository' : 'Folder on this computer'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Site name">
          <input className={inputClass} value={s.name} placeholder="Keira FR" onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>
        <Field label="Live address" hint="Scans of pages under this address use this connection.">
          <input className={inputClass} value={s.urlPrefix} placeholder="https://keira.best" onChange={(e) => setS({ ...s, urlPrefix: e.target.value })} />
        </Field>
      </div>

      {s.kind === 'github' &&
        (state.github ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repository">
              {repos.isLoading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <SearchSelect
                  value={s.repo ?? ''}
                  placeholder="Search your repositories"
                  ariaLabel="Repository"
                  options={(repos.data ?? []).filter((r) => r.canPush).map((r) => ({ value: r.fullName, label: r.fullName, hint: r.private ? 'private' : 'public' }))}
                  onChange={(v) => {
                    const r = repos.data?.find((x) => x.fullName === v);
                    setS({ ...s, repo: v, baseBranch: r?.defaultBranch, name: s.name || v.split('/')[1]! });
                  }}
                />
              )}
            </Field>
            <Field label="Branch the site deploys from">
              <input className={inputClass} value={s.baseBranch ?? ''} placeholder="main" onChange={(e) => setS({ ...s, baseBranch: e.target.value })} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Connect GitHub first in{' '}
            <button className="underline" onClick={() => navigate({ name: 'settings' })}>
              Settings → GitHub
            </button>
            .
          </p>
        ))}

      {s.kind === 'local' && (
        <Field label="Folder with the website source">
          <div className="flex gap-2">
            <input className={cx(inputClass, 'font-mono text-xs')} value={s.localPath ?? ''} onChange={(e) => setS({ ...s, localPath: e.target.value })} />
            <Button
              variant="secondary"
              size="sm"
              className="h-auto"
              onClick={async () => {
                const p = await invoke('site:pickFolder');
                if (p) setS({ ...s, localPath: p, name: s.name || p.split(/[\\/]/).pop()! });
              }}
            >
              Choose…
            </Button>
          </div>
        </Field>
      )}

      {s.kind === 'github' ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={s.autoMerge} onChange={(e) => setS({ ...s, autoMerge: e.target.checked })} />
          <span>
            Merge fixes automatically
            <span className="block text-xs text-muted">
              Each fix still gets its own pull request (so you have a record and can revert it), then it is merged straight away and goes live when your host deploys. If the branch
              requires checks or reviews, GitHub merges it once they pass. Off: fixes wait for someone to merge them.
            </span>
          </span>
        </label>
      ) : (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={s.pushBranch} onChange={(e) => setS({ ...s, pushBranch: e.target.checked })} />
          <span>
            Push the fix branch to the remote
            <span className="block text-xs text-muted">Uses the git sign-in on this computer.</span>
          </span>
        </label>
      )}

      {error && <p className="text-sm text-sev-critical">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy || !s.name || !s.urlPrefix || (s.kind === 'github' ? !s.repo : !s.localPath)} onClick={() => void save()}>
          {busy ? 'Checking…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function Sites({ state, navigate }: { state: AppState; navigate: Navigate }) {
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ['site:list'], queryFn: () => invoke('site:list') });
  const [editing, setEditing] = useState<SiteInput>();
  const done = () => {
    setEditing(undefined);
    void qc.invalidateQueries({ queryKey: ['site:list'] });
    void qc.invalidateQueries({ queryKey: ['fix:target'] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          <p className="text-sm text-muted">Connect a site to its GitHub repository or source folder, so fixes from a report can be published to the live domain.</p>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus size={16} /> Connect a site
          </Button>
        )}
      </header>

      {editing && <SiteForm initial={editing} state={state} onDone={done} navigate={navigate} />}

      {sites.data?.length === 0 && !editing && <p className="py-8 text-center text-sm text-muted">No sites connected yet.</p>}
      <div className="space-y-3">
        {sites.data?.map((s: Site) => (
          <Card key={s.id} className="flex items-center gap-4">
            {s.kind === 'github' ? <Github size={20} /> : <FolderOpen size={20} />}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.name}</div>
              <div className="truncate text-xs text-muted">
                {s.urlPrefix} → {s.kind === 'github' ? `${s.repo} (${s.baseBranch})` : s.localPath}
              </div>
            </div>
            {s.kind === 'github' && <Badge className={s.autoMerge ? 'bg-good/15 text-good' : ''}>{s.autoMerge ? 'Auto-merge' : 'Pull requests'}</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setEditing({ ...s })}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove"
              onClick={async () => {
                if (!confirm(`Disconnect ${s.name}? Nothing is changed in the repository.`)) return;
                await invoke('site:delete', { id: s.id });
                done();
              }}
            >
              <Trash2 size={14} />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
