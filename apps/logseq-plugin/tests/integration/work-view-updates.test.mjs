import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { deferred, fixture } from '../fixtures/work-view.mjs';

const row = (f, uuid) => f.browser.document.querySelector(`.wb-row[data-uuid="${uuid}"]`);
const op = (work, type, fields = {}) => { const { graph, root, seq } = work.snapshot(); return work.apply({ graph, root, expectedSeq: seq, type, ...fields }); };

test('real public and UI entrances share versions, safe snapshots, no-op handling and retained DOM', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); const initial = f.work.snapshot(), nodes = initial.blocks.map(block => row(f, block.uuid));
    initial.blocks[0].content = 'injected'; initial.view.items[0].depth = 100; initial.presentation.reverse(); initial.view.overrides.b0 = 'quiet';
    assert.equal(f.work.snapshot().blocks[0].content, f.root.content); assert.equal(f.work.snapshot().view.items[0].depth, 0);
    const seq = f.work.snapshot().seq;
    await f.work.refresh(); await f.tick(); assert.equal(f.work.snapshot().seq, seq);
    assert.equal(op(f.work, 'display', { uuid: 'b0', level: 'auto' }).ok, true); assert.equal(f.work.snapshot().seq, seq);
    const select = row(f, 'b0').querySelector('select'); select.focus(); select.value = 'quiet'; select.dispatchEvent(new f.browser.Event('change'));
    assert.equal(f.work.snapshot().seq, seq + 1); assert.equal(f.work.snapshot().view.overrides.b0, 'quiet'); assert.equal(f.browser.document.activeElement, select);
    assert.deepEqual(f.work.apply({ graph: initial.graph, root: initial.root, expectedSeq: seq, type: 'focus', uuid: 'b0' }), { ok: false, reason: 'stale-view' });
    const result = op(f.work, 'focus', { uuid: 'b0' }); result.state.items[0].uuid = 'injected'; result.state.overrides.b0 = 'emphasis';
    assert.equal(f.work.snapshot().view.items[0].uuid, 'root'); assert.equal(f.work.snapshot().view.overrides.b0, 'quiet');
    const before = f.work.snapshot().seq; op(f.work, 'focus', { uuid: 'b0' }); assert.equal(f.work.snapshot().seq, before);
    f.resetCounts(); f.content('b1', 'one changed body'); await delay(70);
    assert.equal(f.stats.tree, 0); assert.equal(f.stats.articles, 0); assert.equal(row(f, 'b1').querySelector('.wb-body').textContent.trim(), 'one changed body');
    assert.deepEqual(initial.blocks.map(block => row(f, block.uuid)), nodes); assert.equal(f.browser.document.activeElement, select);
    await f.work.open('root'); assert.equal(f.work.snapshot().seq, before + 1); // reopening the same scope adds no version
    assert.equal(op(f.work, 'reorder', { uuid: 'root', target: 'b0' }).reason, 'root-not-movable');
  } finally { await f.close(); }
});

test('300-node content, presentation, raw and keyboard changes parse only changed bodies and preserve controls', async () => {
  const f = await fixture(undefined, 300);
  const { marked } = await import('../../src/features/work-view/vendor/marked.js');
  const { default: purifier } = await import('dompurify');
  const parse = marked.parse, sanitize = purifier.sanitize; let parsed = 0, sanitized = 0;
  marked.parse = (...args) => { parsed++; return parse(...args); };
  purifier.sanitize = (...args) => { sanitized++; return sanitize(...args); };
  try {
    await f.work.open('root'); assert.equal(parsed, 300); assert.equal(sanitized, 300);
    parsed = 0; sanitized = 0; f.resetCounts();
    const b0 = row(f, 'b0'), b1 = row(f, 'b1');
    op(f.work, 'display', { uuid: 'b0', level: 'compact' }); op(f.work, 'focus', { uuid: 'b1' });
    op(f.work, 'reorder', { uuid: 'b1', target: 'b0', mode: 'after' });
    const full = [...b0.querySelectorAll('button')].find(button => button.textContent === '全文 / 收起'); full.click();
    const raw = [...b0.querySelectorAll('button')].find(button => button.textContent === '查看 Markdown 原文'); raw.click();
    assert.equal(b0.querySelector('pre').textContent, '**条目 0**'); assert.equal(b0.querySelector('.wb-body').classList.contains('expanded'), true);
    b1.focus(); b1.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(f.work.snapshot().view.items.find(item => item.uuid === 'b1').depth, 2); assert.equal(f.browser.document.activeElement, b1);
    b1.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(f.work.snapshot().view.items.find(item => item.uuid === 'b1').depth, 1);
    assert.equal(parsed, 0); assert.equal(sanitized, 0); assert.equal(f.stats.articles, 0); assert.equal(f.stats.tree, 0);
    f.content('b100', '<img src=x onerror=bad()>\n**new**'); await delay(70);
    assert.equal(parsed, 1); assert.equal(sanitized, 1); assert.equal(f.stats.articles, 0);
    assert.equal(row(f, 'b100').querySelector('img,script'), null); assert.ok(row(f, 'b100').textContent.includes('new'));
    op(f.work, 'collapse', { uuid: 'root' }); assert.equal(b1.hidden, true); op(f.work, 'collapse', { uuid: 'root', collapsed: false });
    assert.equal(row(f, 'b1'), b1); assert.equal(b1.hidden, false); assert.equal(parsed, 1);
  } finally { marked.parse = parse; purifier.sanitize = sanitize; await f.close(); }
});

