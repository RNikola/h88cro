import { useState } from 'react';
import { Button } from '@h88cro/ui';
import { Logo } from '../components/Logo';

/** Deliberately bare: logo, headline, Log in / Register, and the offline link. Nothing else. */
export function Welcome({ onSolo }: { onSolo: () => void }) {
  const [teamNote, setTeamNote] = useState(false);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.18),transparent_60%)]">
      <Logo size={88} />
      <h1 className="text-4xl font-bold tracking-tight">
        Welcome to <span className="wordmark">H88CRO</span>
      </h1>
      <div className="flex gap-3">
        <Button size="lg" className="w-36" onClick={() => setTeamNote(true)}>
          Log in
        </Button>
        <Button size="lg" variant="secondary" className="w-36" onClick={() => setTeamNote(true)}>
          Register
        </Button>
      </div>
      {teamNote && (
        <p className="max-w-sm text-center text-sm text-muted">
          Team accounts need the H88CRO team backend, which arrives in the next release. For now, use the app offline in Solo mode.
        </p>
      )}
      <button className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline" onClick={onSolo}>
        Use offline (Solo mode)
      </button>
    </div>
  );
}
