import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkspaceCall, workRefFromBinding, type AgentWorkBinding} from '@task-copilot/contracts';
import {WorkspaceBroker} from '../src/workspace-server.ts';
const binding: AgentWorkBinding={scope:{graphId:'test:/graph',rootUuid:'bbbbbbbb-0000-4000-8000-000000000002'},directory:'/work/B',organization:'flat',provider:'workspace',workspaceId:'B'};
const call=()=>({schemaVersion:1,instanceId:'instance',connectionId:'connection',clientId:'dsh:B',requestId:'request',command:'refresh',payload:{},
  readTarget:{sessionId:'B',workRef:workRefFromBinding(binding),scope:binding.scope,generation:2}});
test('read target has closed identity/scope/generation fields and is tied to the sending Session',()=>{
  assert.equal(parseWorkspaceCall(call()).readTarget?.sessionId,'B');
  assert.throws(()=>parseWorkspaceCall({...call(),clientId:'dsh:A'}),/SESSION_TARGET_MISMATCH/);
  assert.throws(()=>parseWorkspaceCall({...call(),readTarget:{...call().readTarget,generation:-1}}),/INVALID_GENERATION/);
  assert.throws(()=>parseWorkspaceCall({...call(),readTarget:{...call().readTarget,grant:true}}),/UNSUPPORTED_FIELD/);
});
test('broker delivers the exact target and includes it in idempotency identity',async()=>{
  const broker=new WorkspaceBroker('instance');broker.grant('connection',binding);
  const parsed=parseWorkspaceCall(call()),pending=broker.request(parsed);
  assert.deepEqual(broker.poll('connection')?.readTarget,parsed.readTarget);
  assert.throws(()=>broker.request({...parsed,readTarget:{...parsed.readTarget!,generation:3}}),/IDEMPOTENCY_KEY_REUSED/);
  broker.complete('connection','request','dsh:B',{scope:binding.scope});
  assert.deepEqual((await pending).value,{scope:binding.scope});
});
