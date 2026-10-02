import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat, rename, realpath, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { startWorkspaceServer } from "../../task-copilot-cli/src/workspace-server.ts";
import { contentFixture } from "./fixtures/content-writeback.ts";

const exec=promisify(execFile),repo=resolve(import.meta.dirname,"../../..");
test("independent CLI processes use installed plugin data, real filesystem and persistent content Journal with Kernel disabled",async()=>{
  const f=await contentFixture(),root=await realpath(await mkdtemp(join(tmpdir(),"agent-entry-"))),directory=join(root,"work"),state=join(root,"private");await mkdir(directory);
  let server=await startWorkspaceServer({stateDirectory:state}),unloaded=false;
  try{
    (f.browser as unknown as {apis:unknown}).apis={doAction:async(args:unknown[])=>{
      const [command,...values]=args;
      if(command==="readFile")return readFile(String(values[0]),"utf8");
      if(command==="writeFile")return writeFile(String(values[1]),String(values[2]));
      if(command==="mkdir-recur")return mkdir(String(values[0]),{recursive:true});
      if(command==="rename")return rename(String(values[0]),String(values[1]));
      if(command==="stat"){try{const info=await stat(String(values[0]));return {mode:info.mode,size:info.size};}catch(error){if((error as {code:string}).code==="ENOENT")return null;throw error;}}
      if(command==="listdir"){try{return (await readdir(String(values[0]))).map(name=>join(String(values[0]),name));}catch(error){if((error as {code:string}).code==="ENOENT")return null;throw error;}}
      throw Error(`unsupported host action ${String(command)}`);
    },openPath:async()=>{}};
    logseq.settings={tasksEnabled:false,materialsEnabled:true,workViewEnabled:true,materialsAutoCapture:false,agentWorkspaceDescriptor:server.pluginDescriptorPath};
    const insert=logseq.Editor.insertBlock.bind(logseq.Editor);
    logseq.Editor.insertBlock=((target:string,text:string,options:Record<string,unknown>={})=>insert(target,text,{...options,customUUID:options.customUUID??crypto.randomUUID()} as never)) as typeof logseq.Editor.insertBlock;
    logseq.Editor.getPage=(async()=>({id:1,name:"synthetic page",originalName:"synthetic page"})) as typeof logseq.Editor.getPage;
    await import(`../src/index.ts?agent-workspace=${Date.now()}`);await f.boot();
    const api=(f.browser as unknown as {taskCopilotWorkbench:{agentWorkspace:{status:()=>{connected:boolean}};content:{scope:()=>unknown};open:(id:string)=>Promise<void>;openMaterial:(id:string)=>Promise<void>;materials:{read:(id:string)=>Promise<{content:string}>}}}).taskCopilotWorkbench;
    // Use the existing authoritative binding keys, never a JSON permission from the agent.
    f.browser.localStorage.setItem(`workbench:material-binding:${JSON.stringify(["/A",f.root])}`,JSON.stringify({directory,organization:"flat"}));
    await f.commands.get("agent-workspace-allow")!();assert.equal(api.agentWorkspace.status().connected,true,JSON.stringify(f.messages));
    const cli=async(words:string[],input?:unknown,client="one")=>{
      const inputArgs:string[]=[];
      if(input!==undefined){const path=join(root,`input-${crypto.randomUUID()}.json`);await writeFile(path,JSON.stringify(input));inputArgs.push("--input-file",path);}
      try{const result=await exec(process.execPath,["--import","tsx",join(repo,"apps/task-copilot-cli/src/main.ts"),"workspace",...words,...inputArgs,"--directory",directory,"--state-dir",state,"--client",client,"--json"],{cwd:repo,timeout:30000});return JSON.parse(result.stdout);}
      catch(error){const failure=error as {stderr:string};throw new Error(failure.stderr||String(error));}
    };
    const status=await cli(["status"]);assert.equal(status.formalKernelRequired,false);assert.equal(status.formalWorkspace,"unavailable");assert.equal(status.capabilities.content,true);
    const refreshed=await cli(["refresh"]);assert.equal(refreshed.freshness,"checked");const block=refreshed.snapshot.blocks.find((item:{target:{blockUuid:string}})=>item.target.blockUuid===f.a);assert.equal(block.content,f.blocks.get(f.a)!.content);assert.equal(block.contentVersion,createHash("sha256").update(block.content).digest("hex"));
    assert.equal((await cli(["read"])).freshness,"last-known");
    await writeFile(join(directory,"added.txt"),"直接加入的文本");await writeFile(join(directory,"binary.pdf"),Buffer.from([0,255,32]));await symlink(root,join(directory,"link"));
    const observed=await cli(["files","list"]);assert.ok(observed.observation.files.some((file:{path:string})=>file.path==="added.txt"));assert.equal((await cli(["files","read","binary.pdf"])).read,"metadata");assert.equal((await cli(["files","read","added.txt"])).content,"直接加入的文本");
    await assert.rejects(cli(["files","read","link/input.json"]),/SYMLINK_RESTRICTED/);await assert.rejects(cli(["files","read","../escape"]),/PATH_OUTSIDE_SCOPE/);
    const associated=await cli(["files","associate","added.txt"]);assert.equal(await readFile(join(directory,"added.txt"),"utf8"),"直接加入的文本");assert.equal((await cli(["files","list"])).observation.files.find((item:{path:string})=>item.path==="added.txt").materialId,associated.material.id);
    await assert.rejects(cli(["materials","save"],{id:associated.material.id,expectedVersion:"0".repeat(64),expectedContent:"直接加入的文本",next:"agent change"}),/MATERIAL_AGENT_WRITE_FORBIDDEN/);
    const captured=await cli(["materials","capture"],{requestKey:"output-1",text:"# 草稿\n\n可修订"});assert.equal(captured.material.capabilities.edit.agent,true);
    const saved=await cli(["materials","save"],{id:captured.material.id,expectedVersion:captured.material.version,expectedContent:captured.material.content,next:"# 草稿\n\n真实修订"});assert.equal(saved.status,"success");assert.equal((await api.materials.read(captured.material.id)).content,"# 草稿\n\n真实修订");
    const makePatch=(snapshot:typeof refreshed.snapshot,requestId:string,text:string)=>{
      const a=snapshot.blocks.find((item:{target:{blockUuid:string}})=>item.target.blockUuid===f.a),start=a.content.indexOf("Alpha");
      return {schemaVersion:1,requestId,scope:snapshot.scope,operations:[{operationId:"replace",type:"replace-text",target:a.target,expectedContentVersion:a.contentVersion,expectedParentUuid:a.parentUuid,range:{start,end:start+5},expectedText:"Alpha",text}]};
    };
    const before=await cli(["content","read"]),patch=makePatch(before,"patch-1","Omega"),writes=f.counts().writes;
    const applied=await cli(["content","apply"],patch);assert.equal(applied.status,"complete");assert.equal(applied.durable,true);assert.ok(f.blocks.get(f.a)!.content.startsWith("Omega"));assert.equal((await cli(["content","result","patch-1"])).record.digest,applied.record.digest);
    assert.equal((await cli(["content","apply"],patch)).status,"complete");assert.equal(f.counts().writes,writes+1);assert.equal(await cli(["content","result","patch-1"],undefined,"two"),null);
    const conflict=await cli(["content","apply"],{...patch,requestId:"conflict-1"});assert.equal(conflict.record.items[0].status,"CONFLICT");assert.equal(conflict.record.patch.operations[0].text,"Omega");assert.ok(f.blocks.get(f.a)!.content.startsWith("Omega"));
    await assert.rejects(cli(["content","apply"],{...patch,requestId:"forged",actor:"user"}),/UNSUPPORTED_FIELD/);
    const todo=f.add("TODO 局部事项");const todoSource=await cli(["content","read"]),todoBlock=todoSource.blocks.find((item:{target:{blockUuid:string}})=>item.target.blockUuid===todo.uuid);
    const blocked=await cli(["content","apply"],{schemaVersion:1,requestId:"todo",scope:todoSource.scope,operations:[{operationId:"todo",type:"replace-text",target:todoBlock.target,expectedContentVersion:todoBlock.contentVersion,expectedParentUuid:todoBlock.parentUuid,range:{start:0,end:4},expectedText:"TODO",text:"DONE"}]});assert.equal(blocked.record.items[0].status,"BLOCKED");assert.equal(todo.content,"TODO 局部事项");
    const requested=await cli(["focus","request","--question","保留条件与反证"]),source=await cli(["focus","source"]);assert.equal(requested.ok,true);assert.equal(source.ok,true);
    const selected=source.value.blocks.find((item:{target:{blockUuid:string}})=>item.target.blockUuid===f.a),parent=source.value.blocks[0];
    const plan={...requested.value,structureVersion:source.value.structureVersion,sourceVersions:[parent,selected].map(item=>({sourceId:item.sourceId,contentVersion:item.contentVersion})),visibleRanges:[{unit:"block",sourceId:selected.sourceId,contentVersion:selected.contentVersion}]};
    assert.equal((await cli(["focus","apply"],plan)).ok,true);assert.equal(f.browser.document.querySelector(`.wb-row[data-uuid="${f.b}"]`),null);assert.ok(f.browser.document.querySelector(`.wb-row[data-uuid="${f.root}"]`));
    await api.openMaterial(captured.material.id);await api.open(f.root);assert.equal((await cli(["focus","read"])).plan.question,"保留条件与反证");
    await cli(["focus","request","--question","新问题"]);assert.equal((await cli(["focus","apply"],plan)).reason,"superseded-request");await assert.rejects(cli(["focus","apply"],plan,"two"),/FOCUS_REQUEST_NOT_OWNED/);
    assert.equal((await cli(["stage","read"],{})).status,"unavailable");
    await cli(["sessions","add","--platform","codex","--session-id","chosen"]);assert.equal((await cli(["sessions","list"])).references[0].url,null);
    // A full bridge restart rotates descriptors and requires a fresh local grant.
    await server.close();assert.equal((await cli(["read"])).freshness,"last-known");server=await startWorkspaceServer({stateDirectory:state});await assert.rejects(cli(["status"]),/DESCRIPTOR_STALE/);
    await f.commands.get("agent-workspace-allow")!();assert.equal((await cli(["content","result","patch-1"])).record.digest,applied.record.digest);
    f.graph("B");await assert.rejects(cli(["refresh"]),/WORKSPACE_OFFLINE|CONNECTION_REVOKED/);assert.equal(api.agentWorkspace.status().connected,false);
    await f.unload();unloaded=true;assert.equal((f.browser as unknown as {taskCopilotWorkbench?:unknown}).taskCopilotWorkbench,undefined);
  }finally{if(!unloaded)await f.unload();await server.close();await f.cleanup();await rm(root,{recursive:true,force:true});}
});
