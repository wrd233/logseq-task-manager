import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDshTarget} from '../src/features/agent-workspace/dsh-work.ts';
const scope={graphId:'isolated:/graph',rootUuid:'child'};
test('DSH child entry chooses closest natural work ancestor including Project; ordinary TODO stays temporary',async()=>{
  const blocks=new Map([['child',{uuid:'child',content:'saved paragraph',parent:{id:'task'}}],['task',{uuid:'task',content:'TODO [事务] 最近事务',parent:{id:'project'}}],['project',{uuid:'project',content:'[Project] 自然项目'}]]);
  const ports={getBlock:async(id:string|number)=>blocks.get(String(id))??null,formal:async()=>null,check:async()=>{}};
  assert.equal((await resolveDshTarget(scope,ports)).scope.rootUuid,'task');
  assert.equal((await resolveDshTarget({...scope,rootUuid:'project'},ports)).temporary,false);
  blocks.set('child',{uuid:'child',content:'TODO ordinary task'});
  const temporary=await resolveDshTarget(scope,ports);assert.equal(temporary.scope.rootUuid,'child');assert.equal(temporary.temporary,true);
});
test('formal identity uses actual Kernel id; incomplete ancestry and Graph switch refuse entry',async()=>{
  const ports={getBlock:async()=>({uuid:'child',content:'formal object'}),formal:async()=>({objectId:'kernel-real-id',title:'正式对象'}),check:async()=>{}};
  assert.deepEqual((await resolveDshTarget(scope,ports)).workRef,{kind:'kernel',objectId:'kernel-real-id'});
  await assert.rejects(resolveDshTarget(scope,{...ports,getBlock:async()=>null}),{code:'WORK_ANCESTRY_UNAVAILABLE'});
  await assert.rejects(resolveDshTarget(scope,{...ports,check:async()=>{throw Error('Graph changed');}}),/Graph changed/);
});

test('a Graph round trip during directory preparation cancels the original DSH entry',async()=>{
  const {contentFixture}=await import('./fixtures/content-writeback.ts');
  const {installContentWriteback}=await import('../src/features/content-writeback/installer.ts');
  const {installAgentWorkspace}=await import('../src/features/agent-workspace/installer.ts');
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter});
  const agent=installAgentWorkspace({content,materials:null,work:null,binding:{selected:async()=>{throw Error('must not connect');},valid:async()=>false},
    ensureDshWork:async(_scope,check)=>{f.graph('B');f.graph('A');await check();}});
  try {await assert.rejects(agent.local.openWork(f.root),{code:'CONNECTION_REVOKED'});assert.equal(f.counts().writes,0);}
  finally {agent.dispose();content.dispose();await f.cleanup();}
});
