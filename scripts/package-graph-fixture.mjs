// Prepare only an exclusive second synthetic Graph. Switching Graphs and
// opening its assets remain normal Desktop UI actions.
import {readFile,writeFile,mkdir,copyFile,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),graph=join(root,'graph-two'),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken)throw Error('Outside-repository owned package required');
const before=sha(await readFile(join(m.graph,'pages/合成阅读与协作.md'))),corpus=JSON.parse(await readFile(join(repo,'apps/logseq-plugin/tests/fixtures/material-preview/desktop-acceptance/manifest.json')));
await mkdir(graph,{mode:0o700});
for(const dir of ['assets','pages','journals','logseq'])await mkdir(join(graph,dir),{mode:0o700});
const files=[];
for(const [file,target]of [['中文 图像.png','image.png'],['中文 多页扫描.pdf','scan.pdf']]){
  const original=join(root,'preview-corpus/materials',file),expected=corpus.samples.find(s=>s.relativePath==='materials/'+file)?.sha256,version=sha(await readFile(original));
  if(!expected||version!==expected)throw Error('Original fixture bytes differ');
  await copyFile(original,join(graph,'assets',target),constants.COPYFILE_EXCL);if(sha(await readFile(join(graph,'assets',target)))!==version)throw Error('Actual asset copy differs');files.push({file:target,version,original});
}
await writeFile(join(graph,'logseq/config.edn'),'{:git-auto-push false :git-auto-commit false :ui/show-brackets? true}\n',{flag:'wx'});
await writeFile(join(graph,'pages/合成资产页.md'),'- **[MiniProject]** 只读资产合成验收；仅使用隔离实例中的原样副本。\n  id:: b7261010-0000-4000-8000-000000000001\n  - [PNG资产](../assets/image.png)\n    id:: b7261010-0000-4000-8000-000000000002\n  - [PDF资产](../assets/scan.pdf)\n    id:: b7261010-0000-4000-8000-000000000003\n',{flag:'wx'});
if(sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))!==before)throw Error('Primary Graph changed');
await writeFile(join(m.evidence,'graph-assets-final-fixture.json'),JSON.stringify({at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,graph,page:'合成资产页',files,primaryGraphHash:before,primaryGraphUnchanged:true,asciiAssetAliases:true,scope:'Copied verified synthetic bytes only; no claim about special-name URL encoding'},null,2)+'\n');console.log(JSON.stringify({graph,files:files.length,primaryGraphUnchanged:true}));
