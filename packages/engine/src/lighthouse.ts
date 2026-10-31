import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import type { Device } from '@h88cro/core';
import type { PerfMetrics } from '@h88cro/page-model';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

type Lhr = { audits: Record<string, { numericValue?: number; details?: unknown }>; categories: { performance?: { score: number | null } } };

function lcpSelector(lhr: Lhr): string | undefined {
  try {
    const d = lhr.audits['largest-contentful-paint-element']?.details as { items?: { items?: { node?: { selector?: string } }[]; node?: { selector?: string } }[] } | undefined;
    const first = d?.items?.[0];
    return first?.items?.[0]?.node?.selector ?? first?.node?.selector;
  } catch {
    return undefined;
  }
}

/** Lab performance metrics with Lighthouse, run against the same downloaded Chromium over CDP. */
export async function runLighthouse(url: string, devices: Device[], executablePath?: string): Promise<PerfMetrics[]> {
  const { default: lighthouse } = await import('lighthouse');
  const { default: desktopConfig } = await import('lighthouse/core/config/desktop-config.js');
  const out: PerfMetrics[] = [];
  for (const device of devices) {
    const port = await freePort();
    const browser = await chromium.launch({ executablePath, headless: true, args: [`--remote-debugging-port=${port}`] });
    try {
      const res = await lighthouse(url, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] }, device === 'desktop' ? desktopConfig : undefined);
      const lhr = res?.lhr as unknown as Lhr | undefined;
      if (!lhr) continue;
      out.push({
        device,
        lcpMs: lhr.audits['largest-contentful-paint']?.numericValue,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue,
        tbtMs: lhr.audits['total-blocking-time']?.numericValue,
        speedIndexMs: lhr.audits['speed-index']?.numericValue,
        performanceScore: lhr.categories.performance?.score != null ? Math.round(lhr.categories.performance.score * 100) : undefined,
        lcpSelector: lcpSelector(lhr),
      });
    } finally {
      await browser.close();
    }
  }
  return out;
}