test('compact row actions remain discoverable, source updates retain their focus, Escape closes locally and indent has a button path', async () => {
  const f = await fixture();
  try {
    await f.work.open('root');
    const first = row(f, 'b1'), menu = first.querySelector('.wb-row-menu'), summary = menu.querySelector('summary');
    assert.equal(summary.getAttribute('aria-label'), '条目操作'); assert.equal(menu.open, false); assert.equal(first.tabIndex, -1);
    assert.equal(first.querySelector('[aria-label="折叠子项"]').disabled, true);
    assert.equal(first.querySelector('[aria-label="折叠子项"]').style.visibility, 'hidden');
    menu.open = true; const select = menu.querySelector('select'); select.focus();
    f.content('b1', '来源更新后仍可调整显示'); await delay(70);
    assert.equal(first.querySelector('.wb-row-menu'), menu); assert.equal(menu.open, true); assert.equal(f.browser.document.activeElement, select);
    const indent = [...menu.querySelectorAll('button')].find(b => b.textContent === '增加视图缩进'); indent.click();
    assert.equal(f.work.snapshot().view.items.find(item => item.uuid === 'b1').depth, 2);
    select.dispatchEvent(new f.browser.KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(menu.open, false); assert.equal(f.browser.document.activeElement, summary);
    const tab = new f.browser.KeyboardEvent('keydown', {key:'Tab',bubbles:true,cancelable:true}); summary.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, false);
    menu.open = true; row(f, 'b0').querySelector('.wb-body').click(); assert.equal(menu.open, false);
    assert.equal(f.blocks.get('b1').content, '来源更新后仍可调整显示');
  } finally {await f.close();}
});

test('ordinary source title updates and focused counts reflect what is actually shown', async () => {
  const f = await fixture();
  try {
    f.root.content = '**普通工作的名字**'; await f.work.open('root');
    assert.equal(f.work.panel.root.querySelector('.wb-work-title').textContent, '普通工作的名字');
    f.content('root', '**新的工作名**'); await delay(70);
    assert.equal(f.work.panel.root.querySelector('.wb-work-title').textContent, '新的工作名');
    await f.work.lensesAPI.select('b0');
    assert.match(f.work.panel.root.querySelector('.wb-status').textContent, /显示 2 \/ 3 条/);
  } finally {await f.close();}
});

test('bursts coalesce, changes during a slow read get a later batch and failures do not strand the queue', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); f.resetCounts();
    for (let i = 0; i < 20; i++) f.change({}); await delay(75); assert.equal(f.stats.tree, 1);
    const gate = deferred(), started = deferred(); let first = true;
    f.setTreeRead(async () => { if (first) { first = false; started.resolve(); return gate.promise; } return f.root; });
    const old = f.work.refresh(); await started.promise;
    f.content('b0', 'newer event'); f.change({}); const next = f.work.refresh();
    gate.resolve(globalThis.structuredClone(f.root)); await Promise.all([old, next]);
    assert.equal(f.stats.maxTree, 1); assert.equal(f.stats.tree, 3); assert.ok(row(f, 'b0').textContent.includes('newer event'));
    f.setTreeRead(async () => { throw Error('SDK offline'); }); await assert.rejects(f.work.refresh(), /SDK offline/);
    f.setTreeRead(null); await f.work.refresh(); assert.equal(f.stats.maxTree, 1);
    const tree = f.stats.tree; await f.work.panel.close(); await f.tick(); f.change({}); await delay(60); assert.equal(f.stats.tree, tree);
    await f.work.open('root'); assert.equal(f.stats.tree, tree + 1);
  } finally { await f.close(); }
});

