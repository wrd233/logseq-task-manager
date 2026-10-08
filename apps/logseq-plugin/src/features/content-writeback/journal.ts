import { readOptionalPrivateItem } from "../../private-storage.ts";
import type { OperationJournal, RequestRecord, SourceScope } from "./protocol.ts";
import { fail, nativeIdentityReadbackMatches, parsePatch, sameScope, sha256 } from "./validation.ts";

export interface JournalStorage {
  getItem(key: string): Promise<unknown>; setItem(key: string, text: string): Promise<void>; allKeys(): Promise<unknown>;
}
import { validateMoveFact } from "./structure.ts";
import { workRecord, workText } from "@task-copilot/contracts";
import { parseTodoRequest } from "../ordinary-todo/service.ts";

const prefix = "content-writeback-v1-";
const maxRecordLength = 16_777_216;
export async function requestKey(scope: SourceScope, requestId: string): Promise<string> {
  return prefix + await sha256(JSON.stringify([scope.graphId, scope.rootUuid, requestId]));
}
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function result(record: RequestRecord, durable = true, journalProblem: string | null = null) {
  const items = record.items;
  const applied = items.some(item => item.status === "APPLIED_VERIFIED" || item.contentVerified);
  const complete = items.every(item => item.phase === "SETTLED" && (item.status === "APPLIED_VERIFIED" || item.status === "NO_CHANGE"));
  const unknown = items.some(item => item.status === "OUTCOME_UNKNOWN" || item.phase !== "SETTLED");
  return { status: complete ? "complete" as const : applied ? "partial" as const : unknown ? "outcome-unknown" as const : "not-applied" as const, record: clone(record), durable, journalProblem };
}
/** Append-only per-request revisions. No overwriteable global catalog or caller-selected path. */
export class PrivateOperationJournal implements OperationJournal {
  constructor(private readonly storage: JournalStorage) {}
  private async storageKeys():Promise<string[]>{
    const keys=await this.storage.allKeys();
    // FileStorage on a fresh Desktop profile returns null until its directory exists.
    if(keys===null)return [];
    if(!Array.isArray(keys)||keys.some(key=>typeof key!=="string"))fail("JOURNAL_KEYS_UNREADABLE");
    return keys as string[];
  }
  private async keys(key: string): Promise<string[]> {
    return (await this.storageKeys()).filter(item => new RegExp(`^${key}-[0-9]{6}$`, "u").test(item)).sort();
  }
  private async parse(key: string): Promise<RequestRecord> {
    const raw = await readOptionalPrivateItem(this.storage, key);
    if (typeof raw !== "string" || raw.length > maxRecordLength) fail("JOURNAL_UNREADABLE");
    const record = JSON.parse(raw) as RequestRecord;
    if (record.schemaVersion !== 1 || !["content-patch","scope-identity","ordinary-todo"].includes(record.intentKind) || !Number.isSafeInteger(record.sequence) || record.sequence < 0 || !Array.isArray(record.items)) fail("JOURNAL_CORRUPT");
    if(record.origin?.kind==="verified-local-agent"){
      workRecord(record.origin,["kind","instanceId","connectionId","clientLabel","transportRequestId","command","guidance"]);
      for(const value of [record.origin.instanceId,record.origin.connectionId,record.origin.clientLabel,record.origin.transportRequestId,record.origin.command])workText(value);
      const guide=record.origin.guidance;
      if(guide){
        workRecord(guide,["loading","sourceLoadedAt","returnedAt","common","project"]);
        if(guide.loading!=="explicit-read"||!Number.isFinite(Date.parse(guide.sourceLoadedAt))||!Number.isFinite(Date.parse(guide.returnedAt)))fail("JOURNAL_GUIDANCE_INVALID");
        for(const source of [guide.common,guide.project]){workRecord(source,["key","version"]);workText(source.key,256);if(!/^[0-9a-f]{64}$/u.test(source.version))fail("JOURNAL_GUIDANCE_INVALID");}
      }else if(guide!==null)fail("JOURNAL_GUIDANCE_INVALID");
    }else if(record.origin?.kind!=="local-capability"&&record.origin?.kind!=="local-user-command")fail("JOURNAL_ORIGIN_INVALID");
    if(record.intentKind==="ordinary-todo"){
      const fact=record.ordinaryTodo;
      if(!fact||fact.schemaVersion!==1||!["create","complete","reopen"].includes(fact.action)||typeof fact.requestJson!=="string"||fact.requestJson.length>1048576||fact.requestDigest!==await sha256(fact.requestJson))fail("JOURNAL_TODO_FACT_INVALID");
      workRecord(fact,["schemaVersion","action","requestJson","requestDigest","evidence"]);
      const request=parseTodoRequest(JSON.parse(fact.requestJson));
      if(request.action!==fact.action||request.requestId!==record.patch.requestId||!sameScope(request.scope,record.patch.scope))fail("JOURNAL_TODO_FACT_INVALID");
      if(fact.action==="complete"){
        if(!fact.evidence||fact.evidence.kind!=="material-version"||fact.evidence.version!==request.evidence!.expectedVersion||fact.evidence.materialId!==request.evidence!.materialId||fact.evidence.verifiedText!==request.evidence!.verifiedText||typeof fact.evidence.reference!=="string"||fact.evidence.reference.length>8192||typeof fact.evidence.filename!=="string"||fact.evidence.filename.length>4096||!Number.isFinite(Date.parse(fact.evidence.observedAt)))fail("JOURNAL_TODO_EVIDENCE_INVALID");
        workRecord(fact.evidence,["kind","materialId","filename","reference","version","observedAt","verifiedText"]);
      }else if(fact.evidence!==null)fail("JOURNAL_TODO_EVIDENCE_INVALID");
    }else if(record.ordinaryTodo!==undefined)fail("JOURNAL_TODO_FACT_INVALID");
    const patch = parsePatch(record.patch);
    if (await sha256(JSON.stringify(patch)) !== record.digest || key!==`${await requestKey(patch.scope, patch.requestId)}-${String(record.sequence).padStart(6,"0")}`) fail("JOURNAL_DIGEST_MISMATCH");
    if (record.items.length !== patch.operations.length || record.items.some((item, i) => item.operationId !== patch.operations[i]?.operationId || !["PENDING", "EXECUTING", "ACKNOWLEDGED", "SETTLED"].includes(item.phase) || !["NOT_APPLIED", "APPLIED_VERIFIED", "CONFLICT", "BLOCKED", "OUTCOME_UNKNOWN", "NO_CHANGE"].includes(item.status))) fail("JOURNAL_CORRUPT");
    for(const [i,item] of record.items.entries()){
      const op=patch.operations[i]!;
      if(item.readbackNormalization!==undefined&&(record.intentKind!=="ordinary-todo"||item.readbackNormalization!=="native-id-after-first-line"||item.proposedContent===null||item.actualContent===item.proposedContent||!item.contentVerified||!nativeIdentityReadbackMatches(item.actualContent,item.proposedContent,op.target.blockUuid)))fail("JOURNAL_TODO_NORMALIZATION_INVALID");
      if(op.type==="move-block"){
        if(item.move)await validateMoveFact(op,item.move);
        if(item.status==="APPLIED_VERIFIED" && (!item.move?.verified || !item.contentVerified))fail("JOURNAL_MOVE_FACT_INVALID");
      }
    }
    return clone(record);
  }
  async load(scope: SourceScope, requestId: string): Promise<RequestRecord | null> {
    const key = await requestKey(scope, requestId), keys = await this.keys(key);
    if (!keys.length) return null;
    // Corrupt latest state fails closed. Never fall back to an older intent and rewrite.
    const record = await this.parse(keys.at(-1)!);
    if (!sameScope(record.patch.scope, scope) || record.patch.requestId !== requestId) fail("JOURNAL_SCOPE_MISMATCH");
    return record;
  }
  async save(record: RequestRecord): Promise<void> {
    if (record.sequence > 999_999) fail("JOURNAL_SEQUENCE_LIMIT");
    const key = `${await requestKey(record.patch.scope, record.patch.requestId)}-${String(record.sequence).padStart(6,"0")}`;
    const raw = JSON.stringify(record);
    if(raw.length>maxRecordLength)fail("JOURNAL_RECORD_TOO_LARGE");
    const previous = await readOptionalPrivateItem(this.storage, key);
    if (previous !== null && previous !== undefined && previous !== raw) fail("JOURNAL_REVISION_COLLISION");
    if (previous !== raw) await this.storage.setItem(key, raw);
    if (await this.storage.getItem(key) !== raw) fail("JOURNAL_READBACK_MISMATCH");
  }
  async list(scope: SourceScope): Promise<RequestRecord[]> {
    const latest = new Map<string, string>();
    for (const key of (await this.storageKeys()).filter(key => /^content-writeback-v1-[0-9a-f]{64}-[0-9]{6}$/u.test(key)).sort()) latest.set(key.slice(0,-7), key);
    const records: RequestRecord[] = [];
    for (const key of latest.values()) { const record = await this.parse(key); if (sameScope(record.patch.scope, scope)) records.push(record); }
    return records.sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  }
}
