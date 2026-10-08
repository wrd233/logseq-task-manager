import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";
import { GuidanceService, commonGuidanceKey } from "../src/features/agent-workspace/guidance.ts";
import type { AgentWorkBinding } from "@task-copilot/contracts";
import { collaborationStartup } from "../src/features/agent-workspace/collaboration-ui.ts";

test("startup uses the actual installed CLI and private channel, with quoted work paths",()=>{
  const startup=collaborationStartup("/work/中文 ' $()", "/private/channel", "file:///installed%20plugin/dist/index.html");
  assert.ok(startup.includes("node '/installed plugin/dist/workspace.mjs' workspace collaboration read"));
  assert.ok(startup.includes("--state-dir '/private/channel'"));assert.ok(startup.includes("--directory '/work/中文 '\\'' $()'"));
});

test("two workspaces reread one actual common source while keeping their own differences and loaded versions",async()=>{
  const f=await contentFixture(),guide=new GuidanceService(f.storage),check=async()=>{};
  const one:AgentWorkBinding={scope:f.scope,directory:f.directory,organization:"flat",provider:"workspace",workspaceId:"one"},two={...one,scope:{...f.scope,rootUuid:f.b},workspaceId:"two"};
  try{
    const first=await guide.read(one,check),second=await guide.read(two,check);
    assert.equal(first.common.version,second.common.version);assert.equal(first.common.source.key,commonGuidanceKey);assert.equal(first.common.source.origin,"builtin-default");
    assert.equal((await f.storage.allKeys() as string[]).length,0,"reading defaults must not create a source file");
    await guide.saveProject(one,first.project.version,"保留报价中的尚未询问。",check);
    await guide.saveProject(two,second.project.version,"本项目只记录已核对的数据。",check);
    await guide.saveCommon(first.common.version,first.common.text+"\n\n共同新增：保留问号。",check);
    const rereadOne=await guide.read(one,check),rereadTwo=await guide.read(two,check);
    assert.notEqual(rereadOne.common.version,first.common.version);assert.equal(rereadOne.common.version,rereadTwo.common.version);
    assert.equal(rereadOne.project.text,"保留报价中的尚未询问。");assert.equal(rereadTwo.project.text,"本项目只记录已核对的数据。");
    assert.equal(first.common.source.origin,"builtin-default","old loaded snapshot must retain its own version");assert.equal(rereadOne.automaticAgentReload,false);
    await assert.rejects(guide.saveCommon(first.common.version,"stale overwrite",check),/指导已有新版本/);
    assert.equal((await guide.read(two,check)).common.text,rereadOne.common.text);
  }finally{guide.dispose();await f.cleanup();}
});

test("common saves serialize by source, fail closed on corruption, and fence late scope/disposal reads",async()=>{
  const f=await contentFixture(),guide=new GuidanceService(f.storage),binding:AgentWorkBinding={scope:f.scope,directory:f.directory,organization:"flat",provider:"workspace",workspaceId:"one"};
  try{
    const read=await guide.read(binding,async()=>{});
    const saves=await Promise.allSettled([guide.saveCommon(read.common.version,"first",async()=>{}),guide.saveCommon(read.common.version,"second",async()=>{})]);
    assert.equal(saves.filter(s=>s.status==="fulfilled").length,1);assert.equal(saves.filter(s=>s.status==="rejected").length,1);
    await f.storage.setItem(commonGuidanceKey,"{corrupt");await assert.rejects(guide.read(binding,async()=>{}));
    assert.equal(await f.storage.getItem(commonGuidanceKey),"{corrupt");
    const entered=deferred<void>(),release=deferred<void>();let active=true;
    const late=guide.read(binding,async()=>{entered.resolve();await release.promise;if(!active)throw Error("CONNECTION_REVOKED");});await entered.promise;active=false;release.resolve();await assert.rejects(late,/CONNECTION_REVOKED/);
    guide.dispose();await assert.rejects(guide.read(binding,async()=>{}),/GUIDANCE_DISPOSED/);
  }finally{guide.dispose();await f.cleanup();}
});