test('new scopes do not wait for old trees and late results cannot restore a disposed or switched view', async () => {
  const f = await fixture();
  try {
    const other = { uuid: 'other', content: 'new scope', parent: { id: 'page' }, page: { id: 'page' }, children: [] }; f.blocks.set('other', other);
    const gate = deferred(), started = deferred();
    f.setTreeRead(async uuid => { if (uuid === 'root') { started.resolve(); return gate.promise; } return other; });
    const old = f.work.open('root'); await started.promise; await f.work.open('other');
    assert.equal(f.work.snapshot().root, 'other'); assert.equal(f.work.snapshot().blocks[0].content, 'new scope');
    gate.resolve(f.root); await old; assert.equal(f.work.snapshot().root, 'other'); assert.equal(row(f, 'root'), null);
    const seq = f.work.snapshot().seq; f.switchGraph('two'); assert.ok(f.work.snapshot().seq > seq);
    f.setTreeRead(null); await f.work.open('root'); assert.equal(f.work.snapshot().graph, 'two:/two');
    const delayed = deferred(), reading = deferred(); f.setTreeRead(async () => { reading.resolve(); return delayed.promise; });
    const refresh = f.work.refresh(); await reading.promise; f.work.dispose(); await refresh; delayed.resolve(f.root); await delay(10);
    assert.equal(f.browser.document.querySelectorAll('.wb-row').length, 0); assert.equal(f.work.panel.visible, false);
  } finally { await f.close(); }
});

test('draft polling does not read trees and a switched editor never applies a previous draft to another block', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); f.resetCounts(); const seq = f.work.snapshot().seq;
    f.editing('b0', '未保存草稿'); await f.tick(); assert.equal(f.stats.tree, 0); assert.equal(f.work.snapshot().draft, 'b0'); assert.ok(row(f, 'b0').textContent.includes('未保存草稿')); assert.equal(f.work.snapshot().seq, seq + 1);
    const late = deferred(), reading = deferred(); f.setDraftRead(async () => { reading.resolve(); return late.promise; });
    const ticking = f.tick(); await reading.promise; f.editing('b1', '新块内容'); late.resolve('旧块内容'); await ticking; await delay(15);
    assert.equal(f.work.snapshot().draft, null); assert.ok(!row(f, 'b1').textContent.includes('旧块内容')); assert.ok(row(f, 'b0').textContent.includes('条目 0'));
    f.setDraftRead(null); await f.tick(); assert.equal(f.work.snapshot().draft, 'b1'); assert.ok(row(f, 'b1').textContent.includes('新块内容'));
    assert.equal(f.stats.tree, 0);
  } finally { await f.close(); }
});

test('unknown topology events reconcile manual layout, retained and missing sources without losing item identity', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); const retained = row(f, 'b0');
    op(f.work, 'reorder', { uuid: 'b1', target: 'b0', mode: 'before' });
    f.root.children = [f.blocks.get('b1')]; f.change({ txData: [[1, 'block/parent', 42, 2, true]], blocks: [f.blocks.get('b0')] }); await delay(70);
    assert.equal(f.work.snapshot().blocks.find(block => block.uuid === 'b0').outside, true); assert.equal(row(f, 'b0'), retained);
    f.blocks.delete('b0'); await f.work.refresh(); assert.equal(f.work.snapshot().blocks.find(block => block.uuid === 'b0').missing, true); assert.ok(retained.textContent.includes('来源暂不可用'));
    f.blocks.set('b0', { uuid: 'b0', content: 'restored', parent: { id: 'root' }, page: { id: 'page' } }); f.root.children.push(f.blocks.get('b0'));
    await f.work.refresh(); assert.equal(row(f, 'b0'), retained); assert.ok(retained.textContent.includes('restored'));
    assert.deepEqual(f.work.snapshot().presentation.map(item => item.uuid), ['root', 'b1', 'b0']);
  } finally { await f.close(); }
});

test('pointer handlers use current UUID layout and preserve the reading anchor when an earlier body grows', async () => {
  const f = await fixture();
  try {
    await f.work.open('root');
    const root = row(f, 'root'), first = row(f, 'b0'), second = row(f, 'b1'), container = root.parentElement;
    const height = () => root.querySelector('.wb-body').textContent.includes('larger') ? 150 : 50;
    container.getBoundingClientRect = () => ({ top: 0 });
    root.getBoundingClientRect = () => ({ top: -container.scrollTop, bottom: height() - container.scrollTop });
    first.getBoundingClientRect = () => ({ top: height() - container.scrollTop, bottom: height() + 50 - container.scrollTop });
    second.getBoundingClientRect = () => ({ top: height() + 50 - container.scrollTop, bottom: height() + 100 - container.scrollTop });
    container.scrollTop = 100; f.content('root', 'larger body'); await delay(70);
    assert.equal(container.scrollTop, 200); assert.equal(second.getBoundingClientRect().top, 0);
    f.browser.document.elementFromPoint = () => second;
    const grip = first.querySelector('.wb-grip');
    grip.dispatchEvent(new f.browser.PointerEvent('pointerdown', { pointerId: 1, clientX: 0 }));
    grip.dispatchEvent(new f.browser.PointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 100 }));
    assert.deepEqual(f.work.snapshot().presentation.map(item => item.uuid), ['root', 'b1', 'b0']); assert.equal(row(f, 'b0'), first);
    first.focus(); first.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(f.work.snapshot().view.items.find(item => item.uuid === 'b0').depth, 2); assert.equal(f.browser.document.activeElement, first);
  } finally { await f.close(); }
});

