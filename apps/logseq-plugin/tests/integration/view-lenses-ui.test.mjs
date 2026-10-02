import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { deferred, fixture } from '../fixtures/work-view.mjs';

const node = (f, id) => f.browser.document.querySelector('.wb-row[data-uuid="' + id + '"]');
const visible = f => [...f.browser.document.querySelectorAll('.wb-row')].filter(row => !row.hidden).map(row => row.dataset.uuid);
const operation = (f, type, fields = {}) => { const state = f.work.snapshot(); return f.work.apply({ graph: state.graph, root: state.root, expectedSeq: state.seq, type, ...fields }); };
async function settle(predicate) {
  for (let index = 0; index < 100 && !predicate(); index++) await delay(10);
  assert.ok(predicate(), 'expected asynchronous UI state');
}
async function chapters(options = {}) {
  const f = await fixture(undefined, 1, options);
  let nextId = 10;
  const make = (uuid, content, parent, children = []) => ({ id: nextId++, uuid, content, parent: { id: parent }, page: { id: 'page' }, children });
  const a = make('a', '条件：仅两台样机。\n\n但正式验收还需要重复运行。\n\n> 不能忽略重启条件。', 's1');
  const b = make('b', '备选方案，仅供比较。', 's2');
  const c = make('c', '结果：样机通过。\n反证：未覆盖重启。', 's3');
  const s1 = make('s1', '目标', 'root', [a]), s2 = make('s2', '方案', 'root', [b]), s3 = make('s3', '工作记录', 'root', [c]);
  f.root.children = [s1, s2, s3];
  for (const block of [s1, a, s2, b, s3, c]) f.blocks.set(block.uuid, block);
  await f.work.open('root');
  return f;
}
async function prepare(f, ids, question = '验证充分吗？') {
  const api = f.work.lensesAPI, request = api.request({ schemaVersion: 1, question }); assert.equal(request.ok, true);
  const source = await api.source(); assert.equal(source.ok, true);
  return selectedPlan(request.value, source.value, ids);
}
function selectedPlan(request, source, ids) {
  const needed = new Set(ids), byUuid = new Map(source.blocks.map(block => [block.target.blockUuid, block]));
  for (const id of ids) {
    let block = byUuid.get(id);
    while (block) { needed.add(block.target.blockUuid); block = byUuid.get(block.parentUuid); }
  }
  return {
    ...request, structureVersion: source.structureVersion,
    sourceVersions: source.blocks.filter(block => needed.has(block.target.blockUuid)).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion })),
    visibleRanges: source.blocks.filter(block => ids.includes(block.target.blockUuid)).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion, unit: 'block' })),
    emphasisRanges: source.blocks.filter(block => block.target.blockUuid === ids[0]).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion, unit: 'block' })),
    gaps: ['尚未找到重复运行结果'], temporaryInference: '不能据此断言完整验收通过。',
  };
}

test('actual work panel composes reversible multi-structure plans, complete blocks, unchanged source/layout and stable controls', async () => {
  const f = await chapters();
  try {
    operation(f, 'collapse', { uuid: 'root' }); operation(f, 'collapse', { uuid: 's1' });
    operation(f, 'display', { uuid: 'a', level: 'compact' });
    const stored = f.browser.localStorage.getItem('workbench:scope:' + JSON.stringify(['one:/one', 'root']));
    const original = JSON.stringify([...f.blocks]), a = node(f, 'a'), select = a.querySelector('select');
    const plan = await prepare(f, ['a', 'c']);
    assert.equal((await f.work.lensesAPI.apply(plan)).ok, true);
    assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
    assert.equal(node(f, 'a'), a); assert.equal(node(f, 'a').querySelector('select'), select);
    assert.ok(a.querySelector('.wb-body').classList.contains('expanded')); assert.ok(a.textContent.includes('重启条件'));
    assert.equal(f.browser.localStorage.getItem('workbench:scope:' + JSON.stringify(['one:/one', 'root'])), stored);
    assert.equal(JSON.stringify([...f.blocks]), original);
    const read = f.work.lensesAPI.read(); read.plan.question = 'injected'; read.plan.visibleRanges.length = 0;
    assert.equal(f.work.lensesAPI.read().plan.question, '验证充分吗？');
    f.work.lensesAPI.exit();
    assert.deepEqual(visible(f), ['root']); assert.deepEqual(f.work.snapshot().view.collapsed, ['root', 's1']);
    assert.equal(f.browser.localStorage.getItem('workbench:scope:' + JSON.stringify(['one:/one', 'root'])), stored);
    assert.equal(f.browser.document.querySelector('.wb-lens-bar').hidden, true);
  } finally { await f.close(); }
});

