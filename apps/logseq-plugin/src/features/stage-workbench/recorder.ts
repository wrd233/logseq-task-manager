import { validateMoveFact } from "../content-writeback/structure.ts";
import { clone } from "../content-writeback/journal.ts";
import { fail, object, sameScope, sha256, uuid } from "../content-writeback/validation.ts";
import type { ApplyResult } from "../content-writeback/protocol.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { Stage, StageAcceptance, StageFile, StageRevision, StageSources, StageStart } from "./protocol.ts";
import { scopeIdentity, verifySource } from "./store.ts";
import type { StageStore } from "./store.ts";

const queues=new Map<string,Promise<unknown>>();
async function serial<T>(key:string,action:()=>Promise<T>):Promise<T>{
  const next=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(action);queues.set(key,next);
  try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
}
export function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
  const parsed=object(value);if(Object.keys(parsed).some(k=>!keys.includes(k)))fail("STAGE_UNKNOWN_FIELD");return parsed;
}
export function text(value:unknown,max=128):string {
  if(typeof value!=="string"||!value.trim()||value.length>max)fail("STAGE_INVALID_TEXT");return value;
}
export function ids(value:unknown):string[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>64||new Set(value).size!==value.length)fail("STAGE_INVALID_LIST");
  return value.map(v=>text(v));
}
export const latest=(stage:Stage):StageRevision|null=>stage.revisions.at(-1)??null;
export const revisionId=(stage:Stage):string=>latest(stage)?.id??stage.start.id;
export const revisionSource=(stage:Stage)=>latest(stage)?.source??stage.start.source;

