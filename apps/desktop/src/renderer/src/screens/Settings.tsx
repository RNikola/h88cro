import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Field, inputClass } from '@h88cro/ui';
import type { AppState, Settings } from '../../../shared/ipc';
import { formatBytes, invoke } from '../api';
import { ClaudeKeyForm } from '../components/ClaudeKeyForm';

export function SettingsScreen({ state, onChanged }: { state: AppState; onChanged: () => void }) {
  const [s, setS] = useState<Settings>(state.settings);
  const [saved, setSaved] = useState(false);
  const storage = useQuery({ queryKey: ['storage:info'], queryFn: () => invoke('storage:info') });
  useEffect(() => setS(state.settings), [state.settings]);

  const save = async (patch: Partial<Settings>) => {
    const next = await invoke('settings:update', patch);
    setS(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChanged();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {saved && <span className="text-sm text-good">Saved</span>}
      </header>

      <Card className="space-y-3">
        <h2 className="font-medium">Account</h2>
        <p className="text-sm text-muted">
          Solo mode: local profile <strong className="text-fg">{state.profileName}</strong>. Team mode (shared accounts and reports) arrives in the next release; you will be able to sign in and upload your
          reports.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Integrations</h2>
        <Field label="Claude API key" hint="Stored in the system keychain. Only the last 4 characters are shown.">
          <ClaudeKeyForm hint={state.claudeKeyHint} onSaved={onChanged} />
        </Field>
        {state.claudeKeyHint && (
          <Button variant="ghost" size="sm" onClick={async () => (await invoke('secrets:clearClaudeKey'), onChanged())}>
            <Trash2 size={14} /> Remove key
          </Button>
        )}
        <div className="grid grid-cols-3 gap-3">
          {(['classify', 'analysis', 'deep'] as const).map((k) => (
            <Field key={k} label={`Model: ${k}`}>
              <input className={inputClass} value={s.routing[k]} onChange={(e) => setS({ ...s, routing: { ...s.routing, [k]: e.target.value } })} onBlur={() => void save({ routing: s.routing })} />
            </Field>
          ))}
        </div>
        <Field label="Budget per scan (USD)" hint="Claude calls stop when a scan reaches this amount.">
          <input className={inputClass} type="number" step="0.1" min="0.05" value={s.budgetUsd} onChange={(e) => setS({ ...s, budgetUsd: Number(e.target.value) })} onBlur={() => void save({ budgetUsd: s.budgetUsd })} />
        </Field>
        <Field label="LanguageTool server" hint="Optional. e.g. https://api.languagetool.org/v2 or a local server (http://localhost:8081/v2). Leave empty to skip.">
          <input className={inputClass} value={s.languageToolUrl} placeholder="https://api.languagetool.org/v2" onChange={(e) => setS({ ...s, languageToolUrl: e.target.value })} onBlur={() => void save({ languageToolUrl: s.languageToolUrl })} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Scans</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Flag 'last updated' dates older than (days)">
            <input className={inputClass} type="number" min="1" value={s.staleDateDays} onChange={(e) => setS({ ...s, staleDateDays: Number(e.target.value) })} onBlur={() => void save({ staleDateDays: s.staleDateDays })} />
          </Field>
          <Field label="Scans in parallel">
            <select className={inputClass} value={s.concurrency} onChange={(e) => void save({ concurrency: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Scan engine</h2>
        <p className="text-sm text-muted">
          {state.engine.installed ? `Chromium ${state.engine.version} ${state.engine.verified === false ? '(changed or missing: reinstall)' : '(verified)'}` : 'Not installed'}
        </p>
        <Button variant="secondary" size="sm" disabled={state.engine.installing} onClick={async () => (await invoke('engine:install'), onChanged())}>
          <Download size={14} /> {state.engine.installed ? 'Reinstall / update' : 'Install'}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Storage</h2>
        <p className="text-sm text-muted">
          Reports and screenshots: {formatBytes(storage.data?.scansBytes)} · Engines: {formatBytes(storage.data?.enginesBytes)}
        </p>
        <p className="truncate font-mono text-xs text-muted">{storage.data?.dataDir}</p>
        <Button variant="secondary" size="sm" onClick={async () => (await invoke('storage:clear'), void storage.refetch())}>
          <Trash2 size={14} /> Clear cache (full-page screenshots and HTML snapshots)
        </Button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Updates</h2>
        <p className="text-sm text-muted">Version {state.version}. Automatic updates arrive with signed builds in the next release.</p>
      </Card>
    </div>
  );
}
