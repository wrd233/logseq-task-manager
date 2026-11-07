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

test('native reader insertion keeps source identity and never replaces the captured draft span', () => {
  let inserted;
  const result = insertReaderReferences({ captureInsertion: () => ({ start: 2, end: 6, draftRev: 4 }), insertText(text, span) {
    inserted = { text, span };
    return span.start === 6 && span.end === 6 && span.draftRev === 4;
  } }, [{ sourceId: 'source-1', contentVersion: 'version-1', workRef: { kind: 'logseq', graphId: 'g', rootUuid: 'r' }, range: { start: 0, end: 4 }, excerpt: '引用正文' }]);
  assert.equal(result, true);
  assert.match(inserted.text, /Logseq 引用 · 选段 · contentVersion version-1/);
  assert.match(inserted.text, /> 引用正文/);
  assert.match(inserted.text, /"sourceId":"source-1"/);
  assert.deepEqual(inserted.span, { start: 6, end: 6, draftRev: 4 });
});
