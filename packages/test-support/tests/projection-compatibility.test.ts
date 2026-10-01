import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildManagedProjection, projectClosure, parseSemanticOperation, type GraphEffect, type ManagedProjection, type PrimaryAnchor, type EffectiveClosure, type WorkObject } from '@task-copilot/contracts';
import { SqliteStore } from '@task-copilot/sqlite';
import { FakeGraphAdapter } from '@task-copilot/test-support';
import { Kernel } from '@task-copilot/kernel';
async function protocolSamples() {
  const at = '2026-10-01T00:00:00.000Z';
  const store = new SqliteStore(':memory:');
  const kernel = new Kernel(store, { now: () => at });
  const graph = new FakeGraphAdapter(() => at);
  const actor = { type: 'USER' as const, id: 'local-user' };
  const source = graph.seedNaturalRecord('protocol-graph', 'protocol-source', 'TODO 协议样本');
  const samples: Array<{label: string; object: WorkObject; anchor: PrimaryAnchor; closure: EffectiveClosure | null; projection: ManagedProjection}> = [];
  const content = '核对协议样本';
  const contentHash = createHash('sha256').update(content).digest('hex');
  let objectId = '';
  async function verify(result: {commit: {id: string; targetId: string | null}; graphEffect: GraphEffect}, formal = true) {
    const applied = await graph.applyGraphEffect(result.graphEffect);
    const snapshot = await graph.readGraphSnapshot({graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid});
    if (formal) kernel.verifyFormalProjection(result.commit.id, applied, snapshot);
    else kernel.complete(result.commit.id, applied, snapshot);
    objectId = result.commit.targetId!;
  }
  function sample(label: string) {
    samples.push({label, object: store.getWorkObject(objectId)!, anchor: store.getAnchorForWorkObject(objectId)!, closure: store.getClosureHistory(objectId).current, projection: kernel.targetSnapshotInput(objectId).expectedProjection!});
  }
  async function change(type: string, input: unknown, label: string) {
    const object = store.getWorkObject(objectId)!;
    const snapshot = await graph.readGraphSnapshot({graphId: source.graphId, sourceBlockUuid: source.sourceBlockUuid});
    const result = kernel.commitFormal(parseSemanticOperation({operationId: `protocol-${label}`, type, actor, target:{workObjectId: objectId, expectedVersion: object.version, expectedProjectionHash: snapshot.projection!.projectionHash}, input, ...(type === 'CHANGE_ENGAGEMENT' ? {evidenceDependencies:[{evidenceId:'protocol-evidence',contentHash}]} : {})}), snapshot);
    await verify(result); sample(label); return result;
  }
  try {
    await verify(kernel.commitFormal(parseSemanticOperation({operationId:'protocol-create',type:'CREATE_WORK_OBJECT',actor,input:{kind:'TASK',title:'协议样本',anchor:{graphId:source.graphId,blockUuid:source.sourceBlockUuid,sourceContentHash:source.sourceContentHash}}}),source));
    sample('create');
    store.putEvidence({id:'protocol-evidence',workObjectId:objectId,sourceType:'LOGSEQ_BLOCK',graphId:source.graphId,externalId:source.sourceBlockUuid,frozenContent:content,contentHash,frozenAt:at,locator:{graphId:source.graphId,blockUuid:source.sourceBlockUuid}});
    await change('RENAME_WORK_OBJECT', {title:'协议样本更新'}, 'rename');
    await change('CHANGE_ENGAGEMENT', {from:'ACTIONABLE',to:'WAITING',waiting:{description:'等待协议检查',reviewAt:null,evidenceIds:['protocol-evidence']}}, 'waiting');
    await change('CHANGE_ENGAGEMENT', {from:'WAITING',to:'ACTIONABLE',waiting:null}, 'actionable');
    await change('COMPLETE_WORK_OBJECT', {outcomeSummary:'协议已验证',evidenceIds:[]}, 'complete');
    const current = store.getClosureHistory(objectId).current!;
    const amended = await change('AMEND_CLOSURE',{targetClosureRecordId:current.record.id,replacementOutcomeSummary:'协议与恢复已验证',replacementCancellationReason:null,addEvidenceIds:[],reason:'修订样本'},'amend');
    const snapshot=await graph.readGraphSnapshot({graphId:source.graphId,sourceBlockUuid:source.sourceBlockUuid});
    await verify(kernel.prepareUndo({operationId:'protocol-undo-amend',actor,commitId:amended.commit.id},snapshot),false); sample('undo-amend');
    await change('REOPEN_WORK_OBJECT',{reason:'继续验证'},'reopen');
    const cancelled=await change('CANCEL_WORK_OBJECT',{reason:'保留结果',evidenceIds:[],replacementWorkObjectId:null,remainingWorkNote:null},'cancel');
    await verify(kernel.prepareUndo({operationId:'protocol-undo-cancel',actor,commitId:cancelled.commit.id},await graph.readGraphSnapshot({graphId:source.graphId,sourceBlockUuid:source.sourceBlockUuid})),false); sample('undo-cancel');
    return samples;
  } finally { store.close(); }
}

// Captured from the unchanged Kernel at 61e2db0 before extracting its builder.
// These are protocol outputs, not values recomputed by the new helper.
test('v1 protocol samples survive formal creation, updates, closure, amendments and compensation Undo', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/managed-projections-v1.json', import.meta.url), 'utf8')) as {samples: Record<string, ManagedProjection>};
  const samples = await protocolSamples();
  assert.deepEqual(samples.map(sample => sample.label), Object.keys(fixture.samples));
  for (const sample of samples) {
    assert.deepEqual(sample.projection, fixture.samples[sample.label], sample.label);
    // The browser uses the same public builder with asynchronously fetched closure.
    const browserProjection = buildManagedProjection(sample.object, sample.anchor, projectClosure(sample.closure));
    assert.deepEqual(browserProjection, fixture.samples[sample.label], sample.label);
    if (!sample.closure) {
      assert.equal(Object.hasOwn(browserProjection, 'closure'), false);
      assert.deepEqual(buildManagedProjection(sample.object, sample.anchor), browserProjection);
    }
  }
});