test('manual UI and registered current-block commands apply a real subtree without pretending to understand a question', async () => {
  const f = await chapters();
  try {
    node(f, 'a').querySelector('.wb-body').click();
    assert.equal(f.work.snapshot().view.selected, 'a');
    const heading = f.browser.document.querySelector('.wb-heading');
    [...heading.querySelectorAll('button')].find(button => button.textContent === '只看选定范围').click();
    await settle(() => f.work.lensesAPI.read().phase === 'focused');
    assert.deepEqual(visible(f), ['root', 's1', 'a']); assert.equal(f.work.lensesAPI.read().plan.question, '选定范围');
    f.commands.get('workbench-exit-lens')(); assert.equal(f.work.lensesAPI.read().phase, 'reading');
    f.setCurrent('s3'); f.commands.get('workbench-focus-range')();
    await settle(() => f.work.lensesAPI.read().phase === 'focused');
    assert.deepEqual(visible(f), ['root', 's3', 'c']);
    f.browser.document.querySelector('.wb-lens-bar').dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(f.work.lensesAPI.read().phase, 'reading'); assert.equal(visible(f).length, 7);
    assert.equal(f.browser.document.querySelectorAll('input,textarea').length, 0);
  } finally { await f.close(); }
});

test('new questions replace, rather than intersect; genuinely in-flight old reads and cancelled/closed results cannot revive plans', async () => {
  const f = await chapters();
  try {
    const first = await prepare(f, ['a'], '问题一');
    const source = await f.work.lensesAPI.source();
    const gate = deferred(), started = deferred(); f.setTreeRead(async () => { started.resolve(); return gate.promise; });
    const old = f.work.lensesAPI.apply(first); await started.promise;
    const secondRequest = f.work.lensesAPI.request({ schemaVersion: 1, question: '问题二' });
    const second = selectedPlan(secondRequest.value, source.value, ['c']);
    const next = f.work.lensesAPI.apply(second); f.setTreeRead(null); gate.resolve(f.root);
    assert.equal((await old).reason, 'superseded-request'); assert.equal((await next).ok, true);
    assert.deepEqual(visible(f), ['root', 's3', 'c']); assert.equal(f.work.lensesAPI.read().plan.question, '问题二');
    const pending = await prepare(f, ['a'], '取消的题');
    f.work.lensesAPI.cancel(); assert.equal((await f.work.lensesAPI.apply(pending)).reason, 'superseded-request');
    assert.deepEqual(visible(f), ['root', 's3', 'c']);
    const closing = await prepare(f, ['a'], '关闭的题');
    await f.work.panel.close();
    assert.equal((await f.work.lensesAPI.apply(closing)).reason, 'superseded-request');
    await f.work.open('root'); assert.equal(f.work.lensesAPI.read().phase, 'reading'); assert.equal(visible(f).length, 7);
  } finally { await f.close(); }
});

