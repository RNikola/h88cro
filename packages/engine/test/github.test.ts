import { afterEach, expect, it, vi } from 'vitest';
import { GitHubClient } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

it('opens a fix PR on a new branch, never on the base branch', async () => {
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.github.com', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method ?? 'GET', path, body });
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
    if (path.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'base' } });
    if (path.endsWith('/git/commits/base')) return json({ tree: { sha: 'tree0' } });
    if (path.endsWith('/git/trees')) return json({ sha: 'tree1' });
    if (path.endsWith('/git/commits')) return json({ sha: 'c1' });
    if (path.endsWith('/git/refs')) return json({ ref: body.ref }, 201);
    if (path.endsWith('/pulls')) return json({ number: 7, html_url: 'https://github.com/o/r/pull/7', state: 'open', title: body.title, head: { ref: body.head } }, 201);
    return json({ message: 'Not Found' }, 404);
  });
  const gh = new GitHubClient('t');
  const pr = await gh.openFixPr({ fullName: 'o/r', base: 'main', branch: 'h88cro/fix-1', files: [{ path: 'fr/index.html', text: 'x' }], message: 'm', title: 't', body: 'b' });
  expect(pr).toMatchObject({ number: 7, branch: 'h88cro/fix-1', merged: false });
  const ref = calls.find((c) => c.path.endsWith('/git/refs'));
  expect(ref?.body).toEqual({ ref: 'refs/heads/h88cro/fix-1', sha: 'c1' });
  expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  expect(calls.find((c) => c.path.endsWith('/git/commits') && c.method === 'POST')?.body).toMatchObject({ parents: ['base'], tree: 'tree1' });
});

it('explains a rejected token', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }));
  await expect(new GitHubClient('bad').whoami()).rejects.toThrow(/rejected the token/);
});
