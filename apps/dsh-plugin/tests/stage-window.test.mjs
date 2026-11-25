/* global window, URLSearchParams */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Exercise the real JSX handlers with an element tree and hook lifecycle, without
// loading an additional React runtime alongside DSH's host-provided React.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/stage/floating-window.jsx', import.meta.url))],
  bundle: true, write: false, format: 'esm', jsx: 'transform',
  plugins: [{
    name: 'stage-window-fixture', setup(build) {
      build.onResolve({ filter: /^(react(?:\/jsx-runtime)?|@task-copilot\/stage-runtime)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /^react$/, namespace: 'fixture' }, () => ({ contents: `
        export const useState = (...args) => globalThis.stageTestHooks.useState(...args);
        export const useRef = (...args) => globalThis.stageTestHooks.useRef(...args);
        export const useEffect = (...args) => globalThis.stageTestHooks.useEffect(...args);
        export const useSyncExternalStore = (...args) => globalThis.stageTestHooks.useSyncExternalStore(...args);
        export default { createElement(type, props, ...children) { return { type, props, children }; } };
      ` }));
      build.onLoad({ filter: /^react\/jsx-runtime$/, namespace: 'fixture' }, () => ({ contents: `
        export function jsx(type, { children, ...props }) {
          return { type, props, children: Array.isArray(children) ? children : [children] };
        }
        export const jsxs = jsx;
      ` }));
      build.onLoad({ filter: /^@task-copilot\/stage-runtime$/, namespace: 'fixture' }, () => ({ contents: `
        export const compactGazeSummary = () => 'L0 季节星区';
        export const mountSharedStageView = (_element, port) => {
          globalThis.stageTestView = port;
          return { update() {}, dispose() {}, focusZoomOut() {} };
        };
      ` }));
    },
  }],
});
const { createStageWindow } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  return [node, ...elements(node.children)];
}
function content(node) {
  if (Array.isArray(node)) return node.map(content).join('');
  return typeof node === 'string' ? node : node?.children ? content(node.children) : '';
}
function renderHooks(component) {
  const hooks = [];
  let index = 0, effects = [], dirty = true, tree;
  const next = () => index++;
  const react = {
    useState(initial) {
      const i = next();
      hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[i].value, update => {
        const value = typeof update === 'function' ? update(hooks[i].value) : update;
        if (!Object.is(value, hooks[i].value)) { hooks[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const i = next();
      return hooks[i] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const i = next(), previous = hooks[i];
      if (previous && deps.length === previous.deps.length && deps.every((dep, j) => Object.is(dep, previous.deps[j]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        hooks[i] = { deps, cleanup: effect() };
      });
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const [, setValue] = react.useState(getSnapshot);
      react.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot]);
      return getSnapshot();
    },
  };
  return {
    render() {
      globalThis.stageTestHooks = react;
      while (dirty) {
        dirty = false; index = 0; effects = [];
        tree = component();
        for (const node of elements(tree)) if (node.props?.ref) node.props.ref.current ??= {};
        for (const effect of effects) effect();
      }
      return tree;
    },
    dispose() { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test('DSH star map keyboard/header opens in place; Logseq hash and explicit switch enter weekly session before showing gaze; card dives peek', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  globalThis.window = browser;
  globalThis.localStorage = browser.localStorage;
  let active = 'project-a';
  const activeListeners = new Set(), calls = [];
  const snapshot = { version: 3, viewport: { zoomLevel: 0 }, areas: [], ghostProposals: [] };
  const setActive = id => { active = id; activeListeners.forEach(fn => fn()); };
  let resolveGlobal, resolveRefresh;
  const rpc = async (method, payload) => {
    calls.push([method, payload]);
    if (method === 'stage-enter-global') return new Promise(resolve => { resolveGlobal = resolve; });
    if (method === 'stage-state') return { snapshot };
    if (method === 'stage-workspace') return { active: payload.sessionId === 'weekly-global', stageWorkspaceDir: '/reviews' };
    if (method === 'stage-wait') return new Promise(() => {});
    return {};
  };
  const stage = createStageWindow({
    rpc,
    enterWork: async work => { calls.push(['enterWork', work]); setActive('project-b'); },
    refreshSessions: async () => {
      calls.push(['refresh']);
      return new Promise(resolve => { resolveRefresh = resolve; });
    },
    openSession: id => { calls.push(['openSession', id]); setActive(id); },
    getActiveSessionId: () => active,
    subscribeActiveSession: listener => { activeListeners.add(listener); return () => activeListeners.delete(listener); },
  });
  const overlay = renderHooks(stage.StageFloatingOverlay);
  const header = renderHooks(stage.StageHeaderButton);
  const button = (tree, label) => elements(tree).find(node => node.type === 'button' && content(node) === label);
  const settle = async () => { await setImmediate(); overlay.render(); await setImmediate(); return overlay.render(); };
  const enterCount = () => calls.filter(([name]) => name === 'stage-enter-global').length;
  try {
    assert.equal(overlay.render(), null);
    window.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'G', metaKey: true, shiftKey: true }));
    const floating = await settle();
    assert.equal(floating.type, 'section');
    assert.ok(button(floating, '切到全局导航台'));
    assert.equal(active, 'project-a');
    assert.equal(enterCount(), 0);

    // The header invokes the same in-place toggle (floating to peek and back).
    header.render().props.onClick();
    assert.equal((await settle()).props.className, 'tcs-dsh-peek');
    header.render().props.onClick();
    assert.equal((await settle()).type, 'section');
    assert.equal(enterCount(), 0);
    assert.equal(active, 'project-a');

    button(overlay.render(), '✕').props.onClick();
    assert.equal(await settle(), null);

    window.history.replaceState(null, '', '/#stage-discuss=1&keep=1');
    window.dispatchEvent(new browser.Event('hashchange'));
    assert.equal(enterCount(), 1);
    assert.equal(active, 'project-a');
    assert.equal(overlay.render(), null, 'do not expand before the native session is ready');
    assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('stage-discuss'), null);
    assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('keep'), '1');
    const start = calls.findLastIndex(([name]) => name === 'stage-enter-global');
    resolveGlobal({ sessionId: 'weekly-global', weekKey: '2026-W47', directory: '/reviews', created: true });
    await setImmediate();
    assert.equal(active, 'project-a', 'wait for session refresh before navigation');
    assert.equal(overlay.render(), null);
    resolveRefresh();
    const globalWindow = await settle();
    assert.equal(active, 'weekly-global');
    assert.deepEqual(calls.slice(start, start + 5).map(([name]) => name),
      ['stage-enter-global', 'refresh', 'openSession', 'stage-visibility', 'stage-state']);
    assert.equal(globalWindow.type, 'section');
    assert.equal(button(globalWindow, '切到全局导航台'), undefined);
    assert.doesNotMatch(content(globalWindow), /[\p{Extended_Pictographic}\u2190-\u21ff]/u);

    const card = { workRef: { kind: 'logseq', graphId: 'g', rootUuid: 'project-b', sourceKind: 'page' }, title: '项目 B' };
    await globalThis.stageTestView.onOpenInDsh(card);
    assert.equal((await settle()).props.className, 'tcs-dsh-peek');
    assert.equal(active, 'project-b');
    assert.equal(enterCount(), 1);
    stage.toggle();
    const projectWindow = await settle();
    button(projectWindow, '切到全局导航台').props.onClick();
    assert.equal(enterCount(), 2);
    resolveGlobal({ sessionId: 'weekly-global', weekKey: '2026-W47', directory: '/reviews', created: false });
    await setImmediate();
    resolveRefresh();
    await settle();
    assert.equal(active, 'weekly-global');
    await globalThis.stageTestView.onOpenWork(card);
    assert.equal((await settle()).props.className, 'tcs-dsh-peek');
    assert.equal(active, 'project-b');
    assert.equal(calls.filter(([name]) => name === 'enterWork').length, 2);
    assert.equal(enterCount(), 2);
  } finally {
    header.dispose();
    overlay.dispose();
    await browser.happyDOM.abort();
    globalThis.window = previous.window;
    globalThis.localStorage = previous.localStorage;
    delete globalThis.stageTestHooks;
    delete globalThis.stageTestView;
  }
});
