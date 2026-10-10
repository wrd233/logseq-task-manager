// Verify actual saved-input preservation; never manufacture an unsaved draft.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {acceptanceRoot} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),exec=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken)throw Error('Owned package required');
const names=['before-highlight','after-highlight','after-material','after-collaboration'],observations=[];
const uuid='b7261007-0000-4000-8000-000000000028';
for(const n of names){
  const r=JSON.parse(await readFile(join(m.evidence,'input-'+n+'-runtime.json'))),v=r.values.find(x=>x.value?.pluginConnected)?.value;
  if(r.errors.length||r.values.some(x=>x.exception)||r.manifest.identity.commit!==m.identity.commit||r.manifest.zipHash!==m.zipHash||v?.editing!==uuid)throw Error('Actual same-package editing observation required');
  const input=v.inputs.find(x=>x.uuid===uuid),node=r.nativeInputNodes.find(x=>x.attributes.includes('edit-block-6-'+uuid));
  if(!input||!node)throw Error('Actual native textarea required');observations.push({name:n,r,v,input,node:node.backendNodeId});
}
const first=observations[0];
for(const o of observations)if(o.node!==first.node||o.input.value!==first.input.value||o.input.start!==first.input.start||o.input.end!==first.input.end||JSON.stringify(o.v.source)!==JSON.stringify(first.v.source)||o.r.graphFileSha!==first.r.graphFileSha)throw Error('Input node/value/selection or saved Graph changed');
const material=observations[2].v.previews[0];
if(!material||material.target!=='material:22ca6f7b-890c-436a-b1c0-9c31944b4573'||material.version!=='34d5d0d525f75147a43fc4df64e5ea7d048b4c3737f940d470c407115d65fa94')throw Error('Actual image preview required');
const scene=JSON.parse((await exec(process.execPath,[join(m.plugin,'dist/workspace.mjs'),'workspace','collaboration','read','--directory',m.work,'--state-dir',m.channel,'--client','input-final','--json'],{cwd:root,timeout:30000,maxBuffer:4_194_304})).stdout).scene;
if(scene.nativeDraft.included!==false||scene.nativeDraft.editing!==true||scene.nativeDraft.reason!=='saved-source-only'||scene.savedSource.blocks.length!==104)throw Error('Actual saved-only export required');
const data={schemaVersion:1,at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,status:'listed saved native input paths verified',outsideRepository:true,capabilityInjection:false,nativeInput:{uuid,backendNodeId:first.node,valueHash:sha(first.input.value),selection:{start:first.input.start,end:first.input.end},nodeValueAndSelectionPreserved:true,editingStillActive:true},sourceAndGraphUnchanged:true,material:{target:material.target,version:material.version},titleAttempt:{requested:observations[1].v.report.sourceLocation.requestedSourceIds.length,highlighted:observations[1].v.report.sourceLocation.highlightedSourceIds.length,selectionPreserved:true,notCountedAsTitleLocatorAcceptance:true},collaborationExport:{sceneId:scene.sceneId,savedSources:104,nativeDraft:scene.nativeDraft},rawEvidence:names.map(n=>'input-'+n+'-runtime.json'),rawEvidenceRoot:m.evidence,limits:['Only already saved input; no unsaved draft or physical IME proof','The selected-text title attempt kept zero source requests and is not counted as a locator pass','Focus changed with explicit clicks; original textarea and selection persisted','No system clipboard, Undo, arbitrary host or long-duration leak proof']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-focus-final-input-evidence.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({samePackage:true,node:first.node,selection:[first.input.start,first.input.end],savedSources:104,editingPreserved:true,titleLocatorPassed:false}));
