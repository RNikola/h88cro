import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { Device } from '@h88cro/core';
import type { DeviceLayout } from '@h88cro/page-model';

export const DEVICE_PROFILES: Record<Device, { viewport: { width: number; height: number }; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean; userAgent?: string }> = {
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 H88CRO',
  },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

export type RenderTarget = { kind: 'url'; url: string } | { kind: 'file'; path: string };

export type RenderOutput = {
  html: string;
  finalUrl: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  layout: Partial<Record<Device, DeviceLayout>>;
  screenshots: { device: Device; kind: 'fold' | 'full'; path: string }[];
  warnings: string[];
  /** Stylesheets that failed to load (e.g. a saved page opened offline). Layout from such a render is not trustworthy. */
  missingStylesheets: string[];
  /** True when the page's own CSS failed to load and nothing else styles it. */
  unstyled?: boolean;
};

const MAX_FULL_PAGE_PX = 12000;

/** Is this host on a private network (blocked unless the user scans a local file explicitly)? */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) || /^0\./.test(h) || h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)
  );
}

/**
 * Runs in the page: stamps data-h88 ids in DOM order and records geometry + a few computed styles.
 * Kept as a plain string so bundlers (esbuild keepNames etc.) can't inject helpers into it.
 */
const CAPTURE_LAYOUT_JS = `(() => {
  const out = {};
  const all = document.querySelectorAll('body *');
  const effectiveBg = (el) => {
    let cur = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(bg)) return bg;
      cur = cur.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  let i = 0;
  for (const el of Array.from(all)) {
    const id = String(i++);
    el.setAttribute('data-h88', id);
    const cs = getComputedStyle(el);
    const fixed = cs.position === 'fixed' || cs.position === 'sticky';
    if (!fixed && !/^(A|BUTTON|IMG|H1|H2|H3|TABLE|TR|P|LI|SECTION|ARTICLE|DIV|PICTURE|VIDEO)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out[id] = {
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      position: cs.position,
      visible: cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05,
      color: cs.color,
      background: effectiveBg(el),
      fontSize: parseFloat(cs.fontSize),
      zIndex: Number(cs.zIndex) || 0,
    };
  }
  return { elements: out, documentHeight: document.documentElement.scrollHeight };
})()`;

export async function launchBrowser(executablePath?: string): Promise<Browser> {
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--mute-audio'],
  });
}

async function hardenContext(ctx: BrowserContext, target: RenderTarget, warnings: string[]) {
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'file:' && target.kind !== 'file') return route.abort('accessdenied');
    if ((u.protocol === 'http:' || u.protocol === 'https:') && isPrivateHost(u.hostname) && target.kind === 'url') {
      warnings.push(`Blocked request to private network: ${u.hostname}`);
      return route.abort('accessdenied');
    }
    return route.continue();
  });
}

export async function renderPage(opts: {
  target: RenderTarget;
  devices: Device[];
  outDir: string;
  executablePath?: string;
  browser?: Browser;
  timeoutMs?: number;
}): Promise<RenderOutput> {
  const warnings: string[] = [];
  const url = opts.target.kind === 'url' ? opts.target.url : pathToFileURL(opts.target.path).toString();
  if (opts.target.kind === 'url') {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs can be scanned. Drag a local file in to scan it.');
    if (isPrivateHost(u.hostname)) throw new Error('Scanning private-network addresses is blocked.');
  }
  await mkdir(opts.outDir, { recursive: true });
  const browser = opts.browser ?? (await launchBrowser(opts.executablePath));
  const result: RenderOutput = { html: '', finalUrl: url, layout: {}, screenshots: [], warnings, missingStylesheets: [] };
  try {
    for (const device of opts.devices) {
      const p = DEVICE_PROFILES[device];
      const ctx = await browser.newContext({ ...p, acceptDownloads: false, permissions: [], serviceWorkers: 'block', javaScriptEnabled: true });
      await hardenContext(ctx, opts.target, warnings);
      const page = await ctx.newPage();
      page.on('dialog', (d) => void d.dismiss());
      const cssFailed = (u: string) => !result.missingStylesheets.includes(u) && result.missingStylesheets.push(u);
      page.on('requestfailed', (r) => r.resourceType() === 'stylesheet' && cssFailed(r.url()));
      page.on('response', (r) => r.request().resourceType() === 'stylesheet' && r.status() >= 400 && cssFailed(r.url()));
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs ?? 45_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => warnings.push(`${device}: network did not go idle within 8 s`));
        if (!result.html) {
          result.statusCode = res?.status();
          result.responseHeaders = res ? await res.allHeaders() : undefined;
          result.finalUrl = page.url();
        }
        const fold = join(opts.outDir, `${device}-fold.png`);
        await page.screenshot({ path: fold, type: 'png' });
        result.screenshots.push({ device, kind: 'fold', path: fold });

        // Fonts aside, a failed stylesheet only matters when nothing else styles the page (a saved page opened offline).
        const realFailures = result.missingStylesheets.filter((u) => !/fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|\/fonts?\//i.test(u));
        if (realFailures.length && !result.unstyled) {
          const rules = (await page.evaluate(
            `Array.from(document.styleSheets).reduce((n, sh) => { try { return n + (/fonts\\.googleapis/.test(sh.href || '') ? 0 : sh.cssRules.length); } catch { return n; } }, 0)`,
          )) as number;
          if (rules === 0) result.unstyled = true;
        }
        const cap = (await page.evaluate(CAPTURE_LAYOUT_JS)) as { elements: Record<string, unknown>; documentHeight: number };
        result.layout[device] = { device, viewport: p.viewport, documentHeight: cap.documentHeight, elements: cap.elements as DeviceLayout['elements'] };

        const full = join(opts.outDir, `${device}-full.png`);
        await page.screenshot({ path: full, type: 'png', fullPage: cap.documentHeight <= MAX_FULL_PAGE_PX, clip: cap.documentHeight > MAX_FULL_PAGE_PX ? { x: 0, y: 0, width: p.viewport.width, height: MAX_FULL_PAGE_PX } : undefined });
        result.screenshots.push({ device, kind: 'full', path: full });

        if (!result.html) result.html = await page.content();
      } finally {
        await ctx.close();
      }
    }
    await writeFile(join(opts.outDir, 'snapshot.html'), result.html);
  } finally {
    if (!opts.browser) await browser.close();
  }
  return result;
}
