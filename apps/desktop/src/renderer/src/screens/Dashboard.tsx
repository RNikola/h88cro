import { ArrowDownRight, ArrowUpRight, FileText, Globe, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Progress, scoreColor } from '@h88cro/ui';
import type { ScanListItem } from '../../../shared/ipc';
import type { Navigate } from '../App';
import { invoke, useScans } from '../api';

function Delta({ s }: { s: ScanListItem }) {
  if (s.overallScore == null || s.previousScore == null) return null;
  const d = s.overallScore - s.previousScore;
  if (d === 0) return <span className="text-xs text-muted">±0</span>;
  return (
    <span className={`flex items-center text-xs ${d > 0 ? 'text-good' : 'text-sev-critical'}`}>
      {d > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(d)}
    </span>
  );
}

export function Dashboard({ navigate }: { navigate: Navigate }) {
  const { data: scans = [] } = useScans();
  const qc = useQueryClient();
  const active = scans.filter((s) => s.status === 'running' || s.status === 'queued');
  const recent = scans.filter((s) => s.status !== 'running' && s.status !== 'queued');
  const done = scans.filter((s) => s.status === 'done' && s.overallScore != null);
  const avg = done.length ? Math.round(done.reduce((n, s) => n + s.overallScore!, 0) / done.length) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">Your recent audits and the scan queue.</p>
        </div>
        <Button onClick={() => navigate({ name: 'new-scan' })}>
          <Plus size={16} /> New scan
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-muted">Pages audited</div>
          <div className="mt-1 text-3xl font-bold">{done.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Average score</div>
          <div className="mt-1 text-3xl font-bold" style={{ color: avg !== undefined ? scoreColor(avg) : undefined }}>
            {avg ?? '—'}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-muted">In the queue</div>
          <div className="mt-1 text-3xl font-bold">{active.length}</div>
        </Card>
      </div>

      {active.length > 0 && (
        <Card className="space-y-4">
          <h2 className="font-medium">Scan queue</h2>
          {active.map((s) => (
            <div key={s.id} className="flex items-center gap-4">
              <Loader2 size={16} className={s.status === 'running' ? 'animate-spin text-accent-2' : 'text-muted'} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-sm">{s.url}</div>
                {s.status === 'running' ? <Progress value={s.progress?.pct ?? 3} /> : <div className="text-xs text-muted">Queued</div>}
                {s.progress && <div className="text-xs text-muted">{s.progress.message}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => void invoke('scan:cancel', { id: s.id })} aria-label="Cancel scan">
                <X size={14} />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-0">
        <h2 className="border-b border-line px-5 py-3 font-medium">Recent scans</h2>
        {recent.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">No scans yet. Paste a URL or drop an HTML file to start.</div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-panel-2">
                <button className="flex min-w-0 flex-1 items-center gap-4 text-left" disabled={s.status !== 'done'} onClick={() => navigate({ name: 'report', id: s.id })}>
                  <div className="w-12 text-center text-xl font-bold" style={{ color: s.overallScore != null ? scoreColor(s.overallScore) : undefined }}>
                    {s.overallScore ?? '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate text-sm font-medium">
                      {s.url.startsWith('file://') ? <FileText size={14} className="shrink-0 text-muted" /> : <Globe size={14} className="shrink-0 text-muted" />}
                      <span className="truncate">{s.title ?? s.url}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{s.status === 'failed' ? `Failed: ${s.error}` : s.status === 'cancelled' ? 'Cancelled' : s.url}</div>
                  </div>
                  <Delta s={s} />
                  {s.market && <Badge>{s.market}</Badge>}
                  <span className="w-28 text-right text-xs text-muted">{new Date(s.createdAt).toLocaleString()}</span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete scan"
                  onClick={async () => {
                    await invoke('scan:delete', { id: s.id });
                    void qc.invalidateQueries({ queryKey: ['scan:list'] });
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