test('committed source updates do not re-prune; draft versions remain separate and obsolete inference/emphasis is hidden', async () => {
  const f = await chapters();
  try {
    const plan = await prepare(f, ['a', 'c']); await f.work.lensesAPI.apply(plan);
    const selection = visible(f), a = node(f, 'a'), sourceBefore = (await f.work.lensesAPI.source()).value;
    f.editing('a', '未提交草稿'); await f.tick();
    assert.deepEqual(visible(f), selection); assert.equal(f.work.lensesAPI.read().basisChanged, false);
    const sourceWithDraft = (await f.work.lensesAPI.source()).value;
    assert.equal(sourceWithDraft.blocks.find(block => block.target.blockUuid === 'a').contentVersion, sourceBefore.blocks.find(block => block.target.blockUuid === 'a').contentVersion);
    assert.equal(sourceWithDraft.blocks.find(block => block.target.blockUuid === 'a').content, f.blocks.get('a').content);
    f.content('b', '不相关的正文变化'); await delay(80); assert.equal(f.work.lensesAPI.read().basisChanged, false);
    f.content('a', '新的已提交条件。\n但仍未覆盖重启。'); await delay(80);
    assert.deepEqual(visible(f), selection); assert.equal(f.work.lensesAPI.read().phase, 'changed');
    assert.equal(node(f, 'a'), a); assert.ok(a.textContent.includes('未提交草稿'));
    assert.equal(f.browser.document.querySelector('.wb-lens-inference').hidden, true); assert.equal(a.classList.contains('wb-lens-emphasis'), false);
    f.editing(false); await f.tick(); assert.ok(a.textContent.includes('新的已提交条件'));
    const retry = f.work.lensesAPI.request({ schemaVersion: 1, question: plan.question });
    assert.equal((await f.work.lensesAPI.apply({ ...plan, ...retry.value })).reason, 'stale-content');
    assert.deepEqual(visible(f), selection);
    f.work.lensesAPI.exit(); assert.ok(node(f, 'a').textContent.includes('新的已提交条件'));
    assert.equal(f.work.apply({ ...f.work.snapshot(), graph: f.work.snapshot().graph, root: 'root', expectedSeq: f.work.snapshot().seq, type: 'write-source' }).ok, false);
  } finally { await f.close(); }
});

test('user folds, ordering and display choices made while focused survive exit instead of being overwritten by an old snapshot', async () => {
  const f = await chapters();
  try {
    operation(f, 'collapse', { uuid: 's1' });
    await f.work.lensesAPI.apply(await prepare(f, ['a', 'c']));
    const a = node(f, 'a'), select = a.querySelector('select'); select.focus(); select.value = 'quiet'; select.dispatchEvent(new f.browser.Event('change'));
    assert.equal(f.browser.document.activeElement, select);
    operation(f, 'reorder', { uuid: 's3', target: 's1', mode: 'before' });
    assert.deepEqual(visible(f), ['root', 's3', 'c', 's1', 'a']);
    node(f, 's1').children[1].click(); assert.equal(node(f, 'a').hidden, true); // explicit fold overrides temporary expansion
    const during = globalThis.structuredClone(f.work.snapshot().view);
    f.work.lensesAPI.exit(); assert.deepEqual(f.work.snapshot().view, during);
    assert.equal(f.work.snapshot().view.overrides.a, 'quiet'); assert.equal(node(f, 'a'), a);
    assert.deepEqual(visible(f), ['root', 's3', 'c', 's1', 's2', 'b']);
  } finally { await f.close(); }
});

test('composition preserves body nodes and keyboard state; new plans cannot hide an active edit', async () => {
  const f = await chapters();
  try {
    await f.work.lensesAPI.apply(await prepare(f, ['a', 'c']));
    const next = await prepare(f, ['b'], '新问题');
    const a = node(f, 'a'), text = a.querySelector('.wb-body').firstChild, before = globalThis.structuredClone(f.work.snapshot().presentation);
    a.querySelector('.wb-body').dispatchEvent(new f.browser.CompositionEvent('compositionstart', { bubbles: true }));
    f.content('a', '组合期间的来源更新'); await delay(80);
    assert.equal(a.querySelector('.wb-body').firstChild, text);
    a.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Tab', isComposing: true, bubbles: true, cancelable: true }));
    assert.deepEqual(f.work.snapshot().presentation, before);
    assert.equal((await f.work.lensesAPI.apply(next)).reason, 'editing-in-progress');
    assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
    a.querySelector('.wb-body').dispatchEvent(new f.browser.CompositionEvent('compositionend', { bubbles: true }));
    await delay(10); assert.ok(a.textContent.includes('组合期间的来源更新'));
    await f.work.lensesAPI.apply(await prepare(f, ['b'], '新问题')); assert.deepEqual(visible(f), ['root', 's2', 'b']);
  } finally { await f.close(); }
});

