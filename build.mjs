import {build} from 'esbuild';
import {mkdir,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/plugin.js'],bundle:true,format:'iife',target:'chrome110',outfile:'dist/plugin.js'});
await cp('node_modules/@logseq/libs/dist/lsplugin.user.js','dist/sdk.js');
await cp('node_modules/vditor/dist','dist/vditor/dist',{recursive:true});
await cp('src/style.css','dist/style.css');
await cp('src/index.html','dist/index.html');
console.log('Built local-only Logseq longdoc plugin.');
