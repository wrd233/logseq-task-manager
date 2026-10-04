import { snapshot, validateSnapshot } from "../../workspace/source-protocol.ts";
import type { BlockSnapshot, MoveFact, MoveOperation, SourceRead, SourceSnapshot } from "./protocol.ts";
import { formalSyntax, managedSyntax } from "./protection.ts";
import { fail, sameScope, uuidPattern } from "./validation.ts";

function available(read: SourceRead, uuid: string): BlockSnapshot {
  const rows = read.snapshot.blocks.filter(b=>b.target.blockUuid===uuid);
  if(rows.length!==1 || rows[0]!.availability!=="available") fail("MOVE_MEMBER_UNAVAILABLE");
  return rows[0]!;
}
export function subtree(source: SourceSnapshot, uuid: string): BlockSnapshot[] {
  const index=source.blocks.findIndex(b=>b.target.blockUuid===uuid);
  if(index<0) fail("MOVE_MEMBER_UNAVAILABLE");
  const root=source.blocks[index]!, rows=[root];
  for(let i=index+1;i<source.blocks.length && source.blocks[i]!.depth>root.depth;i++) rows.push(source.blocks[i]!);
  return rows;
}
/** A strict whole-scope topology version binds parent and adjacent anchors. Content
 * versions only bind the source/destination; unrelated text does not invalidate it. */
export async function inspectMove(read: SourceRead, op: MoveOperation) {
  await validateSnapshot(read.snapshot);
  const source=available(read,op.target.blockUuid), destination=available(read,op.destination.blockUuid);
  if(source.target.blockUuid===read.snapshot.scope.rootUuid) fail("MOVE_ROOT_FORBIDDEN");
  if(read.snapshot.structureVersion!==op.expectedStructureVersion) fail("STRUCTURE_VERSION_CONFLICT");
  if(source.contentVersion!==op.expectedContentVersion || destination.contentVersion!==op.expectedDestinationVersion) fail("CONTENT_VERSION_CONFLICT");
  if(source.parentUuid!==op.expectedParentUuid || destination.parentUuid!==op.expectedDestinationParentUuid) fail("PARENT_CONFLICT");
  const moved=subtree(read.snapshot,source.target.blockUuid), movedIds=new Set(moved.map(b=>b.target.blockUuid));
  if(movedIds.has(destination.target.blockUuid)) fail("MOVE_CYCLE");
  const parent=op.position==="first-child"?destination.target.blockUuid:destination.parentUuid;
  if(!parent || !source.parentUuid) fail("MOVE_PARENT_OUTSIDE_SCOPE");
  available(read,parent); available(read,source.parentUuid);
  const destinationProtection=read.structure?.get(destination.target.blockUuid);
  if(!destinationProtection || destinationProtection.blocked || formalSyntax(destination.content!) || managedSyntax(destination.content!)) fail("PROTECTED_MOVE_DESTINATION");
  const owner=destinationProtection.ownerUuid;
  const properties: MoveFact["propertiesBefore"]={};
  for(const b of moved){
    const id=b.target.blockUuid, protection=read.structure?.get(id);
    if(!protection || protection.blocked || formalSyntax(b.content!) || managedSyntax(b.content!)) fail("PROTECTED_MOVE_SUBTREE");
    if(protection.ownerUuid!==owner) fail("MOVE_OBJECT_OWNERSHIP_CONFLICT");
    properties[id]=structuredClone(protection.properties);
  }
  const siblings=new Map([...read.children].map(([id,list])=>[id,[...list]]));
  const old=siblings.get(source.parentUuid), next=siblings.get(parent);
  if(!old || !next || old.filter(id=>id===source.target.blockUuid).length!==1) fail("MOVE_TOPOLOGY_UNAVAILABLE");
  old.splice(old.indexOf(source.target.blockUuid),1);
  const anchor=next.indexOf(destination.target.blockUuid);
  if(op.position!=="first-child" && anchor<0) fail("MOVE_TOPOLOGY_UNAVAILABLE");
  const index=op.position==="first-child"?0:anchor+(op.position==="after"?1:0);
  if(index<0) fail("MOVE_TOPOLOGY_UNAVAILABLE");
  next.splice(index,0,source.target.blockUuid);
  const rows:BlockSnapshot[]=[],byId=new Map(read.snapshot.blocks.map(b=>[b.target.blockUuid,b]));
  const visit=(id:string,parentUuid:string|null,order:number,depth:number)=>{
    const b=byId.get(id);if(!b || rows.some(b=>b.target.blockUuid===id)) fail("MOVE_TOPOLOGY_UNAVAILABLE");
    rows.push({...b,parentUuid,order,depth});
    (siblings.get(id)??[]).forEach((child,i)=>visit(child,id,i,depth+1));
  };
  const root=read.snapshot.blocks[0]!;visit(root.target.blockUuid,root.parentUuid,root.order,0);
  if(rows.length!==read.snapshot.blocks.length) fail("MOVE_TOPOLOGY_UNAVAILABLE");
  const expected=await snapshot(read.snapshot.scope,rows);
  const affected=[...new Set([...movedIds,...(read.paths.get(source.target.blockUuid)??[]),...(read.paths.get(destination.target.blockUuid)??[]),...(read.children.get(source.parentUuid)??[]),...(read.children.get(parent)??[])])];
  return {source,expected,affected,properties};
}
function canonical(value:unknown):string {
  const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):v;
  return JSON.stringify(normalize(value));
}
function withoutAddedIdentity(raw:string, prior:string, id:string):boolean {
  if(raw===prior)return true;
  const lines=raw.split(/(?<=\n)/u), native=lines.filter(line=>line.trim()===`id:: ${id}`);
  if(native.length!==1 || prior.split(/\r?\n/u).some(line=>/^\s*id::/u.test(line)))return false;
  return lines.filter(line=>line!==native[0]).join("")===prior || raw.replace(new RegExp(`\\r?\\nid:: ${id}$`,"u"),"")===prior;
}
/** Limited native id insertion is the only tolerated storage representation change.
 * All remaining source bytes and properties must survive; actual hashes are saved. */
