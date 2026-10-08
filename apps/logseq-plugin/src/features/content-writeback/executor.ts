import type { ApplyResult, BlockSnapshot, CallOrigin, EditingGuard, ItemFact, Operation, OperationJournal, Patch, RequestRecord, ScopeAuthority, ScopeLease, SourceRead, SourceReader, SourceScope, SourceWriter, TextOperation, MoveOperation } from "./protocol.ts";
import { clone, result } from "./journal.ts";
import { assertChildContent, assertProtected } from "./protection.ts";
import { childIdentity, combineText, ContentError, fail, parsePatch, sameScope, sha256 } from "./validation.ts";

import { inspectMove, verifyMove } from "./structure.ts";

const queues = new Map<string, Promise<void>>();
async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(action);
  const tail = next.then(() => undefined, () => undefined); queues.set(key,tail);
  try { return await next; } finally { if (queues.get(key) === tail) queues.delete(key); }
}
async function serialSources<T>(keys: readonly string[], action: () => Promise<T>): Promise<T> {
  return keys.length ? serial(`source:${keys[0]}`,()=>serialSources(keys.slice(1),action)) : action();
}
// A timed-out SDK request cannot be cancelled. Fence its sources until it settles,
// including across a disposer/reinstaller in this JS context.
const inFlight = new Set<string>();
class JournalFailure extends Error {}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function sourceKey(scope: SourceScope, uuid: string): string { return JSON.stringify([scope.graphId,uuid]); }
function requestQueueKey(scope: SourceScope, requestId: string): string { return `request:${JSON.stringify([scope.graphId,scope.rootUuid,requestId])}`; }
function item(op: Operation): ItemFact {
  return {operationId:op.operationId,target:clone(op.target),type:op.type,phase:"PENDING",status:"NOT_APPLIED",reason:null,baseContent:null,baseVersion:null,proposedContent:null,actualContent:null,actualVersion:null,currentContent:null,currentVersion:null,parentUuid:null,childUuid:null,identity:null,contentVerified:false,expectationObserved:false,dispatchedAt:null,acknowledgedAt:null,verifiedAt:null};
}
function block(read: SourceRead, uuid: string): BlockSnapshot {
  const value = read.snapshot.blocks.find(value=>value.target.blockUuid===uuid);
  if (!value) fail("TARGET_OUTSIDE_SCOPE");
  if (value.availability !== "available" || value.content === null || value.contentVersion === null) fail("SOURCE_UNAVAILABLE");
  return value;
}
function settle(facts: ItemFact[], status: ItemFact["status"], reason: string | null): void {
  for (const fact of facts) { fact.phase="SETTLED";fact.status=status;fact.reason=reason; }
}
function groups(patch: Patch): Operation[][] {
  const result: Operation[][] = [], texts = new Map<string, Operation[]>();
  for (const op of patch.operations) {
    if (op.type === "insert-child" || op.type === "move-block") { result.push([op]); texts.clear(); }
    else { let group = texts.get(op.target.blockUuid); if (!group) { group=[];texts.set(op.target.blockUuid,group);result.push(group); } group.push(op); }
  }
  return result;
}
export function insertedContentMatches(raw: string | null, proposed: string, uuid: string): boolean {
  // Logseq may place its native property after the first line or at the end.
  // Accept one exact identity line insertion; all other raw bytes must match.
  if (raw === proposed) return true;
  if (raw === null) return false;
  const line = `id:: ${uuid}`;
  const matches = [...raw.matchAll(new RegExp(`(?:^|\\n)${line}(?=\\r?\\n|$)`, "gu"))];
  if (matches.length !== 1) return false;
  const match = matches[0]!, start = match.index! + (match[0].startsWith("\n") ? 1 : 0), end = start + line.length;
  const newline = raw.slice(end).startsWith("\r\n") ? 2 : raw[end] === "\n" ? 1 : 0;
  return (newline > 0 && raw.slice(0,start) + raw.slice(end+newline) === proposed)
    || (start > 0 && raw.slice(0,start-(raw.slice(0,start).endsWith("\r\n") ? 2 : 1)) + raw.slice(end) === proposed);
}
export interface ExecutorPorts {
  reader: SourceReader; authority: ScopeAuthority; editing: EditingGuard; writer: SourceWriter; journal: OperationJournal;
  hostTimeoutMs?: number;
}
export class ContentExecutor {
  constructor(private readonly ports: ExecutorPorts) {}
  private lease(scope: SourceScope): ScopeLease {
    const lease = this.ports.authority.capture(scope); if (!lease || !this.ports.authority.valid(lease)) fail("AUTHORIZATION_REQUIRED"); return lease;
  }
  private valid(lease: ScopeLease): () => boolean { return ()=>this.ports.authority.valid(lease); }
  private assert(lease: ScopeLease): void { if (!this.ports.authority.valid(lease)) fail("SCOPE_REVOKED"); }
  private assertWrite(lease: ScopeLease): void {
    this.assert(lease);
    if (this.ports.authority.allowsSourceWrite?.(lease) === false) fail("CONTENT_WRITE_AUTHORIZATION_REQUIRED");
  }
  private assertRead(lease: ScopeLease, read: SourceRead): void {
    this.assert(lease);
    if (lease.rootPath && JSON.stringify(lease.rootPath) !== JSON.stringify(read.paths.get(lease.scope.rootUuid))) fail("SCOPE_ROOT_CHANGED");
  }
  async read(scope: SourceScope): Promise<SourceRead> {
    const lease=this.lease(scope), read=await this.ports.reader.read(scope,this.valid(lease));this.assertRead(lease,read);return read;
  }
  private async persist(record: RequestRecord): Promise<void> {
    record.sequence++;record.updatedAt=new Date().toISOString();
    try { await this.ports.journal.save(clone(record)); }
    catch (error) { throw new JournalFailure(message(error)); }
  }
  async apply(input: unknown, origin: CallOrigin = {kind:"local-capability"}, retryOf: string | null = null): Promise<ApplyResult> {
    const patch=parsePatch(input), digest=await sha256(JSON.stringify(patch)), lease=this.lease(patch.scope);
    return serial(requestQueueKey(patch.scope,patch.requestId),async()=>{
      const previous=await this.ports.journal.load(patch.scope,patch.requestId);this.assert(lease);
      if (previous) {
        if (previous.digest !== digest) fail("IDEMPOTENCY_KEY_REUSED");
        return result(previous);
      }
      this.assertWrite(lease);
      const at=new Date().toISOString();
      const record:RequestRecord={schemaVersion:1,intentKind:"content-patch",sequence:0,digest,patch,origin:clone(origin),retryOf,createdAt:at,updatedAt:at,items:patch.operations.map(item),resolutions:{}};
      try { await this.ports.journal.save(clone(record)); }
      catch (error) {settle(record.items,"NOT_APPLIED","JOURNAL_INTENT_FAILED");return result(record,false,message(error));}
      let journalProblem:string|null=null;
      for (const ops of groups(patch)) {
        const childUuid=ops[0]!.type==="insert-child"?await childIdentity(patch,ops[0]!):null;
        const moveKeys=ops[0]!.type==="move-block"?[sourceKey(patch.scope,ops[0]!.destination.blockUuid)]:[];
        const keys=[...new Set([sourceKey(patch.scope,"content-graph-writes"),sourceKey(patch.scope,patch.scope.rootUuid),...moveKeys,sourceKey(patch.scope,ops[0]!.target.blockUuid),...(childUuid?[sourceKey(patch.scope,childUuid)]:[])])].sort();
        try { await serialSources(keys,()=>ops[0]!.type==="move-block"?this.executeMove(record,ops[0]!,lease,keys):this.executeGroup(record,ops,childUuid,lease,keys)); }
        catch (error) {
          if (!(error instanceof JournalFailure)) throw error;
          journalProblem=message(error);
          settle(record.items.filter(item=>item.phase==="PENDING"),"NOT_APPLIED","JOURNAL_UNAVAILABLE");
          break;
        }
      }
      return result(record,journalProblem===null,journalProblem);
    });
  }
  /** Only the trusted scope-establishment command calls this. It is not a patch
   * capability: native identity is an independently journaled association fact. */
  async persistScopeIdentity(scope:SourceScope,origin:CallOrigin):Promise<ApplyResult>{
    const lease=this.lease(scope),valid=this.valid(lease),keys=[sourceKey(scope,"content-graph-writes"),sourceKey(scope,scope.rootUuid)].sort();
    return serialSources(keys,async()=>{
      this.assertWrite(lease);
      const read=await this.read(scope),base=block(read,scope.rootUuid);this.assertWrite(lease);
      if(read.protections.get(scope.rootUuid)?.ranges.some(range=>range.reason==="managed"||range.reason==="ambiguous-formal-field"))fail("PROTECTED_SCOPE_ROOT");
      await this.ports.editing.assertSafe(scope,read.paths.get(scope.rootUuid)??[],valid);this.assert(lease);
      const op:TextOperation={operationId:"native-scope-identity",type:"replace-text",target:base.target,expectedContentVersion:base.contentVersion!,expectedParentUuid:base.parentUuid,range:{start:0,end:0},expectedText:"",text:"",context:{before:"",after:[...base.content!].slice(0,8).join("")}};
      const patch=parsePatch({schemaVersion:1,requestId:`scope-identity:${crypto.randomUUID()}`,scope,operations:[op],metadata:null});
      const at=new Date().toISOString(),fact=item(op);
      fact.baseContent=base.content;fact.baseVersion=base.contentVersion;fact.proposedContent=base.content;fact.parentUuid=base.parentUuid;
      fact.identity={status:"PENDING",before:base.content!,beforeVersion:base.contentVersion!,after:null,afterVersion:null,problem:null};
      const record:RequestRecord={schemaVersion:1,intentKind:"scope-identity",sequence:0,digest:await sha256(JSON.stringify(patch)),patch,origin:clone(origin),retryOf:null,createdAt:at,updatedAt:at,items:[fact],resolutions:{}};
      await this.ports.journal.save(clone(record));this.assert(lease);
      let dispatched=false;
      try{
        fact.phase="EXECUTING";fact.status="OUTCOME_UNKNOWN";fact.dispatchedAt=new Date().toISOString();await this.persist(record);this.assert(lease);
        const fresh=await this.read(scope);this.assert(lease);const target=block(fresh,scope.rootUuid);
        if(target.contentVersion!==base.contentVersion||target.parentUuid!==base.parentUuid)fail("IDENTITY_RECOVERY_CONFLICT");
        if(JSON.stringify(fresh.protections.get(scope.rootUuid))!==JSON.stringify(read.protections.get(scope.rootUuid)))fail("IDENTITY_PROTECTION_CHANGED");
        await this.ports.editing.assertSafe(scope,fresh.paths.get(scope.rootUuid)??[],valid);this.assert(lease);
        dispatched=true;await this.callHost(lease,keys,()=>this.ports.writer.persistIdentity(scope,scope.rootUuid,base.content!,valid));
        fact.phase="ACKNOWLEDGED";fact.acknowledgedAt=new Date().toISOString();await this.persist(record);this.assert(lease);
        const after=await this.read(scope);this.assert(lease);const current=block(after,scope.rootUuid);
        if(!insertedContentMatches(current.content,base.content!,scope.rootUuid)||current.parentUuid!==base.parentUuid)fail("IDENTITY_READBACK_MISMATCH");
        fact.identity!.status="VERIFIED";fact.identity!.after=current.content;fact.identity!.afterVersion=current.contentVersion;
        fact.actualContent=current.content;fact.actualVersion=current.contentVersion;fact.currentContent=current.content;fact.currentVersion=current.contentVersion;fact.verifiedAt=new Date().toISOString();
        settle([fact],"NO_CHANGE",null);await this.persist(record);return result(record);
      }catch(error){
        if(error instanceof JournalFailure)return result(record,false,message(error));
        settle([fact],dispatched?"OUTCOME_UNKNOWN":"NOT_APPLIED",message(error));fact.identity!.status="OUTCOME_UNKNOWN";fact.identity!.problem=message(error);
        try{await this.persist(record);}catch(journalError){return result(record,false,message(journalError));}
        return result(record);
      }
    });
  }
  private async inspect(ops: readonly Operation[], lease: ScopeLease): Promise<{read:SourceRead;target:BlockSnapshot;next:string;affected:readonly string[]}> {
    this.assert(lease);
    const scope=lease.scope, valid=this.valid(lease), read=await this.ports.reader.read(scope,valid);this.assertRead(lease,read);
    const first=ops[0]!, target=block(read,first.target.blockUuid);
    if (ops.some(op=>op.expectedContentVersion!==first.expectedContentVersion || op.expectedParentUuid!==first.expectedParentUuid)) fail("INCONSISTENT_BLOCK_BASE");
    if (target.contentVersion!==first.expectedContentVersion) fail("CONTENT_VERSION_CONFLICT");
    if (target.parentUuid!==first.expectedParentUuid) fail("PARENT_CONFLICT");
    const protection=read.protections.get(first.target.blockUuid);if (!protection) fail("PROTECTION_UNAVAILABLE");
    const todoAllowed=(op:Operation)=>this.ports.authority.allowsTodo(lease,op);
    let next:string;
    if(first.type==="move-block")fail("MOVE_REQUIRES_STRUCTURE_PATH");
    if (first.type==="insert-child") {
      if (!protection.insertAllowed && !(protection.ranges.every(range=>range.reason==="todo"||range.reason==="property"||range.reason==="formal-title") && todoAllowed(first))) fail("PROTECTED_PARENT");
      assertChildContent(first.content,todoAllowed(first));next=first.content;
    } else {
      next=combineText(target.content!,ops as TextOperation[]);
      assertProtected(target.content!,next,protection,ops as TextOperation[],todoAllowed);
    }
    const affected=[...(read.paths.get(first.target.blockUuid)??[]),...(first.type==="insert-child"?read.children.get(first.target.blockUuid)??[]:[])];
    await this.ports.editing.assertSafe(scope,affected,valid);this.assert(lease);
    return {read,target,next,affected};
  }
  private async callHost(lease:ScopeLease, keys:readonly string[], action:()=>Promise<void>):Promise<void> {
    this.assertWrite(lease);
    if (keys.some(key=>inFlight.has(key))) fail("HOST_CALL_IN_FLIGHT");
    for (const key of keys) inFlight.add(key);
    const operation=Promise.resolve().then(()=>{this.assertWrite(lease);return action();});
    void operation.finally(()=>{for (const key of keys) inFlight.delete(key);}).catch(()=>undefined);
    let timer:ReturnType<typeof setTimeout>|null=null;
    let abort:()=>void=()=>undefined;
    const stopped=new Promise<never>((_resolve,reject)=>{
      abort=()=>reject(new ContentError("SCOPE_REVOKED"));lease.signal.addEventListener("abort",abort,{once:true});
      timer=setTimeout(()=>reject(new ContentError("HOST_TIMEOUT")),this.ports.hostTimeoutMs??15_000);
    });
    try { await Promise.race([operation,stopped]);this.assert(lease); }
    finally { if(timer)clearTimeout(timer);lease.signal.removeEventListener("abort",abort); }
  }
  private async executeMove(record:RequestRecord,op:MoveOperation,lease:ScopeLease,keys:readonly string[]):Promise<void>{
    const fact=record.items.find(f=>f.operationId===op.operationId)!,valid=this.valid(lease),scope=lease.scope;
    let dispatched=false;
    const inspect=async()=>{
      this.assert(lease);
      if(!this.ports.authority.allowsStructure?.(lease))fail("STRUCTURE_AUTHORIZATION_REQUIRED");
      if(!this.ports.writer.move || this.ports.writer.supportsMove?.()===false)fail("MOVE_UNSUPPORTED_BY_HOST");
      if(keys.some(k=>inFlight.has(k)))fail("HOST_CALL_IN_FLIGHT");
      const read=await this.read(scope),plan=await inspectMove(read,op);this.assert(lease);
      await this.ports.editing.assertSafe(scope,plan.affected,valid);this.assert(lease);
      return {read,plan};
    };
    try{
      const before=await inspect();
      fact.baseContent=before.plan.source.content;fact.baseVersion=before.plan.source.contentVersion;fact.parentUuid=before.plan.source.parentUuid;fact.proposedContent=before.plan.source.content;
      fact.move={before:clone(before.read.snapshot),after:null,propertiesBefore:before.plan.properties,ownersBefore:Object.fromEntries(Object.keys(before.plan.properties).map(id=>[id,before.read.structure!.get(id)!.ownerUuid])),propertiesAfter:null,verified:false};
      if(before.plan.expected.structureVersion===before.read.snapshot.structureVersion){settle([fact],"NO_CHANGE",null);await this.persist(record);return;}
      fact.phase="EXECUTING";fact.status="OUTCOME_UNKNOWN";fact.dispatchedAt=new Date().toISOString();await this.persist(record);this.assert(lease);
      const fresh=await inspect();
      if(JSON.stringify([...fresh.read.structure??[]])!==JSON.stringify([...before.read.structure??[]]))fail("MOVE_PROTECTION_CONFLICT");
      if(fresh.read.snapshot.sourceSetVersion!==before.read.snapshot.sourceSetVersion) {
        // Unrelated text is safe. Every moved descendant must still match its saved base.
        for(const id of Object.keys(fact.move.propertiesBefore))if(fresh.read.snapshot.blocks.find(b=>b.target.blockUuid===id)?.contentVersion!==before.read.snapshot.blocks.find(b=>b.target.blockUuid===id)?.contentVersion)fail("SUBTREE_CONTENT_CONFLICT");
      }
      await this.ports.editing.assertSafe(scope,fresh.plan.affected,valid);this.assert(lease);
      dispatched=true;await this.callHost(lease,keys,()=>this.ports.writer.move!(scope,op.target.blockUuid,op.destination.blockUuid,op.position,valid));
      fact.phase="ACKNOWLEDGED";fact.acknowledgedAt=new Date().toISOString();await this.persist(record);this.assert(lease);
      const after=await this.read(scope);await verifyMove(after,op,fact.move);this.assert(lease);
      const actual=block(after,op.target.blockUuid);fact.actualContent=actual.content;fact.actualVersion=actual.contentVersion;fact.currentContent=actual.content;fact.currentVersion=actual.contentVersion;
      fact.contentVerified=true;fact.verifiedAt=new Date().toISOString();settle([fact],"APPLIED_VERIFIED",null);await this.persist(record);
    }catch(error){
      if(error instanceof JournalFailure){if(!dispatched)settle([fact],"NOT_APPLIED","JOURNAL_INTENT_FAILED");throw error;}
      const reason=message(error);settle([fact],dispatched?"OUTCOME_UNKNOWN":/CONFLICT|MISMATCH/u.test(reason)?"CONFLICT":"BLOCKED",reason);
      if(valid())try{const read=await this.read(scope),current=read.snapshot.blocks.find(b=>b.target.blockUuid===op.target.blockUuid);fact.currentContent=current?.content??null;fact.currentVersion=current?.contentVersion??null;}catch{/* Keep the durable proposal. */}
      await this.persist(record);
    }
  }
  private async executeGroup(record:RequestRecord, ops:Operation[], childUuid:string|null, lease:ScopeLease, keys:readonly string[]):Promise<void> {
    const facts=ops.map(op=>record.items.find(item=>item.operationId===op.operationId)!), first=ops[0]!, valid=this.valid(lease), scope=lease.scope;
    let dispatched=false;
    try {
      if(keys.some(key=>inFlight.has(key)))fail("HOST_CALL_IN_FLIGHT");
      const plan=await this.inspect(ops,lease);
      for(const fact of facts){fact.baseContent=plan.target.content;fact.baseVersion=plan.target.contentVersion;fact.proposedContent=plan.next;fact.parentUuid=plan.target.parentUuid;fact.childUuid=childUuid;}
      if(childUuid){const existing=await this.ports.reader.block(scope,childUuid,valid);this.assert(lease);if(existing)fail("CHILD_UUID_ALREADY_EXISTS");}
      if(first.type!=="insert-child" && plan.next===plan.target.content){settle(facts,"NO_CHANGE",null);await this.persist(record);return;}
      // Persist a conservative dispatch intent BEFORE entering the host. A crash
      // in the following interval is unknown, never an invitation to replay.
      for(const fact of facts){fact.phase="EXECUTING";fact.status="OUTCOME_UNKNOWN";fact.dispatchedAt=new Date().toISOString();}
      await this.persist(record);this.assert(lease);
      const fresh=await this.inspect(ops,lease);
      if(JSON.stringify(fresh.read.paths.get(first.target.blockUuid))!==JSON.stringify(plan.read.paths.get(first.target.blockUuid)) || JSON.stringify(fresh.read.protections.get(first.target.blockUuid))!==JSON.stringify(plan.read.protections.get(first.target.blockUuid)))fail("SOURCE_STRUCTURE_CONFLICT");
      if(childUuid){
        if(JSON.stringify(fresh.read.children.get(first.target.blockUuid))!==JSON.stringify(plan.read.children.get(first.target.blockUuid)))fail("CHILDREN_CONFLICT");
        const existing=await this.ports.reader.block(scope,childUuid,valid);this.assert(lease);if(existing)fail("CHILD_UUID_ALREADY_EXISTS");
      }
      await this.ports.editing.assertSafe(scope,fresh.affected,valid);this.assert(lease);
      dispatched=true;
      await this.callHost(lease,keys,()=>childUuid
        ? this.ports.writer.insert(scope,first.target.blockUuid,fresh.read.children.get(first.target.blockUuid)?.at(-1)??null,childUuid,plan.next,valid)
        : this.ports.writer.update(scope,first.target.blockUuid,plan.next,valid));
      for(const fact of facts){fact.phase="ACKNOWLEDGED";fact.acknowledgedAt=new Date().toISOString();}
      await this.persist(record);this.assert(lease);
      const after=await this.ports.reader.read(scope,valid);this.assertRead(lease,after);
      const actual=block(after,childUuid??first.target.blockUuid);
      const matches=childUuid?actual.parentUuid===first.target.blockUuid && insertedContentMatches(actual.content,plan.next,childUuid):actual.content===plan.next && actual.parentUuid===plan.target.parentUuid;
      for(const fact of facts){fact.currentContent=actual.content;fact.currentVersion=actual.contentVersion;}
      if(!matches)fail("READBACK_MISMATCH");
      if(JSON.stringify(after.paths.get(first.target.blockUuid))!==JSON.stringify(plan.read.paths.get(first.target.blockUuid)))fail("SOURCE_STRUCTURE_CONFLICT");
      for(const fact of facts){fact.actualContent=actual.content;fact.actualVersion=actual.contentVersion;fact.contentVerified=true;fact.verifiedAt=new Date().toISOString();}
      if(childUuid){
        const fact=facts[0]!;
        fact.identity={status:"PENDING",before:actual.content!,beforeVersion:actual.contentVersion!,after:null,afterVersion:null,problem:null};
        if(after.protections.get(childUuid)?.ranges.some(range=>range.reason==="managed"||range.reason==="formal-title"))fail("IDENTITY_PROTECTION_CHANGED");
        await this.persist(record);this.assert(lease);
        await this.ports.editing.assertSafe(scope,[...fresh.affected,childUuid],valid);this.assert(lease);
        await this.callHost(lease,keys,()=>this.ports.writer.persistIdentity(scope,childUuid,actual.content!,valid));
        const identified=await this.ports.reader.read(scope,valid);this.assertRead(lease,identified);
        const current=block(identified,childUuid);
        if(current.parentUuid!==first.target.blockUuid || !insertedContentMatches(current.content,plan.next,childUuid))fail("IDENTITY_READBACK_MISMATCH");
        fact.identity.status="VERIFIED";fact.identity.after=current.content;fact.identity.afterVersion=current.contentVersion;
        fact.actualContent=current.content;fact.actualVersion=current.contentVersion;fact.currentContent=current.content;fact.currentVersion=current.contentVersion;
      }
      settle(facts,"APPLIED_VERIFIED",null);await this.persist(record);
    } catch(error){
      if(error instanceof JournalFailure){
        if(!dispatched)settle(facts,"NOT_APPLIED","JOURNAL_INTENT_FAILED");
        // Facts already verified in this process remain truthful in the response;
        // durable=false tells the caller recovery may only have the earlier intent.
        throw error;
      }
      const reason=message(error);
      if(!dispatched){
        const conflict=/CONFLICT|MISMATCH|ALREADY_EXISTS/u.test(reason);
        settle(facts,conflict?"CONFLICT":"BLOCKED",reason);
      }else{
        settle(facts,"OUTCOME_UNKNOWN",reason);
        for(const fact of facts)if(fact.identity && fact.identity.status!=="VERIFIED"){fact.identity.status="OUTCOME_UNKNOWN";fact.identity.problem=reason;}
      }
      // Preserve current content on conflict without guessing a replacement range.
      if(valid())try{
        // The diagnostic path must not disclose an arbitrary caller UUID outside
        // the authorized subtree (including an unrelated child UUID collision).
        const read=await this.ports.reader.read(scope,valid);this.assertRead(lease,read);
        const current=read.snapshot.blocks.find(block=>block.target.blockUuid===(childUuid??first.target.blockUuid));
        for(const fact of facts){fact.currentContent=current?.content??null;fact.currentVersion=current?.contentVersion??null;}
      }catch{/* Unavailable current text remains explicit. The proposal is already durable. */}
      await this.persist(record);
    }
  }
  async query(scope:SourceScope,requestId:string):Promise<ApplyResult|null>{
    const lease=this.lease(scope),record=await this.ports.journal.load(scope,requestId);this.assert(lease);return record?result(record):null;
  }
  /** Durable facts only; reading history never retries or replays a patch. */
  async history(scope:SourceScope):Promise<ApplyResult[]>{
    const lease=this.lease(scope),records=await this.ports.journal.list(scope);this.assert(lease);
    return records.map(record=>result(record));
  }
  async pending(scope:SourceScope):Promise<RequestRecord[]>{
    const lease=this.lease(scope),records=await this.ports.journal.list(scope);this.assert(lease);
    // Discovery derives resolution from the independently durable retry result;
    // original request facts remain unchanged, and no shared index is authority.
    for(const retry of records)if(retry.retryOf){const original=records.find(record=>record.patch.requestId===retry.retryOf);if(original)for(const item of retry.items)if(item.status==="APPLIED_VERIFIED"||item.status==="NO_CHANGE")original.resolutions={...original.resolutions,[item.operationId]:"retry-verified"};}
    return records.filter(record=>record.items.some(item=>!Object.hasOwn(record.resolutions,item.operationId) && (item.phase!=="SETTLED"||!["APPLIED_VERIFIED","NO_CHANGE"].includes(item.status))));
  }
  async recover(scope:SourceScope,requestId:string):Promise<ApplyResult>{
    const lease=this.lease(scope);
    return serial(requestQueueKey(scope,requestId),async()=>{
      const record=await this.ports.journal.load(scope,requestId);this.assert(lease);if(!record)fail("REQUEST_NOT_FOUND");
      let changed=false;
      for(const fact of record.items){
        if(fact.phase==="SETTLED" && fact.status!=="OUTCOME_UNKNOWN")continue;
        const op=record.patch.operations.find(op=>op.operationId===fact.operationId)!;
        if(fact.phase==="PENDING"){fact.phase="SETTLED";fact.status="NOT_APPLIED";fact.reason="INTERRUPTED_BEFORE_DISPATCH";changed=true;continue;}
        fact.phase="SETTLED";fact.status="OUTCOME_UNKNOWN";fact.reason="RECOVERY_ATTRIBUTION_UNKNOWN";
        const valid=this.valid(lease);
        try{
          const read=await this.ports.reader.read(scope,valid);this.assertRead(lease,read);
          const current=block(read,fact.childUuid??fact.target.blockUuid);
          fact.currentContent=current.content;fact.currentVersion=current.contentVersion;
          if(op.type==="move-block"){
            if(!fact.move)fail("MOVE_INTENT_MISSING");
            const observed=clone(fact.move);await verifyMove(read,op,observed);this.assert(lease);
            fact.move.after=observed.after;fact.move.propertiesAfter=observed.propertiesAfter;fact.expectationObserved=true;
            // Observing the intended state after a lost ACK cannot establish authorship.
            changed=true;continue;
          }
          fact.expectationObserved=record.intentKind==="scope-identity"
            ? current.parentUuid===fact.parentUuid && insertedContentMatches(current.content,fact.identity!.before,scope.rootUuid)
            : op.type==="insert-child"?current.parentUuid===op.target.blockUuid && insertedContentMatches(current.content,op.content,fact.childUuid!):current.content===fact.proposedContent && current.parentUuid===fact.parentUuid;
        }catch(error){this.assert(lease);fact.reason=message(error);}
        changed=true;
      }
      if(changed)try{await this.persist(record);}catch(error){return result(record,false,message(error));}
      return result(record);
    });
  }
  async resolve(scope:SourceScope,requestId:string,operationId:string,resolution:"keep-current"|"copied"):Promise<ApplyResult>{
    const lease=this.lease(scope);
    return serial(requestQueueKey(scope,requestId),async()=>{
      const record=await this.ports.journal.load(scope,requestId);this.assert(lease);if(!record)fail("REQUEST_NOT_FOUND");
      if(!record.items.some(item=>item.operationId===operationId))fail("OPERATION_NOT_FOUND");
      record.resolutions={...record.resolutions,[operationId]:resolution};await this.persist(record);this.assert(lease);return result(record);
    });
  }
  async retry(scope:SourceScope,previousRequestId:string,input:unknown,origin:CallOrigin={kind:"local-capability"}):Promise<ApplyResult>{
    const next=parsePatch(input),lease=this.lease(scope),previous=await this.ports.journal.load(scope,previousRequestId);this.assert(lease);
    if(!previous)fail("REQUEST_NOT_FOUND");
    if(previous.intentKind!=="content-patch")fail("IDENTITY_REQUIRES_REVALIDATION");
    if(!sameScope(next.scope,scope)||next.requestId===previousRequestId)fail("RETRY_REQUIRES_NEW_REQUEST");
    for(const op of next.operations){
      const old=previous.items.find(item=>item.operationId===op.operationId);
      if(!old||old.phase!=="SETTLED"||!["CONFLICT","BLOCKED","NOT_APPLIED"].includes(old.status)||old.contentVerified||JSON.stringify(old.target)!==JSON.stringify(op.target)||old.type!==op.type)fail("RETRY_NOT_PROVEN_UNAPPLIED");
    }
    return this.apply(next,origin,previousRequestId);
  }
  async resumeIdentity(scope:SourceScope,requestId:string,operationId:string):Promise<ApplyResult>{
    const lease=this.lease(scope);
    return serial(requestQueueKey(scope,requestId),async()=>{
      const record=await this.ports.journal.load(scope,requestId);this.assert(lease);if(!record)fail("REQUEST_NOT_FOUND");
      const fact=record.items.find(item=>item.operationId===operationId),op=record.patch.operations.find(op=>op.operationId===operationId);
      const scopeIdentity=record.intentKind==="scope-identity";
      if(!fact||!op||!fact.identity||(!scopeIdentity&&(op.type!=="insert-child"||!fact.childUuid||!fact.contentVerified)))fail("IDENTITY_RECOVERY_UNAVAILABLE");
      if(fact.identity.status==="VERIFIED")return result(record);
      this.assertWrite(lease);
      const child=scopeIdentity?scope.rootUuid:fact.childUuid!,parent=scopeIdentity?fact.parentUuid:op.target.blockUuid;
      const body=scopeIdentity?fact.identity.before:(op as Extract<Operation,{type:"insert-child"}>).content;
      const keys=[...new Set([sourceKey(scope,"content-graph-writes"),sourceKey(scope,child),sourceKey(scope,op.target.blockUuid)])].sort();
      return serialSources(keys,async()=>{
        const valid=this.valid(lease),read=await this.ports.reader.read(scope,valid);this.assertRead(lease,read);
        const current=block(read,child);
        if(read.protections.get(child)?.ranges.some(range=>range.reason==="managed"||range.reason==="ambiguous-formal-field"||(!scopeIdentity&&range.reason==="formal-title")))fail("IDENTITY_PROTECTION_CHANGED");
        if(current.parentUuid!==parent||!insertedContentMatches(current.content,body,child))fail("IDENTITY_RECOVERY_CONFLICT");
        await this.ports.editing.assertSafe(scope,read.paths.get(child)??[child],valid);this.assert(lease);
        fact.identity!.status="PENDING";await this.persist(record);this.assert(lease);
        try{
          await this.callHost(lease,keys,()=>this.ports.writer.persistIdentity(scope,child,current.content!,valid));
          const after=await this.ports.reader.block(scope,child,valid);this.assert(lease);
          if(!after||after.parentUuid!==parent||!insertedContentMatches(after.content,body,child))fail("IDENTITY_READBACK_MISMATCH");
          fact.identity!.status="VERIFIED";fact.identity!.after=after.content;fact.identity!.afterVersion=after.contentVersion;fact.identity!.problem=null;
          fact.actualContent=after.content;fact.actualVersion=after.contentVersion;fact.currentContent=after.content;fact.currentVersion=after.contentVersion;fact.verifiedAt=new Date().toISOString();fact.status=scopeIdentity?"NO_CHANGE":"APPLIED_VERIFIED";fact.reason=null;fact.phase="SETTLED";
        }catch(error){fact.status="OUTCOME_UNKNOWN";fact.identity!.status="OUTCOME_UNKNOWN";fact.identity!.problem=message(error);fact.reason=message(error);}
        try{await this.persist(record);}catch(error){return result(record,false,message(error));}
        return result(record);
      });
    });
  }
}
