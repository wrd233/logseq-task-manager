import { sha256 } from "../../workspace/source-protocol.ts";
import type { Operation, Patch, SourceScope, TextOperation } from "./protocol.ts";

export const limits = { operations: 64, text: 262_144, request: 1_048_576, blocks: 2_000, depth: 64 } as const;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const versionPattern = /^[0-9a-f]{64}$/u;
export class ContentError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function fail(code: string): never { throw new ContentError(code); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_OBJECT");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail("INVALID_OBJECT");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("UNSUPPORTED_FIELD");
}
export function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function string(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.length) || !wellFormed(value) || value.includes("\0")) fail("INVALID_STRING");
  return value;
}
export function uuid(value: unknown): string {
  const result = string(value, 36); if (!uuidPattern.test(result)) fail("INVALID_UUID"); return result;
}
export function parseScope(input: unknown): SourceScope {
  const value = object(input); keys(value, ["graphId", "rootUuid"]);
  return { graphId: string(value.graphId, 2048), rootUuid: uuid(value.rootUuid) };
}
function parseOperation(input: unknown, scope: SourceScope, schemaVersion: 1 | 2): Operation {
  const op = object(input), target = object(op.target);
  keys(target, ["kind", "graphId", "blockUuid"]);
  if (target.kind !== "logseq-block") fail("UNSUPPORTED_SOURCE");
  if (target.graphId !== scope.graphId) fail("TARGET_GRAPH_MISMATCH");
  const base = {
    operationId: string(op.operationId, 128), target: { kind: "logseq-block" as const, graphId: scope.graphId, blockUuid: uuid(target.blockUuid) },
    expectedContentVersion: string(op.expectedContentVersion, 64), expectedParentUuid: op.expectedParentUuid === null ? null : uuid(op.expectedParentUuid),
  };
  if (!versionPattern.test(base.expectedContentVersion)) fail("INVALID_VERSION");
  const fields = ["operationId", "type", "target", "expectedContentVersion", "expectedParentUuid"];
  if (op.type === "move-block") {
    if (schemaVersion !== 2) fail("MOVE_REQUIRES_SCHEMA_2");
    keys(op, [...fields, "destination", "position", "expectedDestinationVersion", "expectedDestinationParentUuid", "expectedStructureVersion"]);
    const destination = object(op.destination); keys(destination, ["kind", "graphId", "blockUuid"]);
    if (destination.kind !== "logseq-block" || destination.graphId !== scope.graphId) fail("TARGET_GRAPH_MISMATCH");
    if (op.position !== "before" && op.position !== "after" && op.position !== "first-child") fail("INVALID_MOVE_POSITION");
    if (typeof op.expectedStructureVersion !== "string" || !versionPattern.test(op.expectedStructureVersion) || typeof op.expectedDestinationVersion !== "string" || !versionPattern.test(op.expectedDestinationVersion)) fail("INVALID_VERSION");
    return {...base, type: "move-block", destination: {kind:"logseq-block",graphId:scope.graphId,blockUuid:uuid(destination.blockUuid)}, position:op.position,
      expectedDestinationVersion:op.expectedDestinationVersion, expectedDestinationParentUuid:op.expectedDestinationParentUuid === null ? null : uuid(op.expectedDestinationParentUuid), expectedStructureVersion:op.expectedStructureVersion};
  }
  if (op.type === "insert-child") {
    keys(op, [...fields, "content", "childUuid"]);
    return { ...base, type: "insert-child", content: string(op.content, limits.text), childUuid: op.childUuid === undefined || op.childUuid === null ? null : uuid(op.childUuid) };
  }
  if (op.type !== "replace-text" && op.type !== "insert-text") fail("UNSUPPORTED_OPERATION");
  keys(op, [...fields, "range", "expectedText", "text", "context"]);
  const range = object(op.range); keys(range, ["start", "end"]);
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || (range.start as number) < 0 || (range.end as number) < (range.start as number) || (range.end as number) > limits.text) fail("INVALID_RANGE");
  const start = range.start as number, end = range.end as number;
  const expectedText = string(op.expectedText, limits.text, true), text = string(op.text, limits.text, true);
  if (end - start !== expectedText.length) fail("EXPECTED_TEXT_LENGTH_MISMATCH");
  let context: TextOperation["context"] = null;
  if (op.context !== undefined && op.context !== null) {
    const value = object(op.context); keys(value, ["before", "after"]);
    context = { before: string(value.before, 256, true), after: string(value.after, 256, true) };
  }
  if (op.type === "insert-text" && (start !== end || expectedText !== "" || !text)) fail("INVALID_INSERT_RANGE");
  if (start === end && !context) fail("INSERT_CONTEXT_REQUIRED");
  return { ...base, type: op.type, range: { start, end }, expectedText, text, context };
}
export function parsePatch(input: unknown): Patch {
  const value = object(input); keys(value, ["schemaVersion", "requestId", "scope", "operations", "metadata"]);
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) fail("UNSUPPORTED_SCHEMA");
  const scope = parseScope(value.scope), requestId = string(value.requestId, 128);
  if (!Array.isArray(value.operations) || !value.operations.length || value.operations.length > limits.operations) fail("INVALID_OPERATIONS");
  const operations = value.operations.map(op => parseOperation(op, scope, value.schemaVersion as 1 | 2));
  if (new Set(operations.map(op => op.operationId)).size !== operations.length) fail("DUPLICATE_OPERATION_ID");
  let metadata: Patch["metadata"] = null;
  if (value.metadata !== undefined && value.metadata !== null) {
    const extra = object(value.metadata); keys(extra, ["runId", "stageId"]);
    metadata = { runId: extra.runId == null ? null : string(extra.runId, 128), stageId: extra.stageId == null ? null : string(extra.stageId, 128) };
  }
  const patch: Patch = { schemaVersion: value.schemaVersion, requestId, scope, operations, metadata };
  if (new TextEncoder().encode(JSON.stringify(patch)).length > limits.request) fail("REQUEST_TOO_LARGE");
  return patch;
}
export { sha256 } from "../../workspace/source-protocol.ts";
export function sameScope(a: SourceScope, b: SourceScope): boolean { return a.graphId === b.graphId && a.rootUuid === b.rootUuid && a.kind===b.kind && a.pageName===b.pageName; }
export function utf16Boundary(text: string, index: number): boolean {
  if (index < 0 || index > text.length) return false;
  const left = text.charCodeAt(index - 1), right = text.charCodeAt(index);
  return !(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff);
}
export function validateText(base: string, op: TextOperation): void {
  const { start, end } = op.range;
  if (!utf16Boundary(base, start) || !utf16Boundary(base, end)) fail("INVALID_UTF16_BOUNDARY");
  if (base.slice(start, end) !== op.expectedText) fail("EXPECTED_TEXT_MISMATCH");
  if (op.context && (!base.slice(0, start).endsWith(op.context.before) || !base.slice(end).startsWith(op.context.after))) fail("CONTEXT_MISMATCH");
  if (start === end && base && !op.context?.before && !op.context?.after) fail("INSERT_CONTEXT_REQUIRED");
}
export function combineText(base: string, operations: readonly TextOperation[]): string {
  const sorted = [...operations].sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end || a.operationId.localeCompare(b.operationId));
  for (let i = 0; i < sorted.length; i++) {
    const op = sorted[i]!; validateText(base, op);
    const previous = sorted[i - 1];
    if (previous && (op.range.start < previous.range.end || (op.range.start === previous.range.start) || (op.range.start === previous.range.end && (op.range.start === op.range.end || previous.range.start === previous.range.end)))) fail("OVERLAPPING_RANGES");
  }
  let result = base;
  for (const op of sorted.reverse()) result = result.slice(0, op.range.start) + op.text + result.slice(op.range.end);
  if (result.length > limits.text) fail("RESULT_TOO_LARGE");
  return result;
}
export async function childIdentity(patch: Patch, op: Operation): Promise<string> {
  if (op.type !== "insert-child") fail("NOT_CHILD_OPERATION");
  if (op.childUuid) return op.childUuid;
  const hash = await sha256(JSON.stringify(["content-child", patch.scope, patch.requestId, op.operationId]));
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
/** The observed Desktop canonicalizes one native id line after the first line.
 * All other bytes and properties must match. Legacy content readback stays exact. */
export function nativeIdentityReadbackMatches(actual:string|null,expected:string,id:string):boolean {
  if(actual===expected)return true;
  if(actual===null||!uuidPattern.test(id)||actual.split(/\r?\n/u)[1]!==`id:: ${id}`)return false;
  const remove=(text:string):string|null=>{
    const line=`id:: ${id}`,matches=[...text.matchAll(new RegExp(`(?:^|\\n)${line}(?=\\r?\\n|$)`,"gu"))];
    if(matches.length!==1)return null;
    const m=matches[0]!,start=m.index!+(m[0].startsWith("\n")?1:0),end=start+line.length;
    const after=text.slice(end).startsWith("\r\n")?2:text[end]==="\n"?1:0;
    if(after)return text.slice(0,start)+text.slice(end+after);
    if(start>0)return text.slice(0,start-(text.slice(0,start).endsWith("\r\n")?2:1))+text.slice(end);
    return null;
  };
  const before=remove(expected),after=remove(actual);return before!==null&&after!==null&&before===after;
}
