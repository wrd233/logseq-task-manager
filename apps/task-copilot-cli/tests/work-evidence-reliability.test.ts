import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir, rename, symlink, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EvidenceStore } from '../src/work-evidence/store.ts';
import { digest } from '../src/work-evidence/git.ts';
const output = fileURLToPath(new URL('../../../tmp/work-evidence/reliability-tests', import.meta.url));
async function fixture() {
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(join(output, 'storage-')), store = new EvidenceStore(join(root, 'state'));
  const scopes = [];
  for (const name of ['a', 'b']) {
    const directory = join(root, name); await mkdir(directory);
    execFileSync('git', ['init', '-q'], { cwd: directory }); await writeFile(join(directory, 'work.txt'), name);
    scopes.push(await store.select(directory));
  }
  return { root, store, a: scopes[0]!, b: scopes[1]! };
}
const observationName = (scopeId: string, observationId: string) => `observation-${scopeId}-${observationId}.json`;
test('a corrupt observation is isolated, valid history stays immutable, and another directory still compares and observes', async () => {
  const f = await fixture(), first = await f.store.observe(f.a.id), intact = await f.store.observe(f.a.id), other = await f.store.observe(f.b.id);
  const intactName = join(f.store.directory, observationName(f.a.id, intact.value.id)), before = await readFile(intactName);
  await writeFile(join(f.store.directory, observationName(f.a.id, first.value.id)), '{');
  const a = await f.store.historyReport(f.a.id), b = await f.store.historyReport(f.b.id);
  assert.equal(a.complete, false); assert.equal(a.problems.length, 1); assert.deepEqual(a.items.map(item => item.hash), [intact.hash]);
  assert.equal(b.complete, true); assert.deepEqual(b.items.map(item => item.hash), [other.hash]);
  const nextA = await f.store.observe(f.a.id), nextB = await f.store.observe(f.b.id);
  assert.equal(nextA.value.historyIncomplete, true); assert.equal(nextA.value.comparison.new.length, 0); assert.equal(nextA.value.comparison.uncertain.length, 1);
  assert.equal(nextB.value.historyIncomplete, undefined); assert.equal(nextB.value.comparison.existing.length, 1);
  assert.deepEqual(await readFile(intactName), before); assert.equal((await new EvidenceStore(f.store.directory).historyReport(f.b.id)).complete, true);
});
test('corrupt supplements, scope records, valid-hash invalid shapes and symlink records cannot poison another directory', async () => {
  const f = await fixture(), a = await f.store.observe(f.a.id), b = await f.store.observe(f.b.id);
  const note = await f.store.note(f.a.id, a.value.id, 'intent', randomUUID());
  await writeFile(join(f.store.directory, `note-${f.a.id}-${a.value.id}-${note.value.id}.json`), '{');
  assert.equal((await f.store.notesReport(f.a.id, a.value.id)).complete, false);
  assert.equal((await f.store.notesReport(f.b.id, b.value.id)).complete, true);
  assert.match(await f.store.quote(f.a.id, a.value.id, ['work.txt']), /"supplementsComplete": false/);
  const malformed = { ...a.value, id: randomUUID(), files: null };
  await writeFile(join(f.store.directory, observationName(f.a.id, malformed.id)), JSON.stringify({ value: malformed, hash: digest(JSON.stringify(malformed)) }), { mode: 0o600 });
  const outside = join(f.root, 'outside.json'); await writeFile(outside, 'must not be read');
  await symlink(outside, join(f.store.directory, observationName(f.a.id, randomUUID())));
  assert.equal((await f.store.historyReport(f.a.id)).problems.length, 2);
  assert.equal((await f.store.historyReport(f.b.id)).complete, true);
  await writeFile(join(f.store.directory, `scope-${f.a.id}.json`), '{');
  const scopes = await f.store.scopesReport(); assert.equal(scopes.problems.length, 1); assert.deepEqual(scopes.items.map(item => item.value.id), [f.b.id]);
  assert.equal((await f.store.select(f.b.directory)).id, f.b.id); assert.equal((await f.store.observe(f.b.id)).value.state, 'changes');
  assert.equal(await readFile(outside, 'utf8'), 'must not be read');
});
test('immutable v1 flat records still read back; unknown-owner corruption is explicit and does not block observations', async () => {
  const f = await fixture(), a = await f.store.observe(f.a.id), b = await f.store.observe(f.b.id);
  const note = await f.store.note(f.a.id, a.value.id, 'legacy note');
  await rename(join(f.store.directory, observationName(f.a.id, a.value.id)), join(f.store.directory, `observation-${a.value.id}.json`));
  await rename(join(f.store.directory, `note-${f.a.id}-${a.value.id}-${note.value.id}.json`), join(f.store.directory, `note-${note.value.id}.json`));
  const restarted = new EvidenceStore(f.store.directory);
  assert.deepEqual(await restarted.observation(f.a.id, a.value.id), a); assert.deepEqual((await restarted.notes(f.a.id, a.value.id))[0], note);
  await writeFile(join(f.store.directory, `observation-${a.value.id}.json`), '{');
  const report = await restarted.historyReport(f.b.id);
  assert.equal(report.complete, false); assert.equal(report.problems[0]?.scope, 'legacy-owner-unknown'); assert.equal(report.items[0]?.hash, b.hash);
  const next = await restarted.observe(f.b.id); assert.equal(next.value.state, 'changes'); assert.equal(next.value.historyIncomplete, true);
});
test('same supplement request replays the exact receipt after restart, races deduplicate, and changed payloads conflict', async () => {
  const f = await fixture(), o = await f.store.observe(f.a.id), requestId = randomUUID();
  const [one, two] = await Promise.all([f.store.note(f.a.id, o.value.id, 'intent', requestId), f.store.note(f.a.id, o.value.id, 'intent', requestId)]);
  assert.deepEqual(one, two);
  const restarted = new EvidenceStore(f.store.directory); assert.deepEqual(await restarted.note(f.a.id, o.value.id, 'intent', requestId), one);
  assert.equal((await restarted.notes(f.a.id, o.value.id)).length, 1);
  await assert.rejects(restarted.note(f.a.id, o.value.id, 'different intent', requestId), /NOTE_KEY_REUSED/);
  assert.equal((await restarted.notes(f.a.id, o.value.id)).length, 1);
});
test('storage rejects every existing symlink prefix before mkdir, without creating outside or inside target directories', async () => {
  await mkdir(output, { recursive: true }); const root = await mkdtemp(join(output, 'paths-'));
  const outside = join(root, 'outside'), inside = join(root, 'inside'); await mkdir(outside); await mkdir(inside);
  await writeFile(join(outside, 'sentinel'), 'unchanged');
  for (const [name, target] of [['external-link', outside], ['internal-link', inside], ['dangling-link', join(root, 'missing-target')]]) {
    const link = join(root, name!); await symlink(target!, link);
    await assert.rejects(new EvidenceStore(join(link, 'must-not-create', 'state')).init());
    assert.equal(await lstat(join(target!, 'must-not-create')).then(() => true, () => false), false);
  }
  assert.deepEqual(await readdir(outside), ['sentinel']); assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'unchanged');
  const unsafe = join(root, 'unsafe'); await mkdir(unsafe); await chmod(unsafe, 0o755);
  await assert.rejects(new EvidenceStore(unsafe).init(), /STATE_DIRECTORY_RESTRICTED/); assert.equal((await lstat(unsafe)).mode & 0o777, 0o755);
  const good = join(root, 'new', 'private', 'state'); await new EvidenceStore(good).init(); assert.equal((await lstat(good)).mode & 0o777, 0o700);
});
