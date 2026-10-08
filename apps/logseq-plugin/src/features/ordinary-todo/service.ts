import { workRecord, workText } from "@task-copilot/contracts";
import type { ApplyResult, CallOrigin, ControlledTodoExecution, Operation, OrdinaryTodoFact, Patch, ScopeLease, SourceRead, SourceScope } from "../content-writeback/protocol.ts";
import { fail, nativeIdentityReadbackMatches, parsePatch, parseScope, sameScope, sha256, uuid, wellFormed } from "../content-writeback/validation.ts";
import { formalSyntax, managedSyntax, propertyLines, todoRanges } from "../content-writeback/protection.ts";

export type TodoAction="create"|"complete"|"reopen";
type Target={blockUuid:string;expectedContentVersion:string;expectedParentUuid:string|null};
export type TodoRequest={schemaVersion:1;requestId:string;scope:SourceScope;action:TodoAction;target:Target;title:string|null;evidence:null|{materialId:string;expectedVersion:string;verifiedText:string}};
export interface TodoMaterial {id:string;path:string;reference:string;writeState:string;availability:string;content:string|null;version:string|null}
interface Ports {
  valid(lease:ScopeLease):boolean;
  read(scope:SourceScope):Promise<SourceRead>;
  apply(patch:Patch,control:ControlledTodoExecution,origin:CallOrigin,retryOf?:string|null):Promise<ApplyResult>;
  query(scope:SourceScope,id:string):Promise<ApplyResult|null>;
  recover(scope:SourceScope,id:string):Promise<ApplyResult>;
  resumeIdentity(scope:SourceScope,id:string,operationId:string,control?:ControlledTodoExecution):Promise<ApplyResult>;
}
const version=(raw:unknown)=>{if(typeof raw!=="string"||!/^([0-9a-f]{64})$/u.test(raw))fail("INVALID_VERSION");return raw;};
function prose(raw:unknown,max:number):string {
  if(typeof raw!=="string"||!raw.trim()||raw.length>max||/[\r\n\0]/u.test(raw)||!wellFormed(raw))fail("INVALID_TODO_TEXT");return raw;
}
export function parseTodoRequest(input:unknown):TodoRequest {
  const raw=workRecord(input,["schemaVersion","requestId","scope","action","target","title","evidence"]);
  if(raw.schemaVersion!==1||!["create","complete","reopen"].includes(String(raw.action)))fail("INVALID_TODO_ACTION");
  const target=workRecord(raw.target,["blockUuid","expectedContentVersion","expectedParentUuid"]),action=raw.action as TodoAction;
  let title:string|null=null,evidence:TodoRequest["evidence"]=null;
  if(action==="create"){
    title=prose(raw.title,1000);
    if(title!==title.trim()||/^(?:TODO|DONE|WAITING|DOING|NOW|LATER|CANCELED)\b|^[-*+>#`~]|^(?:\*\*)?\[/u.test(title)||formalSyntax(`TODO ${title}`)||managedSyntax(title)||propertyLines(title).length)fail("ORDINARY_TODO_TITLE_REQUIRED");
  }else if(raw.title!==undefined&&raw.title!==null)fail("UNSUPPORTED_FIELD");
  if(action==="complete"){
    const proof=workRecord(raw.evidence,["materialId","expectedVersion","verifiedText"]);
    evidence={materialId:workText(proof.materialId),expectedVersion:version(proof.expectedVersion),verifiedText:prose(proof.verifiedText,1000)};
  }else if(raw.evidence!==undefined&&raw.evidence!==null)fail("UNSUPPORTED_FIELD");
  return {schemaVersion:1,requestId:workText(raw.requestId),scope:parseScope(raw.scope),action,target:{blockUuid:uuid(target.blockUuid),expectedContentVersion:version(target.expectedContentVersion),expectedParentUuid:target.expectedParentUuid===null?null:uuid(target.expectedParentUuid)},title,evidence};
}
function available(read:SourceRead,id:string){
  const b=read.snapshot.blocks.find(b=>b.target.blockUuid===id);if(!b||b.availability!=="available"||b.content===null||b.contentVersion===null)fail("TODO_SOURCE_UNAVAILABLE");return b;
}
function safeTarget(read:SourceRead,id:string,action:TodoAction):void {
  const block=available(read,id),protection=read.protections.get(id),structure=read.structure?.get(id);
  if(!protection||!structure||structure.blocked||protection.ranges.some(p=>p.reason==="managed"||p.reason==="ambiguous-formal-field"||action!=="create"&&p.reason==="formal-title"))fail("TODO_FORMAL_PATH_REQUIRED");
  if(action!=="create"){
    if(!/^(?:TODO|DONE) [^\r\n]+/u.test(block.content!)||formalSyntax(block.content!)||managedSyntax(block.content!,structure.properties)||todoRanges(block.content!).some(r=>r.start!==0))fail("ORDINARY_TODO_REQUIRED");
    // Appending an evidence line must not become code or a quote.
    let fence:string|null=null;
    for(const line of block.content!.split(/\r?\n/u)){const m=/^\s*(`{3,}|~{3,})/u.exec(line);if(m)fence=fence===m[1]![0]?null:fence??m[1]![0]!;}
    if(fence)fail("TODO_UNCLOSED_CODE");
  }
}
/** The trusted human UI owns grants. No transport command can set roots,
 * actions, lifetime, a control callback, or an actor. */
export class OrdinaryTodoService {
  private generation=0;
  private grant:null|{lease:ScopeLease;roots:string[];actions:TodoAction[];grantedAt:string}=null;
  constructor(private readonly ports:Ports){}
  revoke():void{this.generation++;this.grant=null;}
  status(lease:ScopeLease){
    if(!this.ports.valid(lease)||this.grant?.lease!==lease){if(this.grant&&!this.ports.valid(this.grant.lease))this.grant=null;return {authorized:false,roots:[],actions:[],lifetime:"current-work-connection" as const};}
    return {authorized:true,roots:[...this.grant.roots],actions:[...this.grant.actions],grantedAt:this.grant.grantedAt,lifetime:"current-work-connection" as const};
  }
  async allow(lease:ScopeLease,roots:readonly string[],actions:readonly TodoAction[]):Promise<void>{
    const generation=++this.generation;this.grant=null;
    if(!this.ports.valid(lease))fail("SCOPE_REVOKED");
    if(!roots.length||roots.length>128||!actions.length||actions.some(a=>!["create","complete","reopen"].includes(a)))fail("INVALID_TODO_GRANT");
    const read=await this.ports.read(lease.scope);if(!this.ports.valid(lease)||generation!==this.generation)fail("SCOPE_REVOKED");
    const selected=[...new Set(roots.map(uuid))];for(const id of selected)safeTarget(read,id,"create");
    this.grant={lease,roots:selected,actions:[...new Set(actions)],grantedAt:new Date().toISOString()};
  }
  private assert(lease:ScopeLease,action:TodoAction):void {
    if(!this.ports.valid(lease))fail("SCOPE_REVOKED");
    if(this.grant?.lease!==lease||!this.grant.actions.includes(action))fail("TODO_AUTHORIZATION_REQUIRED");
  }
  private authorize(lease:ScopeLease,read:SourceRead,request:TodoRequest):void {
    this.assert(lease,request.action);
    const path=read.paths.get(request.target.blockUuid);
    if(!path||!this.grant!.roots.some(id=>path.includes(id)))fail("TODO_OUTSIDE_GRANTED_RANGE");
    safeTarget(read,request.target.blockUuid,request.action);
  }
  private async proof(request:TodoRequest,readMaterial:(id:string)=>Promise<TodoMaterial>):Promise<NonNullable<OrdinaryTodoFact["evidence"]>>{
    const proof=request.evidence;if(!proof)fail("TODO_EVIDENCE_REQUIRED");
    const material=await readMaterial(proof.materialId);
    if(material.id!==proof.materialId||material.availability!=="available"||material.writeState!=="ready"||typeof material.content!=="string"||material.version!==proof.expectedVersion||await sha256(material.content)!==proof.expectedVersion||!material.content.includes(proof.verifiedText))fail("TODO_EVIDENCE_CONFLICT");
    const filename=prose(material.path.split("/").at(-1),4096),reference=prose(material.reference,8192);
    return {kind:"material-version",materialId:material.id,filename,reference,version:proof.expectedVersion,observedAt:new Date().toISOString(),verifiedText:proof.verifiedText};
  }
  private control(lease:ScopeLease,request:TodoRequest,patch:Patch,fact:OrdinaryTodoFact,readMaterial:(id:string)=>Promise<TodoMaterial>):ControlledTodoExecution {
    const operations=JSON.stringify(patch.operations),grant=this.grant;
    const assert=(actual:ScopeLease)=>{if(actual!==lease||grant!==this.grant)fail("TODO_AUTHORIZATION_REQUIRED");this.assert(lease,request.action);};
    return {fact,assert,matchesReadback:(actual,expected,id)=>id===request.target.blockUuid&&nativeIdentityReadbackMatches(actual,expected,id),authorize:(actual,read,ops)=>{
      assert(actual);if(JSON.stringify(ops)!==operations)fail("INVALID_CONTROLLED_TODO_PATCH");this.authorize(lease,read,request);
    },beforeDispatch:async()=>{
      assert(lease);if(fact.evidence){const current=await this.proof(request,readMaterial);assert(lease);if(current.reference!==fact.evidence.reference||current.filename!==fact.evidence.filename)fail("TODO_EVIDENCE_CONFLICT");}
    }};
  }
  async apply(lease:ScopeLease,input:unknown,readMaterial:(id:string)=>Promise<TodoMaterial>,origin:CallOrigin,retryOf:string|null=null):Promise<ApplyResult>{
    const request=parseTodoRequest(input);if(!sameScope(request.scope,lease.scope))fail("SCOPE_MISMATCH");
    const requestJson=JSON.stringify(request),requestDigest=await sha256(requestJson),previous=await this.ports.query(lease.scope,request.requestId);
    if(previous){if(previous.record.intentKind!=="ordinary-todo"||previous.record.ordinaryTodo?.requestDigest!==requestDigest)fail("IDEMPOTENCY_KEY_REUSED");return previous;}
    this.assert(lease,request.action);const grant=this.grant,check=()=>{if(grant!==this.grant)fail("TODO_AUTHORIZATION_REQUIRED");this.assert(lease,request.action);};
    const read=await this.ports.read(lease.scope);check();this.authorize(lease,read,request);
    const block=available(read,request.target.blockUuid),base={target:block.target,expectedContentVersion:request.target.expectedContentVersion,expectedParentUuid:request.target.expectedParentUuid};
    if(block.contentVersion!==base.expectedContentVersion||block.parentUuid!==base.expectedParentUuid)fail("TODO_SOURCE_CONFLICT");
    const evidence=request.action==="complete"?await this.proof(request,readMaterial):null;check();
    const operations:Operation[]=[];
    if(request.action==="create")operations.push({...base,operationId:"todo-create",type:"insert-child",childUuid:null,content:`TODO ${request.title}`});
    else {
      const expected=request.action==="complete"?"TODO":"DONE",next=request.action==="complete"?"DONE":"TODO";
      if(!block.content!.startsWith(`${expected} `))fail("TODO_STATE_CONFLICT");
      operations.push({...base,operationId:"todo-state",type:"replace-text",range:{start:0,end:4},expectedText:expected,text:next,context:null});
      if(evidence){const content=block.content!,newline=content.includes("\r\n")?"\r\n":"\n";
        // A terminal native property may have no newline. Appending would alter
        // its protected line bytes. Insert before the separator preceding the
        // whole terminal property run, without relaxing the legacy validator.
        const lines=content.split(/(?<=\n)/u);let end=content.length;
        if(!content.endsWith("\n")&&propertyLines(lines.at(-1)!).length){
          let first=lines.length-1;while(first>0&&propertyLines(lines[first-1]!).length)first--;
          const prefix=lines.slice(0,first).join("");end=prefix.length-(prefix.endsWith("\r\n")?2:1);
        }
        operations.push({...base,operationId:"todo-evidence",type:"insert-text",range:{start:end,end},expectedText:"",text:`${newline}**[记录]** 已核验所选材料版本及指定片段；详见 ${evidence.reference}。`,context:{before:content.slice(Math.max(0,end-32),end),after:content.slice(end,end+32)}});
      }
    }
    const patch=parsePatch({schemaVersion:1,requestId:request.requestId,scope:request.scope,operations,metadata:null}),fact:OrdinaryTodoFact={schemaVersion:1,action:request.action,requestJson,requestDigest,evidence};
    return this.ports.apply(patch,this.control(lease,request,patch,fact,readMaterial),origin,retryOf);
  }
  async result(lease:ScopeLease,id:string,recover=false):Promise<ApplyResult|null>{
    const previous=await this.ports.query(lease.scope,workText(id));if(previous&&previous.record.intentKind!=="ordinary-todo")fail("NOT_TODO_REQUEST");
    return previous&&recover?this.ports.recover(lease.scope,id):previous;
  }
  async resumeIdentity(lease:ScopeLease,id:string,readMaterial:(id:string)=>Promise<TodoMaterial>):Promise<ApplyResult>{
    const previous=await this.result(lease,id),fact=previous?.record.ordinaryTodo;if(!previous||!fact||fact.action!=="create")fail("IDENTITY_RECOVERY_UNAVAILABLE");
    const request=parseTodoRequest(JSON.parse(fact.requestJson));this.assert(lease,request.action);
    return this.ports.resumeIdentity(lease.scope,id,"todo-create",this.control(lease,request,previous.record.patch,fact,readMaterial));
  }
  async retry(lease:ScopeLease,previousId:string,input:unknown,readMaterial:(id:string)=>Promise<TodoMaterial>,origin:CallOrigin):Promise<ApplyResult>{
    const previous=await this.result(lease,previousId),request=parseTodoRequest(input);if(!previous)fail("REQUEST_NOT_FOUND");
    const old=parseTodoRequest(JSON.parse(previous.record.ordinaryTodo!.requestJson));
    if(request.requestId===previousId||request.action!==old.action||request.target.blockUuid!==old.target.blockUuid||!previous.record.items.every(i=>i.phase==="SETTLED"&&["CONFLICT","BLOCKED","NOT_APPLIED"].includes(i.status)&&!i.contentVerified))fail("RETRY_NOT_PROVEN_UNAPPLIED");
    return this.apply(lease,request,readMaterial,origin,previousId);
  }
}
