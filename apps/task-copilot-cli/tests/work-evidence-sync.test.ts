import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EvidenceStore } from '../src/work-evidence/store.ts';
import { fileItems } from '../src/work-evidence/items.ts';
import { textDiff } from '../src/work-evidence/git.ts';
async function fixture() {
  const base = fileURLToPath(new URL('../../../tmp/work-evidence-reconstruction/tests/', import.meta.url)); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'sync-')), repo = join(root, '仓库 with spaces'); await mkdir(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const commit = (message: string) => { git(['add', '-A']); git(['commit', '-qm', message]); return git(['rev-parse', 'HEAD']); };
  const store = new EvidenceStore(join(root, 'state')), scope = await store.select(repo);
  return { root, repo, git, commit, store, scope };
}
test('internal workspace files stay observable but their bodies are restricted even for older observations', async () => {
  const f = await fixture(); await mkdir(join(f.repo, '.task-workspace'));
  await writeFile(join(f.repo, '.task-workspace', 'source.json'), 'initial'); f.commit('initial');
  await writeFile(join(f.repo, '.task-workspace', 'source.json'), 'changed');
  const record = (await f.store.observe(f.scope.id)).value;
  const file = record.files.find(item => item.path === '.task-workspace/source.json')!;
  assert.equal(file.restricted, true);
  const legacy = { ...record, files: record.files.map(item => ({ ...item, restricted: false })) };
  assert.equal(fileItems(legacy).find(item => item.path === file.path)?.restricted, true);
  await assert.rejects(textDiff(legacy, file.path, 'unstaged'), /TEXT_DIFF_RESTRICTED/);
  const { handoffDraft } = await import('../src/work-evidence/reconstruction.ts');
  const draft = handoffDraft(record, []);
  assert.match(draft, /工作区内部记录：1 项/u);
  assert.doesNotMatch(draft, /\.task-workspace\/source\.json/u);
});
test('unrelated workspace churn does not invalidate a selected file diff; the selected file still must match', async () => {
  const f = await fixture(); await writeFile(join(f.repo, 'work.txt'), 'before\n'); f.commit('baseline');
  await writeFile(join(f.repo, 'work.txt'), 'after\n'); const record = (await f.store.observe(f.scope.id)).value;
  await mkdir(join(f.repo, '.task-workspace')); await writeFile(join(f.repo, '.task-workspace', 'status.json'), 'new internal state');
  assert.match((await textDiff(record, 'work.txt', 'unstaged')).text!, /after/u);
  await writeFile(join(f.repo, 'work.txt'), 'changed again\n');
  await assert.rejects(textDiff(record, 'work.txt', 'unstaged'), /SOURCE_CHANGED/);
});
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

test('unified file evidence keeps commit and workspace sources together and bounds historical body reads', async () => {
  const f = await fixture(); await writeFile(join(f.repo, 'file.txt'), 'base\n'); f.commit('base'); await f.store.observe(f.scope.id);
  await writeFile(join(f.repo, 'file.txt'), 'committed\n'); const sha = f.commit('new change'); await writeFile(join(f.repo, 'file.txt'), 'dirty\n');
  const o = await f.store.observe(f.scope.id), items = await f.store.items(f.scope.id, o.value.id);
  assert.equal(items.length, 1); assert(items[0]?.workspace); assert.deepEqual(items[0]?.commits, [sha]);
  const diff = await f.store.commitDiff(f.scope.id, o.value.id, items[0]!.id, sha); assert.match(diff.text!, /\+committed/u); assert.doesNotMatch(diff.text!, /dirty/u);
  const quote = await f.store.quote(f.scope.id, o.value.id, ['file.txt']); assert(quote.includes(sha));
  await assert.rejects(f.store.commitDiff(f.scope.id, o.value.id, items[0]!.id, 'a'.repeat(40)), /INVALID_COMMIT_SELECTION/);
});

test('interpretations, clarification and early handoff append separately and survive restart without changing the observation', async () => {
  const f = await fixture(); await writeFile(join(f.repo, 'file.txt'), 'base\n'); f.commit('base'); await writeFile(join(f.repo, 'file.txt'), 'dirty\n');
  const o = await f.store.observe(f.scope.id), item = (await f.store.items(f.scope.id, o.value.id))[0]!;
  const { randomUUID } = await import('node:crypto');
  const started = await f.store.appendWork(f.scope.id, o.value.id, { kind: 'analysis-started', itemId: item.id, model: 'test-model' }, randomUUID());
  const result = await f.store.appendWork(f.scope.id, o.value.id, { kind: 'analysis-result', itemId: item.id, runId: started.value.id, interpretation: { explanation: 'A change, purpose is uncertain.', group: 'Investigate change', question: 'What outcome was intended?', uncertainties: ['Verification unknown'], evidenceRefs: [o.value.id] } }, randomUUID());
  assert.equal((await f.store.reconstruct(f.scope.id, o.value.id)).items[0]?.state, 'needs-clarification');
  await f.store.appendWork(f.scope.id, o.value.id, { kind: 'clarification', itemId: item.id, interpretationId: result.value.id, skipped: true, text: '' }, randomUUID());
  const { handoffDraft } = await import('../src/work-evidence/reconstruction.ts');
  const events = (await f.store.workEvents(f.scope.id, o.value.id)).items.map(e=>e.value), draft = handoffDraft(o.value, events);
  assert.match(draft, /用户跳过澄清/u); assert.match(draft, /Verification unknown/u);
  const requestId = randomUUID(), payload = { kind: 'handoff' as const, text: draft, sourceEventIds: events.map(e=>e.id), supersedesId: null };
  const saved = await f.store.appendWork(f.scope.id, o.value.id, payload, requestId);
  const restart = new EvidenceStore(f.store.directory); assert.deepEqual(await restart.appendWork(f.scope.id, o.value.id, payload, requestId), saved);
  assert.equal((await restart.reconstruct(f.scope.id, o.value.id)).handoffs.length, 1); assert.deepEqual(await restart.observation(f.scope.id, o.value.id), o);
  await assert.rejects(restart.appendWork(f.scope.id, o.value.id, { ...payload, text: 'different' }, requestId), /WORK_KEY_REUSED/);
  await assert.rejects(restart.appendWork(f.scope.id, o.value.id, { kind: 'analysis-failed', itemId: item.id, runId: randomUUID(), error: 'not a run' }, randomUUID()), /INVALID_WORK_REFERENCE/);
});

test('historical evidence refuses sensitive paths, symlink blobs and oversized text without reading link targets', async () => {
  const f = await fixture(); await writeFile(join(f.repo, 'base.txt'), 'base'); f.commit('base'); await f.store.observe(f.scope.id);
  const outside = join(f.root, 'outside.txt'); await writeFile(outside, 'synthetic outside body');
  await symlink(outside, join(f.repo, 'linked.txt')); await writeFile(join(f.repo, '.env'), 'SYNTHETIC_SECRET=fixture'); await writeFile(join(f.repo, 'large.txt'), 'x'.repeat(300000));
  const sha = f.commit('fixture boundaries'), o = await f.store.observe(f.scope.id), items = await f.store.items(f.scope.id, o.value.id);
  for (const [path, expected] of [['.env', /INVALID_COMMIT_SELECTION/], ['linked.txt', /TEXT_DIFF_RESTRICTED/], ['large.txt', /FILE_SIZE_LIMIT/]] as const) {
    const item = items.find(i => i.path === path)!; await assert.rejects(f.store.commitDiff(f.scope.id, o.value.id, item.id, sha), expected);
  }
});
