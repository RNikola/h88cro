import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ChannelSchemas, EVENT_NAMES, type Channel, type EventName } from '../shared/ipc';

const CHANNELS = new Set(Object.keys(ChannelSchemas));
const EVENTS = new Set<string>(EVENT_NAMES);

const api = {
  invoke(channel: Channel, payload?: unknown) {
    if (!CHANNELS.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on(event: EventName, cb: (data: unknown) => void) {
    if (!EVENTS.has(event)) throw new Error(`Unknown event ${event}`);
    const listener = (_e: unknown, data: unknown) => cb(data);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
  /** Drag-and-drop of local .html files (File.path is not available in sandboxed renderers). */
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('h88', api);
