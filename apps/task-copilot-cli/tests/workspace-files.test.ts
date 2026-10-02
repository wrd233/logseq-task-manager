import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, mkdir, writeFile, rm, symlink, rename, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverFiles, previewFile, scopedPath, sessionRecords } from "../src/workspace-files.ts";

test("bounded observations preserve valuable hidden files, material IDs, binary limits and actual body hashes",async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),"agent-files-")));
  try{
    await writeFile(join(root,"note.md"),"Alpha");await writeFile(join(root,"binary.pdf"),Buffer.from([0,255,32]));await writeFile(join(root,".valuable"),"hidden");
    await mkdir(join(root,".git"));await writeFile(join(root,".git","secret"),"excluded");
    await symlink(tmpdir(),join(root,"outside"));
    const first=await discoverFiles(root,[{id:"material-1",path:join(root,"note.md")}]);
    assert.equal(first.files.find(item=>item.path==="note.md")!.materialId,"material-1");assert.ok(first.files.some(item=>item.path===".valuable"));assert.ok(!first.files.some(item=>item.path.startsWith(".git")));
    assert.equal(first.files.find(item=>item.path==="outside")!.availability,"restricted");
    await assert.rejects(scopedPath(root,"outside/other"),/SYMLINK_RESTRICTED/);await assert.rejects(scopedPath(root,"../note.md"),/PATH_OUTSIDE_SCOPE/);
    assert.equal((await previewFile(root,"binary.pdf") as {read:string}).read,"metadata");
    const original=await previewFile(root,"note.md") as {version:string};const originalStat=await stat(join(root,"note.md"));
    await writeFile(join(root,"note.md"),"Bravo");await utimes(join(root,"note.md"),originalStat.atime,originalStat.mtime);
    assert.notEqual((await previewFile(root,"note.md") as {version:string}).version,original.version);
    await rename(join(root,"note.md"),join(root,"moved.md"));await writeFile(join(root,"copy.md"),"Bravo");
    const next=await discoverFiles(root,[{id:"material-1",path:join(root,"note.md")}],first);
    assert.equal(next.files.find(item=>item.path==="note.md")!.change,"missing");assert.equal(next.files.find(item=>item.path==="moved.md")!.materialId,null);assert.equal(next.files.find(item=>item.path==="copy.md")!.materialId,null);
    const repeated=await discoverFiles(root,[],next);assert.ok(repeated.files.every(item=>item.materialId===null));
    await writeFile(join(root,"large.txt"),"x".repeat(262145));assert.equal((await previewFile(root,"large.txt") as {reason:string}).reason,"file-size-limit");
  }finally{await rm(root,{recursive:true,force:true});}
});
test("scan bounds and closed ignore config report omitted ranges; explicit sessions contain only real links",async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),"agent-bounds-")));
  try{
    let path=root;for(let i=0;i<10;i++){path=join(path,"deep");await mkdir(path);}await writeFile(join(path,"omitted.txt"),"deep");
    await mkdir(join(root,".task-workspace"));await writeFile(join(root,".task-workspace","files-ignore-v1.json"),JSON.stringify({schemaVersion:1,exclude:["excluded"]}));await mkdir(join(root,"excluded"));
    const view=await discoverFiles(root,[]);assert.ok(view.truncated.some(item=>item.reason==="depth-limit"));assert.ok(!view.files.some(item=>item.path.startsWith("excluded")));
    const binding={scope:{graphId:"A",rootUuid:"00000000-0000-4000-8000-000000000001"},directory:root,organization:"flat" as const,provider:"material-binding" as const,workspaceId:null};
    const refs=await sessionRecords(binding,"add",{platform:"codex",externalId:"chosen-session"});assert.equal(refs[0]!.url,null);assert.equal((await sessionRecords(binding,"list",{})).length,1);
    await assert.rejects(sessionRecords(binding,"add",{platform:"chat",externalId:"other",url:"javascript:alert(1)"}),/UNSUPPORTED_SESSION_URL/);
    assert.equal((await sessionRecords(binding,"remove",{platform:"codex",externalId:"chosen-session"})).length,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
