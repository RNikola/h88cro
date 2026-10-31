/**
 * End-to-end smoke test: launches the built app with Playwright for Electron, creates a Solo profile,
 * scans the fixture as a local file and opens the report.
 *   pnpm --filter @h88cro/desktop build && H88CRO_CHROMIUM_PATH=/path/to/chrome node e2e/smoke.mjs [screenshotDir]
 */
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const shots = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (shots) mkdirSync(shots, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'h88cro-e2e-'));
const fixture = resolve(import.meta.dirname, '../../../fixtures/sample-toplist-fr.html');

// H88CRO_APP_EXECUTABLE runs the test against a packaged build instead of the dev build.
const packaged = process.env.H88CRO_APP_EXECUTABLE;
const app = await electron.launch({
  ...(packaged ? { executablePath: packaged } : {}),
  args: [...(packaged ? [] : [resolve(import.meta.dirname, '..')]), `--user-data-dir=${userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: { ...process.env, NODE_ENV: 'production' },
});
const win = await app.firstWindow();
await win.setViewportSize({ width: 1360, height: 880 }).catch(() => {});
const snap = async (name) => shots && (await win.screenshot({ path: join(shots, `${name}.png`) }));
const step = (m) => console.log(`✓ ${m}`);

await win.getByText('Welcome to').waitFor();
await snap('01-welcome');
step('welcome screen');

await win.getByText('Use offline (Solo mode)').click();
await win.getByLabel('Your name').fill('Niko');
await win.getByLabel('Local password').fill('test-password-1');
await win.getByLabel('Repeat password').fill('test-password-1');
await snap('02-solo-profile');
await win.getByRole('button', { name: 'Create profile' }).click();
step('solo profile created');

// With H88CRO_CHROMIUM_PATH set, the engine counts as installed and setup is skipped.
await win.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
await snap('03-dashboard-empty');
step('dashboard');

await win.getByRole('button', { name: /New scan/ }).first().click();
await win.getByRole('heading', { name: 'New scan' }).waitFor();
// Drag-and-drop needs a real OS drag, so attach the file through the IPC the file picker uses.
await win.evaluate(async (p) => {
  await window.h88.invoke('scan:start', { targets: [{ kind: 'file', path: p }], devices: ['mobile', 'desktop'], pageType: 'toplist', lighthouse: false, useClaude: false, deep: false });
}, fixture);
await snap('04-new-scan');
await win.getByRole('button', { name: 'Cancel' }).click();
step('scan queued');

const row = win.getByText('Meilleur casino en ligne 2026', { exact: false }).first();
await row.waitFor({ timeout: 90000 });
await snap('05-dashboard-done');
await row.click();
await win.getByText('Fix these first').first().waitFor();
await win.waitForTimeout(800);
await snap('06-report');
step('report opened');

await win.getByRole('button', { name: /Consistency & facts/ }).first().click();
await win.waitForTimeout(300);
await win.mouse.wheel(0, 650);
await win.waitForTimeout(300);
await snap('07-report-consistency');
await win.emulateMedia({ colorScheme: 'dark' });
await win.waitForTimeout(300);
await snap('08-report-dark');
await win.mouse.wheel(0, -2000);
await win.waitForTimeout(300);
await snap('09-report-dark-top');
const titles = await win.locator('h3').allTextContents();
if (!titles.some((t) => t.includes('deuxième place'))) throw new Error('Expected the rank mismatch finding in the report');
step('consistency finding visible');

// Language picker: search any language, country follows.
await win.emulateMedia({ colorScheme: 'light' });
await win.getByRole('button', { name: /New scan/ }).first().click();
await win.getByRole('button', { name: 'Language' }).click();
await win.getByPlaceholder('Search languages…').fill('serb');
await win.keyboard.press('Enter');
await win.getByRole('button', { name: 'Country' }).getByText('Serbia').waitFor();
await snap('10-language-serbian');
step('language search → Serbian / Serbia');

// Settings shows the update section.
await win.getByRole('button', { name: 'Settings' }).first().click();
await win.getByRole('button', { name: /Check for updates/ }).waitFor();
await snap('11-settings-updates');
step('update settings visible');

await app.close();
console.log('E2E smoke test passed');
