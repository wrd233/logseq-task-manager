// Summarize only observed UI interactions in the current installed package.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import console from 'node:console';
import {acceptanceRoot} from './acceptance-context.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=acceptanceRoot(repo),m=JSON.parse(await readFile(join(root,'manifest.json')));
if(!m.ownerToken)throw Error('Owned package required');
const read=async n=>{const r=JSON.parse(await readFile(join(m.evidence,'interaction-'+n+'-runtime.json'))),v=r.values.find(x=>x.value?.pluginConnected)?.value;if(!v||r.errors.length||r.values.some(x=>x.exception)||r.manifest.identity.commit!==m.identity.commit||r.manifest.zipHash!==m.zipHash||v.editing)throw Error('Actual same-package readonly interaction required');return {r,v};};
const before=await read('keyboard-before'),enter=await read('keyboard-enter'),escape=await read('keyboard-escape');
for(const o of [enter,escape])if(JSON.stringify(o.v.source)!==JSON.stringify(before.v.source)||o.r.graphFileSha!==before.r.graphFileSha)throw Error('Keyboard changed source or Graph');
const ids=enter.v.report.sourceLocation;
if(before.v.report.sourceLocation.requestedSourceIds.length||ids.requestedSourceIds.length!==104||ids.mountedSourceIds.length!==104||ids.highlightedSourceIds.length!==104||escape.v.report.sourceLocation.requestedSourceIds.length)throw Error('Actual Enter/Escape source mapping missing');
const folded=await read('fold-before'),located=await read('fold-after'),restored=await read('fold-restored');
if(!folded.v.source['collapsed?']||!located.v.source['collapsed?']||restored.v.source['collapsed?']||JSON.stringify(folded.v.source)!==JSON.stringify(located.v.source)||folded.r.graphFileSha!==located.r.graphFileSha||located.v.report.sourceLocation.highlightedSourceIds.length!==1||located.v.report.sourceLocation.unavailableSourceIds.length!==103)throw Error('Actual folded-source preservation missing');
const selectedBefore=await read('selection-before'),selected=await read('selection-after');
if(selected.v.selection!=='阅读与协作合成验收'||JSON.stringify(selected.v.source)!==JSON.stringify(selectedBefore.v.source)||selected.r.graphFileSha!==selectedBefore.r.graphFileSha||JSON.stringify(selected.v.report.sourceLocation)!==JSON.stringify(selectedBefore.v.report.sourceLocation))throw Error('Selection accidentally located or changed source');
const data={schemaVersion:1,at:new Date().toISOString(),commit:m.identity.commit,zipHash:m.zipHash,status:'listed final package keyboard selection and fold paths verified',outsideRepository:true,capabilityInjection:false,keyboard:{requested:104,marked:104,mounted:104,visible:ids.visibleSourceIds.length,enterPassed:true,escapeCleared:true,sourceAndGraphUnchanged:true},fold:{nativeMenu:true,requested:104,marked:1,unavailable:103,collapsedKept:true,locatorSourceAndGraphUnchanged:true,restoredThroughNativeMenu:true},selection:{text:selected.v.selection,noSourceRequestOrGraphChange:true},rawEvidenceRoot:m.evidence,limits:['Initial AX activation did not establish keyboard focus; retained three ax-focus-attempt snapshots and repeated with observed real title focus','Native fold/unfold changes collapsed metadata intentionally; only the locator pair is byte-preserving','No physical IME, unsaved draft, clipboard restoration or arbitrary external drag/drop claim']};
await writeFile(join(repo,'docs/implementation/assets/reading-agent/package-focus-final-interaction-evidence.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({samePackage:true,keyboard:true,selection:true,fold:true,marked:104}));
