import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { snapshot, sha256, sourceId } from '../../logseq-plugin/src/workspace/source-protocol.ts';
import { createDshHandoff, browserDescriptor, claimDshBrowserOffer } from '../../task-copilot-cli/src/dsh-handoff.ts';
import { atomicJson } from '../../task-copilot-cli/src/workspace-files.ts';
import { readerModel, readerReferences } from '../src/reader-model.mjs';
import { changeReaderSelection, insertReaderReferences } from '../src/reader-draft.mjs';
import { currentStructure } from '../src/current-structure.mjs';
import { PlannerStore } from '../src/planner-store.mjs';
import { currentPlanning } from '../src/planner-model.mjs';
import process from 'node:process';

const graphId = 'demo:/graph', scope = {graphId, rootUuid: 'root'};
const workRef = {kind: 'kernel', objectId: 'project'};
const block = async (blockUuid, parentUuid, depth, order, content) => ({
  sourceId: sourceId(graphId, blockUuid), target: {kind: 'logseq-block', graphId, blockUuid}, parentUuid, depth, order,
  content, contentVersion: await sha256(content), availability: 'available',
});

test('Reader preserves topology, parses Logseq and Markdown, and inserts scoped references after the native selection', async () => {
  const blocks = await Promise.all([block('root', null, 0, 0, '[Project] Demo'),
    block('child', 'root', 1, 0, 'DOING [待确认] **标题** *正文* [[链接]]\nid:: hidden\nowner:: Team\n\n- Item\n\n```text\nid:: code\n```'),
    block('child-2', 'root', 1, 1, '[其他] 自定义')]);
  const reader = readerModel(await snapshot(scope, blocks), workRef);
  const [, node, sibling] = reader.nodes;
  assert.equal(node.parentUuid, 'root');
  assert.equal(node.depth, 1);
  assert.equal(sibling.order, 1);
  assert.equal(sibling.body.markdown, '[其他] 自定义');
  assert.equal(node.body.status, 'DOING');
  assert.deepEqual(node.body.semantic, {kind: 'pending', label: '待确认'});
  assert.deepEqual(node.body.properties, [{name: 'owner', value: 'Team'}]);
  assert.doesNotMatch(node.body.markdown, /hidden/);
  assert.match(node.body.markdown, /id:: code/);
  assert.deepEqual(node.body.tokens.filter(t => t.type !== 'space').map(t => t.type), ['paragraph', 'list', 'code']);
  assert.ok(node.body.tokens[0].tokens.some(t => t.type === 'logseqPage' && t.page === '链接'));

  const select = value => ({sourceId: value.sourceId, contentVersion: value.contentVersion});
  const selections = [select(sibling), {...select(node), range: {start: 2, end: 4}}];
  const refs = readerReferences(reader, changeReaderSelection(selections, 'move', 1, 0));
  assert.equal(refs[0].excerpt, '标题');
  assert.equal(refs[0].graphId, graphId);
  assert.deepEqual(refs[0].workRef, workRef);
  assert.equal(refs[1].contentVersion, sibling.contentVersion);
  assert.equal(changeReaderSelection(refs, 'remove', 0).length, 1);
  assert.throws(() => readerReferences(reader, [{...select(node), contentVersion: 'old'}]), {code: 'REFERENCE_SOURCE_CHANGED'});
  assert.throws(() => readerReferences(reader, [{...select(node), sourceId: sourceId('another graph', 'child')}]), {code: 'SOURCE_OUTSIDE_SCOPE'});
  let inserted;
  assert.equal(insertReaderReferences({captureInsertion: () => ({start: 1, end: 9, revision: 4}), insertText(text, span) {
    inserted = text;
    assert.deepEqual(span, {start: 9, end: 9, revision: 4});
    return true;
  }}, refs), true);
  assert.match(inserted, /Logseq 引用.*contentVersion/);
});

