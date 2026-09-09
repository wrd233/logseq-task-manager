import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
let require=createRequire(import.meta.url);
try{require.resolve('esbuild')}catch{require=createRequire('/Users/wangrundong/work/任务管理中心-logseq插件/package.json')}
const {build}=require('esbuild');
await mkdir('dist',{recursive:true});
let config;
try{config=JSON.parse(await readFile('runtime.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e;config={port:8768,token:randomBytes(32).toString('base64url')};await writeFile('runtime.json',JSON.stringify(config),{mode:0o600})}
await build({entryPoints:['plugin.ts'],bundle:true,format:'iife',target:'chrome110',outfile:'dist/plugin.js',define:{RUNTIME:JSON.stringify(config)},alias:{dompurify:require.resolve('dompurify')}});
await build({entryPoints:['external.ts'],bundle:true,format:'iife',target:'chrome110',outfile:'dist/external.js',alias:{dompurify:require.resolve('dompurify')}});
await copyFile(require.resolve('@logseq/libs/dist/lsplugin.user.js'),'dist/sdk.js');
const shell=await readFile('shell.html','utf8');
await writeFile('dist/index.html',shell.replace('<!-- scripts -->','<script src="sdk.js"></script><script src="plugin.js"></script>'));
await writeFile('dist/external.html',shell.replace('<!-- scripts -->','<script src="external.js"></script>'));
console.log('Built standalone Logseq plugin and external preview.');
