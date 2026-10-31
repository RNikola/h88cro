import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@h88cro/ui';
import { useAppState, useEvent } from './api';
import { Shell } from './components/Shell';
import { CommandPalette } from './components/CommandPalette';
import { Welcome } from './screens/Welcome';
import { SoloProfile } from './screens/SoloProfile';
import { Unlock } from './screens/Unlock';
import { Setup } from './screens/Setup';
import { Dashboard } from './screens/Dashboard';
import { NewScan } from './screens/NewScan';
import { Report } from './screens/Report';
import { SettingsScreen } from './screens/Settings';

export type Route = { name: 'dashboard' } | { name: 'new-scan' } | { name: 'report'; id: string } | { name: 'settings' };
export type Navigate = (r: Route) => void;

export function App() {
  const { data: state, isLoading, refetch } = useAppState();
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [signedOutView, setSignedOutView] = useState<'welcome' | 'solo'>('welcome');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [setupDone, setSetupDone] = useState(false);

  const navigate = useCallback<Navigate>((r) => {
    setRoute(r);
    setPaletteOpen(false);
  }, []);

  useEvent(
    'menu:navigate',
    useCallback(({ to }) => {
      if (to === 'palette') setPaletteOpen(true);
      else if (to === 'new-scan') navigate({ name: 'new-scan' });
      else if (to === 'settings') navigate({ name: 'settings' });
      else navigate({ name: 'dashboard' });
    }, [navigate]),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (isLoading || !state) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  if (state.mode === 'none') {
    return signedOutView === 'welcome' ? <Welcome onSolo={() => setSignedOutView('solo')} /> : <SoloProfile onBack={() => setSignedOutView('welcome')} onCreated={() => void refetch()} />;
  }
  if (!state.unlocked) return <Unlock name={state.profileName} onUnlocked={() => void refetch()} />;
  if (!state.engine.installed && !setupDone) return <Setup state={state} onDone={() => { setSetupDone(true); void refetch(); }} />;

  return (
    <Shell route={route} navigate={navigate} state={state} onLock={() => void refetch()} onOpenPalette={() => setPaletteOpen(true)}>
      {route.name === 'dashboard' && <Dashboard navigate={navigate} />}
      {route.name === 'new-scan' && <NewScan navigate={navigate} state={state} />}
      {route.name === 'report' && <Report id={route.id} navigate={navigate} />}
      {route.name === 'settings' && <SettingsScreen state={state} onChanged={() => void refetch()} />}
      {paletteOpen && <CommandPalette navigate={navigate} onClose={() => setPaletteOpen(false)} />}
    </Shell>
  );
}
