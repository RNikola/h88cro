import { useState } from 'react';
import { Check, ExternalLink, Trash2 } from 'lucide-react';
import { Button, inputClass } from '@h88cro/ui';
import { invoke } from '../api';

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function GitHubForm({ login, onChanged }: { login?: string; onChanged: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-3 text-sm">
      {login ? (
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-2 text-good">
            <Check size={14} /> Connected as {login}
          </p>
          <Button variant="ghost" size="sm" onClick={async () => (await invoke('github:clearToken'), onChanged())}>
            <Trash2 size={14} /> Disconnect
          </Button>
        </div>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            Create a fine-grained token on GitHub{' '}
            <button className="inline-flex items-center gap-1 text-accent-2 underline" onClick={() => void invoke('shell:openExternal', { url: NEW_TOKEN_URL })}>
              here <ExternalLink size={12} />
            </button>
            .
          </li>
          <li>Repository access: choose the repositories of your landing pages.</li>
          <li>
            Permissions: <strong className="text-fg">Contents</strong> and <strong className="text-fg">Pull requests</strong> set to &quot;Read and write&quot;.
          </li>
          <li>Paste the token below. It is stored in your system keychain.</li>
        </ol>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const r = await invoke('github:setToken', { token });
            if (r.ok) {
              setToken('');
              onChanged();
            } else setError(r.error);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={inputClass} type="password" autoComplete="off" placeholder={login ? 'Replace token…' : 'github_pat_…'} value={token} onChange={(e) => setToken(e.target.value)} />
        <Button variant="secondary" disabled={token.length < 10 || busy}>
          {busy ? 'Checking…' : 'Save'}
        </Button>
      </form>
      {error && <p className="text-sev-critical">{error}</p>}
    </div>
  );
}
