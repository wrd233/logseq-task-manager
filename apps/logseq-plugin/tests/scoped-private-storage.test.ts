import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readScopedPrivateItem,writeScopedPrivateItem,scopedPrivateKey,PrivateWriteUnconfirmedError } from "../src/scoped-private-storage.ts";

test("long Chinese Graph and formal intent use real bounded filesystem names and preserve exact scope",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"scoped-private-")),graph="graph:/"+"长中文工作目录/".repeat(100),key="task-copilot-vnext-pending:create:"+crypto.randomUUID();
  const storage={getItem:async(k:string)=>{try{return await readFile(join(directory,k),"utf8");}catch(e){if((e as {code:string}).code==="ENOENT")return null;throw e;}},setItem:async(k:string,v:string)=>writeFile(join(directory,k),v)};
  try{
    assert.equal(await readScopedPrivateItem(storage,key,graph),null);await writeScopedPrivateItem(storage,key,graph,"saved exact intent");assert.equal(await readScopedPrivateItem(storage,key,graph),"saved exact intent");
    const path=await scopedPrivateKey(key,graph);assert.ok(new TextEncoder().encode(path).length<255);assert.notEqual(path,await scopedPrivateKey(key,graph+"乙"));assert.notEqual(path,await scopedPrivateKey(key+"retry",graph));
    assert.equal(await readScopedPrivateItem(storage,key,graph+"乙"),null);const value=JSON.parse(await storage.getItem(path) as string);value.graphId+="乙";await storage.setItem(path,JSON.stringify(value));await assert.rejects(readScopedPrivateItem(storage,key,graph),/SCOPED_PRIVATE_STATE_INVALID/u);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test("legacy short scoped state remains readable and a verified new tombstone cannot revive it",async()=>{
  const values=new Map<string,string>([["pending:graph%3AA","old request"]]),storage={getItem:async(k:string)=>values.get(k)??null,setItem:async(k:string,v:string)=>{values.set(k,v);}};
  assert.equal(await readScopedPrivateItem(storage,"pending","graph:A"),"old request");await writeScopedPrivateItem(storage,"pending","graph:A","");assert.equal(await readScopedPrivateItem(storage,"pending","graph:A"),"");assert.equal(values.get("pending:graph%3AA"),"old request");
});
test("silent SDK loss, readback mismatch and private IO cannot confirm an intent; scope is rechecked",async()=>{
  for(const getItem of [async()=>null,async()=>"different",async()=>{throw Error("EACCES");}])await assert.rejects(writeScopedPrivateItem({getItem,setItem:async()=>{}},"pending","graph:A","intent"),PrivateWriteUnconfirmedError);
  let writes=0;await assert.rejects(writeScopedPrivateItem({getItem:async()=>null,setItem:async()=>{writes++;}},"pending","graph:A","intent",()=>{throw Error("GRAPH_SCOPE_CHANGED");}),/GRAPH_SCOPE_CHANGED/u);assert.equal(writes,0);
  await assert.rejects(readScopedPrivateItem({getItem:async()=>{throw Error("EACCES");},setItem:async()=>{}},"pending","graph:A"),/EACCES/u);
});
