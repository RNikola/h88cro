import { useEffect } from 'react';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel, ChannelResult, EventName, Events } from '../../shared/ipc';

export const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } } });

export function invoke<C extends Channel>(channel: C, payload?: unknown): Promise<ChannelResult[C]> {
  return window.h88.invoke(channel, payload).catch((e: Error) => {
    // Strip Electron's "Error invoking remote method 'x': Error:" prefix for display.
    throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  });
}

export function useEvent<E extends EventName>(event: E, cb: (data: Events[E]) => void) {
  useEffect(() => window.h88.on(event, cb), [event, cb]);
}

export function useAppState() {
  return useQuery({ queryKey: ['app:state'], queryFn: () => invoke('app:state') });
}

export function useScans() {
  const qc = useQueryClient();
  useEffect(() => {
    const off1 = window.h88.on('scan:updated', () => void qc.invalidateQueries({ queryKey: ['scan:list'] }));
    const off2 = window.h88.on('scan:progress', (p) =>
      qc.setQueryData<ChannelResult['scan:list']>(['scan:list'], (old) => old?.map((s) => (s.id === p.id ? { ...s, progress: { pct: p.pct, message: p.message } } : s))),
    );
    return () => {
      off1();
      off2();
    };
  }, [qc]);
  return useQuery({ queryKey: ['scan:list'], queryFn: () => invoke('scan:list') });
}

export function useScan(id: string) {
  const qc = useQueryClient();
  useEffect(
    () => window.h88.on('scan:updated', (u) => u.id === id && void qc.invalidateQueries({ queryKey: ['scan:get', id] })),
    [id, qc],
  );
  return useQuery({ queryKey: ['scan:get', id], queryFn: () => invoke('scan:get', { id }) });
}

export const MARKETS = [
  { id: '', label: 'Auto-detect' },
  { id: 'fr-FR', label: 'France (fr)' },
  { id: 'fr-BE', label: 'Belgium (fr/nl)' },
  { id: 'en-GB', label: 'United Kingdom (en-GB)' },
  { id: 'en-IE', label: 'Ireland (en-IE)' },
  { id: 'sv-SE', label: 'Sweden (sv)' },
  { id: 'da-DK', label: 'Denmark (da)' },
  { id: 'nl-NL', label: 'Netherlands (nl)' },
  { id: 'pt-PT', label: 'Portugal (pt-PT)' },
  { id: 'en-AU', label: 'Australia (en-AU)' },
  { id: 'th-TH', label: 'Thailand (th)' },
];

export const PAGE_TYPES = [
  { id: 'toplist', label: 'Toplist' },
  { id: 'brand-review', label: 'Brand review' },
  { id: 'bonus', label: 'Bonus page' },
  { id: 'slot', label: 'Slot page' },
  { id: 'sportsbook', label: 'Sportsbook page' },
  { id: 'other', label: 'Other' },
] as const;

export function formatBytes(n?: number) {
  if (n === undefined) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
