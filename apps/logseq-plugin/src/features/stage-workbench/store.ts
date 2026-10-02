import { readOptionalPrivateItem } from "../../private-storage.ts";
import { clone } from "../content-writeback/journal.ts";
import { fail, parseScope, sameScope, sha256, uuid } from "../content-writeback/validation.ts";
import type { SourceSnapshot } from "../content-writeback/protocol.ts";
import type { StageAcceptance, StageEvent, StageHistory, StageRevision, StageStorage } from "./protocol.ts";

export const scopeIdentity = (scope: {graphId: string; rootUuid: string}) => JSON.stringify([scope.graphId, scope.rootUuid]);
const prefix = "stage-workbench-v1-";
const limit = 16_777_216;

/** Same raw UTF-8 hashes and real preorder as the content reader, including the root's actual parent/order. */
export async function verifySource(source: SourceSnapshot): Promise<void> {
  parseScope(source.scope);
  if (source.schemaVersion !== 1 || !Array.isArray(source.blocks) || !source.blocks.length || source.blocks.length > 2000) fail("STAGE_SOURCE_INVALID");
  const seen = new Set<string>(), stack: string[] = []; let size = 0;
  for (const [index, block] of source.blocks.entries()) {
    const id = uuid(block.target.blockUuid);
    if (block.target.kind !== "logseq-block" || block.target.graphId !== source.scope.graphId ||
        block.sourceId !== JSON.stringify(["logseq", source.scope.graphId, id]) || seen.has(id) ||
        !Number.isSafeInteger(block.order) || block.order < 0 || !Number.isSafeInteger(block.depth) || block.depth < 0 || block.depth > 64 ||
        (index === 0 ? id !== source.scope.rootUuid || block.depth !== 0 : block.depth === 0 || block.parentUuid !== stack[block.depth - 1])) fail("STAGE_SOURCE_IDENTITY");
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
    if (old !== raw) await this.storage.setItem(key,raw);
    if (await this.storage.getItem(key) !== raw) fail("STAGE_SAVE_UNCONFIRMED");
  }
  async events(scope: StageEvent["scope"]): Promise<{events: StageEvent[]; problems: string[]}> {
    const base = prefix + await sha256(scopeIdentity(scope)) + "-", keys = await this.storage.allKeys();
    if (keys !== null && (!Array.isArray(keys) || keys.some(k=>typeof k!=="string"))) fail("STAGE_STORAGE_UNAVAILABLE");
    const events: StageEvent[] = [], problems: string[] = [];
    for (const key of (keys ?? []) as string[]) {
      if (!key.startsWith(base)) continue;
      try {
        const raw = await this.storage.getItem(key);
        if (typeof raw !== "string" || raw.length > limit) fail("STAGE_RECORD_UNREADABLE");
        const envelope = JSON.parse(raw);
        if (typeof envelope.payload !== "string" || await sha256(envelope.payload) !== envelope.hash) fail("STAGE_RECORD_HASH");
        const event = JSON.parse(envelope.payload) as StageEvent;
        if (event.schemaVersion !== 1 || !sameScope(event.scope,scope) || key !== await this.key(scope,event.id) || !["begin","select","revision","acceptance","candidate"].includes(event.kind)) fail("STAGE_RECORD_INVALID");
        uuid(event.stageId);
        if (event.kind === "begin") {
          if (event.start.id !== event.stageId || !sameScope(event.start.scope,scope) || typeof event.start.goal !== "string" || event.start.goal.length > 240) fail("STAGE_RECORD_INVALID");
          await verifySource(event.start.source);
        } else if (event.kind === "revision" || event.kind === "candidate") await verifySource(event.revision.source);
        events.push(event);
      } catch (error) { problems.push(`${key.slice(-36)}：${error instanceof Error ? error.message : String(error)}`); }
    }
    return {events,problems};
  }
  async history(scope: StageEvent["scope"]): Promise<StageHistory> {
    const {events,problems} = await this.events(scope);
    const begins = events.filter(e=>e.kind==="begin");
    const stages = begins.map(e=>({start:e.start,revisions:[] as StageRevision[],acceptances:[] as StageAcceptance[],candidates:[] as StageRevision[],problems:[] as string[]}));
    for (const stage of stages) {
      const own = events.filter(e=>e.stageId===stage.start.id), remaining = own.filter(e=>e.kind==="revision");
      let parent = stage.start.id;
      while (true) {
        const next = remaining.filter(e=>e.revision.parent===parent);
        if (next.length > 1) {stage.problems.push("并发修订已保留，需重新读取并显式提交。");stage.candidates.push(...next.map(e=>e.revision));break;}
        if (!next.length) break;
        stage.revisions.push(next[0]!.revision); parent=next[0]!.revision.id;
      }
      for (const event of own) {
        if (event.kind==="candidate") stage.candidates.push(event.revision);
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
    return clone({stages:stages.sort((a,b)=>a.start.at.localeCompare(b.start.at)),current,currentEventId,problems});
  }
}
