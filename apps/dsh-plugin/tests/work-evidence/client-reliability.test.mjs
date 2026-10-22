import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { render, unmount } from './react-harness.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = `${root}tmp/work-evidence/reliability-tests/client.mjs`;
await mkdir(`${root}tmp/work-evidence/reliability-tests`, { recursive: true });
await build({ entryPoints: [`${root}apps/dsh-plugin/src/work-evidence/client.jsx`], outfile: output, bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'callback-harness', setup(builder) {
  builder.onResolve({ filter: /^react$/ }, () => ({ path: fileURLToPath(new URL('./react-harness.mjs', import.meta.url)), external: true }));
} }] });
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
async function fixture() {
  const callbacks = new Map(); globalThis.document = { createElement: () => ({ remove() {} }), head: { append() {} } };
  const local = new Map();
  globalThis.window = { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) }, addEventListener: (name, fn) => callbacks.set(name, fn), removeEventListener: name => callbacks.delete(name) };
  const { apply } = await import(`${pathToFileURL(output).href}?test=${globalThis.crypto.randomUUID()}`);
  let Component, release, failRead = false, failDiff = false; const notes = []; let draft = 'existing draft', canInsert = true;
  const native = { captureInsertion: () => ({}), insertText: value => { if (!canInsert) return false; draft += value; return true; } };
  const observation = { value: { id: 'observation', state: 'changes', files: [{ path: 'work.txt', staged: 'M', unstaged: 'M', untracked: false, restricted: false }], comparison: { new: [], existing: [], uncertain: [], absent: [] } }, hash: 'hash' };
  const list = items => ({ items, complete: true, problems: [] });
  const context = { on() {}, slots: { inject: (_name, fn) => fn(), register: (_spec, fn) => { Component = fn; } }, connection: { rpc: { call: async (_base, method, payload) => {
    let value;
    switch (method.split('/')[1]) {
      case 'scopes': value = list([{ value: { id: 'scope', directory: '/owned' } }]); break;
      case 'select': value = { id: 'scope' }; break;
      case 'history': value = list([observation]); break;
      case 'observe': value = observation; break;
      case 'note': return new Promise(resolve => { release = () => {
        const receipt = { value: { ...payload, id: payload.requestId, text: payload.text.trim(), source: 'user-supplement' }, hash: 'receipt' };
        notes.push(receipt); resolve({ ok: true, value: receipt });
      }; });
      case 'diff': if (failDiff) throw Object.assign(Error('source changed'), { code: 'SOURCE_CHANGED' }); value = { state: 'current-text', text: 'obsolete diff body' }; break;
      case 'quote': value = ' citation'; break;
      case 'reconstruction': value = { items: [{ fact: { id: 'file-item', path: 'work.txt', aliases: ['work.txt'], commits: [], workspace: observation.value.files[0] }, state: 'pending' }], events: [], handoffs: [], complete: true }; break;
      case 'read': if (failRead) throw Error('list transport failed'); value = { observation, notes: list(notes) }; break;
      default: throw Error(method);
    }
    return { ok: true, value };
  } } } }; apply(context);
  const tree = () => render(Component, { inputActions: native });
  const find = (type, label) => { const found = walk(tree()).find(node => node.type === type && (!label || text(node).includes(label))); assert.ok(found, `${type}: ${label}`); return found; };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  find('button', '工作变化').props.onClick(); await tick(); find('form').props.onSubmit({ preventDefault() {} }); await tick();
  find('button', '同步一下我刚才做的事').props.onClick(); await tick(); tree(); await tick();
  return { find, tree, tick, callbacks, notes, remount: () => unmount(Component), reinitialize: () => apply(context), draft: () => draft, allowInsert: value => { canInsert = value; }, release: () => release(), failRead: (value = true) => { failRead = value; }, failDiff: () => { failDiff = true; } };
}
test('production client preserves typing across save and failed list refresh; closing and reopening does not reset it', async () => {
  const f = await fixture(); f.find('textarea').props.onChange({ target: { value: 'first intent' } });
  f.find('button', '保存补充').props.onClick(); await f.tick();
  assert.equal(f.find('textarea').props.disabled, undefined);
  f.find('textarea').props.onChange({ target: { value: 'first intent plus later input' } }); f.failRead(); f.release(); await f.tick();
  assert.equal(f.find('textarea').props.value, 'first intent plus later input'); assert.equal(f.notes[0].value.text, 'first intent');
  assert.match(text(f.tree()), /补充已确认保存；列表暂未刷新/);
  f.find('button', '收起').props.onClick(); f.find('button', '工作变化').props.onClick(); await f.tick();
  assert.equal(f.find('textarea').props.value, 'first intent plus later input');
  let prevented = false; f.callbacks.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
});
test('reading the same observation again cannot clear unsubmitted intent', async () => {
  const f = await fixture(); f.find('textarea').props.onChange({ target: { value: 'keep this intent' } });
  f.find('button', '项').props.onClick(); await f.tick(); assert.equal(f.find('textarea').props.value, 'keep this intent');
});

