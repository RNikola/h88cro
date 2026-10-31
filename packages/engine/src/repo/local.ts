/**
 * Local folder connection: the fix is committed on a new branch with the system git, so the user
 * reviews and merges it (or pushes it) with their usual tools. Folders that are not git
 * repositories are written in place after a backup copy is saved next to each file.
 */
import { execFile } from 'node:child_process';
import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TEXT_EXT = /\.(html?|md|mdx|markdown|astro|njk|liquid|hbs|handlebars|ejs|pug|php|twig|vue|svelte|jsx|tsx|js|ts|json|ya?ml|toml|txt)$/i;
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.astro', 'vendor', '.cache', 'out']);

/** Resolve `path` inside `root`, refusing anything that escapes it. */
export function safeJoin(root: string, path: string): string {
  const abs = resolve(root, path);
  const r = resolve(root);
  if (abs !== r && !abs.startsWith(r + sep)) throw new Error(`Path is outside the connected folder: ${path}`);
  return abs;
}

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await run('git', args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    return (await git(root, 'rev-parse', '--is-inside-work-tree')) === 'true';
  } catch {
    return false;
  }
}

export async function listLocalFiles(root: string, max = 5000): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  async function walk(dir: string) {
    if (out.length >= max) return;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.') && e.name !== '.well-known') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name)) await walk(p);
      } else if (TEXT_EXT.test(e.name)) {
        out.push({ path: relative(root, p).split(sep).join('/'), size: (await stat(p)).size });
        if (out.length >= max) return;
      }
    }
  }
  await walk(root);
  return out;
}

export async function readLocalFile(root: string, path: string): Promise<string> {
  return readFile(safeJoin(root, path), 'utf8');
}

/**
 * Write the fixed files. In a git repo: new branch from the current HEAD, commit, switch back.
 * The working tree must have no uncommitted changes to the same files.
 */
export async function applyLocal(o: { root: string; branch: string; files: { path: string; text: string }[]; message: string; push?: boolean }): Promise<{ branch?: string; commit?: string; backups?: string[]; pushed?: boolean; message: string }> {
  if (!(await isGitRepo(o.root))) {
    const backups: string[] = [];
    for (const f of o.files) {
      const abs = safeJoin(o.root, f.path);
      const bak = `${abs}.h88cro-backup`;
      await copyFile(abs, bak).catch(() => undefined);
      backups.push(relative(o.root, bak));
      await writeFile(abs, f.text, 'utf8');
    }
    return { backups, message: `Saved ${o.files.length} file${o.files.length > 1 ? 's' : ''}. The originals were kept as .h88cro-backup copies.` };
  }
  const dirty = await git(o.root, 'status', '--porcelain', '--', ...o.files.map((f) => f.path));
  if (dirty) throw new Error('These files have uncommitted changes in the folder. Commit or discard them first, then apply the fix.');
  const start = (await git(o.root, 'rev-parse', '--abbrev-ref', 'HEAD')) || 'HEAD';
  const stashed = (await git(o.root, 'status', '--porcelain')) !== '';
  if (stashed) await git(o.root, 'stash', 'push', '--include-untracked', '-m', 'h88cro: before applying fix');
  try {
    await git(o.root, 'checkout', '-b', o.branch);
    for (const f of o.files) await writeFile(safeJoin(o.root, f.path), f.text, 'utf8');
    await git(o.root, 'add', '--', ...o.files.map((f) => f.path));
    try {
      await git(o.root, 'commit', '-m', o.message);
    } catch {
      // No git identity configured on this computer.
      await git(o.root, '-c', 'user.name=H88CRO', '-c', 'user.email=h88cro@users.noreply.github.com', 'commit', '-m', o.message);
    }
    const commit = await git(o.root, 'rev-parse', '--short', 'HEAD');
    let pushed = false;
    if (o.push) {
      try {
        await git(o.root, 'push', '-u', 'origin', o.branch);
        pushed = true;
      } catch {
        /* reported below */
      }
    }
    return {
      branch: o.branch,
      commit,
      pushed,
      message: `Committed on branch ${o.branch}${o.push ? (pushed ? ' and pushed it' : ' (push failed: check your git sign-in)') : ''}. Merge it when you are happy with it.`,
    };
  } finally {
    await git(o.root, 'checkout', start).catch(() => undefined);
    if (stashed) await git(o.root, 'stash', 'pop').catch(() => undefined);
  }
}
