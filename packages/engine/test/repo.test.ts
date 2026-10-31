import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyLocal, fixBranchName, listLocalFiles, readLocalFile, safeJoin, suggestFilesForPage } from '../src/index.js';

const PAGE = '<html><head><title>Meilleurs casinos en ligne 2026</title></head><body><h1>Meilleurs casinos en ligne en France</h1><h2>Tower Casino, notre numéro un</h2></body></html>';

function site() {
  const root = mkdtempSync(join(tmpdir(), 'h88-site-'));
  mkdirSync(join(root, 'fr'));
  mkdirSync(join(root, 'en'));
  writeFileSync(join(root, 'fr/index.html'), PAGE);
  writeFileSync(join(root, 'en/index.html'), '<h1>Best online casinos</h1>');
  writeFileSync(join(root, 'index.html'), '<h1>Home</h1>');
  return root;
}

describe('local folder', () => {
  it('finds the file for a URL', async () => {
    const root = site();
    const files = await listLocalFiles(root);
    const r = await suggestFilesForPage({
      url: 'https://keira.best/fr/',
      page: { title: 'Meilleurs casinos en ligne 2026', headings: [{ text: 'Meilleurs casinos en ligne en France' }, { text: 'Tower Casino, notre numéro un' }], bodyText: '' },
      files,
      load: (p) => readLocalFile(root, p),
    });
    expect(r[0]?.path).toBe('fr/index.html');
  });

  it('refuses paths outside the folder', () => {
    expect(() => safeJoin('/tmp/site', '../etc/passwd')).toThrow(/outside/);
  });

  it('commits a fix on a new branch and leaves the current branch alone', async () => {
    const root = site();
    const g = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
    g('init', '-q', '-b', 'main');
    g('add', '.');
    g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    const branch = fixBranchName('Name Tower Casino in the FAQ');
    const r = await applyLocal({ root, branch, files: [{ path: 'fr/index.html', text: PAGE.replace('numéro un', 'n°1') }], message: 'Fix' });
    expect(r.branch).toBe(branch);
    expect(g('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(readFileSync(join(root, 'fr/index.html'), 'utf8')).toBe(PAGE);
    expect(g('show', `${branch}:fr/index.html`)).toContain('n°1');
  });

  it('writes in place with a backup when the folder is not a git repo', async () => {
    const root = site();
    const r = await applyLocal({ root, branch: 'x', files: [{ path: 'fr/index.html', text: 'new' }], message: 'Fix' });
    expect(r.backups).toEqual(['fr/index.html.h88cro-backup']);
    expect(readFileSync(join(root, 'fr/index.html'), 'utf8')).toBe('new');
  });
});

it('branch names are safe', () => {
  expect(fixBranchName('Écrire « 9,8 » — fix!', new Date('2026-10-31T08:00:00Z'))).toBe('h88cro/ecrire-9-8-fix-2610310800');
});
