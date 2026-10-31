import type { ReactNode } from 'react';
import { Gauge, Lock, Plus, Search, Settings } from 'lucide-react';
import { Button, cx } from '@h88cro/ui';
import type { AppState } from '../../../shared/ipc';
import type { Navigate, Route } from '../App';
import { invoke } from '../api';
import { Logo, Wordmark } from './Logo';
import { UpdateBanner } from './UpdateBanner';

export function Shell({ route, navigate, state, children, onLock, onOpenPalette }: { route: Route; navigate: Navigate; state: AppState; children: ReactNode; onLock: () => void; onOpenPalette: () => void }) {
  const mod = state.platform === 'darwin' ? '⌘' : 'Ctrl';
  const item = (r: Route, label: string, icon: ReactNode) => (
    <button
      onClick={() => navigate(r)}
      className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition', route.name === r.name ? 'bg-panel-3 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg')}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <Logo size={30} />
          <Wordmark className="text-lg" />
        </div>
        <Button className="mb-4 w-full" onClick={() => navigate({ name: 'new-scan' })}>
          <Plus size={16} /> New scan <span className="ml-auto text-xs opacity-70">{mod}N</span>
        </Button>
        <nav className="space-y-1">
          {item({ name: 'dashboard' }, 'Dashboard', <Gauge size={16} />)}
          {item({ name: 'settings' }, 'Settings', <Settings size={16} />)}
        </nav>
        <button onClick={onOpenPalette} className="mt-4 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-fg">
          <Search size={14} /> Search & commands <span className="ml-auto">{mod}K</span>
        </button>
        <div className="mt-auto pt-4">
          <UpdateBanner initial={state.update} />
        </div>
        <div className="mt-4 space-y-2 border-t border-line pt-4 text-xs text-muted">
          <div className="flex items-center justify-between">
            <span>{state.profileName}</span>
            <span className="rounded bg-panel-3 px-1.5 py-0.5">Solo mode</span>
          </div>
          <button
            className="flex items-center gap-1.5 hover:text-fg"
            onClick={async () => {
              await invoke('profile:lock');
              onLock();
            }}
          >
            <Lock size={12} /> Lock
          </button>
          <div>v{state.version}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
