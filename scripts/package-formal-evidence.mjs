// Read-only final-package Journal queries and strict observed-fact summary.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile);
if(!m.ownerToken)throw Error('Actual owned outside-repository package required');
const read=async n=>JSON.parse(await readFile(join(m.evidence,n+'.json'))),same=r=>{if(r.commit!==m.identity.commit||r.zipHash!==m.zipHash)throw Error('Mixed package facts');};
const storage=await read('formal-storage-exercise'),focus=await read('formal-focus-exercise'),boundary=await read('formal-boundary-exercise'),grant=await read('formal-todo-grant-exercise'),restart=await read('formal-restart-exercise'),input=await read('input-source-highlight-exercise');
for(const r of [storage.runtime,boundary.runtime,grant,restart,input])same(r);
if(storage.views.length!==2||!storage.verifiedBoundedFiles||storage.records.some(r=>r.bytes!==87)||focus.applied.commit.actor.type!=='AGENT'||focus.applied.projectionObligation.status!=='VERIFIED'||focus.after.object.lifecycle!=='OPEN'||!focus.replay?.sameCommit||!focus.replay.graphUnchanged||boundary.bodyResults.length!==3||boundary.bodyResults.some(r=>r.result.status!=='not-applied'||!r.result.durable||!r.sameQueryDigest)||!boundary.graphUnchanged||!boundary.formalStateUnchanged||grant.registeredFormalRoots.some(r=>r.selectable)||!restart.after.sourceUnchanged||!restart.after.allPermissionsRevoked||!restart.after.currentFormalClosureReadonlyQuery||!input.nodeValueSelectionAndSavedSourcePreserved||!input.materialClick.sameNonemptyHighlightSet)throw Error('Actual formal/restart/input acceptance facts required');
const cli=async words=>JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace',...words,'--directory',m.work,'--state-dir',m.channel,'--client','formal-boundary-desktop','--json'],{cwd:root,timeout:30000})).stdout);
const status=await cli(['status']);if(status.capabilities.content||status.capabilities.fileWrite||status.authorizesTodo||status.binding.scope.rootUuid!==boundary.source.scope.rootUuid||status.binding.scope.graphId!==boundary.source.scope.graphId)throw Error('Actual same-scope read-only reconnect required');
const source=await cli(['content','read']),queries=[];
for(const [index,r] of boundary.bodyResults.entries()){
  const id='formal-boundary-body-'+index,result=await cli(['content','result',id]),recovered=await cli(['content','recover',id]);
  if(result.record.digest!==r.result.record.digest||recovered.record.digest!==result.record.digest||result.status!=='not-applied'||!result.durable)throw Error('Reliable blocked Journal changed during readonly reconnect');
  queries.push({requestId:id,status:result.status,durable:result.durable,sameDigest:true,reason:result.record.items[0].reason});
}
if(JSON.stringify(source.blocks)!==JSON.stringify(boundary.source.blocks))throw Error('Readonly formal Journal query changed sources');
await writeFile(join(m.evidence,'formal-readonly-reconnect-exercise.json'),JSON.stringify({at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,queries,sourceUnchanged:true,body:false,file:false,todo:false},null,2)+'\n');
const data={schemaVersion:1,status:'listed actual formal/restart/input paths verified; remaining lifecycle and Page matrix',commit:m.identity.commit,zipHash:m.zipHash,observedAt:new Date().toISOString(),capabilityInjection:false,
  normalKernel:{objects:storage.views.map(v=>({id:v.object.id,kind:v.object.kind,anchor:v.anchor.externalId,lifecycle:v.object.lifecycle})),isolatedDatabase:true,externalServiceFromRepository:true,remoteProvider:false,pluginAndCompanionOutsideRepository:true},
  privateStorage:{files:storage.records.map(r=>({name:r.name,key:r.key,filenameBytes:r.bytes,empty:r.text===''})),verifiedBoundedEnvelopes:true,createRequestsCleared:true,downgradeVerified:false},
  governedFocus:{objectId:focus.objectId,actorType:focus.applied.commit.actor.type,commit:focus.applied.commit.id,projectionStatus:focus.applied.projectionObligation.status,field:focus.after.anchor.projectionFocusUuid,lifecycle:'OPEN',replaySameCommit:true,graphUnchangedOnReplay:true},
  ordinaryBoundary:{body:boundary.bodyResults.map(r=>({uuid:r.uuid,reason:r.result.record.items[0].reason,status:r.result.status,durable:r.result.durable})),todo:boundary.todoRejected,localFormalRootsNotSelectable:grant.registeredFormalRoots,sourceAndFormalStateAndGraphUnchanged:true,inRangeFormalTodoRuntimeAttempt:false},
  restart:restart.after,readonlyJournalReconnect:{queries,sourceUnchanged:true,allWritePermissionsFalse:true},nativeInput:input,
  limitations:['formal TODO refusal was outside the actual selected grant; registered roots cannot be granted by this trusted UI','Kernel is an ordinary external service from repository source, not a bundled standalone Kernel release','physical IME and unsaved draft not established; focus moved to reading control','stock Desktop unmounted source first returned native-input-unavailable; manual native scroll mounted it','backup/restore and safe downgrade not established; baseline schema/fake executor/path/race risks remain','resource cleanup and Page final-package acceptance still pending']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-formal-stage-evidence.json'),JSON.stringify(data,null,2)+'\n');
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-input-stage-evidence.json'),JSON.stringify(input,null,2)+'\n');console.log(JSON.stringify({samePackage:true,formalBodyBlocked:3,formalTodoOutsideRangeRejected:2,registeredRootsNotSelectable:2,restartRevoked:true,readonlyJournalQueries:queries.length,nativeInputPreserved:true,finalMatrix:false}));
