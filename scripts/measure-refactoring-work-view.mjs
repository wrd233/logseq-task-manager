import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { platform, release } from 'node:os';
import process from 'node:process';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import console from 'node:console';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from '../apps/logseq-plugin/tests/fixtures/work-view.mjs';

mkdirSync('tmp/round04', { recursive: true });
const before = execFileSync('git', ['show', '9293ad6:apps/logseq-plugin/src/features/work-view/controller.ts'], { encoding: 'utf8' });
await build({ stdin: { contents: before.replace('marked.parse(', '(globalThis.__workViewMetrics.parse++, marked.parse)('), resolveDir: resolve('apps/logseq-plugin/src/features/work-view'), sourcefile: 'controller-before.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: 'tmp/round04/work-view-before.mjs' });
// Import renderers only after setting up the browser globals DOMPurify requires.
const initial = await fixture(); await initial.close();
const { WorkView: Before } = await import('../tmp/round04/work-view-before.mjs');
const { WorkView: After } = await import('../apps/logseq-plugin/src/features/work-view/controller.ts');
const recent = 'ffce330927a75a9c8b18eb07d77e01e6146d0618';
await build({ entryPoints: ['apps/logseq-plugin/src/features/work-view/controller.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: 'tmp/round04/work-view-ffce.mjs', plugins: [{name:'historical-work-view',setup(builder){
  builder.onLoad({filter:/features\/work-view\/.*\.(?:ts|mjs|js)$/}, async args => ({contents:execFileSync('git',['show',`${recent}:${relative(process.cwd(),args.path)}`],{encoding:'utf8'}).replaceAll('marked.parse(', '(globalThis.__workViewMetrics.parse++, marked.parse)('),loader:args.path.endsWith('.ts')?'ts':'js'}));
}}] });
const { WorkView: Recent } = await import('../tmp/round04/work-view-ffce.mjs');

const { marked } = await import('../apps/logseq-plugin/src/features/work-view/vendor/marked.js');
const { default: purifier } = await import('dompurify');
const metrics = { parse: 0, sanitize: 0 }; globalThis.__workViewMetrics = metrics;
const parse = marked.parse, sanitize = purifier.sanitize;
marked.parse = (...args) => { metrics.parse++; return parse(...args); };
purifier.sanitize = (...args) => { metrics.sanitize++; return sanitize(...args); };
const output = { method: 'Same 300-node SDK fixture and happy-dom; ten visible checks spanning 6.5s simulated clock, twenty edits 70ms apart; counts, not real Desktop latency. No millisecond assertions.', environment: { node: process.version, arch: process.arch, platform: platform(), release: release(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }, baselines: { before: '9293ad6', ffce: recent }, before: {}, ffce: {}, after: {} };
try {
  for (const [name, Controller] of [['before', Before], ['ffce', Recent], ['after', After]]) {
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
// Compare normalization itself, with identical returned rows, retained entries,
// and SDK reads. Getter reads count actual body normalization, not elapsed time.
const sourceBefore = execFileSync('git', ['show', `${recent}:apps/logseq-plugin/src/features/work-view/source.ts`], { encoding: 'utf8' });
await build({stdin:{contents:sourceBefore,resolveDir:resolve('apps/logseq-plugin/src/features/work-view'),sourcefile:'source-ffce.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'tmp/round04/source-ffce.mjs'});
const { readSource: oldRead } = await import('../tmp/round04/source-ffce.mjs');
const { readSource: newRead } = await import('../apps/logseq-plugin/src/features/work-view/source.ts');
const savedLogseq = globalThis.logseq; let reference;
try {
  for (const [name, read] of [['ffce', oldRead], ['after', newRead]]) {
    let bodies = 0, sdk = 0;
    const block = (uuid, children = []) => ({uuid,get content(){bodies++;return uuid;},children});
    const root = block('root', Array.from({length:300},(_,i)=>block(`b${i}`)));
    const retained = Array.from({length:20},(_,i)=>block(`outside${i}`,Array.from({length:30},(_,j)=>block(`nested${i}-${j}`))));
    globalThis.logseq={Editor:{getBlock:async uuid=>{sdk++;return uuid==='root'?root:retained.find(item=>item.uuid===uuid);}}};
    const result=await read('root',retained.map(item=>({uuid:item.uuid})),()=>true);
    if(reference)assert.deepEqual(result,reference);else reference=result;
    output[name].sourceNormalization={sdkReads:sdk,bodyReads:bodies,returnedRows:result.rows.length,available:result.available};
  }
} finally {globalThis.logseq=savedLogseq;}
mkdirSync('tmp/round04', { recursive: true });
writeFileSync('tmp/round04/work-view-workload.json' , JSON.stringify(output, null, 2) + '\n'); console.log(JSON.stringify(output));
