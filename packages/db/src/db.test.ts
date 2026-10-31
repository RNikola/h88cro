import { describe, expect, it } from 'vitest';
import { LocalDb, hashPassword, verifyPassword } from './index.js';


describe('passwords', () => {
  it('hashes and verifies with scrypt', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
});

describe('LocalDb', () => {
  it('migrates, stores a profile, scans and findings', async () => {
    const db = new LocalDb(':memory:');
    await db.createProfile('Niko', 'pw-123456');
    expect(await db.checkPassword('pw-123456')).toBe(true);
    await db.insertScan({ id: 's1', url: 'https://x.best/fr/', status: 'done', devices: ['mobile'], pageType: 'toplist', request: {} });
    await db.insertScan({ id: 's2', url: 'https://x.best/fr/', status: 'done', devices: ['mobile'], pageType: 'toplist', request: {}, createdAt: '2999-01-01T00:00:00Z' });
    expect((await db.previousScan('https://x.best/fr/', 's2'))?.id).toBe('s1');
    db.insertFindings('s1', [
      { id: 'a', module: 'cro', ruleId: 'cro.x', severity: 'low', title: 't', explanation: '', evidence: [], suggestion: '', effort: 'xs', impact: 1, confidence: 1, source: 'deterministic' },
    ]);
    expect(await db.listFindings('s1')).toHaveLength(1);
    expect((await db.listFindings('s1'))[0]!.ruleId).toBe('cro.x');
    await db.deleteScan('s1');
    expect(await db.listFindings('s1')).toHaveLength(0);
    db.close();
  });

  it('stores connected sites, page links and fixes', async () => {
    const db = new LocalDb(':memory:');
    await db.upsertSite({ id: 'k', name: 'Keira', kind: 'github', urlPrefix: 'https://keira.best', repo: 'o/keira', baseBranch: 'main', autoMerge: true });
    await db.upsertSite({ id: 'k2', name: 'Keira FR', kind: 'local', urlPrefix: 'https://www.keira.best/fr', localPath: '/x' });
    expect((await db.siteForUrl('https://keira.best/fr/'))?.id).toBe('k2');
    expect((await db.siteForUrl('https://keira.best/en/'))?.id).toBe('k');
    expect(await db.siteForUrl('https://keira.bestx/')).toBeUndefined();
    expect((await db.getSite('k'))?.autoMerge).toBe(true);
    await db.setPageMap('k', '/fr/', 'fr/index.html');
    await db.setPageMap('k', '/fr/', 'src/fr.astro');
    expect(await db.getPageMap('k', '/fr/')).toBe('src/fr.astro');
    await db.addFixChange({ id: 'f1', siteId: 'k', scanId: 's', findingIds: ['a'], summary: 's', kind: 'pr', prNumber: 3, state: 'open' });
    expect(await db.openFixPrs()).toHaveLength(1);
    await db.updateFixChange('f1', { state: 'merged' });
    expect(await db.openFixPrs()).toHaveLength(0);
    expect((await db.listFixChanges(['s']))[0]?.findingIds).toEqual(['a']);
    db.close();
  });
});