test('current structure hides ordinary intermediates and follows saved object moves and deletions', async () => {
  const root = await block('root', null, 0, 0, '[Project] Demo');
  const group = await block('group', 'root', 1, 0, '普通正文');
  const child = await block('child', 'group', 2, 0, 'TODO 安装');
  const note = await block('note', 'child', 3, 0, '叶子内容');
  const original = await snapshot(scope, [root, group, child, note]);
  const objects = [{blockUuid: 'root', kind: 'PROJECT', title: 'Demo', workRef}];
  const parent = currentStructure(original, workRef, objects);
  assert.deepEqual(parent.content, []);
  assert.deepEqual(parent.children.map(item => [item.uuid, item.parentUuid, item.sourceParentUuid]), [['child', 'root', 'group']]);
  const leaf = currentStructure(original, workRef, objects, 'child');
  assert.deepEqual(leaf.path.map(item => item.uuid), ['root', 'child']);
  assert.deepEqual(leaf.content.map(item => item.body.markdown), ['安装', '叶子内容']);

  const next = await snapshot(scope, [root, group, {...child, parentUuid: 'root', depth: 1, order: 1}, {...note, depth: 2}]);
  assert.notEqual(next.structureVersion, original.structureVersion);
  assert.equal(currentStructure(next, workRef, objects, 'child').root.sourceParentUuid, 'root');
  assert.equal(leaf.root.sourceParentUuid, 'group');
  assert.throws(() => currentStructure({...next, blocks: [root, group]}, workRef, objects, 'child'), {code: 'STRUCTURE_FOCUS_MISSING'});
});

test('fixed timing survives storage, blocks drag, and resolves independently of semantic slots', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'planner-fixed-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const store = new PlannerStore(directory);
  await store.load();
  const state = await store.change({revision: 0, action: 'save', entry: {title: '会议', schedule: 'fixed',
    startAt: '2026-11-07T14:00', endAt: '2026-11-07T15:00', dueAt: '2026-11-08T18:00', plannedMinutes: 25, actualMinutes: 12}});
  const [entry] = state.entries;
  assert.equal(entry.slotId, null);
  assert.equal(entry.plannedMinutes, 25);
  assert.equal(entry.actualMinutes, 12);
  assert.equal(entry.dueAt, '2026-11-08T18:00');
  assert.equal(currentPlanning(state, '2026-11-07T14:00').slot.id, 'slot-afternoon');
  assert.deepEqual(currentPlanning(state, '2026-11-07T14:00').fixed, [entry]);
  assert.deepEqual(currentPlanning(state, '2026-11-07T15:00').fixed, []);
  assert.equal(currentPlanning(state, '2026-11-07T16:30').slot, null);
  await assert.rejects(store.change({revision: 1, action: 'move', id: entry.id}), {code: 'PLANNER_FIXED_EDIT_REQUIRED'});
  const edited = await store.change({revision: 1, action: 'save', entry: {...entry, startAt: '2026-11-07T14:30'}});
  const reopened = new PlannerStore(directory);
  await reopened.load();
  assert.deepEqual(reopened.read().entries, edited.entries);
});

test('one existing DSH browser claims a continue offer, while explicit new-tab navigation returns the ticket URL', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'browser-offer-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  await atomicJson(browserDescriptor(directory), {url: 'http://127.0.0.1:3088/', pid: process.pid});
  const input = {mode: 'continue', title: 'Demo', workRef, entry: {directory, instanceId: 'i', connectionId: 'c',
    binding: {directory, scope, organization: 'flat', provider: 'workspace', workspaceId: 'w'}}};
  const pending = createDshHandoff(directory, input);
  let claims = [];
  for (let i = 0; i < 50 && !claims.length; i++) {
    await delay(20);
    claims = (await Promise.all([claimDshBrowserOffer(directory), claimDshBrowserOffer(directory)])).filter(Boolean);
  }
  const result = await pending;
  assert.deepEqual(claims, [result.ticket]);
  assert.equal(result.url, null);
  assert.match((await createDshHandoff(directory, input, true)).url, /#logseq-work=/);
  assert.equal(await claimDshBrowserOffer(directory), null);
});
