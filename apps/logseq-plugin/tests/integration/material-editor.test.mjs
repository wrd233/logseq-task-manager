import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';
import { deferred } from '../fixtures/work-view.mjs';

async function fixture() {
  const browser = new Window({ url: 'http://localhost/plugin/' });
  globalThis.window = browser; globalThis.document = browser.document; globalThis.localStorage = browser.localStorage; globalThis.location = browser.location;
  let graph = '/A', changed, editor, input, creates = 0, sets = 0, destroyed = 0, readCount = 0, intercept = null;
  const files = new Map(), writes = [], intervals = new Map(), timeouts = new Map(); let timer = 0;
  browser.setInterval = fn => { const id = ++timer; intervals.set(id, fn); return id; }; browser.clearInterval = id => intervals.delete(id);
  browser.setTimeout = fn => { const id = ++timer; timeouts.set(id, fn); return id; }; browser.clearTimeout = id => timeouts.delete(id);
  browser.apis = { doAction: async ([op, ...args]) => {
    if (op === 'readFile') { readCount++; if (!files.has(args[0])) throw Error('ENOENT'); return files.get(args[0]); }
    if (op === 'writeFile') { writes.push({ graph: args[0], path: args[1] }); if (intercept) await intercept(args[1]); files.set(args[1], args[2]); return; }
    if (op === 'mkdir-recur') return;
    if (op === 'rename') { files.set(args[1], files.get(args[0])); files.delete(args[0]); return; }
    if (op === 'listdir') return [...files.keys()].filter(path => path.startsWith(args[0] + '/'));
    throw Error('unsupported fixture bridge');
  }, openPath: async () => {} };
  const rememberEditor = value => { editor = value; };
  browser.Vditor = class {
    constructor(root, options) { creates++; this.value = options.value; this.root = root; this.control = browser.document.createElement('textarea'); root.append(this.control); rememberEditor(this); input = options.input; globalThis.queueMicrotask(options.after); }
    getValue() { assert.equal(this.dead, undefined); return this.value; }
    setValue(value) { sets++; this.value = value; }
    destroy() { destroyed++; this.dead = true; this.root.replaceChildren(); }
  };
  globalThis.logseq = {
    settings: { materialsDirectory: '/materialsA' },
    App: { getCurrentGraph: async () => ({ path: graph }), registerCommandPalette: () => {}, onCurrentGraphChanged: fn => { changed = fn; return () => { changed = null; }; } },
    Editor: { getCurrentBlock: async () => ({ uuid: 'source' }), checkEditing: async () => false },
    UI: { showMsg: async () => {} }, showMainUI: () => {}, hideMainUI: () => {}, setMainUIInlineStyle: () => {},
  };
  const { MaterialStore } = await import('../../src/features/materials/store.ts');
  const { Materials } = await import('../../src/features/materials/controller.ts');
  const io = { read: async path => files.get(path), write: async (path, text) => { files.set(path, text); }, mkdir: async () => {}, rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); }, list: async path => [...files.keys()].filter(file => file.startsWith(path + '/')) };
  const a = new MaterialStore(io, '/materialsA'), b = new MaterialStore(io, '/materialsB');
  const docA = await a.create('base A', { graph: '/A', sourceUuid: 'source' }), docB = await b.create('base B', { graph: '/B', sourceUuid: 'source' });
  const materials = new Materials();
  return {
    browser, materials, files, a, b, docA, docB, writes,
    get editor() { return editor; }, counts: () => ({ creates, sets, destroyed, readCount, saves: timeouts.size }),
    input: text => { editor.value = text; input(); },
    composition: type => materials.panel.root.querySelector('.wb-editor').dispatchEvent(new browser.Event(type, { bubbles: true })),
    tick: async () => { for (const fn of intervals.values()) fn(); await delay(10); },
    saveTimers: async () => { const callbacks = [...timeouts.values()]; timeouts.clear(); for (const fn of callbacks) fn(); await delay(10); },
    switchGraph: name => { graph = `/${name}`; globalThis.logseq.settings.materialsDirectory = `/materials${name}`; changed?.(); },
    intercept: fn => { intercept = fn; },
    close: async () => { materials.dispose(); await delay(10); await browser.happyDOM.abort(); delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; delete globalThis.location; delete globalThis.logseq; },
  };
}

