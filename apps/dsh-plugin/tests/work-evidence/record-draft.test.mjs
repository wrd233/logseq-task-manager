/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordDraft } from '../../src/work-evidence/record-draft.mjs';
import { structureRows } from '../../src/structure-view/model.mjs';
test('clarification/handoff drafts fence later typing and restore the exact lost receipt payload after reload', async () => {
 let backup,release, count=0; const storage={read:()=>backup,write:value=>{backup=structuredClone(value);}};
 const draft=new RecordDraft('owned:handoff',storage,()=>`request-${++count}`); draft.edit('submitted',{sourceEventIds:['source'],supersedesId:'old'});
 const save=draft.save({scopeId:'scope',observationId:'obs',...draft.state.meta},payload=>new Promise(resolve=>{release=()=>resolve({hash:'hash',value:{id:payload.requestId,...payload}});}));
 draft.edit('later user typing'); release(); await save; assert.equal(draft.state.text,'later user typing');
 await assert.rejects(draft.save({scopeId:'scope',observationId:'obs'},async()=>{throw Error('lost receipt');}));
 draft.edit('even later input'); const request=draft.state.attempt.payload;
 const reopened=new RecordDraft('owned:handoff',storage); assert.equal(reopened.state.status,'unknown');
 await reopened.save({scopeId:'different-must-not-be-used'},async payload=>{assert.deepEqual(payload,request);return{hash:'hash',value:{id:payload.requestId,...payload}};});
 assert.equal(reopened.state.text,'even later input'); assert.equal(reopened.state.attempt,null); assert.equal(count,2);
});
test('skipping never clears typed text and invalid receipts stay retryable',async()=>{
 const draft=new RecordDraft('owned:answer'); draft.edit('not yet ready to answer');
 await draft.save({text:'',skipped:true},async payload=>({hash:'hash',value:{id:payload.requestId,...payload}}));
 assert.equal(draft.state.text,'not yet ready to answer');
 await assert.rejects(draft.save({},async()=>({hash:'hash',value:{id:'wrong',text:'wrong'}})),/INVALID_WORK_RECEIPT/);
 assert.equal(draft.state.status,'unknown'); assert.equal(draft.state.text,'not yet ready to answer');
});
test('generic node-edge layout has no business dependencies, keeps child selection stable and honors expansion',()=>{
 const nodes=[{id:'purpose',label:'Purpose'},{id:'a',label:'a.txt'},{id:'b',label:'b.txt'},{id:'other',label:'Other'}],edges=[{from:'purpose',to:'a'},{from:'purpose',to:'b'}];
 assert.deepEqual(structureRows(nodes,edges).map(r=>[r.id,r.depth]),[['purpose',0],['a',1],['b',1],['other',0]]);
 assert.deepEqual(structureRows(nodes,edges,new Set(['purpose'])).map(r=>r.id),['purpose','other']);
 assert.equal(structureRows(nodes,edges)[2].id,'b');
 assert.equal(structureRows([{id:'a'},{id:'b'}],[{from:'a',to:'b'},{from:'b',to:'a'}]).length,2);
});
test('an explicitly rejected interpretation version keeps the answer editable instead of pinning an impossible retry',async()=>{
 const draft=new RecordDraft('answer');draft.edit('retained explanation edit');
 await assert.rejects(draft.save({interpretationId:'old'},async()=>{throw Object.assign(Error('stale'),{code:'INTERPRETATION_CHANGED'});}));
 assert.equal(draft.state.attempt,null);assert.equal(draft.state.text,'retained explanation edit');
 await draft.save({interpretationId:'new'},async payload=>({hash:'hash',value:{id:payload.requestId,...payload}}));
 assert.equal(draft.state.text,'');
});
