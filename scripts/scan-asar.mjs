/**
 * Fails if a packaged app.asar contains anything that looks like a secret (brief §12 "No secrets").
 * Usage: node scripts/scan-asar.mjs <release dir>
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const PATTERNS = [
  [/sk-ant-(api|admin)\d{2}-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, 'JWT (Supabase key?)'],
  [/service_role/, 'Supabase service-role reference'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/SEED_ADMIN_PASSWORD\s*[=:]\s*['"][^'"]{4,}/, 'Seed admin password'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'Private key'],
];

function findAsars(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === 'app.asar') out.push(p);
    else if (statSync(p).isDirectory()) out.push(...findAsars(p));
  }
  return out;
}

const root = process.argv[2] ?? 'apps/desktop/release';
const archives = findAsars(root);
if (!archives.length) throw new Error(`No app.asar found under ${root}`);
let hits = 0;
for (const archive of archives) {
  for (const file of asar.listPackage(archive, { isPack: false })) {
    if (!/\.(m?js|cjs|json|html|env|txt|ya?ml)$/.test(file) || /node_modules[\\/](lighthouse|playwright-core|typescript)[\\/]/.test(file)) continue;
    let content;
    try {
      content = asar.extractFile(archive, file.replace(/^[\\/]/, '')).toString('utf8');
    } catch {
      continue;
    }
    for (const [re, label] of PATTERNS) {
      if (re.test(content)) {
        console.error(`✗ ${label} in ${archive}:${file}`);
        hits++;
      }
    }
  }
}
if (hits) process.exit(1);
console.log(`✓ No secrets found in ${archives.length} app.asar file(s)`);
