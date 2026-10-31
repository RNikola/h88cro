import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './render.js';
import { renderReportHtml } from './report.js';
import type { ScanResult } from './types.js';

/** Render the report HTML to PDF with the same Chromium used for scanning. */
export async function exportPdf(result: ScanResult, outPath: string, executablePath?: string): Promise<void> {
  const html = await renderReportHtml(result);
  const browser = await launchBrowser(executablePath);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
    await writeFile(outPath, pdf);
  } finally {
    await browser.close();
  }
}
