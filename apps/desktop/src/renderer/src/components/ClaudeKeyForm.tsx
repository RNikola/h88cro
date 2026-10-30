import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, inputClass } from '@h88cro/ui';
import { invoke } from '../api';

export function ClaudeKeyForm({ hint, onSaved }: { hint?: string; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      {hint && (
        <p className="flex items-center gap-2 text-sm text-good">
          <Check size={14} /> Key saved in your system keychain ({hint})
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const r = await invoke('secrets:setClaudeKey', { key });
            if (r.ok) {
              setKey('');
              onSaved();
            } else setError(r.error ?? 'The key was rejected.');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={inputClass} type="password" placeholder={hint ? 'Replace key…' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        <Button variant="secondary" disabled={key.length < 10 || busy}>
          {busy ? 'Checking…' : 'Save'}
        </Button>
      </form>
      {error && <p className="text-sm text-sev-critical">{error}</p>}
    </div>
  );
}
