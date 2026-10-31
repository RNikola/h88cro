import { useMemo, useState } from 'react';
import { countryOptions, languageOptions, SEED_MARKETS } from '@h88cro/core';
import { SearchSelect, type SearchOption } from '../components/SearchSelect';
import { FileUp, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, cx, inputClass } from '@h88cro/ui';
import type { AppState } from '../../../shared/ipc';
import type { Navigate } from '../App';
import { PAGE_TYPES, invoke } from '../api';

export function NewScan({ navigate, state }: { navigate: Navigate; state: AppState }) {
  const qc = useQueryClient();
  const [urls, setUrls] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [lang, setLang] = useState('');
  const [country, setCountry] = useState('');
  const market = lang ? `${lang}-${country || defaultCountry(lang)}` : '';
  const langOpts = useMemo<SearchOption[]>(
    () => [
      { value: '', label: 'Auto-detect', hint: 'from the page' },
      ...languageOptions().map((l) => ({
        value: l.code,
        label: l.name,
        hint: l.native || undefined,
        badge: SEED_MARKETS.some((m) => m.languages[0] === l.code) ? 'full profile' : undefined,
      })),
    ],
    [],
  );
  const countryOpts = useMemo<SearchOption[]>(
    () => countryOptions().map((c) => ({ value: c.code, label: c.name, hint: c.currency, keywords: c.code, badge: SEED_MARKETS.some((m) => m.market === c.code) ? 'full profile' : undefined })),
    [],
  );
  const [devices, setDevices] = useState<('mobile' | 'desktop')[]>(['mobile', 'desktop']);
  const [pageType, setPageType] = useState<(typeof PAGE_TYPES)[number]['id']>('toplist');
  const [lighthouse, setLighthouse] = useState(true);
  const [useClaude, setUseClaude] = useState(!!state.claudeKeyHint);
  const [deep, setDeep] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();

  const urlList = urls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
  const badUrls = urlList.filter((u) => {
    try {
      new URL(u);
      return false;
    } catch {
      return true;
    }
  });
  const canStart = (urlList.length > 0 || files.length > 0) && badUrls.length === 0 && devices.length > 0;

  const toggleDevice = (d: 'mobile' | 'desktop') => setDevices((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">New scan</h1>
        <p className="text-sm text-muted">Paste one or more URLs, or drop an unpublished HTML file to audit it before it goes live.</p>
      </header>
      <Card className="space-y-5">
        <Field label="URLs" hint="One per line. Up to 20 at once.">
          <textarea className={cx(inputClass, 'h-24 font-mono')} placeholder="https://www.example.best/fr/" value={urls} onChange={(e) => setUrls(e.target.value)} autoFocus />
        </Field>
        {badUrls.length > 0 && <p className="text-sm text-sev-high">Not a valid URL: {badUrls.join(', ')}</p>}

        <div
          className={cx('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition', dragging ? 'border-accent-2 bg-accent-2/5' : 'border-line text-muted')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const paths = Array.from(e.dataTransfer.files)
              .filter((f) => /\.html?$/i.test(f.name))
              .map((f) => window.h88.getPathForFile(f))
              .filter(Boolean);
            setFiles((fs) => [...new Set([...fs, ...paths])]);
          }}
        >
          <FileUp size={20} />
          <span>Drop local .html files here</span>
          <Button variant="secondary" size="sm" type="button" onClick={async () => setFiles([...new Set([...files, ...(await invoke('dialog:pickFiles'))])])}>
            Choose files…
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-1.5 text-xs">
                <span className="flex-1 truncate font-mono">{f}</span>
                <button onClick={() => setFiles(files.filter((x) => x !== f))} aria-label="Remove file">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Language" hint="Every language, searchable. Auto-detect reads it from the page.">
            <SearchSelect ariaLabel="Language" value={lang} options={langOpts} onChange={(v) => (setLang(v), setCountry(''))} placeholder="Search languages…" />
          </Field>
          <Field label="Country" hint={lang ? 'Sets currency and local checks.' : 'Pick a language first.'}>
            {lang ? (
              <SearchSelect ariaLabel="Country" value={country || defaultCountry(lang)} options={countryOpts} onChange={setCountry} placeholder="Search countries…" />
            ) : (
              <div className={cx(inputClass, 'text-muted')}>Auto-detect</div>
            )}
          </Field>
          <Field label="Page type">
            <select className={inputClass} value={pageType} onChange={(e) => setPageType(e.target.value as typeof pageType)}>
              {PAGE_TYPES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Devices</span>
          <div className="flex gap-2">
            {(['mobile', 'desktop'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDevice(d)}
                className={cx('rounded-lg border px-4 py-1.5 text-sm capitalize', devices.includes(d) ? 'border-accent-2 bg-accent-2/10 text-fg' : 'border-line text-muted')}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={lighthouse} onChange={(e) => setLighthouse(e.target.checked)} /> Measure speed with Lighthouse (URLs only, adds ~30 s)
          </label>
          <label className={cx('flex items-center gap-2', !state.claudeKeyHint && 'opacity-50')}>
            <input type="checkbox" checked={useClaude} disabled={!state.claudeKeyHint} onChange={(e) => setUseClaude(e.target.checked)} /> Claude review (language, facts, first screen)
            {!state.claudeKeyHint && <span className="text-xs text-muted">Add a key in Settings</span>}
          </label>
          <label className={cx('flex items-center gap-2 pl-6', (!useClaude || !state.claudeKeyHint) && 'opacity-50')}>
            <input type="checkbox" checked={deep} disabled={!useClaude || !state.claudeKeyHint} onChange={(e) => setDeep(e.target.checked)} /> Deep "full audit" mode (slower, uses the strongest model)
          </label>
        </div>

        {error && <p className="text-sm text-sev-critical">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })}>
            Cancel
          </Button>
          <Button
            disabled={!canStart}
            onClick={async () => {
              setError(undefined);
              try {
                const { ids } = await invoke('scan:start', {
                  targets: [...urlList.map((url) => ({ kind: 'url', url })), ...files.map((path) => ({ kind: 'file', path }))],
                  marketId: market || undefined,
                  devices,
                  pageType,
                  lighthouse,
                  useClaude,
                  deep,
                });
                await qc.invalidateQueries({ queryKey: ['scan:list'] });
                navigate(ids.length === 1 ? { name: 'dashboard' } : { name: 'dashboard' });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Start {urlList.length + files.length > 1 ? `${urlList.length + files.length} scans` : 'scan'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Main country for a language (fr → FR, sv → SE, sr → RS); falls back to the seeded markets. */
function defaultCountry(lang: string): string {
  const seeded = SEED_MARKETS.find((m) => m.languages[0] === lang);
  if (seeded) return seeded.market;
  try {
    return new Intl.Locale(lang).maximize().region ?? 'US';
  } catch {
    return 'US';
  }
}