/** No SDK, DOM, formal state, Git, or agent runtime. Facts come only from installed ports. */
export class StageRecorder {
  private epoch=0;
  private disposed=false;
  constructor(readonly store:StageStore,readonly sources:StageSources){}
  invalidate():void{this.epoch++;}
  dispose():void{this.disposed=true;this.invalidate();}
  private lease(scope:SourceScope):()=>void{
    const epoch=this.epoch,lifetime=this.sources.lifetime?.();
    return ()=>{if(this.disposed||epoch!==this.epoch||this.sources.lifetime?.()!==lifetime||!this.sources.scope()||!sameScope(scope,this.sources.scope()!))fail("STAGE_SCOPE_REVOKED");};
  }
  async read(scope:SourceScope,stageId:string):Promise<Stage>{
    const history=await this.store.history(scope),stage=history.stages.find(s=>s.start.id===uuid(stageId));
    if(!stage)fail("STAGE_NOT_FOUND");return stage;
  }
  async begin(input:unknown):Promise<Stage>{
    const value=fields(input,["goal","requestKey","expectedStageId","fileIds"]),scope=this.sources.scope();
    if(!scope)fail("AUTHORIZATION_REQUIRED");
    const goal=text(value.goal,240),id=uuid(value.requestKey),expected=value.expectedStageId===null?null:uuid(value.expectedStageId),fileIds=ids(value.fileIds),valid=this.lease(scope);
    return serial(scopeIdentity(scope),async()=>{
      valid();const history=await this.store.history(scope);valid();
      const existing=history.stages.find(s=>s.start.id===id);
      if(existing){if(existing.start.goal!==goal||existing.start.previousStageId!==expected||JSON.stringify(existing.start.files.map(f=>f.id))!==JSON.stringify(fileIds))fail("STAGE_KEY_REUSED");return existing;}
      if(history.problems.length||history.current!==expected)fail("STAGE_CURRENT_CONFLICT");
      const source=await this.sources.read();valid();await verifySource(source);valid();
      const files=await this.files(fileIds,scope);valid();
      const previous=history.stages.find(s=>s.start.id===history.current),at=new Date().toISOString();
      const start:StageStart={id,scope:clone(scope),goal,at,source:clone(source),files,previousStageId:expected,previousRevisionId:previous?revisionId(previous):null};
      await this.store.append({schemaVersion:1,id,scope,stageId:id,kind:"begin",start,expectedStageId:expected,focusParent:history.currentEventId});valid();
      return this.read(scope,id);
    });
  }
  async activate(input:unknown):Promise<Stage>{
    const value=fields(input,["stageId","expectedStageId","requestKey"]),scope=this.sources.scope();
    if(!scope)fail("AUTHORIZATION_REQUIRED");
    const id=uuid(value.stageId),expected=value.expectedStageId===null?null:uuid(value.expectedStageId),key=uuid(value.requestKey),valid=this.lease(scope);
    return serial(scopeIdentity(scope),async()=>{
      const history=await this.store.history(scope);valid();
      const stage=history.stages.find(s=>s.start.id===id);if(!stage)fail("STAGE_NOT_FOUND");
      if(history.problems.length||history.current!==expected)fail("STAGE_CURRENT_CONFLICT");
      if(history.current===id)return stage;
      await this.store.append({schemaVersion:1,id:key,scope,stageId:id,kind:"select",focusParent:history.currentEventId});valid();
      return stage;
    });
  }
  private async files(fileIds:string[],scope:SourceScope,previous:StageFile[]=[]):Promise<StageFile[]>{
    const files:StageFile[]=[];
    for(const id of fileIds){
      let file:StageFile;
      try{file=await this.sources.file(uuid(id));}catch(error){
        const known=previous.find(f=>f.id===id);if(!known)throw error;
        file={...known,availability:"unavailable",problem:`保留最后已知记录；本次读取失败：${String(error)}`};
      }
      if(file.id!==id||!this.sources.scope()||!sameScope(scope,this.sources.scope()!))fail("STAGE_FILE_IDENTITY");
      if(file.content!==null&&(file.content.length>1_000_000||await sha256(file.content)!==file.version))fail("STAGE_FILE_HASH");
      files.push(clone(file));
    }return files;
  }
  private async facts(stage:Stage,requestIds:string[]):Promise<ApplyResult[]>{
    const old=latest(stage)?.facts??[],byId=new Map(old.map(f=>[f.record.patch.requestId,f]));
    const versions=new Map(stage.start.source.blocks.map(b=>[b.target.blockUuid,b.contentVersion]));
    // Replay fact validation, never source writes. Include prior facts so later revisions retain failure meaning.
    for(const id of requestIds){
      const actual=await this.sources.result(id);if(!actual)fail("STAGE_REQUEST_NOT_FOUND");
      byId.set(id,actual);
    }
    if(byId.size>64)fail("STAGE_FACT_LIMIT");
    const facts=[...byId.values()].sort((a,b)=>a.record.createdAt.localeCompare(b.record.createdAt));
    for(const result of facts){
      const record=result.record;
      if(record.intentKind!=="content-patch"||!sameScope(record.patch.scope,stage.start.scope)||
         record.patch.metadata?.stageId!==stage.start.id||record.createdAt<stage.start.at)fail("STAGE_FACT_SCOPE");
      if(await sha256(JSON.stringify(record.patch))!==record.digest)fail("STAGE_FACT_DIGEST");
      for(const fact of record.items){
        const operation=record.patch.operations.find(op=>op.operationId===fact.operationId);
        if(!operation||operation.target.blockUuid!==fact.target.blockUuid||fact.target.graphId!==stage.start.scope.graphId)fail("STAGE_FACT_TARGET");
        if(operation.type==="move-block" && fact.move)await validateMoveFact(operation,fact.move);
        if(!versions.has(fact.target.blockUuid)){
          // An actually observed native/unknown-origin new block may be corrected later.
          // This verifies its pre-request version; it does not upgrade the older write's status.
          const observed=stage.revisions.filter(r=>r.at<=record.createdAt).flatMap(r=>r.source.blocks).find(b=>b.target.blockUuid===fact.target.blockUuid&&b.availability==="available"&&b.contentVersion===fact.baseVersion);
          if(!observed)fail("STAGE_FACT_TARGET");versions.set(fact.target.blockUuid,observed.contentVersion);
        }
        if(fact.baseContent!==null&&await sha256(fact.baseContent)!==fact.baseVersion)fail("STAGE_FACT_HASH");
        if(fact.actualContent!==null&&await sha256(fact.actualContent)!==fact.actualVersion)fail("STAGE_FACT_HASH");
        if(result.durable&&fact.status==="APPLIED_VERIFIED"&&fact.contentVerified){
          // A stage hint alone cannot attach an arbitrary later/foreign write.
          // Sibling operations share one verified combined block result.
          const siblings=record.items.filter(f=>f.target.blockUuid===fact.target.blockUuid&&f.type!=="insert-child");
          const already=siblings.some(f=>f!==fact&&f.actualVersion===versions.get(fact.target.blockUuid));
          const observed=stage.revisions.some(r=>r.at<=record.createdAt&&r.source.blocks.some(b=>b.target.blockUuid===fact.target.blockUuid&&b.contentVersion===fact.baseVersion));
          if(fact.baseVersion!==versions.get(fact.target.blockUuid)&&!already&&!observed)fail("STAGE_FACT_BASE_MISMATCH");
          if(fact.actualVersion===null)fail("STAGE_FACT_HASH");
          versions.set(fact.childUuid??fact.target.blockUuid,fact.actualVersion);
        }
      }
    }return clone(facts);
  }
  async checkpoint(input:unknown):Promise<StageRevision>{
    const value=fields(input,["stageId","expectedRevision","requestKey","requestIds","fileIds","correctionOf"]),scope=this.sources.scope();
    if(!scope)fail("AUTHORIZATION_REQUIRED");
    const id=uuid(value.stageId),expected=uuid(value.expectedRevision),key=text(value.requestKey),requests=ids(value.requestIds),fileIds=ids(value.fileIds),valid=this.lease(scope);
    return serial(scopeIdentity(scope),async()=>{
      valid();const history=await this.store.history(scope);valid();
      const stage=history.stages.find(s=>s.start.id===id);if(!stage)fail("STAGE_NOT_FOUND");
      const inputDigest=await sha256(JSON.stringify({stageId:id,expectedRevision:expected,requestIds:requests,fileIds,correctionOf:value.correctionOf??null}));
      const duplicate=stage.revisions.find(r=>r.requestKey===key);
      if(duplicate){if(duplicate.inputDigest!==inputDigest)fail("STAGE_KEY_REUSED");return duplicate;}
      if(history.problems.length||history.current!==id||stage.problems.length)fail("STAGE_NOT_CURRENT");
      let correctionOf:StageRevision["correctionOf"]=null;
      if(value.correctionOf!=null){
        const link=fields(value.correctionOf,["stageId","revisionId","sourceId"]),old=history.stages.find(s=>s.start.id===uuid(link.stageId));
        const revision=old?.revisions.find(r=>r.id===uuid(link.revisionId));
        const sourceId=text(link.sourceId,4096);
        if(!revision?.source.blocks.some(b=>b.sourceId===sourceId))fail("STAGE_CORRECTION_REFERENCE");
        correctionOf={stageId:old!.start.id,revisionId:revision.id,sourceId};
      }
      const facts=await this.facts(stage,requests);valid();
      const source=await this.sources.read();valid();await verifySource(source);valid();
      const selected=fileIds.length?fileIds:(latest(stage)?.files??stage.start.files).map(f=>f.id);
      const files=await this.files(selected,scope,latest(stage)?.files??stage.start.files);valid();
      const fingerprint=await sha256(JSON.stringify({source:[source.structureVersion,source.sourceSetVersion],facts,files}));
      if(latest(stage)?.fingerprint===fingerprint)return latest(stage)!;
      const revision:StageRevision={id:crypto.randomUUID(),parent:expected,at:new Date().toISOString(),source:clone(source),files,facts,fingerprint,requestKey:key,inputDigest,correctionOf};
      if(revisionId(stage)!==expected){
        await this.store.append({schemaVersion:1,id:crypto.randomUUID(),scope,stageId:id,kind:"candidate",revision,reason:"expected-revision-mismatch"});valid();
        fail("STAGE_REVISION_CONFLICT_CANDIDATE_RETAINED");
      }
      await this.store.append({schemaVersion:1,id:revision.id,scope,stageId:id,kind:"revision",revision});valid();
      const confirmed=await this.read(scope,id);valid();
      if(confirmed.problems.length)fail("STAGE_REVISION_COMPETITION");
      return revision;
    });
  }
  /** Select retained evidence only; no semantic merge or authoritative-source writes. */
  async resolveCandidate(input:unknown):Promise<Stage>{
    const value=fields(input,["stageId","expectedRevision","candidateRevision","requestKey"]),scope=this.sources.scope();
    if(!scope)fail("AUTHORIZATION_REQUIRED");
    const id=uuid(value.stageId),expected=uuid(value.expectedRevision),chosen=uuid(value.candidateRevision),key=uuid(value.requestKey),valid=this.lease(scope);
    return serial(scopeIdentity(scope),async()=>{
      const stage=await this.read(scope,id);valid();
      const candidate=stage.candidates.find(r=>r.id===chosen);
      if(revisionId(stage)!==expected||!candidate||candidate.parent!==expected)fail("STAGE_CANDIDATE_CONFLICT");
      const history=await this.store.history(scope);valid();if(history.current!==id||history.problems.length)fail("STAGE_NOT_CURRENT");
      await this.store.append({schemaVersion:1,id:key,scope,stageId:id,kind:"resolution",parent:expected,chosen});valid();return this.read(scope,id);
    });
  }
  /** Installed UI only. Never expose this method through an external namespace. */
  async acceptLocal(scope:SourceScope,stageId:string,seenRevision:string,seenHash:string):Promise<StageAcceptance>{
    const valid=this.lease(scope);
    return serial(scopeIdentity(scope),async()=>{
      valid();const stage=await this.read(scope,stageId);valid();
      const revision=stage.revisions.find(r=>r.id===seenRevision);
      if(!revision||stage.problems.length||await sha256(JSON.stringify(revision))!==seenHash)fail("STAGE_SEEN_REVISION_MISMATCH");
      const prior=stage.acceptances.find(a=>a.revisionId===seenRevision);if(prior)return prior;
      const acceptance:StageAcceptance={id:crypto.randomUUID(),revisionId:seenRevision,revisionHash:seenHash,at:new Date().toISOString(),origin:{kind:"local-user-command",command:"stage-accept"}};
      await this.store.append({schemaVersion:1,id:acceptance.id,scope,stageId,kind:"acceptance",acceptance});valid();return acceptance;
    });
  }
  async reconcile(input:unknown):Promise<StageRevision>{
    const value=fields(input,["stageId","expectedRevision","requestKey"]),scope=this.sources.scope();
    if(!scope)fail("AUTHORIZATION_REQUIRED");
    const stageId=uuid(value.stageId),records=await this.sources.history();
    // Only explicit reconciliation discovers stage-associated Journal facts. It never calls recover/apply.
    return this.checkpoint({...value,requestIds:records.filter(r=>r.record.intentKind==="content-patch"&&r.record.patch.metadata?.stageId===stageId).map(r=>r.record.patch.requestId)});
  }
}
