import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EvidenceStore } from '../src/work-evidence/store.ts';
async function fixture() {
  const base = fileURLToPath(new URL('../../../tmp/work-evidence-reconstruction/tests/', import.meta.url)); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'sync-')), repo = join(root, '仓库 with spaces'); await mkdir(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const commit = (message: string) => { git(['add', '-A']); git(['commit', '-qm', message]); return git(['rev-parse', 'HEAD']); };
  const store = new EvidenceStore(join(root, 'state')), scope = await store.select(repo);
  return { root, repo, git, commit, store, scope };
}
test('incremental sync retains new commits and current dirty files, including a reverted intermediate change, across restart', async () => {
  const f = await fixture(); await writeFile(join(f.repo, '文件 name.txt'), 'base\n'); f.commit('base');
  const first = await f.store.observe(f.scope.id); assert.equal(first.value.sync?.state, 'initial'); assert.equal(first.value.sync?.commits.length, 0);
  await writeFile(join(f.repo, '文件 name.txt'), 'changed\n'); const one = f.commit('change');
  await writeFile(join(f.repo, '文件 name.txt'), 'base\n'); const two = f.commit('revert text');
  await writeFile(join(f.repo, 'untracked.txt'), 'not read');
  const sync = await f.store.observe(f.scope.id);
  assert.deepEqual(sync.value.sync?.commits.map(c => c.sha), [one, two]);
  assert.equal(sync.value.sync?.files.length, 1); assert.deepEqual(sync.value.sync?.files[0]?.commits, [one, two]);
  assert(sync.value.files.some(file => file.path === 'untracked.txt'));
  const restarted = new EvidenceStore(f.store.directory); assert.deepEqual(await restarted.observation(f.scope.id, sync.value.id), sync);
  assert.equal((await restarted.observe(f.scope.id)).value.sync?.commits.length, 0);
});
test('unborn checkpoint, rename and rewritten history are explicit, never replaced with a guessed range', async () => {
  const f = await fixture(); await f.store.observe(f.scope.id);
  await writeFile(join(f.repo, 'old name.txt'), 'base\n'); f.commit('first');
  assert.equal((await f.store.observe(f.scope.id)).value.sync?.commits.length, 1);
  await rename(join(f.repo, 'old name.txt'), join(f.repo, '新 name.txt')); f.commit('rename');
  const renamed = await f.store.observe(f.scope.id); assert.equal(renamed.value.sync?.files[0]?.originalPath, 'old name.txt');
  f.git(['checkout', '--orphan', 'rewritten']); await writeFile(join(f.repo, 'different.txt'), 'different'); f.commit('different history');
  const changed = await f.store.observe(f.scope.id); assert.equal(changed.value.sync?.state, 'unknown'); assert.equal(changed.value.sync?.reason, 'CHECKPOINT_NOT_ANCESTOR_OR_UNAVAILABLE');
  assert.equal((await f.store.observe(f.scope.id)).value.sync?.state, 'unknown');
});
