// Strict summary of observations from the final ZIP; never changes host state.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),sha=v=>createHash('sha256').update(v).digest('hex');
const read=async n=>JSON.parse(await readFile(join(m.evidence,n+'.json'))),same=r=>{if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed final ZIP evidence');};
if(!m.ownerToken)throw Error('Owned outside-repository installation required');
const stats=r=>({previewPages:r.pages.filter(p=>p.previewTargets.length).length,pluginFrames:r.pages.filter(p=>decodeURIComponent(p.url).startsWith('file://'+m.plugin+'/dist/')).length,workers:r.targets.filter(t=>t.type==='worker').length,nativeDocumentListeners:r.listeners.find(l=>l.surface==='native-document')?.all.length,blobsReadable:r.blobs.filter(b=>b.ok).length,blobReads:r.blobs.length}),pairs=[];
for(const [kind,a,b,removed]of [['work','before','after-work',false],['graph','before-graph','after-graph',false],['disable-image','before-unload','after-unload',true],['disable-pdf','before-unload-pdf','after-unload-pdf',true]]){
  const before=await read('resources-'+a+'-runtime'),after=await read('resources-'+b+'-runtime');same(before);same(after);
  if(!before.desktop?.pid||before.desktop.pid!==after.desktop?.pid||!before.hostTarget||before.hostTarget!==after.hostTarget)throw Error('Lifecycle pair spans a restart');
  const x=stats(before),y=stats(after);
  if(x.previewPages!==2||x.pluginFrames!==1||y.previewPages!==0||y.pluginFrames!==(removed?0:1)||y.workers!==1||x.workers<(kind==='disable-pdf'?3:1))throw Error('Actual preview/frame/worker cleanup missing');
  if(kind!=='disable-pdf'&&(!x.blobsReadable||!y.blobReads||y.blobsReadable))throw Error('Observed blobs were not revoked');
  if(removed&&!(y.nativeDocumentListeners<x.nativeDocumentListeners))throw Error('Native listener reduction missing');
  pairs.push({kind,pid:before.desktop.pid,hostTarget:before.hostTarget,beforeAt:before.observedAt,afterAt:after.observedAt,before:x,after:y});
}
const work=await read('work-switch-old-scope-rejection'),graph=await read('graph-switch-old-scope-rejection'),unload=await read('unload-old-scope-rejection'),invitation=await read('graph-switch-live-invitation'),late=await read('graph-switch-late-plan'),fixture=await read('graph-assets-final-fixture');
for(const r of [work,graph,unload,fixture])same(r);
if(![work,graph].every(r=>r.results.length===2&&r.results.every(x=>x.exitCode===1&&x.error.error.code==='WORKSPACE_OFFLINE'))||unload.error.error.code!=='WORKSPACE_OFFLINE'||late.requestId!==graph.liveInvitation||!JSON.stringify(invitation).includes(late.requestId))throw Error('Actual stale scope rejections missing');
if(sha(await readFile(join(m.graph,'pages/合成阅读与协作.md')))!==fixture.primaryGraphHash)throw Error('Primary Graph bytes changed during lifecycle checks');
for(const f of fixture.files)if(sha(await readFile(join(fixture.graph,'assets',f.file)))!==f.version||sha(await readFile(f.original))!==f.version)throw Error('Asset bytes changed');
const data={schemaVersion:1,at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,status:'listed same-process lifecycle paths verified',outsideRepository:true,capabilityInjection:false,pairs,oldWorkCalls:work.results,oldGraphCalls:graph.results,actualPreswitchReadingRequest:late.requestId,disableOldCall:unload.error,primaryGraphUnchanged:true,syntheticAssetBytesUnchanged:true,asciiAssetAliases:true,rawEvidenceRoot:m.evidence,limits:['Only these observed lifecycle paths; no all-timer, arbitrary-callback or long-duration leak proof','Native SDK wrapper listener attribution unavailable; actual document totals are reported','ASCII asset aliases do not prove special-name native URL encoding compatibility','No production Graph, cross-platform, physical IME, unsaved draft or ordinary IO-race acceptance']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-layout-final-lifecycle-evidence.json'),JSON.stringify(data,null,2)+'\n');
const input=JSON.parse(await readFile(join(repo,'docs/implementation/assets/reading-agent/package-layout-final-input-evidence.json'))),exported=await read('input-collaboration-export-exercise'),observed=await read('input-after-collaboration-runtime');same(input);same(exported);
const scene=exported.scene.scene;
if(!exported.sourceUnchanged||!exported.graphUnchanged||!exported.editingStillActive||exported.node!==input.nativeInput.backendNodeId||JSON.stringify(exported.selection)!==JSON.stringify([input.nativeInput.selection.start,input.nativeInput.selection.end])||!observed.nativeInputNodes.some(n=>n.backendNodeId===exported.node)||scene.nativeDraft.included!==false||scene.nativeDraft.editing!==true||scene.nativeDraft.reason!=='saved-source-only'||scene.savedSource.blocks.length!==103)throw Error('Actual saved-source-only export/input preservation missing');
input.collaborationExport={at:exported.at,sceneId:scene.sceneId,savedSources:scene.savedSource.blocks.length,nativeDraft:scene.nativeDraft,inputNodeAndSelectionPreserved:true,sourceAndGraphUnchanged:true};
input.rawEvidence=[...new Set([...input.rawEvidence,'input-after-collaboration-runtime.json','input-collaboration-export-exercise.json'])];
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-layout-final-input-evidence.json'),JSON.stringify(input,null,2)+'\n');
console.log(JSON.stringify({sameZIP:true,sameProcessPairs:pairs.length,pdfWorkersReleased:true,observedBlobsRevoked:true,savedOnlyExport:true,finalMatrix:false}));
