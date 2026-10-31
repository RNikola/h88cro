import { useCallback, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@h88cro/ui';
import type { UpdateState } from '../../../shared/ipc';
import { invoke, useEvent } from '../api';

/** Live update state: starts from app state, then follows 'update:status' events. */
export function useUpdate(initial: UpdateState) {
  const [u, setU] = useState(initial);
  useEvent('update:status', useCallback((s: UpdateState) => setU(s), []));
  return [u, setU] as const;
}

/** Slim bar in the sidebar when a new version is ready or available. */
export function UpdateBanner({ initial }: { initial: UpdateState }) {
  const [u] = useUpdate(initial);
  if (u.status === 'ready')
    return (
      <div className="rounded-lg border border-accent-2/40 bg-accent-2/10 p-3 text-xs">
        <p className="mb-2 font-medium text-fg">Version {u.version} is ready</p>
        <Button size="sm" className="w-full" onClick={() => void invoke('update:install')}>
          <RefreshCw size={12} /> Restart to update
        </Button>
      </div>
    );
  if (u.status === 'available' && u.manual)
    return (
      <div className="rounded-lg border border-accent-2/40 bg-accent-2/10 p-3 text-xs">
        <p className="mb-2 font-medium text-fg">Version {u.version} is available</p>
        <Button size="sm" className="w-full" onClick={() => void invoke('update:install')}>
          <Download size={12} /> Download
        </Button>
        <p className="mt-2 text-muted">Install it over this one. Your profile, settings and scans are kept.</p>
      </div>
    );
  if (u.status === 'downloading') return <p className="text-xs text-muted">Downloading update {u.version ?? ''}… {u.progress ?? 0}%</p>;
  return null;
}

/** Settings card: current version, status, and a manual check. */
export function UpdateSettings({ initial }: { initial: UpdateState }) {
  const [u, setU] = useUpdate(initial);
  const [busy, setBusy] = useState(false);
  const text: Record<UpdateState['status'], string> = {
    idle: 'Updates are checked automatically when the app starts and every few hours.',
    checking: 'Checking for updates…',
    none: 'You have the latest version.',
    available: `Version ${u.version} is available.`,
    downloading: `Downloading version ${u.version ?? ''}… ${u.progress ?? 0}%`,
    ready: `Version ${u.version} is downloaded. Restart to finish updating.`,
    error: `Couldn't check for updates: ${u.error ?? 'unknown error'}`,
    unsupported: 'Updates work in the installed app (not in development mode).',
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Version {u.current}. {text[u.status]}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || u.status === 'unsupported' || u.status === 'checking' || u.status === 'downloading'}
          onClick={async () => {
            setBusy(true);
            setU(await invoke('update:check'));
            setBusy(false);
          }}
        >
          <RefreshCw size={14} /> Check for updates
        </Button>
        {(u.status === 'ready' || (u.status === 'available' && u.manual)) && (
          <Button size="sm" onClick={() => void invoke('update:install')}>
            {u.status === 'ready' ? <RefreshCw size={14} /> : <Download size={14} />} {u.status === 'ready' ? 'Restart to update' : 'Download'}
          </Button>
        )}
      </div>
      {u.manual && <p className="text-xs text-muted">On Mac, install the new version over the old one. Your profile, settings, Claude key and scans are kept.</p>}
    </div>
  );
}
