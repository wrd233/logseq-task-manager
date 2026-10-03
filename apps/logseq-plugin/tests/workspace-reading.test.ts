import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rename, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FileIO } from "../src/host/file-io.ts";
import { MaterialDirectories, type KeyStorage } from "../src/workspace/material-context.ts";
import { MaterialService } from "../src/features/materials/service.ts";
import { SourceReader, ScopeExpired } from "../src/workspace/source-reader.ts";
import { sha256, sourceId, validateSnapshot } from "../src/workspace/source-protocol.ts";
import { WorkspaceRegistry } from "../src/workspace/registry.ts";
import { WorkspaceContextService } from "../src/workspace/context-service.ts";
import { MirrorPublisher, renderMirror } from "../src/workspace/mirror.ts";
import { optionalRead } from "../src/workspace/workspace-record.ts";

class Storage implements KeyStorage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
}
async function fixture() {
  const temp = join(process.cwd(), "tmp"); await mkdir(temp, {recursive: true});
  const root = await mkdtemp(join(temp, "workspace-tests-")), a = join(root, "a"), b = join(root, "b"), global = join(root, "global");
  for (const path of [a, b, global]) await mkdir(path);
  const io: FileIO = {read: path => readFile(path, "utf8"), write: (path, text) => writeFile(path, text), mkdir: async path => {await mkdir(path, {recursive: true});}, rename, list: readdir, stat: async path => {const s = await stat(path); return {type: s.isDirectory() ? "directory" : "file", size: s.size};}};
  const storage = new Storage(), directories = new MaterialDirectories(storage);
  let graphId = "synthetic:/graph", materialGraph = "/graph", available = true, persist = 0;
  const scope = {graphId, rootUuid: "root"};
  const tree = {uuid: "root", content: "TODO 同名工作\n属性:: 保留\r\nemoji 🐈", children: [{uuid: "child", content: "自然段\n\n[注] 未确定\nTODO 只读", children: []}]};
  let gate: Promise<void> | null = null;
  const reader = new SourceReader({graphId: async () => graphId, getBlock: async uuid => {if (gate) await gate; if (!available) throw new Error("offline"); return uuid === "root" ? structuredClone(tree) : uuid === "other" ? {...tree, uuid: "other"} : null;}, getPage: async () => ({uuid: "page"}), getPageBlocksTree: async () => [{uuid: "page-child", content: "page body"}]});
  const materials = new MaterialService(io, directories, "/graph", global, text => text);
  const host = {current: async () => ({graphId, materialGraph}), persistRoot: async () => {persist++;}, readMaterial: (id: string) => materials.read(id)};
  const registry = new WorkspaceRegistry(io, directories, storage), service = new WorkspaceContextService(registry, reader, host);
  return {root, a, b, global, io, storage, directories, reader, registry, service, materials, host, scope, tree,
    setGraph: (id: string) => {graphId = id; materialGraph = id === scope.graphId ? "/graph" : `/graph-${id.split(":")[0]}`; service.invalidate();}, offline: (value: boolean) => {available = !value;},
    setGate: (p: Promise<void> | null) => {gate = p;}, persisted: () => persist,
    cleanup: async () => {service.dispose(); await rm(root, {recursive: true, force: true});}};
}
test("source contract hashes full UTF-8 body, preserves preorder/order, maps every UTF-16 span and never persists IDs on read", async () => {
  const f = await fixture();
  try {
    const source = await f.reader.read(f.scope, () => true), [root, child] = source.blocks;
    assert.equal(root!.contentVersion, createHash("sha256").update(f.tree.content, "utf8").digest("hex"));
    assert.equal(root!.sourceId, JSON.stringify(["logseq", f.scope.graphId, "root"]));
    assert.equal(child!.parentUuid, "root"); assert.equal(child!.depth, 1); assert.equal(child!.order, 0);
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    assert.equal(source.structureVersion, hash(source.blocks.map(b => [b.sourceId,b.parentUuid,b.order,b.depth])));
    assert.equal(source.sourceSetVersion, hash(source.blocks.map(b => [b.sourceId,b.availability,b.contentVersion])));
    const later = await f.reader.read(f.scope, () => true); assert.equal(later.sourceSetVersion, source.sourceSetVersion);
    const bundle = {schemaVersion: 1 as const, workspaceId: crypto.randomUUID(), primary: source, sources: []}, rendered = renderMirror(bundle);
    for (const range of rendered.ranges) { const block = source.blocks.find(b => b.sourceId === range.sourceId)!; assert.equal(rendered.text.slice(range.mirrorStart,range.mirrorEnd), block.content!.slice(range.sourceStart,range.sourceEnd)); }
    assert.equal(f.persisted(), 0);
    assert.deepEqual(await validateSnapshot(source), source);
    await assert.rejects(validateSnapshot({...source, blocks: [{...root, content: "tampered"}]}), /VERSION_MISMATCH/);
    f.offline(true); const missing = await f.reader.read(f.scope, () => true); assert.equal(missing.blocks[0]!.availability,"unavailable"); assert.equal(missing.blocks[0]!.content,null); assert.equal(missing.blocks[0]!.contentVersion,null);
    assert.notEqual(sourceId("another:/graph", "root"), root!.sourceId);
  } finally {await f.cleanup();}
});
test("binding is idempotent, protects user entry/manifests, separates same names and Graphs, and explicitly creates directories", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.a,"WORKSPACE.md"),"user entry");
    const a = await f.service.bind({scope:f.scope,directory:f.a}); assert.equal(a.freshness,"checked");
    assert.equal(a.binding.manifest.entryFile,"WORKSPACE.task-copilot.md"); assert.equal(await readFile(join(f.a,"WORKSPACE.md"),"utf8"),"user entry");
    const repeat = await f.service.bind({scope:f.scope,directory:f.a}); assert.equal(repeat.workspaceId,a.workspaceId); assert.equal(repeat.mirror!.pointer.revision,a.mirror!.pointer.revision);
    await assert.rejects(f.service.bind({scope:{...f.scope,rootUuid:"other"},directory:f.a}),/另一份工作/);
    const b = await f.service.bind({scope:{...f.scope,rootUuid:"other"},directory:f.b}); assert.notEqual(a.workspaceId,b.workspaceId); assert.equal(b.binding.manifest.organization,"flat");
    await assert.rejects(f.service.bind({scope:f.scope,directory:f.b}),/重新关联/);
    f.setGraph("another:/graph"); await assert.rejects(f.service.bind({scope:{...f.scope,graphId:"another:/graph"},directory:f.a}),/另一份工作/);
    const fresh = join(f.root,"new"); const c = await f.service.bind({scope:{...f.scope,graphId:"another:/graph"},directory:fresh,create:true}); assert.notEqual(c.workspaceId,a.workspaceId);
    assert.equal((await stat(fresh)).isDirectory(),true);
  } finally {await f.cleanup();}
});
test("mechanical updates keep natural annotations, unchanged display/draft state does not publish a new body version, offline/restart preserves good mirrors", async () => {
  const f = await fixture();
  try {
    const a = await f.service.bind({scope:f.scope,directory:f.a});
    const first = a.mirror!.pointer.revision;
    // A private draft is outside the committed host tree.
    f.storage.setItem("workbench:draft", "different draft"); f.service.changed();
    assert.equal((await f.service.refresh(f.scope)).mirror!.pointer.revision,first);
    f.tree.children[0]!.content += "\n[注] 条件改变，不清理"; f.service.changed(["child"]);
    const next = await f.service.refresh(f.scope); assert.notEqual(next.mirror!.pointer.revision,first); assert.match(next.mirror!.markdown,/条件改变，不清理/);
    assert.equal(next.observed!.primary.structureVersion,a.observed!.primary.structureVersion);
    f.offline(true); const stale = await f.service.refresh(f.scope); assert.equal(stale.freshness,"last-known"); assert.equal(stale.status!.availability,"unavailable"); assert.equal(stale.observed!.primary.blocks[0]!.content,null); assert.equal(stale.mirror!.pointer.revision,next.mirror!.pointer.revision);
    const restart = new WorkspaceContextService(new WorkspaceRegistry(f.io,new MaterialDirectories(f.storage),f.storage),f.reader,f.host);
    try { const read = await restart.read(f.scope); assert.equal(read.mirror!.pointer.revision,next.mirror!.pointer.revision); assert.equal(read.freshness,"last-known"); f.offline(false); assert.equal((await restart.refresh(f.scope)).freshness,"checked"); } finally {restart.dispose();}
  } finally {await f.cleanup();}
});
test("mirror temporary write, readback and pointer failures retain the old verified publication, including recovery after current corruption", async () => {
  const f = await fixture();
  try {
    const first = await f.service.bind({scope:f.scope,directory:f.a}), pointer = first.mirror!.pointer.revision;
    const write = f.io.write, read = f.io.read, move = f.io.rename;
    for (const failure of ["write", "readback", "pointer"]) {
      f.tree.content += `\n${failure}`; f.service.changed();
      f.io.write = async (path,text) => {if(failure === "write" && path.endsWith("original.md"))throw Error("disk full"); await write(path,text);};
      f.io.read = async path => {const result=await read(path);return failure === "readback" && path.endsWith("source.json") && !path.includes(pointer) ? result+"corrupt" : result;};
      f.io.rename = async (from,to) => {if(failure === "pointer" && to.endsWith("current.json"))throw Error("rename failed");await move(from,to);};
      const failed=await f.service.refresh(f.scope); assert.equal(failed.freshness,"last-known"); assert.equal(failed.mirror!.pointer.revision,pointer);
      f.io.write=write;f.io.read=read;f.io.rename=move;
      assert.equal((await new MirrorPublisher(f.io).read(f.a,first.binding.manifest))!.pointer.revision,pointer);
    }
    const success=await f.service.refresh(f.scope);assert.notEqual(success.mirror!.pointer.revision,pointer);
    await writeFile(join(f.a,".task-workspace/current.json"),"bad pointer");
    const recovered=await new MirrorPublisher(f.io).read(f.a,first.binding.manifest);assert.equal(recovered!.pointer.revision,pointer);assert.equal(recovered!.recovered,true);
  } finally {await f.cleanup();}
});
test("Graph change, unbind and directory rebind invalidate late reads and late file jobs without publishing to a new target", async () => {
  const f = await fixture();
  try {
    const first=await f.service.bind({scope:f.scope,directory:f.a}); const old=await readFile(join(f.a,".task-workspace/current.json"),"utf8");
    for (const operation of ["graph","unbind","rebind"]) {
      let release!:()=>void; f.setGate(new Promise<void>(resolve=>{release=resolve;}));f.tree.content+=`\n${operation}`;
      const late=f.service.refresh(f.scope); await new Promise(resolve=>setTimeout(resolve,15));
      if(operation==="graph"){f.setGraph("B:/graph");f.setGate(null);release();await assert.rejects(late,ScopeExpired);f.setGraph(f.scope.graphId);}
      else if(operation==="unbind"){await f.service.unbind(f.scope);f.setGate(null);release();await assert.rejects(late,ScopeExpired);await f.service.bind({scope:f.scope,directory:f.a});}
      else { f.setGate(null); const rebinding=f.service.bind({scope:f.scope,directory:f.b,rebind:true});release();await assert.rejects(late,ScopeExpired);const bound=await rebinding;assert.equal(bound.workspaceId,first.workspaceId);assert.equal(bound.binding.directory,f.b); }
    }
    assert.notEqual(await readFile(join(f.a,".task-workspace/current.json"),"utf8"),old); // only the explicit rebind-back refreshed A
    const before=await readFile(join(f.b,".task-workspace/current.json"),"utf8");
    const write=f.io.write;let began!:()=>void,release!:()=>void;const begun=new Promise<void>(resolve=>{began=resolve;}), hold=new Promise<void>(resolve=>{release=resolve;});
    f.io.write=async(path,text)=>{if(path.endsWith("original.md")){began();await hold;}await write(path,text);};f.tree.content+="\nlate IO";
    const job=f.service.refresh(f.scope);await begun;await f.service.unbind(f.scope);release();await assert.rejects(job,ScopeExpired);f.io.write=write;
    assert.equal(await readFile(join(f.b,".task-workspace/current.json"),"utf8"),before);
    assert.equal(await f.registry.resolve(f.scope),null);
  } finally {await f.cleanup();}
});
test("moving the whole directory explicitly recovers identity, missing directory never writes to global, and unbind retains all records", async () => {
  const f=await fixture();
  try {
    const first=await f.service.bind({scope:f.scope,directory:f.a}), moved=join(f.root,"moved");
    const read=await f.service.read(f.scope);read.mirror!.markdown="caller tampered";await rename(f.a,moved);
    const missing=await f.service.read(f.scope);assert.equal(missing.freshness,"last-known");assert.match(missing.problem!,/暂不可用/);
    assert.notEqual(missing.mirror!.markdown,"caller tampered");missing.mirror!.markdown="another mutation";assert.notEqual((await f.service.read(f.scope)).mirror!.markdown,"another mutation");
    await assert.rejects(f.service.refresh(f.scope));assert.deepEqual(await readdir(f.global),[]);
    const rebound=await f.service.bind({scope:f.scope,directory:moved,rebind:true});assert.equal(rebound.workspaceId,first.workspaceId);
    await f.service.unbind(f.scope);assert.equal(await f.registry.resolve(f.scope),null);assert.ok(await stat(join(moved,".task-workspace/manifest.json")));
    assert.equal((await f.service.bind({scope:f.scope,directory:moved})).workspaceId,first.workspaceId);
  } finally {await f.cleanup();}
});
test("real MaterialService consumes the single binding, preserves legacy locations/fallback and exposes explicit block/page/material readings", async () => {
  const f=await fixture();
  try {
    // Legacy bindings remain valid and can be explicitly adopted without moving old material files.
    f.directories.bind({graph:"/graph",sourceUuid:"root",directory:f.a,organization:"flat"});
    const legacy=await f.materials.capture({requestKey:"legacy",text:"# legacy"},{graph:"/graph",sourceUuid:"root",directory:f.a,organization:"flat"});
    const first=await f.service.bind({scope:f.scope,directory:f.a});
    const context={graph:"/graph",sourceUuid:"root",...f.directories.binding("/graph","root")!};
    const captured=await f.materials.capture({requestKey:"actual",text:"# actual"},context);assert.equal(captured.material.recordRoot,f.a);
    await f.service.associate({scope:f.scope,source:{kind:"logseq-block",graphId:f.scope.graphId,blockUuid:"other"}});
    await f.service.associate({scope:f.scope,source:{kind:"logseq-page",graphId:f.scope.graphId,pageUuid:"page",pageName:"known page"}});
    const linked=await f.service.associate({scope:f.scope,source:{kind:"material",id:legacy.material.id}});assert.equal(linked.observed!.sources.length,3);assert.equal(linked.observed!.sources[2]!.material!.content,"# legacy");
    await f.service.bind({scope:f.scope,directory:f.b,rebind:true,organization:"project"});
    const next=await f.materials.capture({requestKey:"new",text:"# new",role:"output"},{graph:"/graph",sourceUuid:"root",...f.directories.binding("/graph","root")!});assert.equal(next.material.recordRoot,join(f.b,"成果"));
    assert.equal((await f.materials.read(legacy.material.id)).path,legacy.material.path);assert.equal(first.workspaceId,linked.workspaceId);
    await f.service.unbind(f.scope);const fallback=await f.materials.capture({requestKey:"fallback",text:"fallback"},{graph:"/graph",sourceUuid:"root",directory:null,organization:"flat"});assert.equal(fallback.material.recordRoot,f.global);
  } finally {await f.cleanup();}
});
test("source change during a read causes re-read instead of publishing an inconsistent observation", async () => {
  const f=await fixture();
  try {
    await f.service.bind({scope:f.scope,directory:f.a});let release!:()=>void;f.setGate(new Promise<void>(resolve=>{release=resolve;}));
    const running=f.service.refresh(f.scope);await new Promise(resolve=>setTimeout(resolve,10));f.tree.content="changed during read";f.service.changed();f.setGate(null);release();
    const result=await running;assert.equal(result.freshness,"checked");assert.equal(result.observed!.primary.blocks[0]!.content,"changed during read");
    assert.equal(result.observed!.primary.blocks[0]!.contentVersion,await sha256("changed during read"));
  } finally {await f.cleanup();}
});
test("Desktop missing-parent shape is confirmed as absent, but an unreadable existing record fails closed", async () => {
  const f=await fixture();
  try {
    const original=f.io.stat!;
    f.io.stat=async path=>{if(path.endsWith("manifest.json"))throw Error("文件状态不可用。");return original(path);};
    assert.equal(await optionalRead(f.io,join(f.a,".task-workspace/manifest.json")),null);
    await mkdir(join(f.a,".task-workspace"));await writeFile(join(f.a,".task-workspace/manifest.json"),"existing");
    await assert.rejects(optionalRead(f.io,join(f.a,".task-workspace/manifest.json")),/文件状态不可用/);
  } finally {await f.cleanup();}
});
test("external unavailable readings retain separately labeled old content across repeated refreshes and restart", async () => {
  const f=await fixture();
  try {
    await f.service.bind({scope:f.scope,directory:f.a});
    const material=await f.materials.capture({requestKey:"old-source",text:"# 最后良好正文"},{graph:"/graph",sourceUuid:"root",directory:f.a,organization:"flat"});
    await f.service.associate({scope:f.scope,source:{kind:"material",id:material.material.id}});await rm(material.material.path);
    let current=await f.service.refresh(f.scope);
    assert.equal(current.observed!.sources[0]!.availability,"unavailable");assert.equal(current.observed!.sources[0]!.material!.content,null);
    assert.equal(current.observed!.lastKnownSources![0]!.reading.material!.content,"# 最后良好正文");assert.match(current.mirror!.markdown,/最后已知关联副本 · 当前不可用/);
    current=await f.service.refresh(f.scope);assert.equal(current.mirror!.bundle.lastKnownSources![0]!.reading.material!.content,"# 最后良好正文");
    const disk=await new MirrorPublisher(f.io).read(f.a,current.binding.manifest);assert.equal(disk!.bundle.lastKnownSources![0]!.reading.material!.content,"# 最后良好正文");
  } finally {await f.cleanup();}
});
test("concurrent different sources cannot replace one directory identity; interrupted entry publication retries the saved manifest", async () => {
  const f=await fixture();
  try {
    const results=await Promise.allSettled([f.service.bind({scope:f.scope,directory:f.a}),f.service.bind({scope:{...f.scope,rootUuid:"other"},directory:f.a})]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
    const write=f.io.write;f.io.write=async(path,text)=>{if(path.includes("WORKSPACE.md."))throw Error("entry disk failure");await write(path,text);};
    await assert.rejects(f.service.bind({scope:f.scope,directory:f.b,rebind:true}),/entry disk failure/);
    const saved=await f.registry.manifest(f.b);assert.ok(saved);f.io.write=write;
    const retried=await f.service.bind({scope:f.scope,directory:f.b,rebind:true});assert.equal(retried.workspaceId,saved.workspaceId);assert.equal(retried.freshness,"checked");
    const snapshot=await f.reader.read(f.scope,()=>true);await assert.rejects(validateSnapshot({...snapshot,blocks:[{...snapshot.blocks[0],depth:2}]}),/TOPOLOGY/);
  } finally {await f.cleanup();}
});

test("shared live-source port works without a directory and expires on unbind without returning mirror bytes",async()=>{
  const f=await fixture();try{
    const source=await f.service.readSource(f.scope,()=>true);assert.equal(source.sourceSetVersion,(await f.reader.read(f.scope,()=>true)).sourceSetVersion);assert.equal(f.persisted(),0);
    await f.service.bind({scope:f.scope,directory:f.a});const version=f.service.sourceVersion(f.scope);
    let release!:()=>void;f.setGate(new Promise<void>(r=>{release=r;}));const late=f.service.readSource(f.scope,()=>true);
    await new Promise(r=>setTimeout(r,15));await f.service.unbind(f.scope);f.setGate(null);release();
    await assert.rejects(late,ScopeExpired);assert.notEqual(f.service.sourceVersion(f.scope),version);
    f.offline(true);const missing=await f.service.readSource(f.scope,()=>true);assert.equal(missing.blocks[0]!.availability,"unavailable");assert.equal(missing.blocks[0]!.content,null);
  }finally{await f.cleanup();}
});
