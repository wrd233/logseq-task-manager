import { validateMoveFact } from "../content-writeback/structure.ts";
import { readOptionalPrivateItem } from "../../private-storage.ts";
import { clone } from "../content-writeback/journal.ts";
import { fail, parseScope, sameScope, sha256, uuid } from "../content-writeback/validation.ts";
import type { SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { StageAcceptance, StageEvent, StageFile, StageHistory, StageRevision, StageStorage } from "./protocol.ts";

export const scopeIdentity = (scope: {graphId: string; rootUuid: string}) => JSON.stringify([scope.graphId, scope.rootUuid]);
const prefix = "stage-workbench-v1-";
const limit = 16_777_216;

/** Shared raw UTF-8 hashes and real preorder; also accepts content's dedicated actual-root-parent facts. */
export async function verifySource(source: SourceSnapshot): Promise<void> {
  parseScope(source.scope);
  if (source.schemaVersion !== 1 || !Array.isArray(source.blocks) || !source.blocks.length || source.blocks.length > 2000) fail("STAGE_SOURCE_INVALID");
  if(typeof source.capturedAt!=="string"||!Number.isFinite(Date.parse(source.capturedAt)))fail("STAGE_SOURCE_INVALID");
  const seen = new Set<string>(), stack: string[] = [],orders=new Map<string|null,number>(); let size = 0;
  for (const [index, block] of source.blocks.entries()) {
    const id = uuid(block.target.blockUuid);
    if (block.target.kind !== "logseq-block" || block.target.graphId !== source.scope.graphId ||
        block.sourceId !== JSON.stringify(["logseq", source.scope.graphId, id]) || seen.has(id) ||
        !Number.isSafeInteger(block.order) || block.order < 0 || !Number.isSafeInteger(block.depth) || block.depth < 0 || block.depth > 64 ||
        (index === 0 ? id !== source.scope.rootUuid || block.depth !== 0 : block.depth === 0 || block.parentUuid !== stack[block.depth - 1])) fail("STAGE_SOURCE_IDENTITY");
    if(block.parentUuid!==null)uuid(block.parentUuid);
    if(index>0&&block.order!==(orders.get(block.parentUuid)??0))fail("STAGE_SOURCE_ORDER");
    orders.set(block.parentUuid,block.order+1);
    if (!["available","missing","unavailable"].includes(block.availability)) fail("STAGE_SOURCE_INVALID");
    if (block.availability === "available") {
      if (typeof block.content !== "string" || block.content.length > 262144 || await sha256(block.content) !== block.contentVersion) fail("STAGE_SOURCE_HASH");
      size += block.content.length;
    } else if (block.content !== null || block.contentVersion !== null) fail("STAGE_SOURCE_INVALID");
    if (size > 4_000_000) fail("STAGE_SOURCE_TOO_LARGE");
    seen.add(id); stack.length = block.depth; stack[block.depth] = id;
  }
  if (await sha256(JSON.stringify(source.blocks.map(b=>[b.sourceId,b.parentUuid,b.order,b.depth]))) !== source.structureVersion ||
      await sha256(JSON.stringify(source.blocks.map(b=>[b.sourceId,b.availability,b.contentVersion]))) !== source.sourceSetVersion) fail("STAGE_SOURCE_HASH");
}

async function verifyFiles(files:StageFile[]):Promise<void>{
  if(!Array.isArray(files)||files.length>64||new Set(files.map(f=>f.id)).size!==files.length)fail("STAGE_FILES_INVALID");
  for(const file of files){uuid(file.id);
    if(typeof file.title!=="string"||typeof file.path!=="string"||file.path.length>4096||!["available","unavailable"].includes(file.availability)||!["text-snapshot","record-only"].includes(file.retention)||typeof file.editing?.user!=="boolean"||typeof file.editing?.agent!=="boolean"||(file.size!==null&&(!Number.isSafeInteger(file.size)||file.size<0)))fail("STAGE_FILES_INVALID");
    if(file.content!==null&&(typeof file.content!=="string"||file.content.length>1_000_000||file.version!==await sha256(file.content)||file.hash!==file.version||file.retention!=="text-snapshot"))fail("STAGE_FILE_HASH");
  }
}
async function verifyRevision(r:StageRevision,scope:StageEvent["scope"],stageId:string):Promise<void>{
  uuid(r.id);uuid(r.parent);
  if(!sameScope(r.source.scope,scope)||!Number.isFinite(Date.parse(r.at))||typeof r.requestKey!=="string"||r.requestKey.length>128||!Array.isArray(r.facts)||r.facts.length>64||!/^\w{64}$/.test(r.inputDigest))fail("STAGE_REVISION_INVALID");
  await verifySource(r.source);await verifyFiles(r.files);
  for(const f of r.facts){if(!sameScope(f.record.patch.scope,scope)||f.record.patch.metadata?.stageId!==stageId||await sha256(JSON.stringify(f.record.patch))!==f.record.digest)fail("STAGE_FACT_SCOPE");for(const item of f.record.items){const op=f.record.patch.operations.find(op=>op.operationId===item.operationId);if(op?.type==="move-block"){if(item.move)await validateMoveFact(op,item.move);if(item.status==="APPLIED_VERIFIED"&&!item.move?.verified)fail("STAGE_MOVE_FACT_INVALID");}}}
  if(await sha256(JSON.stringify({source:[r.source.structureVersion,r.source.sourceSetVersion],facts:r.facts,files:r.files}))!==r.fingerprint)fail("STAGE_REVISION_HASH");
}
/** Immutable, verified events. No mutable catalog, no caller paths, no source replay. */
export class StageStore {
  constructor(readonly storage: StageStorage) {}
  private async key(scope: StageEvent["scope"], id: string): Promise<string> {
    return prefix + await sha256(scopeIdentity(scope)) + "-" + uuid(id);
  }
  async append(event: StageEvent): Promise<void> {
    const key = await this.key(event.scope,event.id), payload = JSON.stringify(event);
    if (payload.length > limit) fail("STAGE_RECORD_TOO_LARGE");
    const raw = JSON.stringify({payload,hash:await sha256(payload)});
    if(raw.length>limit)fail("STAGE_RECORD_TOO_LARGE");
    const old = await readOptionalPrivateItem(this.storage,key);
    if (old != null && old !== raw) fail("STAGE_EVENT_COLLISION");
    if (old !== raw) {
      // Preserve a verified immutable preparation before publishing. A torn publication
      // can be read from this complete copy; a torn preparation is never a revision.
      const pending="stage-prepared-v1-"+key.slice(prefix.length),prepared=await readOptionalPrivateItem(this.storage,pending);
      if(prepared!==null&&prepared!==raw)fail("STAGE_PREPARATION_COLLISION");
      if(prepared!==raw)await this.storage.setItem(pending,raw);
      if(await this.storage.getItem(pending)!==raw)fail("STAGE_PREPARATION_UNCONFIRMED");
      await this.storage.setItem(key,raw);
    }
    if (await this.storage.getItem(key) !== raw) fail("STAGE_SAVE_UNCONFIRMED");
  }
  async events(scope: StageEvent["scope"]): Promise<{events: StageEvent[]; problems: string[]; notes:string[]}> {
    const base = prefix + await sha256(scopeIdentity(scope)) + "-", keys = await this.storage.allKeys();
    if (keys !== null && (!Array.isArray(keys) || keys.some(k=>typeof k!=="string"))) fail("STAGE_STORAGE_UNAVAILABLE");
    const events: StageEvent[] = [], problems: string[] = [],notes:string[]=[];
    const preparedBase="stage-prepared-v1-"+base.slice(prefix.length);
    const ids=new Set(((keys??[]) as string[]).filter(k=>k.startsWith(base)||k.startsWith(preparedBase)).map(k=>k.slice(k.startsWith(base)?base.length:preparedBase.length)));
    for(const id of ids){
      const key=base+id;
      try {
        const decode=async(k:string):Promise<StageEvent>=>{
          const raw=await this.storage.getItem(k);
          if(typeof raw!=="string"||raw.length>limit)fail("STAGE_RECORD_UNREADABLE");
          const envelope=JSON.parse(raw);
          if(typeof envelope.payload!=="string"||await sha256(envelope.payload)!==envelope.hash)fail("STAGE_RECORD_HASH");
          return JSON.parse(envelope.payload) as StageEvent;
        };
        let event:StageEvent;
        try{event=await decode(key);}catch{
          try{event=await decode(preparedBase+id);notes.push(`${id}：已从完整准备记录恢复；未重放正文。`);}catch(error){
            // No committed key: an incomplete preparation has no lifecycle effect.
            if(!((keys??[]) as string[]).includes(key)){notes.push(`${id}：未确认的准备记录保留，可从 Journal 对账。`);continue;}
            throw error;
          }
        }
        if (event.schemaVersion !== 1 || !sameScope(event.scope,scope) || key !== await this.key(scope,event.id) || !["begin","select","revision","acceptance","candidate","resolution"].includes(event.kind)) fail("STAGE_RECORD_INVALID");
        uuid(event.stageId);
        if (event.kind === "begin") {
          if (event.start.id !== event.stageId || !sameScope(event.start.scope,scope) || typeof event.start.goal !== "string" || event.start.goal.length > 240) fail("STAGE_RECORD_INVALID");
          if(!sameScope(event.start.source.scope,scope)||!Number.isFinite(Date.parse(event.start.at)))fail("STAGE_RECORD_INVALID");
          if(event.focusParent!==null)uuid(event.focusParent);
          if(event.expectedStageId!==null)uuid(event.expectedStageId);
          await verifySource(event.start.source);await verifyFiles(event.start.files);
        } else if (event.kind === "revision" || event.kind === "candidate") {await verifyRevision(event.revision,scope,event.stageId);if(event.kind==="revision"&&event.id!==event.revision.id)fail("STAGE_RECORD_INVALID");}
        else if(event.kind==="select"){if(event.focusParent!==null)uuid(event.focusParent);}
        else if(event.kind==="resolution"){uuid(event.parent);uuid(event.chosen);}
        else {uuid(event.acceptance.id);uuid(event.acceptance.revisionId);if(event.id!==event.acceptance.id||!Number.isFinite(Date.parse(event.acceptance.at)))fail("STAGE_RECORD_INVALID");}
        events.push(event);
      } catch (error) { problems.push(`${key.slice(-36)}：${error instanceof Error ? error.message : String(error)}`); }
    }
    return {events,problems,notes};
  }
  async history(scope: StageEvent["scope"]): Promise<StageHistory> {
    const {events,problems,notes} = await this.events(scope);
    const begins = events.filter(e=>e.kind==="begin");
    const stages = begins.map(e=>({start:e.start,revisions:[] as StageRevision[],acceptances:[] as StageAcceptance[],candidates:[] as StageRevision[],problems:[] as string[]}));
    for (const stage of stages) {
      const own = events.filter(e=>e.stageId===stage.start.id), remaining = own.filter(e=>e.kind==="revision").map(e=>e.revision);
      let parent = stage.start.id;
      while (true) {
        let next = remaining.filter(r=>r.parent===parent);
        const alternatives=own.filter(e=>e.kind==="candidate").map(e=>e.revision).filter(r=>r.parent===parent);
        const resolutions=own.filter(e=>e.kind==="resolution").filter(e=>e.parent===parent);
        if(resolutions.length){
          const chosen=new Set(resolutions.map(e=>e.chosen));
          if(chosen.size!==1){stage.problems.push("并发选择修订，候选已保留。");break;}
          const choice=[...next,...alternatives].filter(r=>r.id===resolutions[0]!.chosen);
          if(choice.length!==1){stage.problems.push("候选修订引用不可核验。");break;}
          stage.candidates.push(...next.filter(r=>r.id!==choice[0]!.id));next=choice;
        }
        if (next.length > 1) {stage.problems.push("并发修订已保留，需重新读取并显式提交。");stage.candidates.push(...next);break;}
        if (!next.length) break;
        if(stage.revisions.some(r=>r.id===next[0]!.id)){stage.problems.push("修订链循环。");break;}
        stage.revisions.push(next[0]!); parent=next[0]!.id;
      }
      for (const event of own) {
        if (event.kind==="candidate"&&!stage.revisions.some(r=>r.id===event.revision.id)) stage.candidates.push(event.revision);
        if (event.kind==="acceptance") {
          const revision=stage.revisions.find(r=>r.id===event.acceptance.revisionId);
          if (revision && await sha256(JSON.stringify(revision))===event.acceptance.revisionHash && event.acceptance.origin.kind==="local-user-command" && event.acceptance.origin.command==="stage-accept") stage.acceptances.push(event.acceptance);
          else stage.problems.push("认可关联版本不可核验，保留记录。");
        }
      }
    }
    // Follow explicit begin ancestry. Multiple children are a conflict, never last-writer-wins.
    let current: string | null=null,currentEventId:string|null=null;
    const focus=events.filter(e=>e.kind==="begin"||e.kind==="select"),visited=new Set<string>();
    for (;;) {
      const children=focus.filter(e=>e.focusParent===currentEventId);
      if(children.length>1){problems.push("并发开始阶段，当前可写阶段不确定。");current=null;break;}
      if(!children.length)break;
      const child=children[0]!;
      if(visited.has(child.id)||!stages.some(s=>s.start.id===child.stageId)){problems.push("阶段链损坏。");current=null;break;}
      visited.add(child.id);current=child.stageId;currentEventId=child.id;
    }
    return clone({stages:stages.sort((a,b)=>a.start.at.localeCompare(b.start.at)),current,currentEventId,problems,storageNotes:notes});
  }
}
