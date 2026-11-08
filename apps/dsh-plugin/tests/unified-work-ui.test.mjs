import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, mergeSelections, previewText, selectionKey } from '../src/work-experience/model.mjs';
import { workFocus } from '../src/work-experience/focus-store.mjs';
import { insertReaderReferences } from '../src/reader-draft.mjs';

const block = (blockUuid, parentUuid, order) => ({ blockUuid, parentUuid, order });

test('reader tree keeps real parents and promotes nodes whose parent is outside the slice', () => {
  const tree = buildTree([
    block('root', null, 0),
    block('child', 'root', 0),
    block('note', 'child', 0),
    block('outside-parent', 'missing', 0),
    block('second', 'root', 1),
  ]);
  assert.deepEqual(tree.roots.map(node => node.blockUuid), ['root', 'outside-parent']);
  assert.deepEqual(tree.children.get('root').map(node => node.blockUuid), ['child', 'second']);
  assert.equal(tree.depth.get('note'), 2);
});

test('a whole-block reference supersedes ranged references of the same source, and vice versa', () => {
  const ranged = { sourceId: 's', contentVersion: 'v', range: { start: 1, end: 3 }, excerpt: 'text' };
  const whole = { sourceId: 's', contentVersion: 'v', range: null, excerpt: 'whole' };
  const other = { sourceId: 't', contentVersion: 'v', range: null, excerpt: 'other' };
  const onlyWhole = mergeSelections([ranged], [whole]);
  assert.equal(onlyWhole.length, 1);
  assert.equal(selectionKey(onlyWhole[0]), 's:block');
  const stillWhole = mergeSelections([whole], [ranged]);
  assert.equal(stillWhole.length, 1);
  assert.equal(selectionKey(stillWhole[0]), 's:block');
  assert.equal(mergeSelections([whole], [other]).length, 2);
});

test('display previews remove object markers and Markdown punctuation without changing source', () => {
  assert.equal(previewText('[任务] **核对** [[网络方案]] 与 `代码`'), '核对 网络方案 与 代码');
  assert.equal(previewText('[Project] 统一工作体验验收'), '统一工作体验验收');
});

test('the Work tab receives one in-memory focus request per session without creating navigation', () => {
  const seen = [];
  const off = workFocus.subscribe(() => seen.push('changed'));
  workFocus.request('s1', 'work-a');
  assert.equal(workFocus.peek('s1'), 'work-a');
  assert.deepEqual(seen, ['changed']);
  assert.equal(workFocus.take('s1'), 'work-a');
  assert.equal(workFocus.peek('s1'), undefined);
  off();
  workFocus.dispose();
  assert.equal(seen.length, 1);
});

test('native reader chip preserves exact source identity while composer and clipboard stay readable', async () => {
  let inserted;
  const references = [{ sourceId: 'source-1', graphId: 'graph-private', blockUuid: 'block-1', contentVersion: 'version-1', workTitle: '核对方案', workRef: { kind: 'logseq', graphId: 'g', rootUuid: 'r' }, range: { start: 0, end: 4 }, excerpt: '引用正文' }];
  const result = await insertReaderReferences({ captureInsertion: () => ({ start: 2, end: 6, draftRev: 4 }) }, references, (reference, span) => {
    inserted = {reference, span}; return true;
  });
  assert.equal(result, true);
  assert.deepEqual(JSON.parse(inserted.reference.ref), references);
  assert.match(inserted.reference.label, /引用正文.*Logseq/);
  assert.match(inserted.reference.clipboardText, /> 引用正文/);
  assert.match(inserted.reference.clipboardText, /核对方案/);
  assert.doesNotMatch(inserted.reference.label + inserted.reference.clipboardText, /sourceId|graph-private|version-1|rootUuid|\{/);
  assert.deepEqual(inserted.span, {start: 6, end: 6, draftRev: 4});
});


test('work locations survive reload per native Session and clearing a missing focus leaves other work alone', async () => {
  const { readWorkFocus, saveWorkFocus } = await import('../src/work-experience/focus-store.mjs');
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  saveWorkFocus('s1', 'child-a', storage);
  saveWorkFocus('s2', 'child-b', storage);
  assert.equal(readWorkFocus('s1', storage), 'child-a');
  assert.equal(readWorkFocus('s2', storage), 'child-b');
  saveWorkFocus('s1', null, storage);
  assert.equal(readWorkFocus('s1', storage), null);
  assert.equal(readWorkFocus('s2', storage), 'child-b');
});
