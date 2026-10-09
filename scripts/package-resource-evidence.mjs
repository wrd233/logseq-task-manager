// Derive a bounded lifecycle summary from actual CDP observations.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json')));
const read=async name=>JSON.parse(await readFile(join(m.evidence,name+'.json')));
const same=r=>{if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed package resource evidence');};
const nativeId=r=>r.targets.find(t=>t.type==='page'&&decodeURIComponent(t.url).startsWith('file://'+m.app+'/'))?.id;
const stats=r=>({previewPages:r.pages.filter(p=>p.previewTargets.length).length,pluginFrames:r.pages.filter(p=>decodeURIComponent(p.url).startsWith('file://'+m.plugin+'/dist/')).length,workers:r.targets.filter(t=>t.type==='worker').length,nativeDocumentListeners:r.listeners.find(l=>l.surface==='native-document')?.all.length,blobsReadable:r.blobs.filter(b=>b.ok).length,blobReads:r.blobs.length});
const pairs=[];
for(const [kind,a,b,minWorkers,removed] of [['work','before','after-work',2,false],['graph','before-graph','after-graph',2,false],['disable-image','before-unload','after-unload',1,true],['disable-pdf','before-unload-pdf','after-unload-pdf',3,true]]){
  const before=await read('resources-'+a+'-runtime'),after=await read('resources-'+b+'-runtime');same(before);same(after);
  if(!nativeId(before)||nativeId(before)!==nativeId(after)||before.desktop&&before.desktop.pid!==after.desktop?.pid)throw Error('Lifecycle pair spans a Desktop restart');
  const x=stats(before),y=stats(after);
  if(x.previewPages<2||x.workers<minWorkers||y.previewPages||y.workers!==1||removed&&y.pluginFrames||!removed&&y.pluginFrames!==1)throw Error('Actual window/worker cleanup missing: '+kind);
  if(kind!=='disable-pdf'&&(!x.blobsReadable||!y.blobReads||y.blobsReadable))throw Error('Actual blob revocation missing');
  if(removed&&!(y.nativeDocumentListeners<x.nativeDocumentListeners))throw Error('Actual native listener reduction missing');
  pairs.push({kind,beforeAt:before.observedAt,afterAt:after.observedAt,hostTarget:nativeId(before),pid:before.desktop?.pid??null,before:x,after:y,sameNativeHost:true});
}
const channel=await read('work-switch-channel-exercise'),encoding=await read('graph-asset-fixture-degradation');same(channel);same(encoding);
if(channel.rejections.length!==2||channel.rejections.some(r=>r.code!=='WORKSPACE_OFFLINE')||encoding.encodingCompatibilityPassed!==false||!encoding.actualNativeRewriteCompleted)throw Error('Actual lifecycle rejection/encoding limitation missing');
const data={schemaVersion:1,status:'listed lifecycle paths verified; remaining final matrix incomplete',observedAt:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,outsideRepository:true,capabilityInjection:false,pairs,oldWorkCalls:channel.rejections,graphAssetCompatibility:{percentEncodedSpacePassed:false,nativeHref:encoding.actualNativeHref,result:encoding.actualUIResult,ordinaryNativeAliases:encoding.alternativeTargets,parentTextPreserved:encoding.originalParentTextPreserved},rawEvidenceRoot:m.evidence,limits:['Previous process handles were absent on continuation; unload baselines were re-established on the new live host and never paired across that restart','DOM inspector cannot reliably attribute native SDK wrapper listeners to individual plugin components; only actual totals are reported','No proof of every timer, arbitrary callback, long-duration soak or all platforms','Graph-two asset links are on separate ordinary leaf scopes; changing leaf closes the prior independent preview','Percent-encoded space in this native host was double encoded; no general native URL encoding compatibility claim']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-resource-stage-evidence.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({samePackage:true,pairs:pairs.length,pdfWorkersReleased:true,blobsRevoked:true,finalMatrix:false}));
