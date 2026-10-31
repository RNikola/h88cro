import { useState } from 'react';
import { Button, Card, inputClass } from '@h88cro/ui';
import { invoke } from '../api';
import { Logo } from '../components/Logo';

export function Unlock({ name, onUnlocked }: { name?: string; onUnlocked: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-[380px] space-y-5 p-8 text-center">
        <div className="flex justify-center">
          <Logo size={56} />
        </div>
        <h1 className="text-xl font-semibold">Welcome back{name ? `, ${name}` : ''}</h1>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await invoke('profile:unlock', { password: pw });
            if (r.ok) onUnlocked();
            else setError(true);
          }}
        >
          <input className={inputClass} type="password" placeholder="Local password" value={pw} onChange={(e) => (setPw(e.target.value), setError(false))} autoFocus />
          {error && <p className="text-sm text-sev-critical">Wrong password.</p>}
          <Button className="w-full" disabled={!pw}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  );
}
