import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import console from 'node:console';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from '../apps/logseq-plugin/tests/fixtures/work-view.mjs';

mkdirSync('tmp/round0203', { recursive: true });
const before = execFileSync('git', ['show', '9293ad6:apps/logseq-plugin/src/features/work-view/controller.ts'], { encoding: 'utf8' });
await build({ stdin: { contents: before.replace('marked.parse(', '(globalThis.__workViewMetrics.parse++, marked.parse)('), resolveDir: resolve('apps/logseq-plugin/src/features/work-view'), sourcefile: 'controller-before.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: 'tmp/round0203/work-view-before.mjs' });
// Import renderers only after setting up the browser globals DOMPurify requires.
const initial = await fixture(); await initial.close();
const { WorkView: Before } = await import('../tmp/round0203/work-view-before.mjs');
const { WorkView: After } = await import('../apps/logseq-plugin/src/features/work-view/controller.ts');
const { marked } = await import('../apps/logseq-plugin/src/features/work-view/vendor/marked.js');
const { default: purifier } = await import('dompurify');
const metrics = { parse: 0, sanitize: 0 }; globalThis.__workViewMetrics = metrics;
const parse = marked.parse, sanitize = purifier.sanitize;
marked.parse = (...args) => { metrics.parse++; return parse(...args); };
purifier.sanitize = (...args) => { metrics.sanitize++; return sanitize(...args); };
const output = { method: 'Same 300-node SDK fixture and happy-dom; ten visible checks spanning 6.5s simulated clock, twenty edits 70ms apart; counts, not real Desktop latency. No millisecond assertions.', before: {}, after: {} };
try {
  for (const [name, Controller] of [['before', Before], ['after', After]]) {
    const f = await fixture(Controller, 300);
    const operation = (type, fields) => { const snapshot = f.work.snapshot(); return f.work.apply({ graph: snapshot.graph, root: snapshot.root, expectedSeq: snapshot.seq, type, ...fields }); };
    async function measure(scene, run) {
      f.resetCounts(); metrics.parse = metrics.sanitize = 0; await run();
      output[name][scene] = { treeReads: f.stats.tree, individualReads: f.stats.retained, markdownParses: metrics.parse, sanitizes: metrics.sanitize, articlesCreated: f.stats.articles, elementsCreated: f.stats.elements };
    }
    try {
      await measure('initial300', () => f.work.open('root'));
      await measure('unchangedVisible10', async () => { for (let i = 0; i < 10; i++) await f.tick(); });
      await measure('oneContentChange', async () => { f.content('b100', 'one changed body'); await delay(70); });
      await measure('continuousEdits20', async () => { for (let i = 0; i < 20; i++) { f.content('b100', `edit ${i}`); await delay(70); } });
      await measure('display', () => operation('display', { uuid: 'b0', level: 'quiet' }));
      await measure('selection', () => operation('focus', { uuid: 'b1' }));
      await measure('layout', () => operation('reorder', { uuid: 'b1', target: 'b0', mode: 'before' }));
      await measure('retained20', async () => { f.root.children = f.root.children.slice(20); await f.work.refresh(); });
      await measure('reload300', async () => { for (const block of f.blocks.values()) block.content += '\nreload'; await f.work.refresh(); });
    } finally { await f.close(); }
  }
} finally { marked.parse = parse; purifier.sanitize = sanitize; delete globalThis.__workViewMetrics; }
writeFileSync('tmp/round0203/work-view-workload.json', JSON.stringify(output, null, 2) + '\n'); console.log(JSON.stringify(output));
