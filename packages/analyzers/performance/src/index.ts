import { finding, type Finding } from '@h88cro/core';
import type { Analyzer, AnalyzerContext, Image } from '@h88cro/page-model';

function hostOf(u: string): string | undefined {
  try {
    return new URL(u).hostname;
  } catch {
    return undefined;
  }
}

/** Best guess at the LCP image: from Lighthouse if available, else the largest image in the first screen, else the first content image. */
function lcpImage(ctx: AnalyzerContext): Image | undefined {
  const { page } = ctx;
  const fromLh = ctx.perf?.find((p) => p.lcpSelector)?.lcpSelector;
  if (fromLh) {
    const hit = page.images.find((i) => fromLh.includes(i.selector) || i.selector.includes(fromLh));
    if (hit) return hit;
  }
  const layout = page.layout?.mobile ?? page.layout?.desktop;
  if (layout) {
    const inView = page.images
      .map((i) => ({ i, l: i.h88 ? layout.elements[i.h88] : undefined }))
      .filter((x) => x.l && x.l.visible && x.l.rect.y < layout.viewport.height && x.l.rect.w * x.l.rect.h > 0)
      .sort((a, b) => b.l!.rect.w * b.l!.rect.h - a.l!.rect.w * a.l!.rect.h);
    if (inView[0] && inView[0].l!.rect.w * inView[0].l!.rect.h > 10_000) return inView[0].i;
  }
  // Static scan: only images near the top of the reading order can be the LCP element.
  return page.images.find((i) => i.index < 6 && !/logo|icon|avatar|flag/i.test(`${i.src} ${i.alt ?? ''}`));
}

