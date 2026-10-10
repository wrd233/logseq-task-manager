// Bounded same-process work-switch evidence; other lifecycle paths stay pending.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),read=async n=>JSON.parse(await readFile(join(m.evidence,n+'.json'))),i=process.argv.indexOf('--output'),output=process.argv[i+1];
if(!m.ownerToken||i<0||!/^package-[a-z0-9-]+-evidence\.json$/u.test(output??''))throw Error('Owned package and explicit safe output required');
const before=await read('resources-before-runtime'),after=await read('resources-after-work-runtime'),denied=await read('work-switch-old-scope-rejection');
for(const r of [before,after,denied])if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed package evidence');
if(!before.desktop?.pid||before.desktop.pid!==after.desktop?.pid||!before.hostTarget||before.hostTarget!==after.hostTarget)throw Error('Same actual process and native host required');
const stats=r=>({previews:r.pages.filter(p=>p.previewTargets.length).length,frames:r.pages.filter(p=>decodeURIComponent(p.url).startsWith('file://'+m.plugin+'/dist/')).length,workers:r.targets.filter(t=>t.type==='worker').length,pluginListeners:r.listeners.find(l=>l.surface==='plugin-document')?.all.length,nativeListeners:r.listeners.find(l=>l.surface==='native-document')?.all.length,readableBlobs:r.blobs.filter(b=>b.ok).length,blobReads:r.blobs.length});
const a=stats(before),b=stats(after);
if(a.previews!==2||b.previews!==0||a.frames!==1||b.frames!==1||a.workers!==1||b.workers!==1||!a.readableBlobs||!b.blobReads||b.readableBlobs||denied.results.length!==2||denied.results.some(r=>r.exitCode!==1||r.error.error.code!=='WORKSPACE_OFFLINE'))throw Error('Actual scoped disposal and old-call rejection required');
const data={schemaVersion:1,at:new Date().toISOString(),status:'listed same-process work switch verified; remaining lifecycle matrix pending',commit:m.identity.commit,zipHash:m.zipHash,outsideRepository:true,capabilityInjection:false,pid:before.desktop.pid,hostTarget:before.hostTarget,before:a,after:b,oldCalls:denied.results,observedBlobsRevoked:true,rawEvidenceRoot:m.evidence,limits:['This pair predates the cold restart; never compare its baseline to a new process.','Graph switch, normal disable and PDF worker cleanup are still pending on this ZIP.','Listener counts and one observed pair do not prove long-term absence of leaks.']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent',output),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({sameProcess:true,previews:[a.previews,b.previews],observedBlobsRevoked:true,oldCallsRejected:2,finalMatrix:false}));
