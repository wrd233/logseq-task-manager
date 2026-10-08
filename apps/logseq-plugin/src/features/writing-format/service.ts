import { workRecord, workText } from "@task-copilot/contracts";
import type { ApplyResult, CallOrigin, ControlledFormattingExecution, Patch, RequestRecord, ScopeLease, SourceRead, SourceScope, TextOperation } from "../content-writeback/protocol.ts";
import { combineText, fail, nativeIdentityReadbackMatches, parsePatch, sha256 } from "../content-writeback/validation.ts";
import { formalSyntax, managedSyntax, propertyLines } from "../content-writeback/protection.ts";
import { managedLabels } from "../../writing-convention.ts";

export const naturalLabels=["目标","想法","注","说明","记录","问题"] as const;
const reserved=new Set(["任务","事务","MiniProject","Project","Area",...Object.values(managedLabels)]);
type Check=(lease:ScopeLease)=>boolean;
function proposalOwner(origin:CallOrigin):unknown{return origin.kind==="verified-local-agent"?[origin.kind,origin.instanceId,origin.connectionId,origin.clientLabel]:[origin.kind];}
interface Ports {valid:Check;read(scope:SourceScope):Promise<SourceRead>;apply(patch:Patch,control:ControlledFormattingExecution,origin:CallOrigin):Promise<ApplyResult>;query(scope:SourceScope,id:string):Promise<ApplyResult|null>;recover(scope:SourceScope,id:string):Promise<ApplyResult>;resolve(scope:SourceScope,id:string,operation:string,resolution:"keep-current"):Promise<ApplyResult>;pending(scope:SourceScope):Promise<RequestRecord[]>}
export interface FormattingProposal {schemaVersion:1;proposalId:string;scope:SourceScope;sourceSetVersion:string;structureVersion:string;sourceIds:string[];labels:string[];proposedBy:CallOrigin;changes:Array<{sourceId:string;blockUuid:string;line:number;before:string;after:string;lineText:string;formattedLine:string}>;skipped:Array<{sourceId:string;reason:string}>;writesSource:false}
interface Stored {packet:FormattingProposal;patch:Patch|null;lease:ScopeLease;generation:number;versions:Map<string,string>;requestDigest:string}
function list(raw:unknown,max:number):string[]{if(!Array.isArray(raw)||!raw.length||raw.length>max)fail("FORMAT_SELECTION_REQUIRED");return [...new Set(raw.map(value=>workText(value,4096)))];}
export function formattingLabels(raw:unknown):string[]{
  const labels=raw===undefined?[...naturalLabels]:list(raw,32);
  if(labels.some(l=>l.length>40||/[[\]\r\n]/u.test(l)||reserved.has(l)))fail("FORMAT_FORMAL_LABEL_FORBIDDEN");return labels;
}
/** All replacements remain in the original raw coordinate space. */
export function prefixChanges(content:string,labels:ReadonlySet<string>):Array<{start:number;end:number;before:string;after:string;line:number}> {
  const changes:Array<{start:number;end:number;before:string;after:string;line:number}>=[];let offset=0,fence:{mark:string;length:number}|null=null,lineNumber=0,quote=false,literal:string|null=null;
  for(const line of content.split(/(?<=\n)/u)){
    lineNumber++;const text=line.replace(/\r?\n$/u,""),delimiter=/^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(text);
    if(literal){if(literal==="math"?text.trim()==="$$":literal==="org"?/^\s*#\+END_(?:SRC|EXAMPLE|QUOTE)\b/iu.test(text):new RegExp(`</${literal}\\s*>`,"iu").test(text))literal=null;}
    else if(!fence&&/^ {0,3}<(pre|code|script|style)\b/iu.test(text)){const tag=/^ {0,3}<(pre|code|script|style)\b/iu.exec(text)![1]!.toLowerCase();if(!new RegExp(`</${tag}\\s*>`,"iu").test(text))literal=tag;}
    else if(!fence&&text.trim()==="$$")literal="math";
    else if(!fence&&/^\s*#\+BEGIN_(?:SRC|EXAMPLE|QUOTE)\b/iu.test(text))literal="org";
    else if(fence){if(delimiter?.[1]?.[0]===fence.mark&&delimiter[1].length>=fence.length&&!delimiter[2]!.trim())fence=null;}
    else if(delimiter)fence={mark:delimiter[1]![0]!,length:delimiter[1]!.length};
    else if(/^ {0,3}>/u.test(text))quote=true;
    else if(quote){if(!text.trim())quote=false;}
    else {
      // ASCII colon immediately after the bracket is also Markdown reference
      // definition syntax. Preserve that ambiguous literal form.
      const match=/^( {0,3}(?:[-*+] )?)\[([^\]\r\n]{1,40})\](?=\s|$|：)/u.exec(text);
      if(match&&labels.has(match[2]!)){const before=`[${match[2]}]`,start=offset+match[1]!.length;changes.push({start,end:start+before.length,before,after:`**${before}**`,line:lineNumber});}
    }
    offset+=line.length;
  }return changes;
}
function versionMap(read:SourceRead):Map<string,string>{return new Map(read.snapshot.blocks.map(b=>[b.sourceId,JSON.stringify([b.contentVersion,b.availability,b.parentUuid,b.order,b.depth])]));}
function literalAncestor(read:SourceRead,id:string):boolean {
  return (read.paths.get(id)??[]).filter(parent=>parent!==id).some(parent=>{
    const content=read.snapshot.blocks.find(b=>b.target.blockUuid===parent)?.content;
    if(content===null)return true;if(content===undefined)return false;
    if(/^(?: {0,3}>| {4}|\t| {0,3}<(?:pre|code|script|style)\b|\s*\$\$|\s*#\+BEGIN_(?:SRC|EXAMPLE|QUOTE)\b)/iu.test(content))return true;
    let fence:{mark:string;length:number}|null=null;
    for(const line of content.split(/\r?\n/u)){
      const m=/^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);if(!m)continue;
      if(!fence)fence={mark:m[1]![0]!,length:m[1]!.length};
      else if(m[1]![0]===fence.mark&&m[1]!.length>=fence.length&&!m[2]!.trim())fence=null;
    }return fence!==null;
  });
}
function ordinary(read:SourceRead,id:string):boolean {
  const b=read.snapshot.blocks.find(b=>b.target.blockUuid===id),p=read.protections.get(id),structure=read.structure?.get(id);
  return !!b&&b.availability==="available"&&b.content!==null&&!!p&&!!structure&&!structure.blocked&&!literalAncestor(read,id)&&!p.ranges.some(r=>["managed","ambiguous-formal-field","formal-title","todo"].includes(r.reason))&&!formalSyntax(b.content)&&!managedSyntax(b.content,structure.properties);
}
/** Preview is readable by the Agent. Applying is retained by the local human
 * form and grants only this immutable prefix patch, never general body rights. */
export class WritingFormatService {
  private generation=0;
  private tail:Promise<void>=Promise.resolve();
  private readonly proposals=new Map<string,Stored>();
  constructor(private readonly ports:Ports){}
  clear():void{this.generation++;this.proposals.clear();}
  entries(lease:ScopeLease):FormattingProposal[]{return [...this.proposals.values()].filter(p=>p.lease===lease&&this.ports.valid(lease)).map(p=>structuredClone(p.packet));}
  async preview(lease:ScopeLease,input:unknown,origin:CallOrigin):Promise<FormattingProposal>{
    const raw=workRecord(input,["requestId","sourceIds","labels"]),id=workText(raw.requestId),sourceIds=list(raw.sourceIds,128),labels=formattingLabels(raw.labels),generation=this.generation;
    const previous=this.proposals.get(id);
    if(previous){
      if(previous.lease!==lease||JSON.stringify([previous.packet.sourceIds,previous.packet.labels,proposalOwner(previous.packet.proposedBy)])!==JSON.stringify([sourceIds,labels,proposalOwner(origin)]))fail("IDEMPOTENCY_KEY_REUSED");
      if(!this.ports.valid(lease)||previous.generation!==generation)fail("SCOPE_REVOKED");return structuredClone(previous.packet);
    }
    if(!this.ports.valid(lease))fail("SCOPE_REVOKED");const read=await this.ports.read(lease.scope);if(!this.ports.valid(lease)||generation!==this.generation)fail("SCOPE_REVOKED");
    const roots=sourceIds.map(id=>{const b=read.snapshot.blocks.find(b=>b.sourceId===id);if(!b)fail("FORMAT_SOURCE_OUTSIDE_SCOPE");return b.target.blockUuid;});
    const packet:FormattingProposal={schemaVersion:1,proposalId:id,scope:{...lease.scope},sourceSetVersion:read.snapshot.sourceSetVersion,structureVersion:read.snapshot.structureVersion,sourceIds,labels,proposedBy:structuredClone(origin),changes:[],skipped:[],writesSource:false},operations:TextOperation[]=[];
    for(const b of read.snapshot.blocks){
      if(!read.paths.get(b.target.blockUuid)?.some(id=>roots.includes(id)))continue;
      if(!ordinary(read,b.target.blockUuid)){packet.skipped.push({sourceId:b.sourceId,reason:"protected-or-unavailable"});continue;}
      const changes=prefixChanges(b.content!,new Set(labels));
      for(const change of changes){
        if(read.protections.get(b.target.blockUuid)!.ranges.some(r=>change.start<r.end&&change.end>r.start)){packet.skipped.push({sourceId:b.sourceId,reason:"protected-prefix"});continue;}
        operations.push({operationId:`format-${operations.length+1}`,type:"replace-text",target:b.target,expectedContentVersion:b.contentVersion!,expectedParentUuid:b.parentUuid,range:{start:change.start,end:change.end},expectedText:change.before,text:change.after,context:null});
        const lineText=b.content!.split(/\r?\n/u)[change.line-1]!,lineStart=b.content!.slice(0,change.start).lastIndexOf("\n")+1,start=change.start-lineStart;
        packet.changes.push({sourceId:b.sourceId,blockUuid:b.target.blockUuid,line:change.line,before:change.before,after:change.after,lineText,formattedLine:lineText.slice(0,start)+change.after+lineText.slice(start+change.before.length)});
      }
    }
    if(operations.length>64)fail("FORMAT_CHANGE_LIMIT");
    if(new TextEncoder().encode(JSON.stringify(packet)).length>1_048_576)fail("FORMAT_PREVIEW_TOO_LARGE");
    const patch=operations.length?parsePatch({schemaVersion:1,requestId:id,scope:lease.scope,operations,metadata:null}):null,requestDigest=await sha256(JSON.stringify(patch));
    if(!this.ports.valid(lease)||generation!==this.generation)fail("SCOPE_REVOKED");
    const concurrent=this.proposals.get(id);
    if(concurrent){if(concurrent.lease!==lease||JSON.stringify([concurrent.packet.sourceIds,concurrent.packet.labels,proposalOwner(concurrent.packet.proposedBy)])!==JSON.stringify([sourceIds,labels,proposalOwner(origin)]))fail("IDEMPOTENCY_KEY_REUSED");return structuredClone(concurrent.packet);}
    this.proposals.set(id,{packet,patch,lease,generation,versions:versionMap(read),requestDigest});
    if(this.proposals.size>8)this.proposals.delete(this.proposals.keys().next().value!);
    return structuredClone(packet);
  }
  apply(lease:ScopeLease,id:string):Promise<ApplyResult|null>{
    const run=this.tail.then(()=>this.applyStored(lease,id));this.tail=run.then(()=>undefined,()=>undefined);return run;
  }
  private async applyStored(lease:ScopeLease,id:string):Promise<ApplyResult|null>{
    const stored=this.proposals.get(workText(id));if(!stored||stored.lease!==lease)fail("FORMAT_PROPOSAL_UNAVAILABLE");
    const assert=()=>{if(!this.ports.valid(lease)||stored.generation!==this.generation||this.proposals.get(id)!==stored)fail("SCOPE_REVOKED");};assert();
    if(!stored.patch)return null;
    const previous=await this.ports.query(lease.scope,id);assert();if(previous){if(previous.record.intentKind!=="formatting"||previous.record.digest!==stored.requestDigest)fail("IDEMPOTENCY_KEY_REUSED");return previous;}
    if((await this.pending(lease)).length)fail("FORMAT_UNRESOLVED_RESULT");assert();
    const expected=new Map(stored.versions),patch=stored.patch;
    const control:ControlledFormattingExecution={intentKind:"formatting",fact:{schemaVersion:1,proposalId:id,requestDigest:stored.requestDigest,sourceSetVersion:stored.packet.sourceSetVersion,structureVersion:stored.packet.structureVersion,sourceIds:[...stored.packet.sourceIds],proposedBy:stored.packet.proposedBy},assert:actual=>{if(actual!==lease)fail("SCOPE_REVOKED");assert();},beforeDispatch:async()=>assert(),authorize:(actual,read,ops)=>{
      if(actual!==lease)fail("SCOPE_REVOKED");assert();
      if(read.snapshot.structureVersion!==stored.packet.structureVersion||read.snapshot.blocks.length!==expected.size||[...versionMap(read)].some(([id,version])=>expected.get(id)!==version))fail("FORMAT_SOURCE_CHANGED");
      const allowed=patch.operations.filter(op=>op.target.blockUuid===ops[0]!.target.blockUuid);if(JSON.stringify(allowed)!==JSON.stringify(ops)||!ordinary(read,ops[0]!.target.blockUuid))fail("INVALID_FORMATTING_PATCH");
      const base=read.snapshot.blocks.find(b=>b.target.blockUuid===ops[0]!.target.blockUuid)!.content!,next=combineText(base,ops as TextOperation[]);
      if(JSON.stringify(propertyLines(base))!==JSON.stringify(propertyLines(next)))fail("PROTECTED_PROPERTY");
    },matchesReadback:(actual,next,id)=>nativeIdentityReadbackMatches(actual,next,id),afterVerified:(read,ops)=>{
      const ids=new Set(ops.map(op=>op.target.blockUuid));for(const b of read.snapshot.blocks)if(ids.has(b.target.blockUuid))expected.set(b.sourceId,versionMap(read).get(b.sourceId)!);
    }};
    return this.ports.apply(patch,control,{kind:"local-user-command",command:"formatting-apply"});
  }
  async result(lease:ScopeLease,id:string,recover=false):Promise<ApplyResult|null>{
    const found=await this.ports.query(lease.scope,workText(id));if(found&&found.record.intentKind!=="formatting")fail("NOT_FORMATTING_REQUEST");return found&&recover?this.ports.recover(lease.scope,id):found;
  }
  async pending(lease:ScopeLease):Promise<RequestRecord[]>{return (await this.ports.pending(lease.scope)).filter(record=>record.intentKind==="formatting");}
  async keepCurrent(lease:ScopeLease,id:string):Promise<ApplyResult|null>{
    let result=await this.result(lease,id);if(!result)return null;
    for(const item of result.record.items)result=await this.ports.resolve(lease.scope,id,item.operationId,"keep-current");return result;
  }
}
