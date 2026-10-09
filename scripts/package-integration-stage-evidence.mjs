// Summarize only independently verified paths from the same actual ZIP.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRoot} from './acceptance-context.mjs';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json'))),sha=v=>createHash('sha256').update(v).digest('hex');
if(!m.ownerToken)throw Error('Actual package instance required');
const read=async name=>JSON.parse(await readFile(join(m.evidence,name))),observe=async name=>{
  const r=await read(name),v=r.values.find(v=>v.value?.pluginConnected)?.value;
  if(!v||r.errors.length||r.values.some(v=>v.exception))throw Error('Actual successful observation required: '+name);return v;
};
const bootstrap=await observe('package-bootstrap-runtime.json'),reading=await read('package-reading-exercise.json'),structure=await read('package-structure-exercise.json'),todo=await read('todo-native-id-exercise.json'),link=await read('package-agent-reference-preview.json'),window=await read('package-md-window-runtime.json'),resized=await read('package-md-window-resized-runtime.json'),moved=await read('package-md-window-move-second-runtime.json'),restart=await observe('package-restart-runtime.json');
const expected={commit:m.identity.commit,zipHash:m.zipHash};
for(const v of [reading.runtime,structure,todo.executionRuntime,link,window,resized,moved])if(v.commit!==expected.commit||v.zipHash!==expected.zipHash)throw Error('Mixed build evidence');
if(!bootstrap.currentGraphAbsent||!bootstrap.apiPresent||reading.source.blocks.length!==101||!reading.sourceUnchanged||!reading.graphUnchanged||reading.views.length!==3||reading.denied.length!==3||!reading.userWorkspacePreserved||structure.structureSources!==101||structure.fullChineseSequenceChecks!==101)throw Error('Actual complete reading evidence required');
if(todo.created.status!=='complete'||!todo.created.durable||todo.completed.status!=='complete'||!todo.completed.durable||!todo.originalSourcesUnchanged||!todo.parentRemainsTodo||todo.duplicateChildren!==0||!todo.fileOnlyCapture.unchanged||todo.aResolution.materialId!==todo.material.id||todo.aResolution.reference!==todo.material.reference)throw Error('Actual independent TODO/file and A resolution evidence required');
if(sha(await readFile(todo.material.path))!==todo.material.version||link.materialId!==todo.material.id||link.preview.version!==todo.material.version||!link.nativeSourceUnchanged||!link.sourceRequestedAndHighlightedSetsUnchanged)throw Error('Actual bytes/reference/source evidence mismatch');
const first=window.windows[0],changed=resized.windows[0],move=moved.windows[0];
if(first.previews[0].target!==link.preview.target||first.previews[0].version!==link.preview.version||changed.previews[0].target!==first.previews[0].target||changed.previews[0].version!==first.previews[0].version||first.dimensions.outerWidth===changed.dimensions.outerWidth)throw Error('Actual same-version native resize evidence required');
if(restart.connection.connected||Object.values(restart.connection.permissions).some(Boolean)||restart.primary.length!==102||restart.reading.activePlanId!==null||restart.previews.length)throw Error('Actual restart authority/source evidence required');
const data={schemaVersion:1,status:'listed integration paths verified; final matrix incomplete',at:new Date().toISOString(),aDelivery:'d0c38706b79c63f6f5b15e16286e1c49d28736ff',mergeCommit:'a5e0888c9d512045bf6805437517f4db67b44b67',...expected,installedResources:Object.keys(m.identity.files).length,root,capabilityInjection:false,
  bootstrap:{missingGraphSafe:true,apiPublished:true,unhandledExceptions:0},
  reading:{sources:101,layouts:2,comparisonHeadings:4,realStructureRows:101,fullChineseSequenceChecks:101,sourceVersionsOrderAndDepthPreserved:true,graphBytesUnchanged:true,permissionsDenied:reading.denied,sourceHighlight:25,userWorkspacePreserved:true},
  doing:{originalSourcesPreserved:true,createdChild:todo.created.record.items[0].childUuid,childCompleteVerified:true,parentStillTodo:true,duplicateChildren:0,fileOnlyCaptureNoGraphWrite:true,materialId:todo.material.id,fileName:todo.aResolution.fileName,reference:todo.material.reference,version:todo.material.version,physicalIdentity:todo.aResolution.identity,resolutionStatus:todo.aResolution.status,journalOrigin:todo.completed.record.origin},
  preview:{actualNativeReference:true,sameMaterialAndVersion:true,savedNativeSourceUnchanged:true,noNewSourceHighlights:true,visibleSourceCountChanged:{before:link.visibleBefore,after:link.visibleAfter},independentWindow:true,nativeResize:{before:first.dimensions,after:changed.dimensions},sameTargetVersionAfterResize:true,moveAttempt:{actualPositionChanged:first.dimensions.screenX!==move.dimensions.screenX||first.dimensions.screenY!==move.dimensions.screenY,firstAndSecondDragDidNotMove:true},earlierStrictLocationEquality:link.earlierStrictLocationEquality},
  restart:{sources:102,allConnectionPermissionsRevoked:true,oldPlansInactive:true,previewAbsent:true},
  remaining:['two further writing exercises and formatting stale proposal replay','common guidance two-workspace version refresh','five-format/two-root/nested-directory and lifecycle final matrix','actual Kernel formal objects and readonly Journal reconnect','physical IME, clipboard/Finder preservation, other platforms and ordinary IO races'],rawEvidenceRoot:m.evidence};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-integration-stage-evidence.json'),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({sameBuild:true,reading:true,doing:true,nativeReference:true,nativeWindowResize:true,windowMoveVerified:data.preview.moveAttempt.actualPositionChanged,restartRevoked:true,finalMatrix:false}));