test('previous questions revalidate versions; scope switches and dispose invalidate all stored and in-flight selection', async () => {
  const f = await chapters();
  try {
    await f.work.lensesAPI.apply(await prepare(f, ['a'], '前题')); await f.work.lensesAPI.apply(await prepare(f, ['c'], '当前题'));
    assert.equal((await f.work.lensesAPI.back()).ok, true); assert.deepEqual(visible(f), ['root', 's1', 'a']);
    await f.work.lensesAPI.apply(await prepare(f, ['c'], '再次当前'));
    f.content('a', '前题依据改变'); await delay(80);
    assert.equal((await f.work.lensesAPI.back()).reason, 'stale-content'); assert.deepEqual(visible(f), ['root', 's3', 'c']);
    const late = await prepare(f, ['a'], '切换前');
    f.switchGraph('two'); assert.equal(f.work.lensesAPI.read().plan, null);
    assert.equal((await f.work.lensesAPI.apply(late)).reason, 'superseded-request');
    await f.work.open('root'); assert.equal(f.work.lensesAPI.read().phase, 'reading');
    const disposed = await prepare(f, ['a'], '卸载前'); f.work.dispose();
    assert.equal((await f.work.lensesAPI.apply(disposed)).reason, 'superseded-request');
    assert.equal(f.work.lensesAPI.request({ schemaVersion: 1, question: 'new' }).reason, 'view-not-visible');
    assert.equal(f.browser.document.querySelectorAll('.wb-row').length, 0);
  } finally { await f.close(); }
});

test('native editing that starts after source capture still prevents pruning, and cancellation during that check wins', async () => {
  const f = await chapters();
  const nativeCheck = globalThis.logseq.Editor.checkEditing;
  try {
    await f.work.lensesAPI.apply(await prepare(f, ['a', 'c']));
    const plan = await prepare(f, ['b'], '编辑前的新题');
    let checks = 0;
    globalThis.logseq.Editor.checkEditing = async () => ++checks >= 3 ? 'a' : false;
    assert.equal((await f.work.lensesAPI.apply(plan)).reason, 'editing-in-progress');
    assert.equal(f.work.snapshot().draft, null); // The next draft polling tick has not happened.
    assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
    const gate = deferred(), started = deferred(); checks = 0;
    globalThis.logseq.Editor.checkEditing = async () => {
      if (++checks < 3) return false;
      started.resolve(); return gate.promise;
    };
    const late = f.work.lensesAPI.apply(plan); await started.promise;
    f.work.lensesAPI.cancel(); gate.resolve('a');
    assert.equal((await late).reason, 'superseded-request');
    assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
    globalThis.logseq.Editor.checkEditing = async () => { throw Error('native editing state unavailable'); };
    const retry = f.work.lensesAPI.request({ schemaVersion: 1, question: plan.question });
    assert.equal((await f.work.lensesAPI.apply({ ...plan, ...retry.value })).reason, 'source-read-failed');
    assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
  } finally { globalThis.logseq.Editor.checkEditing = nativeCheck; await f.close(); }
});

test('source failure preserves the focused reading but exposes unavailable versions; restored sources do not revive old inference', async () => {
  const f = await chapters();
  try {
    await f.work.lensesAPI.apply(await prepare(f, ['a']));
    const before = visible(f), a = node(f, 'a');
    f.setTreeRead(async () => { throw Error('SDK offline'); });
    assert.equal((await f.work.lensesAPI.source()).reason, 'source-read-failed');
    await settle(() => f.work.lensesAPI.read().basisChanged);
    assert.deepEqual(visible(f), before); assert.equal(node(f, 'a'), a);
    f.setTreeRead(null); await f.work.refresh();
    assert.equal(f.work.lensesAPI.read().basisChanged, true);
    const source = await f.work.lensesAPI.source(); assert.equal(source.ok, true);
    assert.equal(source.value.blocks[0].availability, 'available');
  } finally { await f.close(); }
});

test('material opening failure keeps the current question and location; switching cancels pending requests and returning restores the lens', async () => {
  let material;
  const f = await chapters({ onMaterials: async () => { if (!material) throw Error('材料不可读'); await material.open(); } });
  const { FeaturePanel } = await import('../../src/host/panel-host.ts');
  try {
    await f.work.lensesAPI.apply(await prepare(f, ['a', 'c']));
    const a = node(f, 'a'), container = a.parentElement; container.scrollTop = 91;
    const materialButton = [...f.browser.document.querySelector('.wb-heading').querySelectorAll('button')].find(button => button.textContent === '材料');
    materialButton.click(); await settle(() => f.browser.document.querySelector('.wb-status').textContent === '材料不可读');
    assert.equal(f.work.panel.visible, true); assert.equal(f.work.lensesAPI.read().plan.question, '验证充分吗？'); assert.equal(container.scrollTop, 91);
    material = new FeaturePanel('materials', '材料');
    const pending = await prepare(f, ['b'], '切换中的题');
    materialButton.click(); await settle(() => material.visible);
    assert.equal(f.work.panel.visible, false); assert.equal(f.work.lensesAPI.read().suspended, true);
    assert.equal((await f.work.lensesAPI.apply(pending)).reason, 'superseded-request');
    await f.work.open('root');
    assert.equal(f.work.lensesAPI.read().plan.question, '验证充分吗？'); assert.deepEqual(visible(f), ['root', 's1', 'a', 's3', 'c']);
    assert.equal(f.browser.document.querySelector('.wb-lens-question').textContent, '验证充分吗？');
    assert.ok(!f.browser.document.querySelector('.wb-lens-bar').textContent.includes('等待范围选择'));
    assert.equal(node(f, 'a'), a); assert.equal(container.scrollTop, 91);
  } finally { await material?.close(); await f.close(); }
});