test('a failed diff refresh removes the previously displayed current diff', async () => {
  const f = await fixture(); f.find('button', '未暂存差异').props.onClick(); await f.tick(); assert.match(text(f.tree()), /obsolete diff body/);
  f.failDiff(); f.find('button', '未暂存差异').props.onClick(); await f.tick(); assert.doesNotMatch(text(f.tree()), /obsolete diff body/); assert.match(text(f.tree()), /来源已变化/);
});

test('production quote preview cancels safely and failed insertion remains retryable without replacing the draft', async () => {
  const f = await fixture();
  walk(f.tree()).find(node => node.type === 'label' && text(node).includes('work.txt')).props.children[0].props.onChange({ target: { checked: true } });
  f.find('button', '准备草稿引用').props.onClick(); await f.tick();
  assert.equal(f.draft(), 'existing draft');
  f.find('button', '关闭引用预览').props.onClick(); assert.equal(f.draft(), 'existing draft');
  f.find('button', '准备草稿引用').props.onClick(); await f.tick();
  f.allowInsert(false); f.find('button', '确认插入原生草稿').props.onClick(); await f.tick();
  assert.equal(f.draft(), 'existing draft'); assert.match(text(f.tree()), /原草稿未替换/);
  assert.equal(f.find('button', '确认插入原生草稿').props.disabled, false);
  f.allowInsert(true); f.find('button', '确认插入原生草稿').props.onClick(); await f.tick();
  assert.equal(f.draft(), 'existing draft citation'); assert.equal(f.find('button', '确认插入原生草稿').props.disabled, true);
  assert.match(text(f.tree()), /本次不会重复插入/);
});

test('DSH slot remount keeps the open panel, observation and in-flight lock until the actual receipt', async () => {
  const f = await fixture(); f.find('textarea').props.onChange({ target: { value: 'submitted' } });
  f.find('button', '保存补充').props.onClick(); await f.tick();
  f.find('textarea').props.onChange({ target: { value: 'new while pending' } });
  f.remount(); assert.equal(f.find('textarea').props.value, 'new while pending');
  assert.equal(f.find('button', '同步一下我刚才做的事').props.disabled, true);
  f.release(); await f.tick();
  assert.equal(f.find('textarea').props.value, 'new while pending');
  assert.equal(f.find('button', '同步一下我刚才做的事').props.disabled, false);
  assert.equal(f.notes.length, 1);
});

test('plugin reinitialization restores open preference, selected history and the browser-backed unsaved intent', async () => {
  const f = await fixture(); f.find('textarea').props.onChange({ target: { value: 'retain on plugin restart' } });
  f.reinitialize(); f.tree(); await f.tick(); f.tree(); await f.tick();
  assert.equal(f.find('textarea').props.value, 'retain on plugin restart');
  assert.match(text(f.tree()), /历史记录/);
});
test('a failed navigation restore cannot erase the remembered observation and a later open retries it', async () => {
 const f=await fixture();f.failRead();f.reinitialize();f.tree();await f.tick();f.tree();await f.tick();
 f.failRead(false);f.find('button','收起').props.onClick();f.find('button','工作变化').props.onClick();await f.tick();f.tree();await f.tick();
 assert.match(text(f.tree()),/历史记录/);assert(f.find('button','未暂存差异'));
});
