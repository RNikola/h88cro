import type { Channel, ChannelResult, EventName, Events } from '../shared/ipc';

export type H88Api = {
  invoke<C extends Channel>(channel: C, payload?: unknown): Promise<ChannelResult[C]>;
  on<E extends EventName>(event: E, cb: (data: Events[E]) => void): () => void;
  getPathForFile(file: File): string;
  platform: string;
};

declare global {
  interface Window {
    h88: H88Api;
  }
}
