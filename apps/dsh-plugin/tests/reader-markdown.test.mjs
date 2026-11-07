import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import { marked } from '../../logseq-plugin/src/features/work-view/vendor/marked.js';

// Render the production JSX to an element tree without bringing a second React runtime into tests.
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/work-experience/markdown.jsx', import.meta.url))], bundle: true, write: false, format: 'esm',
  plugins: [{name: 'element-tree', setup(build) {
    build.onResolve({filter: /^react$/}, () => ({path: 'react', namespace: 'element-tree'}));
    build.onLoad({filter: /.*/, namespace: 'element-tree'}, () => ({contents: 'export default {createElement(type,props,...children){return {type,props,children}}}'}));
  }}] });
const { Markdown } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function spans(node) {
  if (Array.isArray(node)) return node.flatMap(spans);
  if (!node || typeof node !== 'object') return [];
  return [...(node.props?.['data-ms'] != null ? [node] : []), ...spans(node.children)];
}

test('table citations map to actual cells rather than matching alignment separators or repeated text', () => {
  const source = '| - | 内容 |\n| --- | --- |\n| --- | 相同 |\n| 相同 | `inline` |';
  const runs = spans(Markdown({tokens: marked.lexer(source), source}));
  assert.deepEqual(runs.map(run => source.slice(run.props['data-ms'], run.props['data-me'])), ['-', '内容', '---', '相同', '相同', 'inline']);
  assert.equal(runs[2].props['data-ms'], source.indexOf('| --- | 相同') + 2);
  assert.equal(runs[4].props['data-ms'], source.lastIndexOf('| 相同') + 2);
});

test('normalized escaped-pipe cells never guess an offset in another cell', () => {
  const source = '| A\\|B | C |\n| --- | --- |\n| A|B |';
  const runs = spans(Markdown({tokens: marked.lexer(source), source}));
  assert.ok(runs.every(run => source.slice(run.props['data-ms'], run.props['data-me']) === run.children.join('')));
  assert.ok(!runs.some(run => run.children.join('') === 'A|B'));
});
