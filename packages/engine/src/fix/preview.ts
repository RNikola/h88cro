import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Device } from '@h88cro/core';
import { DEVICE_PROFILES, isPrivateHost, launchBrowser } from '../render.js';

/**
 * Before/after screenshots of a fix. The patched HTML is served in place of the page's own
 * document at its real URL, so its stylesheets, fonts and images load as on the live site.
 */
export async function renderFixPreview(o: {
  url: string;
  beforeHtml: string;
  afterHtml: string;
  /** Visible text near the change, to scroll to. */
  focusText?: string[];
  device: Device;
  outDir: string;
  executablePath?: string;
}): Promise<{ before: string; after: string; focused: boolean }> {
  const u = new URL(o.url);
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) throw new Error('Preview needs a public http(s) page URL.');
  await mkdir(o.outDir, { recursive: true });
  const browser = await launchBrowser(o.executablePath);
  let focused = false;
  try {
    const shot = async (html: string, name: string) => {
      const ctx = await browser.newContext({ ...DEVICE_PROFILES[o.device], serviceWorkers: 'block', acceptDownloads: false });
      try {
        await ctx.route('**/*', async (route) => {
          const r = new URL(route.request().url());
          if (route.request().isNavigationRequest() && r.href.split('#')[0] === u.href.split('#')[0]) {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
          }
          if (r.protocol === 'file:' || ((r.protocol === 'http:' || r.protocol === 'https:') && isPrivateHost(r.hostname))) return route.abort('accessdenied');
          return route.continue();
        });
        const page = await ctx.newPage();
        page.on('dialog', (d) => void d.dismiss());
        await page.goto(o.url, { waitUntil: 'load', timeout: 45_000 });
        await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
        for (const t of o.focusText ?? []) {
          const loc = page.getByText(t.slice(0, 80), { exact: false }).first();
          if (await loc.count().catch(() => 0)) {
            await loc.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
            await page.evaluate('window.scrollBy(0, -window.innerHeight / 3)');
            focused = true;
            break;
          }
        }
        const path = join(o.outDir, `${name}-${o.device}.png`);
        await page.screenshot({ path, type: 'png' });
        return path;
      } finally {
        await ctx.close();
      }
    };
    const before = await shot(o.beforeHtml, 'before');
    const after = await shot(o.afterHtml, 'after');
    return { before, after, focused };
  } finally {
    await browser.close();
  }
}

/** Visible text from a replacement, for scrolling the preview to the change. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
