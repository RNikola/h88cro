import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, Field, inputClass } from '@h88cro/ui';
import { invoke } from '../api';
import { Logo } from '../components/Logo';

export function SoloProfile({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const valid = name.trim() && pw.length >= 8 && pw === pw2;
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-[420px] space-y-5 p-8">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-semibold">Create your local profile</h1>
            <p className="text-sm text-muted">Everything stays on this computer.</p>
          </div>
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              await invoke('profile:create', { name: name.trim(), password: pw });
              onCreated();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Your name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Local password" hint="At least 8 characters. Protects this app on this computer.">
            <input className={inputClass} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Repeat password">
            <input className={inputClass} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          {pw2 && pw !== pw2 && <p className="text-sm text-sev-high">Passwords don't match.</p>}
          {error && <p className="text-sm text-sev-critical">{error}</p>}
          <Button className="w-full" disabled={!valid || busy}>
            Create profile
          </Button>
        </form>
      </Card>
    </div>
  );
}
