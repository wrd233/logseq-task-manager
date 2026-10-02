import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceBroker, startWorkspaceServer } from "../src/workspace-server.ts";
import { parseWorkspaceCall, type WorkspaceCall } from "@task-copilot/contracts";

const binding={scope:{graphId:"A",rootUuid:"00000000-0000-4000-8000-000000000001"},directory:"/work",organization:"flat" as const,provider:"material-binding" as const,workspaceId:null};
const call=(clientId="one"):WorkspaceCall=>({schemaVersion:1,instanceId:"instance",connectionId:"connection",clientId,requestId:"same-request",command:"status",payload:{}});
test("broker isolates clients, rejects forged commands and stale grants, and never redelivers an unknown result",async()=>{
  const broker=new WorkspaceBroker("instance",1000,20);broker.grant("connection",binding);
  const one=broker.request(call());assert.equal(broker.poll("connection")!.clientId,"one");assert.equal(broker.poll("connection"),null);
  const two=broker.request(call("two"));assert.equal(broker.poll("connection",true),null);assert.equal(broker.poll("connection")!.clientId,"two");
  broker.complete("connection","same-request","one",{client:"one"});broker.complete("connection","same-request","two",{client:"two"});assert.deepEqual((await one).value,{client:"one"});assert.deepEqual((await two).value,{client:"two"});
  assert.throws(()=>broker.request({...call(),command:"refresh"}),/IDEMPOTENCY_KEY_REUSED/);
  const timed=broker.request({...call(),requestId:"lost"});broker.poll("connection");await assert.rejects(timed,/unknown result/);assert.equal(broker.poll("connection"),null);
  broker.complete("connection","lost","one",{finished:true});assert.deepEqual((await broker.request({...call(),requestId:"lost"})).value,{finished:true});
  broker.revoke();assert.throws(()=>broker.request(call()),/WORKSPACE_OFFLINE/);broker.grant("new",binding);assert.throws(()=>broker.poll("connection"),/CONNECTION_STALE/);
  assert.throws(()=>parseWorkspaceCall({...call(),actor:"user"}),/UNSUPPORTED_FIELD/);assert.throws(()=>parseWorkspaceCall({...call(),command:"eval"}),/UNKNOWN_COMMAND/);assert.throws(()=>parseWorkspaceCall({...call(),payload:{rootUuid:binding.scope.rootUuid}}),/UNSUPPORTED_FIELD/);broker.revoke();
});
test("real loopback server uses private separate capabilities, instance identity, host and browser-origin checks",async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),"agent-server-"))),server=await startWorkspaceServer({stateDirectory:join(root,"private")});
  try{
    assert.equal((await stat(server.descriptorPath)).mode&0o077,0);assert.equal((await stat(server.pluginDescriptorPath)).mode&0o077,0);
    const request=(path:string,headers:Record<string,string>,input:unknown)=>fetch(server.descriptor.baseUrl+path,{method:"POST",headers:{"content-type":"application/json","x-workspace-instance":server.descriptor.instanceId,...headers},body:JSON.stringify(input)});
    assert.equal((await request("/plugin/connect",{authorization:`Bearer ${server.descriptor.token}`},{connectionId:"forged",binding})).status,401);
    const origin=await request("/call",{authorization:`Bearer ${server.descriptor.token}`,origin:"https://hostile.example"},{});assert.equal((await origin.json() as {error:{code:string}}).error.code,"ORIGIN_REJECTED");
    const stale=await request("/call",{authorization:`Bearer ${server.descriptor.token}`,"x-workspace-instance":"old"},call());assert.equal((await stale.json() as {error:{code:string}}).error.code,"DESCRIPTOR_STALE");
    await assert.rejects(startWorkspaceServer({stateDirectory:join(root,"private")}),/EEXIST/);
  }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
