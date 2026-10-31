/**
 * Scan worker (Electron utilityProcess). Runs the headless browser, analyzers, Lighthouse and
 * Claude calls outside the main process, so a crashing or slow page never freezes the app.
 */
import { exportPdf, installChromium, scan, type ScanRequest, type ScanResult } from '@h88cro/engine';

type Incoming =
  | { type: 'scan'; id: string; request: Omit<ScanRequest, 'now'> }
  | { type: 'install-chromium'; cacheDir: string }
  | { type: 'export-pdf'; result: ScanResult; outPath: string; chromiumPath?: string };

type ParentPort = { on(event: 'message', cb: (e: { data: Incoming }) => void): void; postMessage(msg: unknown): void };
const port = (process as unknown as { parentPort: ParentPort }).parentPort;

port.on('message', async ({ data }) => {
  try {
    if (data.type === 'scan') {
      const result = await scan(data.request, (p) => port.postMessage({ type: 'progress', id: data.id, ...p }));
      port.postMessage({ type: 'done', id: data.id, result });
    } else if (data.type === 'install-chromium') {
      const info = await installChromium(data.cacheDir, (done, total) => port.postMessage({ type: 'install-progress', pct: total ? Math.round((done / total) * 100) : 0 }));
      port.postMessage({ type: 'installed', info });
    } else if (data.type === 'export-pdf') {
      await exportPdf(data.result, data.outPath, data.chromiumPath);
      port.postMessage({ type: 'pdf-done', outPath: data.outPath });
    }
  } catch (e) {
    port.postMessage({ type: 'error', id: 'id' in data ? data.id : undefined, message: (e as Error).message });
  }
});