test('safe Markdown and block emphasis retain link semantics; reduced-motion styling is local and semantic inference remains text', async () => {
  const f = await chapters();
  try {
    // Happy DOM's NodeIterator differs for adjacent removals; the combined payload is a real-Chromium gate.
    f.content('a', '[原文链接](https://example.com)\n<img src=x onerror=bad()>'); await delay(80);
    const plan = await prepare(f, ['a']); plan.temporaryInference = '<b>临时文字</b>';
    await f.work.lensesAPI.apply(plan);
    assert.equal(node(f, 'a').querySelector('.wb-body a').getAttribute('href'), 'https://example.com');
    assert.equal(node(f, 'a').querySelector('img,script'), null);
    assert.equal(f.browser.document.querySelector('.wb-lens-inference b'), null);
    assert.ok(f.browser.document.querySelector('.wb-lens-inference').textContent.includes('<b>临时文字</b>'));
    f.content('a', '[原文链接](https://example.com)\n<script>bad()</script>'); await delay(80);
    assert.equal(node(f, 'a').querySelector('img,script'), null);
    assert.equal(f.browser.document.querySelector('.wb-lens-inference').hidden, true);
    assert.ok([...f.browser.document.querySelectorAll('style')].some(style => style.textContent.includes('prefers-reduced-motion') && style.textContent.includes('transition:none')));
    assert.equal((await f.work.lensesAPI.apply({ ...plan, css: 'body{display:none}' })).reason, 'unknown-field');
  } finally { await f.close(); }
});

test('exit restores a reliable block offset after source growth, with stable focus and text selection during material suspension', async () => {
  const f = await chapters();
  const { FeaturePanel } = await import('../../src/host/panel-host.ts');
  const material = new FeaturePanel('materials', '材料');
  try {
    const container = node(f, 'root').parentElement;
    container.getBoundingClientRect = () => ({ top: 0, bottom: 80 });
    const height = row => row.dataset.uuid === 'a' && row.textContent.includes('更长的来源') ? 60 : 20;
    for (const row of container.children) row.getBoundingClientRect = () => {
      let top = -container.scrollTop;
      for (const preceding of container.children) { if (preceding === row) break; if (!preceding.hidden) top += height(preceding); }
      return { top, bottom: top + (row.hidden ? 0 : height(row)) };
    };
    container.scrollTop = 60; const prior = node(f, 's2').getBoundingClientRect().top;
    await f.work.lensesAPI.apply(await prepare(f, ['a', 'c']));
    const a = node(f, 'a'), control = a.querySelector('select'); control.focus();
    const text = a.querySelector('.wb-body p').firstChild, range = f.browser.document.createRange();
    range.setStart(text, 0); range.setEnd(text, 2);
    f.browser.document.getSelection().addRange(range);
    const textBefore = f.browser.document.getSelection().toString();
    await material.open(); await f.work.open('root');
    assert.equal(f.browser.document.activeElement, control);
    assert.equal(f.browser.document.getSelection().toString(), textBefore);
    assert.equal(node(f, 'a'), a);
    f.content('a', '更长的来源\n条件仍保留。'); await delay(80);
    f.work.lensesAPI.exit();
    assert.equal(node(f, 's2').getBoundingClientRect().top, prior);
    assert.equal(container.scrollTop, 100);
    assert.ok(node(f, 'a').textContent.includes('更长的来源'));
    assert.notEqual(f.browser.document.getSelection().toString(), textBefore);
  } finally { await material.close(); await f.close(); }
});
