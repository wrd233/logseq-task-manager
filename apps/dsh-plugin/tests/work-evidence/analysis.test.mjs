import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisModel } from '../../src/work-evidence/analysis.mjs';
const value = { explanation: 'A change whose purpose is uncertain.', group: 'Recovery', question: 'Was recovery the intended outcome?', uncertainties: ['No test output'], evidenceRefs: ['git:source'] };
function model(output = value, finish = { kind: 'stop' }) {
  const requests = [];
  const ctx = { agentDefaultModel: { currentSelection: () => ({ provider: 'fixture-provider', model: 'fixture-model' }) }, llm: { async *stream(request) { requests.push(request); yield { type: 'text-delta', text: JSON.stringify(output) }; yield { type: 'finish', reason: finish }; } } };
  for (const name of ['sessionController','tools','agent']) Object.defineProperty(ctx,name,{get(){return assert.fail(`forbidden ${name}`);}});
  return { runtime: analysisModel(ctx), requests };
}
test('host model adapter uses the actual DSH stream vocabulary without tools or message submission', async () => {
  const f = model(), packet = { evidence: [{ ref: 'git:source', text: 'diff content' }] };
  assert.deepEqual(await f.runtime.explain(packet), value);
  const request = f.requests[0]; assert.equal(request.provider,'fixture-provider'); assert.equal(request.messages[0].role,'user'); assert.equal(request.tools,undefined); assert.equal(request.sessionId,undefined); assert(request.signal); assert.equal(request.messages[0].content[0].text,JSON.stringify(packet));
});
test('missing model, fabricated refs, malformed JSON shape and failed finish are genuine failures', async () => {
  assert.throws(()=>analysisModel({}).selection(),/MODEL_NOT_CONFIGURED/);
  await assert.rejects(model({...value,evidenceRefs:['invented']}).runtime.explain({evidence:[{ref:'git:source'}]}),/ANALYSIS_INVALID_REFERENCES/);
  await assert.rejects(model({}).runtime.explain({evidence:[]}),/ANALYSIS_INVALID_REFERENCES/);
  await assert.rejects(model(value,{kind:'error',failure:{code:'AUTH'}}).runtime.explain({evidence:[]}),/AUTH/);
});
test('an already aborted analysis never invokes a provider and reports a resumable local interruption',async()=>{
 const f=model();
 await assert.rejects(f.runtime.explain({evidence:[]},undefined,globalThis.AbortSignal.abort()),/ANALYSIS_INTERRUPTED/);
 assert.equal(f.requests.length,0);
});
