import { useCallback, useState } from 'react';
import { Check, Download, HardDrive } from 'lucide-react';
import { Button, Card, Progress, Spinner } from '@h88cro/ui';
import type { AppState, EngineState } from '../../../shared/ipc';
import { formatBytes, invoke, useEvent } from '../api';
import { ClaudeKeyForm } from '../components/ClaudeKeyForm';
import { Logo } from '../components/Logo';

const NEEDED_BYTES = 600 * 1024 * 1024;

/** First-run setup: download the scan engine, check disk space, and (Solo mode) add a Claude key. */
export function Setup({ state, onDone }: { state: AppState; onDone: () => void }) {
  const [engine, setEngine] = useState<EngineState>(state.engine);
  const [keyHint, setKeyHint] = useState(state.claudeKeyHint);
  useEvent('engine:progress', useCallback((e: EngineState) => setEngine(e), []));
  const lowDisk = state.freeDiskBytes !== undefined && state.freeDiskBytes < NEEDED_BYTES;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto py-10">
      <Card className="w-[560px] space-y-6 p-8">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="text-xl font-semibold">Set up H88CRO</h1>
            <p className="text-sm text-muted">Two quick steps. You can change both later in Settings.</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-3 text-xs">1</span> Download the scan engine
          </h2>
          <p className="text-sm text-muted">H88CRO opens pages in its own private browser (Chromium, about 150 MB). It never uses your normal browser.</p>
          <p className={`flex items-center gap-2 text-xs ${lowDisk ? 'text-sev-high' : 'text-muted'}`}>
            <HardDrive size={12} /> Free disk space: {formatBytes(state.freeDiskBytes)} {lowDisk && '(at least 600 MB recommended)'}
          </p>
          {engine.installed ? (
            <p className="flex items-center gap-2 text-sm text-good">
              <Check size={14} /> Installed (Chromium {engine.version})
            </p>
          ) : engine.installing ? (
            <div className="space-y-2">
              <Progress value={engine.progress ?? 0} />
              <p className="flex items-center gap-2 text-xs text-muted">
                <Spinner className="h-3 w-3" /> Downloading… {engine.progress ?? 0}%
              </p>
            </div>
          ) : (
            <Button onClick={() => void invoke('engine:install').then(setEngine)}>
              <Download size={16} /> Download engine
            </Button>
          )}
          {engine.error && <p className="text-sm text-sev-critical">{engine.error}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-3 text-xs">2</span> Add your Claude API key <span className="text-xs font-normal text-muted">(optional)</span>
          </h2>
          <p className="text-sm text-muted">
            Claude adds the native-speaker language review, deeper fact checks and the first-screen visual review. Without a key you still get all the automatic checks. The key is
            stored in your system keychain and only the last 4 characters are ever shown.
          </p>
          <ClaudeKeyForm hint={keyHint} onSaved={() => void invoke('app:state').then((s) => setKeyHint(s.claudeKeyHint))} />
        </section>

        <p className="text-xs text-muted">The offline grammar engine (LanguageTool) can be connected later in Settings.</p>

        <Button className="w-full" size="lg" disabled={!engine.installed} onClick={onDone}>
          Continue
        </Button>
      </Card>
    </div>
  );
}
