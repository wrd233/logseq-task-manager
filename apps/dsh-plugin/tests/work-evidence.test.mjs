import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { collectGit } from '../src/work-evidence/git.mjs';
import { EvidenceService } from '../src/work-evidence/service.mjs';
import { ProjectRecords } from '../src/project-records.mjs';
import { hostModel } from '../src/work-evidence/model.mjs';
import { snapshot, sha256, sourceId } from '../../logseq-plugin/src/workspace/source-protocol.ts';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-rebuild-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'work'); await mkdir(directory);
  git(directory, 'init'); git(directory, 'config', 'user.name', 'Work Evidence test'); git(directory, 'config', 'user.email', 'evidence@example.invalid');
  const store = new ProjectRecords(join(root, 'state'));
  const workbench = { generations: new Map(), status: async () => ({ cwd: directory }) };
  const service = new EvidenceService({ store, workbench, model: hostModel({}) });
  const sync = () => service.sync('s', { requestId: randomUUID() });
  return { root, directory, store, workbench, service, sync };
}
async function idle(service) { for (let n = 0; n < 100 && service.jobs.size; n++) await delay(10); assert.equal(service.jobs.size, 0); }

test('real Git: initial dirty/unborn baseline; commits, reverted work, rename, staged/unstaged and saved Diff', async t => {
  const f = await fixture(t), dir = f.directory;
  await writeFile(join(dir, '已有.txt'), 'old before baseline\n');
  const first = await f.sync();
  assert.equal(first.git.head, null); assert.equal(first.git.baseline, true); assert.deepEqual(first.git.items, []);
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'first after baseline');
  await writeFile(join(dir, '已有.txt'), 'temporary\n'); git(dir, 'commit', '-am', 'experiment');
  await writeFile(join(dir, '已有.txt'), 'old before baseline\n'); git(dir, 'commit', '-am', 'revert experiment');
  git(dir, 'mv', '已有.txt', '改名.txt'); git(dir, 'commit', '-m', 'rename');
  await writeFile(join(dir, '改名.txt'), 'staged content\n'); git(dir, 'add', '.');
  await writeFile(join(dir, '改名.txt'), 'working content\n'); await writeFile(join(dir, 'new.txt'), 'untracked content\n');
  await writeFile(join(dir, '.env'), 'PASSWORD=must-not-be-retained');
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'do-not-retain-this-test-value' }));
  await symlink('/etc/passwd', join(dir, 'link.txt'));
  const synced = await f.sync(), file = synced.git.items.find(i => i.path === '改名.txt');
  assert.equal(synced.git.commits.length, 4); assert.ok(file);
  assert.ok(file.aliases.includes('已有.txt'));
  assert.equal(synced.git.items.filter(i => ['已有.txt', '改名.txt'].includes(i.path)).length, 1);
  assert.ok(file.parts.some(p => p.text.includes('temporary')));
  assert.match(file.parts.find(p => p.kind === 'staged').text, /staged content/);
  assert.match(file.parts.find(p => p.kind === 'unstaged').text, /working content/);
  assert.match(synced.git.items.find(i => i.path === 'new.txt').parts[0].text, /untracked content/);
  assert.equal(synced.git.items.find(i => i.path === 'link.txt').parts[0].state, 'restricted');
  assert.doesNotMatch(JSON.stringify(synced), /must-not-be-retained/);
  assert.doesNotMatch(JSON.stringify(synced), /do-not-retain-this-test-value/);
  await writeFile(join(dir, '改名.txt'), 'later edits\n');
  assert.match((await f.service.view('s', { syncId: synced.id })).items.find(i => i.id === file.id).parts.find(p => p.kind === 'unstaged').text, /working content/);
  const third = await f.sync();
  assert.equal(third.git.commits.length, 0); assert.equal(third.git.items.find(i => i.path === 'new.txt').changed, false);
  await rm(join(dir, '改名.txt'));
  const deletion = await f.sync(); assert.ok(deletion.git.items.find(i => i.path === '改名.txt').code.includes('D'));
});