export async function verifyMove(read: SourceRead, op: MoveOperation, fact: MoveFact):Promise<void> {
  const synthetic:SourceRead={...read,snapshot:fact.before};
  // Reconstruct expected topology using saved before facts, not new absolute offsets.
  synthetic.children=new Map(fact.before.blocks.map(b=>[b.target.blockUuid,fact.before.blocks.filter(c=>c.parentUuid===b.target.blockUuid).map(c=>c.target.blockUuid)]));
  synthetic.structure=new Map(fact.before.blocks.map(b=>[b.target.blockUuid,{blocked:false,ownerUuid:null,properties:fact.propertiesBefore[b.target.blockUuid]??{}}]));
  const expected=await inspectMove(synthetic,op);
  if(read.snapshot.structureVersion!==expected.expected.structureVersion) fail("MOVE_READBACK_STRUCTURE_MISMATCH");
  const props:MoveFact["propertiesBefore"]={};
  for(const before of subtree(fact.before,op.target.blockUuid)){
    const id=before.target.blockUuid,after=available(read,id),structure=read.structure?.get(id);
    if(!structure || structure.blocked || structure.ownerUuid!==fact.ownersBefore[id] || !withoutAddedIdentity(after.content!,before.content!,id)) fail("MOVE_READBACK_CONTENT_MISMATCH");
    const prior=fact.propertiesBefore[id];if(!prior)fail("MOVE_PROPERTY_FACT_MISSING");
    const actual={...structure.properties};
    if(!Object.hasOwn(prior,"id") && actual.id===id)delete actual.id;
    if(canonical(prior)!==canonical(actual))fail("MOVE_READBACK_PROPERTY_MISMATCH");
    props[id]=structuredClone(structure.properties);
  }
  fact.after=structuredClone(read.snapshot);fact.propertiesAfter=props;fact.verified=true;
}

/** Journal and stage storage use the same validation, preserving old text records.
 * This confirms internal facts, never turns an observed recovery into attribution. */
export async function validateMoveFact(op: MoveOperation, fact: MoveFact):Promise<void>{
  await validateSnapshot(fact.before);
  if(typeof fact.verified!=="boolean" || fact.before.scope.graphId!==op.target.graphId)fail("MOVE_FACT_INVALID");
  const ids=subtree(fact.before,op.target.blockUuid).map(b=>b.target.blockUuid);
  if(!fact.propertiesBefore || !fact.ownersBefore || JSON.stringify(Object.keys(fact.propertiesBefore).sort())!==JSON.stringify([...ids].sort()) || JSON.stringify(Object.keys(fact.ownersBefore).sort())!==JSON.stringify([...ids].sort()))fail("MOVE_FACT_INVALID");
  for(const id of ids)if(!fact.propertiesBefore[id] || typeof fact.propertiesBefore[id]!=="object" || Array.isArray(fact.propertiesBefore[id]) || fact.ownersBefore[id]!==null && (typeof fact.ownersBefore[id]!=="string" || !uuidPattern.test(fact.ownersBefore[id])))fail("MOVE_FACT_INVALID");
  if(fact.after){
    await validateSnapshot(fact.after);
    if(!sameScope(fact.before.scope,fact.after.scope) || !fact.propertiesAfter || JSON.stringify(Object.keys(fact.propertiesAfter).sort())!==JSON.stringify([...ids].sort()))fail("MOVE_FACT_INVALID");
    for(const id of ids)if(!fact.propertiesAfter[id] || typeof fact.propertiesAfter[id]!=="object" || Array.isArray(fact.propertiesAfter[id]))fail("MOVE_FACT_INVALID");
    const read:SourceRead={snapshot:fact.after,children:new Map(),paths:new Map(),protections:new Map(),structure:new Map(fact.after.blocks.map(b=>[b.target.blockUuid,{blocked:false,ownerUuid:fact.ownersBefore[b.target.blockUuid]??null,properties:fact.propertiesAfter![b.target.blockUuid]??{}}]))};
    await verifyMove(read,op,structuredClone(fact));
  }else if(fact.verified)fail("MOVE_FACT_INVALID");
}
