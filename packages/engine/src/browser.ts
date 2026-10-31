import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { Browser, computeExecutablePath, detectBrowserPlatform, getInstalledBrowsers, install, resolveBuildId } from '@puppeteer/browsers';

/**
 * Chromium for Testing is downloaded on first run into the app data folder (brief §4.2),
 * which keeps the installer small. Release engineering can pin a build with
 * H88CRO_CHROME_BUILD; otherwise the current stable build is resolved once and then
 * recorded (version + SHA-256) so later launches can verify the binary is unchanged.
 */
export const PINNED_CHROME_BUILD = process.env.H88CRO_CHROME_BUILD || '';

export type EngineInfo = { name: 'chromium'; version: string; executablePath: string; sha256: string };

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(path).on('data', (d) => h.update(d)).on('end', resolve).on('error', reject);
  });
  return h.digest('hex');
}

export async function findInstalledChromium(cacheDir: string): Promise<EngineInfo | undefined> {
  const installed = await getInstalledBrowsers({ cacheDir });
  const chrome = installed.filter((b) => b.browser === Browser.CHROME).sort((a, b) => (a.buildId < b.buildId ? 1 : -1))[0];
  if (!chrome || !existsSync(chrome.executablePath)) return undefined;
  return { name: 'chromium', version: chrome.buildId, executablePath: chrome.executablePath, sha256: await sha256File(chrome.executablePath) };
}

export async function installChromium(cacheDir: string, onProgress?: (done: number, total: number) => void): Promise<EngineInfo> {
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error('Unsupported platform for Chromium for Testing');
  const buildId = PINNED_CHROME_BUILD || (await resolveBuildId(Browser.CHROME, platform, 'stable'));
  await install({ browser: Browser.CHROME, buildId, cacheDir, platform, downloadProgressCallback: onProgress });
  const executablePath = computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir, platform });
  return { name: 'chromium', version: buildId, executablePath, sha256: await sha256File(executablePath) };
}

/** Verify the binary still matches the checksum recorded at install time. */
export async function verifyChromium(info: Pick<EngineInfo, 'executablePath' | 'sha256'>): Promise<boolean> {
  return existsSync(info.executablePath) && (await sha256File(info.executablePath)) === info.sha256;
}