test('material editor is reused, unrelated polls preserve focus and IME waits until composition ends before autosave', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); assert.equal(f.counts().creates, 1); assert.equal(f.counts().sets, 0);
    const control = f.editor.control; control.focus();
    for (let i = 0; i < 10; i++) await f.tick();
    assert.equal(f.counts().sets, 0); assert.equal(f.browser.document.activeElement, control);
    f.composition('compositionstart'); f.input('中文组合草稿'); await f.saveTimers(); await f.tick();
    assert.equal(f.files.get(f.a.file(f.docA.id)), 'base A'); assert.equal(f.counts().saves, 0);
    f.input('中文完成内容'); f.composition('compositionend'); assert.equal(f.counts().saves, 1); await f.saveTimers();
    assert.equal(f.files.get(f.a.file(f.docA.id)), '中文完成内容'); assert.equal(f.browser.document.activeElement, control);
    await f.materials.panel.close(); const reads = f.counts().readCount; await f.tick(); assert.equal(f.counts().readCount, reads);
    await f.materials.openDoc(f.docA.id); assert.equal(f.counts().creates, 1); assert.equal(f.counts().sets, 0);
  } finally { await f.close(); }
});

test('stable external versions update a clean editor but never replace a dirty draft; each Graph restores its own draft', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); const control = f.editor.control; control.focus();
    f.files.set(f.a.file(f.docA.id), 'external clean'); await f.tick(); assert.equal(f.editor.value, 'base A'); await f.tick();
    assert.equal(f.editor.value, 'external clean'); assert.equal(f.counts().sets, 1); assert.equal(f.browser.document.activeElement, control);
    f.input('local dirty A'); f.files.set(f.a.file(f.docA.id), 'external conflict'); await f.tick(); await f.tick();
    assert.equal(f.editor.value, 'local dirty A'); assert.equal(f.counts().sets, 1); assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    assert.equal(f.browser.document.activeElement, control);
    f.switchGraph('B'); await f.materials.openDoc(f.docB.id); assert.equal(f.editor.value, 'base B'); f.input('local dirty B');
    f.switchGraph('A'); await f.materials.openDoc(f.docA.id);
    assert.equal(f.editor.value, 'local dirty A'); assert.equal(f.materials.panel.root.querySelector('.wb-conflict').hidden, false);
    assert.equal(f.files.get(f.a.file(f.docA.id)), 'external conflict'); assert.equal(f.counts().creates, 1);
    assert.equal(JSON.parse(f.browser.localStorage.getItem(`workbench:draft:/B:${f.docB.id}`)).text, 'local dirty B');
    assert.equal(JSON.parse(f.browser.localStorage.getItem(`workbench:draft:/A:${f.docA.id}`)).base, 'external clean');
  } finally { await f.close(); }
});

test('an already-started save remains bound to its original Graph and dispose waits to destroy the editor', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id); f.input('saved A');
    const gate = deferred(), started = deferred();
    f.intercept(async path => { if (path.endsWith('.pending')) { started.resolve(); await gate.promise; } });
    const saving = f.saveTimers(); await started.promise;
    f.switchGraph('B'); await f.materials.linkedContext(''); // constructs B storage while A's disk operation remains pending
    f.materials.dispose(); f.materials.dispose(); assert.equal(f.counts().destroyed, 0);
    gate.resolve(); await saving; await delay(15);
    assert.equal(f.files.get(f.a.file(f.docA.id)), 'saved A'); assert.equal(f.files.get(f.b.file(f.docB.id)), 'base B');
    assert.ok(f.writes.filter(write => write.path.startsWith('/materialsA')).every(write => write.graph === '/A'));
    assert.equal(f.counts().destroyed, 1);
  } finally { await f.close(); }
});

test('restoring captured source stops before writing when Graph changes during its SDK read', async () => {
  const f = await fixture();
  try {
    await f.materials.openDoc(f.docA.id);
    const source = deferred(), started = deferred(); let sourceWrites = 0;
    globalThis.logseq.Editor.getBlock = async () => { started.resolve(); return source.promise; };
    globalThis.logseq.Editor.updateBlock = async () => { sourceWrites++; };
    [...f.materials.panel.root.querySelectorAll('button')].find(button => button.textContent === '恢复收纳原文').click();
    await started.promise; f.switchGraph('B'); source.resolve({ uuid: 'source', content: `[📄 ${f.docA.title}](longdoc://${f.docA.id})` }); await delay(15);
    assert.equal(sourceWrites, 0); assert.equal(f.files.get(f.a.file(f.docA.id)), 'base A');
  } finally { await f.close(); }
});