test('source changes hidden by a draft still invalidate a prior public version', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); f.editing('b0', 'draft stays visible'); await f.tick(); const before = f.work.snapshot();
    f.content('b0', 'new saved source'); await delay(70);
    assert.ok(f.work.snapshot().seq > before.seq); assert.equal(f.work.snapshot().blocks.find(block => block.uuid === 'b0').content, 'draft stays visible');
    assert.equal(f.work.apply({ graph: before.graph, root: before.root, expectedSeq: before.seq, type: 'focus', uuid: 'b0' }).reason, 'stale-view');
    f.editing(false); await f.tick(); assert.equal(f.work.snapshot().blocks.find(block => block.uuid === 'b0').content, 'new saved source');
  } finally { await f.close(); }
});

test('captured Desktop body datoms accept property metadata and page timestamps but reject incomplete or structural events', async () => {
  const { contentChanges } = await import('../../src/features/work-view/source.ts');
  const body = { id: 42, uuid: 'body', content: 'updated\nid:: body', properties: {}, parent: { id: 37 } }, page = { id: 37, uuid: 'page', name: 'fixture', originalName: 'fixture' };
  const event = { blocks: [body, page], txData: [[42, 'block/properties-text-values', {}, 1, true], [42, 'block/properties', {}, 1, true], [42, 'block/properties-order', [], 1, true], [37, 'block/updated-at', 1, 1, true], [42, 'block/content', 'old', 1, false], [42, 'block/content', body.content, 1, true]] };
  assert.deepEqual([...contentChanges(event)], [['body', body.content]]);
  for (const attribute of ['block/parent', 'block/left', 'block/page', 'block/uuid', 'block/unknown']) assert.equal(contentChanges({ ...event, txData: [...event.txData, [42, attribute, 1, 1, true]] }), null);
  assert.equal(contentChanges({ ...event, blocks: [page] }), null);
  assert.equal(contentChanges({ ...event, blocks: [body, { id: 99, uuid: 'unknown' }] }), null);
  assert.equal(contentChanges({ blocks: [body] }), null);
});

test('reading anchor follows current DOM order after manual layout rather than original cache insertion order', async () => {
  const f = await fixture();
  try {
    await f.work.open('root'); op(f.work, 'reorder', { uuid: 'b1', target: 'b0', mode: 'before' });
    const root = row(f, 'root'), first = row(f, 'b1'), second = row(f, 'b0'), container = root.parentElement;
    const height = () => first.querySelector('.wb-body').textContent.includes('larger') ? 150 : 50;
    container.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
    root.getBoundingClientRect = () => ({ top: -50 - container.scrollTop, bottom: -container.scrollTop });
    first.getBoundingClientRect = () => ({ top: 0 - container.scrollTop, bottom: height() - container.scrollTop });
    second.getBoundingClientRect = () => ({ top: height() - container.scrollTop, bottom: height() + 50 - container.scrollTop });
    f.content('b1', 'larger visible first item'); await delay(70);
    assert.equal(container.scrollTop, 0); assert.equal(first.getBoundingClientRect().top, 0);
  } finally { await f.close(); }
});

test('reading anchor preserves browser scroll adjustment already applied during layout', async () => {
  const f = await fixture();
  try {
    await f.work.open('root');
    const root = row(f, 'root'), first = row(f, 'b0'), container = root.parentElement;
    let adjusted = false;
    const height = () => {
      const larger = root.querySelector('.wb-body').textContent.includes('larger');
      // A real browser may anchor the scroll while a geometry read forces layout.
      if (larger && !adjusted) { container.scrollTop += 100; adjusted = true; }
      return larger ? 200 : 100;
    };
    container.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
    root.getBoundingClientRect = () => ({ top: 0 - container.scrollTop, bottom: height() - container.scrollTop });
    first.getBoundingClientRect = () => ({ top: height() - container.scrollTop, bottom: height() + 50 - container.scrollTop });
    container.scrollTop = 100; f.content('root', 'larger body'); await delay(70);
    assert.equal(adjusted, true); assert.equal(container.scrollTop, 200); assert.equal(first.getBoundingClientRect().top, 0);
  } finally { await f.close(); }
});
