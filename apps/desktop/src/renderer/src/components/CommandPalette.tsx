import { useMemo, useState } from 'react';
import type { Navigate } from '../App';
import { useScans } from '../api';
import { inputClass } from '@h88cro/ui';

export function CommandPalette({ navigate, onClose }: { navigate: Navigate; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { data: scans } = useScans();
  const items = useMemo(() => {
    const base = [
      { label: 'New scan', run: () => navigate({ name: 'new-scan' }) },
      { label: 'Dashboard', run: () => navigate({ name: 'dashboard' }) },
      { label: 'Settings', run: () => navigate({ name: 'settings' }) },
      ...(scans ?? []).filter((s) => s.status === 'done').map((s) => ({ label: `Report: ${s.title ?? s.url}`, run: () => navigate({ name: 'report', id: s.id }) })),
    ];
    return base.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  }, [q, scans, navigate]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]" onClick={onClose}>
      <div className="w-[560px] rounded-xl border border-line bg-panel p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className={inputClass}
          placeholder="Type a command or search reports…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && items[0]) items[0].run();
          }}
        />
        <ul className="mt-2 max-h-80 overflow-y-auto">
          {items.map((i) => (
            <li key={i.label}>
              <button className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-panel-2 hover:text-fg" onClick={i.run}>
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