export function runPerformance(ctx: AnalyzerContext): Finding[] {
  const out: Finding[] = [];
  const { page } = ctx;

  // Lab metrics from Lighthouse, when it ran.
  for (const p of ctx.perf ?? []) {
    if (p.lcpMs !== undefined && p.lcpMs > 2500) {
      out.push(
        finding({
          ruleId: 'performance.slow-lcp',
          severity: p.lcpMs > 4000 ? 'high' : 'medium',
          title: `Main content takes ${(p.lcpMs / 1000).toFixed(1)} s to appear on ${p.device}`,
          explanation: 'Largest Contentful Paint (when the main content shows up) should be under 2.5 s. Every extra second loses impatient visitors and hurts rankings.',
          suggestion: 'Load the hero image early (no lazy-loading, fetchpriority="high"), compress it, and remove render-blocking CSS and scripts.',
          evidence: [{ selector: p.lcpSelector, metric: { name: 'LCP (ms)', value: Math.round(p.lcpMs), target: 2500 } }],
          effort: 'm',
          impact: 4,
          confidence: 0.9,
          key: p.device,
        }),
      );
    }
    if (p.cls !== undefined && p.cls > 0.1) {
      out.push(
        finding({
          ruleId: 'performance.layout-shift',
          severity: p.cls > 0.25 ? 'high' : 'medium',
          title: `Content jumps while loading on ${p.device} (CLS ${p.cls.toFixed(2)})`,
          explanation: 'Layout shift makes people tap the wrong thing and feels broken. Target is under 0.1.',
          suggestion: 'Give images and ad/widget slots fixed width and height, and avoid injecting banners above content.',
          evidence: [{ metric: { name: 'CLS', value: Math.round(p.cls * 1000) / 1000, target: 0.1 } }],
          effort: 's',
          impact: 3,
          confidence: 0.9,
          key: p.device,
        }),
      );
    }
    if (p.tbtMs !== undefined && p.tbtMs > 300) {
      out.push(
        finding({
          ruleId: 'performance.main-thread-blocking',
          severity: p.tbtMs > 600 ? 'high' : 'medium',
          title: `Page is unresponsive for ${Math.round(p.tbtMs)} ms while loading on ${p.device}`,
          explanation: 'Heavy JavaScript blocks taps and scrolling. Total Blocking Time should be under 200–300 ms.',
          suggestion: 'Defer or remove non-essential third-party scripts (chat widgets, trackers).',
          evidence: [{ metric: { name: 'TBT (ms)', value: Math.round(p.tbtMs), target: 200 } }],
          effort: 'm',
          impact: 3,
          confidence: 0.85,
          key: p.device,
        }),
      );
    }
  }

  const lcp = lcpImage(ctx);
  if (lcp?.loading === 'lazy') {
    out.push(
      finding({
        ruleId: 'performance.lcp-image-lazy',
        severity: 'high',
        title: 'The main above-the-fold image is lazy-loaded',
        explanation: 'Lazy-loading the hero image delays the moment the page looks ready (LCP), often by a full second on mobile.',
        suggestion: 'Remove loading="lazy" from this image and add fetchpriority="high".',
        evidence: [{ selector: lcp.selector, textExcerpt: lcp.src }],
        effort: 'xs',
        impact: 4,
        confidence: 0.85,
        fix: { type: 'html-patch', available: false },
      }),
    );
  }

  const noDims = page.images.filter((i) => !i.width || !i.height);
  if (noDims.length) {
    out.push(
      finding({
        ruleId: 'performance.img-missing-dimensions',
        severity: noDims.length > 5 ? 'medium' : 'low',
        title: `${noDims.length} image${noDims.length > 1 ? 's have' : ' has'} no width/height`,
        explanation: 'Without dimensions the browser cannot reserve space, so content jumps as images load (layout shift).',
        suggestion: 'Add width and height attributes matching each image\'s aspect ratio.',
        evidence: noDims.slice(0, 6).map((i) => ({ selector: i.selector, textExcerpt: i.src })),
        effort: 'xs',
        impact: 2,
        confidence: 0.95,
        fix: { type: 'html-patch', available: false },
      }),
    );
  }

  const blockingJs = page.scripts.filter((s) => s.inHead && s.src && !s.async && !s.defer && s.type !== 'module');
  if (blockingJs.length) {
    out.push(
      finding({
        ruleId: 'performance.render-blocking-js',
        severity: 'high',
        title: `${blockingJs.length} script${blockingJs.length > 1 ? 's block' : ' blocks'} the page from rendering`,
        explanation: 'Synchronous scripts in <head> must download and run before anything is shown.',
        suggestion: 'Add defer (or async for independent trackers), or move the scripts to the end of <body>.',
        evidence: blockingJs.map((s) => ({ selector: 'head > script', textExcerpt: s.src })),
        effort: 'xs',
        impact: 3,
        confidence: 0.9,
      }),
    );
  }

  const blockingCss = page.stylesheets.filter((s) => s.inHead && (!s.media || s.media === 'all' || s.media === 'screen'));
  const fontCss = blockingCss.filter((s) => /fonts\.googleapis|typekit|fonts\.com/.test(s.href));
  if (blockingCss.length > 2 || fontCss.length) {
    out.push(
      finding({
        ruleId: 'performance.render-blocking-css',
        severity: 'medium',
        title: fontCss.length ? 'Web-font CSS blocks rendering' : `${blockingCss.length} stylesheets block rendering`,
        explanation: 'The browser waits for every blocking stylesheet before showing anything. External font CSS adds an extra connection on top.',
        suggestion: 'Self-host fonts with font-display: swap, inline critical CSS, and combine stylesheets.',
        evidence: (fontCss.length ? fontCss : blockingCss).map((s) => ({ selector: 'head > link[rel=stylesheet]', textExcerpt: s.href })),
        effort: 's',
        impact: 2,
        confidence: 0.8,
      }),
    );
  }

  const legacy = page.images.filter((i) => /\.(png|jpe?g|gif)(\?|$)/i.test(i.src) && !i.inPicture && !/logo|icon/i.test(i.src));
  if (legacy.length) {
    out.push(
      finding({
        ruleId: 'performance.legacy-image-format',
        severity: 'low',
        title: `${legacy.length} image${legacy.length > 1 ? 's use' : ' uses'} older formats (PNG/JPEG/GIF)`,
        explanation: 'WebP or AVIF images are typically 25–50% smaller, so the page loads faster on mobile data.',
        suggestion: 'Serve WebP/AVIF versions (for example with <picture>).',
        evidence: legacy.slice(0, 5).map((i) => ({ selector: i.selector, textExcerpt: i.src })),
        effort: 's',
        impact: 2,
        confidence: 0.8,
      }),
    );
  }

  const third = page.scripts.filter((s) => s.isThirdParty);
  if (third.length > 4) {
    out.push(
      finding({
        ruleId: 'performance.third-party-scripts',
        severity: 'medium',
        title: `${third.length} third-party scripts`,
        explanation: 'Each third-party script adds connections and JavaScript work that slow the page, especially on mobile.',
        suggestion: 'Remove unused tags and load the rest with defer or after user interaction.',
        evidence: third.slice(0, 8).map((s) => ({ textExcerpt: s.src })),
        effort: 's',
        impact: 2,
        confidence: 0.85,
      }),
    );
  }

  const earlyOrigins = new Set(
    [...page.stylesheets.filter((s) => s.inHead).map((s) => s.href), ...page.scripts.filter((s) => s.inHead && s.isThirdParty).map((s) => s.src ?? '')]
      .map((u) => hostOf(u))
      .filter((h): h is string => !!h),
  );
  if (!page.isLocalFile) {
    const pageHost = hostOf(page.finalUrl ?? page.url);
    earlyOrigins.delete(pageHost ?? '');
  }
  const preconnected = new Set(page.preconnects.map((p) => hostOf(p.startsWith('//') ? `https:${p}` : p)));
  const needPreconnect = [...earlyOrigins].filter((h) => !preconnected.has(h));
  if (needPreconnect.length) {
    out.push(
      finding({
        ruleId: 'performance.no-preconnect',
        severity: 'low',
        title: `No preconnect for ${needPreconnect.length} early third-party origin${needPreconnect.length > 1 ? 's' : ''}`,
        explanation: 'Preconnecting saves the DNS/TLS setup time for resources the page needs immediately.',
        suggestion: `Add <link rel="preconnect" href="https://${needPreconnect[0]}" crossorigin> for: ${needPreconnect.join(', ')}.`,
        effort: 'xs',
        impact: 1,
        confidence: 0.8,
      }),
    );
  }

  if (page.responseHeaders && !page.isLocalFile) {
    const cc = page.responseHeaders['cache-control'];
    if (!cc || /no-store|max-age=0/.test(cc)) {
      out.push(
        finding({
          ruleId: 'performance.no-cache-headers',
          severity: 'low',
          title: 'The page is served without browser caching',
          explanation: 'Without caching, returning visitors download everything again.',
          suggestion: 'Set Cache-Control with a sensible max-age (and long max-age for static assets).',
          evidence: [{ textExcerpt: `cache-control: ${cc ?? '(missing)'}` }],
          effort: 'xs',
          impact: 1,
          confidence: 0.7,
        }),
      );
    }
  }

  return out;
}

export const performanceAnalyzer: Analyzer = { id: 'performance', version: '0.1.0', run: runPerformance };
export default performanceAnalyzer;
