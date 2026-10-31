/**
 * Minimal GitHub REST client for the fix engine: read files, create a branch with one commit,
 * open a pull request and (optionally) merge it. Uses a fine-grained token with
 * Contents: read/write and Pull requests: read/write on the chosen repositories.
 */
export type GhRepo = { fullName: string; owner: string; name: string; defaultBranch: string; private: boolean; canPush: boolean; htmlUrl: string };
export type GhPr = { number: number; url: string; state: 'open' | 'closed'; merged: boolean; mergeable?: boolean | null; title: string; branch: string; checks?: 'pending' | 'success' | 'failure' };

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TEXT_EXT = /\.(html?|md|mdx|markdown|astro|njk|liquid|hbs|handlebars|ejs|pug|php|twig|vue|svelte|jsx|tsx|js|ts|json|ya?ml|toml|txt)$/i;

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly api = 'https://api.github.com',
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'H88CRO-desktop',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new GitHubError(explain(res.status, String(data.message ?? res.statusText), path), res.status);
    return data as T;
  }

  async whoami(): Promise<{ login: string; name?: string }> {
    const u = await this.req<{ login: string; name?: string }>('GET', '/user');
    return { login: u.login, name: u.name ?? undefined };
  }

  async listRepos(): Promise<GhRepo[]> {
    const out: GhRepo[] = [];
    for (let page = 1; page <= 5; page++) {
      const rows = await this.req<RawRepo[]>('GET', `/user/repos?per_page=100&sort=updated&page=${page}`);
      out.push(...rows.map(repo));
      if (rows.length < 100) break;
    }
    return out;
  }

  async getRepo(fullName: string): Promise<GhRepo> {
    return repo(await this.req<RawRepo>('GET', `/repos/${fullName}`));
  }

  /** Text-like files in the repo (path + size), from the branch's tree. */
  async listFiles(fullName: string, ref: string): Promise<{ path: string; size: number }[]> {
    const t = await this.req<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>('GET', `/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    return t.tree.filter((e) => e.type === 'blob' && TEXT_EXT.test(e.path) && !/(^|\/)(node_modules|\.git|dist|vendor)\//.test(e.path)).map((e) => ({ path: e.path, size: e.size ?? 0 }));
  }

  async getFile(fullName: string, path: string, ref: string): Promise<{ text: string; sha: string }> {
    const f = await this.req<{ content?: string; encoding?: string; sha: string; download_url?: string; size: number }>(
      'GET',
      `/repos/${fullName}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
    );
    if (f.content && f.encoding === 'base64') return { text: Buffer.from(f.content, 'base64').toString('utf8'), sha: f.sha };
    // Files over 1 MB: fetch the blob.
    const b = await this.req<{ content: string }>('GET', `/repos/${fullName}/git/blobs/${f.sha}`);
    return { text: Buffer.from(b.content, 'base64').toString('utf8'), sha: f.sha };
  }

  /** Paths of files containing `text` (GitHub code search; default branch only). */
  async searchText(fullName: string, text: string): Promise<string[]> {
    const q = encodeURIComponent(`"${text.replace(/"/g, '')}" repo:${fullName}`);
    try {
      const r = await this.req<{ items: { path: string }[] }>('GET', `/search/code?q=${q}&per_page=10`);
      return r.items.map((i) => i.path);
    } catch {
      return [];
    }
  }

  /**
   * Create `branch` from `base` with one commit that writes `files`, then open a pull request.
   * Never writes to the base branch directly.
   */
  async openFixPr(o: { fullName: string; base: string; branch: string; files: { path: string; text: string }[]; message: string; title: string; body: string }): Promise<GhPr> {
    const ref = await this.req<{ object: { sha: string } }>('GET', `/repos/${o.fullName}/git/ref/heads/${encodeURIComponent(o.base)}`);
    const baseSha = ref.object.sha;
    const baseCommit = await this.req<{ tree: { sha: string } }>('GET', `/repos/${o.fullName}/git/commits/${baseSha}`);
    const tree = await this.req<{ sha: string }>('POST', `/repos/${o.fullName}/git/trees`, {
      base_tree: baseCommit.tree.sha,
      tree: o.files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })),
    });
    const commit = await this.req<{ sha: string }>('POST', `/repos/${o.fullName}/git/commits`, { message: o.message, tree: tree.sha, parents: [baseSha] });
    await this.req('POST', `/repos/${o.fullName}/git/refs`, { ref: `refs/heads/${o.branch}`, sha: commit.sha });
    const pr = await this.req<RawPr>('POST', `/repos/${o.fullName}/pulls`, { title: o.title, head: o.branch, base: o.base, body: o.body });
    return toPr(pr);
  }

  async getPr(fullName: string, number: number): Promise<GhPr> {
    const pr = toPr(await this.req<RawPr>('GET', `/repos/${fullName}/pulls/${number}`));
    try {
      const s = await this.req<{ state: 'pending' | 'success' | 'failure' | 'error'; total_count: number }>('GET', `/repos/${fullName}/commits/${encodeURIComponent(pr.branch)}/status`);
      if (s.total_count) pr.checks = s.state === 'error' ? 'failure' : s.state;
    } catch {
      /* no status */
    }
    return pr;
  }

  /**
   * Merge a fix PR (squash). If branch protection blocks an immediate merge (checks still running,
   * reviews required), turn on GitHub auto-merge so it merges as soon as the rules allow.
   */
  async mergePr(fullName: string, number: number, title: string): Promise<{ merged: boolean; autoMerge: boolean; message: string }> {
    // GitHub needs a moment to compute mergeability after the PR is opened.
    let lastError = '';
    for (let i = 0; i < 4; i++) {
      try {
        await this.req('PUT', `/repos/${fullName}/pulls/${number}/merge`, { merge_method: 'squash', commit_title: `${title} (#${number})` });
        await this.deleteBranchOf(fullName, number).catch(() => undefined);
        return { merged: true, autoMerge: false, message: 'Merged. Your site will update after its next deploy.' };
      } catch (e) {
        lastError = (e as Error).message;
        if ((e as GitHubError).status === 401 || (e as GitHubError).status === 403) break;
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
    try {
      const pr = await this.req<{ node_id: string }>('GET', `/repos/${fullName}/pulls/${number}`);
      await this.graphql(`mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}`, { id: pr.node_id });
      return { merged: false, autoMerge: true, message: 'Auto-merge is on: GitHub will merge it once the required checks or reviews pass.' };
    } catch (e) {
      return { merged: false, autoMerge: false, message: `Could not merge automatically (${lastError || (e as Error).message}). The pull request is open for review.` };
    }
  }

  private async deleteBranchOf(fullName: string, number: number) {
    const pr = await this.req<RawPr>('GET', `/repos/${fullName}/pulls/${number}`);
    if (pr.head.repo?.full_name === fullName) await this.req('DELETE', `/repos/${fullName}/git/refs/heads/${encodeURIComponent(pr.head.ref)}`);
  }

  private async graphql(query: string, variables: Record<string, unknown>) {
    const r = await this.req<{ errors?: { message: string }[] }>('POST', '/graphql', { query, variables });
    if (r.errors?.length) throw new Error(r.errors.map((x) => x.message).join('; '));
    return r;
  }
}

type RawRepo = { full_name: string; name: string; owner: { login: string }; default_branch: string; private: boolean; permissions?: { push?: boolean }; html_url: string };
type RawPr = { number: number; html_url: string; state: 'open' | 'closed'; merged?: boolean; merged_at?: string | null; mergeable?: boolean | null; title: string; head: { ref: string; repo?: { full_name: string } | null } };

const repo = (r: RawRepo): GhRepo => ({ fullName: r.full_name, owner: r.owner.login, name: r.name, defaultBranch: r.default_branch, private: r.private, canPush: r.permissions?.push ?? false, htmlUrl: r.html_url });
const toPr = (p: RawPr): GhPr => ({ number: p.number, url: p.html_url, state: p.state, merged: !!(p.merged || p.merged_at), mergeable: p.mergeable, title: p.title, branch: p.head.ref });

function explain(status: number, message: string, path: string): string {
  if (status === 401) return 'GitHub rejected the token. It may have expired; add a new one in Settings → GitHub.';
  if (status === 403 && /rate limit/i.test(message)) return 'GitHub rate limit reached. Try again in a few minutes.';
  if (status === 403 || (status === 404 && /\/repos\//.test(path)))
    return `GitHub: ${message}. Check that the token has access to this repository with Contents and Pull requests set to "Read and write".`;
  if (status === 422 && /Reference already exists/i.test(message)) return 'A branch with this name already exists. Try again.';
  return `GitHub: ${message} (${status})`;
}

/** "fix/h88cro-…" branch names: short, unique, safe. */
export function fixBranchName(summary: string, now = new Date()): string {
  const slug = summary
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `h88cro/${slug || 'fix'}-${now.toISOString().replace(/\D/g, '').slice(2, 12)}`;
}
