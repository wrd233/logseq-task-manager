import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {KernelClient, ClientError, type PluginKernelDescriptor} from '@task-copilot/client';
import {FakeGraphAdapter} from '../../../packages/test-support/src/index.ts';
import {startKernelServer} from '../src/server.ts';

test('Inbox Formal Task uses trusted user capability, live source identity, Kernel receipts and source backlink', async () => {
  const directory = await mkdtemp(join(tmpdir(),'inbox-kernel-'));
  const service = await startKernelServer({databasePath:join(directory,'kernel.sqlite'),descriptorPath:join(directory,'kernel.json'),maintenanceIntervalMs:60000});
  const graph = new FakeGraphAdapter(); graph.seedNaturalRecord('graph','source','TODO 真实内核测试锚点');
  let reads = 0;
  service.broker.request = async request => {
    if(request.kind === 'READ_TARGET_SNAPSHOT') {reads++;return {kind:'READ_TARGET_SNAPSHOT',snapshot:await graph.readGraphSnapshot(request.input)};}
    throw Error('Unexpected request in isolated test');
  };
  const descriptor = {schemaVersion:1 as const,baseUrl:service.baseUrl,token:service.token,pid:process.pid,startedAt:'now'};
  const user = new KernelClient({...descriptor,userChannelToken:service.userChannelToken} as PluginKernelDescriptor);
  const external = new KernelClient(descriptor);
  const input = {inboxId:randomUUID(),operationId:randomUUID(),title:'明确创建的正式任务',graphId:'graph',blockUuid:'source',confirmed:true as const};
  try {
    await assert.rejects(external.createInboxTask(input),(error:unknown)=>error instanceof ClientError && error.code==='TRUSTED_USER_CHANNEL_REQUIRED');
    assert.equal(service.store.listWorkObjects().length,0); assert.equal(reads,0);
    const first = await user.createInboxTask(input);
    assert.equal(first.commit.status,'COMMITTED'); assert.equal(service.store.getWorkObject(first.commit.targetId!)?.kind,'TASK');
    assert.equal(service.store.getAnchorForWorkObject(first.commit.targetId!)?.externalId,'source');
    assert.ok(JSON.stringify(service.store.listCommits()).includes(`inbox:${input.inboxId}:${input.operationId}`));
    // Recovery must not depend on the Graph still being online after the first commit.
    service.broker.request = async()=>{throw Error('Graph now offline');};
    const retry = await user.createInboxTask(input);
    assert.equal(retry.commit.id,first.commit.id); assert.equal(service.store.listWorkObjects().length,1); assert.equal(reads,1);
    await assert.rejects(user.createInboxTask({...input,title:'不可复用同一请求改名'}),(error:unknown)=>error instanceof ClientError && error.code==='INBOX_OPERATION_REUSED');
    assert.equal(service.store.listCommits().length,1);
  } finally {await service.close();await rm(directory,{recursive:true,force:true});}
});
