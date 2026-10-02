import { readOptionalPrivateItem } from "../../private-storage.ts";
import type { OperationJournal, RequestRecord, SourceScope } from "./protocol.ts";
import { fail, parsePatch, sameScope, sha256 } from "./validation.ts";

export interface JournalStorage {
  getItem(key: string): Promise<unknown>; setItem(key: string, text: string): Promise<void>; allKeys(): Promise<unknown>;
}
const prefix = "content-writeback-v1-";
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
    if (typeof raw !== "string" || raw.length > 16_777_216) fail("JOURNAL_UNREADABLE");
    const record = JSON.parse(raw) as RequestRecord;
    if (record.schemaVersion !== 1 || !["content-patch","scope-identity"].includes(record.intentKind) || !Number.isSafeInteger(record.sequence) || record.sequence < 0 || !Array.isArray(record.items)) fail("JOURNAL_CORRUPT");
    const patch = parsePatch(record.patch);
    if (await sha256(JSON.stringify(patch)) !== record.digest || key!==`${await requestKey(patch.scope, patch.requestId)}-${String(record.sequence).padStart(6,"0")}`) fail("JOURNAL_DIGEST_MISMATCH");
    if (record.items.length !== patch.operations.length || record.items.some((item, i) => item.operationId !== patch.operations[i]?.operationId || !["PENDING", "EXECUTING", "ACKNOWLEDGED", "SETTLED"].includes(item.phase) || !["NOT_APPLIED", "APPLIED_VERIFIED", "CONFLICT", "BLOCKED", "OUTCOME_UNKNOWN", "NO_CHANGE"].includes(item.status))) fail("JOURNAL_CORRUPT");
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
    const raw = JSON.stringify(record), previous = await readOptionalPrivateItem(this.storage, key);
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
