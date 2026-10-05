import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function fixture(Controller, count = 3, options = {}) {
  const now = Date.now; let clock = now(); Date.now = () => clock;
  const browser = new Window({ url: 'http://localhost/plugin/' });
  globalThis.window = browser; globalThis.document = browser.document; globalThis.localStorage = browser.localStorage;
  const { WorkView } = Controller ? { WorkView: Controller } : await import('../../src/features/work-view/controller.ts');
  const nodes = Array.from({ length: count - 1 }, (_, i) => ({ id: i + 2, uuid: `b${i}`, content: `**条目 ${i}**`, parent: { id: 'root' }, page: { id: 'page' } }));
  const root = { id: 1, uuid: 'root', content: 'TODO **[任务]** 来源', parent: { id: 'page' }, page: { id: 'page' }, children: nodes };
  const blocks = new Map([['root', root], ...nodes.map(node => [node.uuid, node])]);
  const commands = new Map();
  const stats = { tree: 0, retained: 0, activeTree: 0, maxTree: 0, elements: 0, articles: 0 };
  const createElement = browser.document.createElement.bind(browser.document);
  browser.document.createElement = (tag, ...args) => { stats.elements++; if (tag === 'article') stats.articles++; return createElement(tag, ...args); };
  let changed, switched, graph = 'one', editing = false, draft = '', treeRead = null, draftRead = null, current = root;
  const intervals = new Map(); let intervalId = 0;
  browser.setInterval = fn => { const id = ++intervalId; intervals.set(id, fn); return id; };
  browser.clearInterval = id => intervals.delete(id);
  globalThis.logseq = {
    App: { getCurrentGraph: async () => ({ name: graph, url: `/${graph}` }), registerCommandPalette: (command, callback) => { commands.set(command.key, callback); }, onCurrentGraphChanged: fn => { switched = fn; return () => { switched = null; }; } },
    Editor: {
      getBlock: async (uuid, options) => {
        if (!options?.includeChildren) { stats.retained++; return blocks.get(uuid) ?? null; }
        stats.tree++; stats.activeTree++; stats.maxTree = Math.max(stats.maxTree, stats.activeTree);
        try { return treeRead ? await treeRead(uuid) : blocks.get(uuid) ?? null; } finally { stats.activeTree--; }
      },
      getCurrentBlock: async () => current, checkEditing: async () => editing,
      getEditingBlockContent: async () => draftRead ? await draftRead() : draft,
      registerBlockContextMenuItem: () => () => {}, getPage: async () => ({ name: 'fixture' }), scrollToBlockInPage: () => {},
    },
    DB: { onChanged: fn => { changed = fn; return () => { changed = null; }; } },
    showMainUI: () => {}, hideMainUI: () => {}, setMainUIInlineStyle: () => {},
  };
  // Saved-layout tests retain structure mode; an explicit undefined mode
  // requests the production default instead of introducing a fixture override.
  const initialReadingMode = Object.hasOwn(options, 'readingMode') ? options.readingMode : options.initialReadingMode ?? 'structure';
  const work = new WorkView(options.onMaterials ?? (() => {}), {...options, initialReadingMode});
  return {
    browser, work, root, blocks, stats, commands, setCurrent: uuid => { current = blocks.get(uuid); },
    change: event => changed?.(event),
    content: (id, text) => { blocks.get(id).content = text; changed?.({ blocks: [blocks.get(id), { id: 1000, uuid: 'page', name: 'fixture' }], txData: [[blocks.get(id).id, 'block/properties', {}, 1, true], [blocks.get(id).id, 'block/properties-order', [], 1, true], [blocks.get(id).id, 'block/properties-text-values', {}, 1, true], [1000, 'block/updated-at', 1, 1, true], [blocks.get(id).id, 'block/content', text, 1, true]] }); },
    switchGraph: name => { graph = name; switched?.(); },
    editing: (uuid, text = '') => { editing = uuid; draft = text; },
    setTreeRead: read => { treeRead = read; }, setDraftRead: read => { draftRead = read; },
    tick: async (elapsed = 650) => { clock += elapsed; for (const fn of intervals.values()) fn(); await delay(60); },
    resetCounts: () => { for (const key of Object.keys(stats)) stats[key] = 0; },
    close: async () => { work.dispose(); Date.now = now; await browser.happyDOM.abort(); delete globalThis.logseq; delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; },
  };
}