test('nested directory stays scoped; divergent history fails without advancing baseline and explicit restart preserves records', async t => {
  const f = await fixture(t), dir = f.directory;
  await mkdir(join(dir, 'sub')); await writeFile(join(dir, 'sub/a.txt'), 'a\n'); await writeFile(join(dir, 'outside.txt'), 'outside\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'initial');
  const before = await collectGit(join(dir, 'sub'));
  await writeFile(join(dir, 'outside.txt'), 'outside new\n'); await writeFile(join(dir, 'sub/a.txt'), 'inside\n'); git(dir, 'commit', '-am', 'both');
  const after = await collectGit(join(dir, 'sub'), before);
  assert.deepEqual(after.items.map(i => i.path), ['a.txt']); assert.doesNotMatch(JSON.stringify(after), /outside new/);
  const first = await f.sync();
  git(dir, 'checkout', '--orphan', 'unrelated'); git(dir, 'commit', '-am', 'different root');
  await assert.rejects(f.sync(), /EVIDENCE_HISTORY_DIVERGED/);
  assert.equal((await f.service.view('s')).sync.id, first.id);
  const next = await f.service.sync('s', { requestId: 'restart', resetBaseline: true });
  assert.equal(next.git.baseline, true); assert.equal(next.previousId, first.id);
  assert.equal((await f.service.sync('s', { requestId: 'restart', resetBaseline: true })).id, next.id);
});

test('local explanation, grouping, clarification versions, skip, restart and handoff revision protection', async t => {
  const f = await fixture(t), dir = f.directory;
  await f.sync(); await writeFile(join(dir, 'a.txt'), 'a'); await writeFile(join(dir, 'b.txt'), 'b');
  const sync = await f.sync(), [a, b] = sync.git.items;
  const calls = [];
  f.service.model = async (phase, packet) => {
    calls.push({ phase, packet });
    return { model: { provider: 'explicit-test-double', model: 'scripted' }, value: phase === 'file' ? {
      explanation: packet.clarification?.text || '观察到新增文本；目的仍待确认。', purpose: '文本整理', question: packet.clarification ? null : '这次希望解决什么问题？', uncertainties: ['未运行验证'], evidenceRefs: [packet.evidence[0].ref],
    } : { groups: [{ title: '文本整理', itemIds: packet.files.map(f => f.id) }] } };
  };
  await f.service.analyze('s', { syncId: sync.id, requestId: 'analyze', itemIds: [a.id, b.id] }); await idle(f.service);
  const before = await f.service.view('s'), bVersion = before.items.find(i => i.id === b.id).analysis.id;
  assert.equal(before.items[0].status, 'question'); assert.equal(before.groups.length, 1);
  let answer = await f.service.clarify('s', { syncId: sync.id, itemId: a.id, text: '只整理说明，尚未测试', skipped: false, requestId: 'answer', expectedId: null });
  assert.equal((await f.service.view('s')).items[0].status, 'stale');
  await assert.rejects(f.service.clarify('s', { syncId: sync.id, itemId: a.id, text: 'old editor', skipped: false, requestId: 'conflict', expectedId: null }), /EDIT_CONFLICT/);
  answer = await f.service.clarify('s', { syncId: sync.id, itemId: a.id, question: '请只核对演示文本的三种来源', text: answer.text, skipped: false, requestId: 'edit-question', expectedId: answer.id });
  assert.equal(answer.question, '请只核对演示文本的三种来源');
  await f.service.analyze('s', { syncId: sync.id, requestId: 'again', itemIds: [a.id] }); await idle(f.service);
  assert.equal((await f.service.view('s')).items.find(i => i.id === b.id).analysis.id, bVersion);
  assert.equal(calls.filter(c => c.phase === 'file' && c.packet.file.path === b.path).length, 1);
  await f.service.clarify('s', { syncId: sync.id, itemId: b.id, text: '部分检查尚未进行', skipped: true, requestId: 'skip', expectedId: null });
  assert.equal((await f.service.view('s')).items.find(i => i.id === b.id).status, 'skipped');
  const draft = await f.service.handoff('s', { syncId: sync.id }); assert.match(draft.text, /未执行验证/); assert.match(draft.text, /跳过/);
  assert.match(draft.text, /部分检查尚未进行/);
  const saved = await f.service.save('s', { syncId: sync.id, text: draft.text, requestId: 'save' });
  assert.equal((await f.service.save('s', { syncId: sync.id, text: draft.text, requestId: 'save' })).id, saved.id);
  assert.equal((await f.service.save('s', { syncId: sync.id, text: draft.text, requestId: 'receipt-lost-retry' })).id, saved.id);
  const second = await f.service.save('s', { syncId: sync.id, text: draft.text + '\n补充检查结果', parent: saved.id, requestId: 'revise' });
  await assert.rejects(f.service.save('s', { syncId: sync.id, text: 'stale overwrite', parent: saved.id, requestId: 'stale' }), /EDIT_CONFLICT/);
  const reopened = new EvidenceService({ store: new ProjectRecords(f.store.directory), workbench: f.workbench, model: hostModel({}) });
  assert.equal((await reopened.readHandoff('s', { id: saved.id })).text, draft.text);
  assert.match((await reopened.quote('s', { id: second.id })).text, /补充检查结果/);
  assert.equal((await reopened.view('s')).items[0].clarification.id, answer.id);
  await reopened.analyze('s', { syncId: sync.id, requestId: 'no-model', itemIds: [a.id] }); await idle(reopened);
  const failed = (await reopened.view('s')).items.find(i => i.id === a.id); assert.equal(failed.status, 'failed'); assert.equal(failed.error, 'EVIDENCE_MODEL_NOT_CONFIGURED'); assert.ok(failed.analysis);
});

test('validated real-shape block snapshots: node/content/order/ancestor depth, scope isolation and invalid-version refusal', async t => {
  const f = await fixture(t), scope = { graphId: 'test-graph', rootUuid: 'root' }, binding = { directory: f.directory, scope, workspaceId: 'work' };
  let source;
  const blocks = async rows => Promise.all(rows.map(async ([id, content, parentUuid, order, depth]) => ({ sourceId: sourceId(scope.graphId, id), target: { kind: 'logseq-block', graphId: scope.graphId, blockUuid: id }, content, contentVersion: await sha256(content), parentUuid, order, depth, availability: 'available' })));
  const commands = [];
  f.workbench.status = async () => ({ binding });
  f.workbench.command = async (_id, command) => { commands.push(command); assert.equal(command, 'content.read'); return source; };
  source = await snapshot(scope, await blocks([['root', 'Root', null, 0, 0], ['a', 'A', 'root', 0, 1], ['child', 'Child', 'a', 0, 2], ['b', 'B', 'root', 1, 1], ['gone', 'Gone', 'root', 2, 1]]));
  const first = await f.sync(); assert.equal((await f.service.structure('s', { syncId: first.id })).state, 'baseline');
  source = await snapshot(scope, await blocks([['root', 'Root', null, 0, 0], ['b', 'B', 'root', 0, 1], ['a', 'A updated', 'b', 0, 2], ['child', 'Child', 'a', 0, 3], ['new', 'New', 'root', 1, 1]]));
  const second = await f.sync(), diff = await f.service.structure('s', { syncId: second.id });
  assert.equal(diff.state, 'comparable');
  assert.ok(diff.changes.find(c => c.id === sourceId(scope.graphId, 'child')).kinds.includes('深度'));
  assert.ok(diff.changes.find(c => c.id === sourceId(scope.graphId, 'a')).kinds.includes('正文'));
  assert.ok(diff.changes.find(c => c.id === sourceId(scope.graphId, 'gone')).kinds.includes('删除'));
  assert.ok(diff.changes.find(c => c.id === sourceId(scope.graphId, 'new')).kinds.includes('新增'));
  const stored = await readFile(join(f.store.folder(f.directory), second.id + '.json'), 'utf8');
  source = { ...source, sourceSetVersion: 'invalid' };
  const third = await f.sync(); assert.equal((await f.service.structure('s', { syncId: third.id })).state, 'unavailable');
  assert.equal(await readFile(join(f.store.folder(f.directory), second.id + '.json'), 'utf8'), stored);
  binding.scope = { graphId: 'other-graph', rootUuid: 'root' };
  await assert.rejects(f.service.source('s', { syncId: second.id, nodeId: diff.changes[0].id }), /BINDING_CHANGED/);
  assert.ok(commands.every(c => c === 'content.read'));
});

test('host model uses actual stream protocol and refuses invented evidence references', async () => {
  let received;
  const ctx = { agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model' }) }, llm: { async *stream(input) { received = input;
    yield { type: 'text-delta', text: JSON.stringify({ explanation: '变化解释', purpose: '整理', question: null, uncertainties: [], evidenceRefs: ['invented'] }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } } };
  await assert.rejects(hostModel(ctx)('file', { evidence: [{ ref: 'real' }] }), /MODEL_OUTPUT/);
  assert.equal(received.messages[0].role, 'user'); assert.equal(received.tools, undefined);
  await assert.rejects(hostModel({})('file', { evidence: [] }), /NOT_CONFIGURED/);
});
