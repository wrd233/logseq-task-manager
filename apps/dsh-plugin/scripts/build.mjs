import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}dist`, { recursive: true });
await build({ entryPoints: [`${root}src/index.mjs`], outfile: `${root}dist/index.js`, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'], sourcemap: true });
const client = await build({ entryPoints: [`${root}src/client.jsx`], bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', external: ['react', 'react/jsx-runtime'], write: false });
const manifest = JSON.parse(await readFile(`${root}package.json`, 'utf8'));
await writeFile(`${root}dist/client.js`, `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`);
