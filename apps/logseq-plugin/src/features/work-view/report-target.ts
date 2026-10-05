import type { BlockTarget, SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { LensInputError, lensHash, lensRecord, lensText, requireLens } from "./lens-input.ts";
import { readLensScope, sameLensScope } from "./lens-source.ts";

export type BodyPosition = "block" | "before" | "after" | "child";
export interface BodyTarget {
  schemaVersion: 1; scope: SourceScope; sourceId: string; target: BlockTarget; contentVersion: string;
  structureVersion: string; position: {kind:BodyPosition};
  parent: {sourceId:string; target:BlockTarget; contentVersion:string} | null;
}

/** A resolved target is a versioned fact, never permission to write or impersonate a user drop. */
export function resolveBodyTarget(input: unknown, source: SourceSnapshot): BodyTarget {
  const raw = lensRecord(input,["schemaVersion","scope","sourceId","contentVersion","structureVersion","position"],"invalid-report-target");
  requireLens(raw.schemaVersion === 1,"unsupported-report-schema");
  const scope = readLensScope(raw.scope);
  requireLens(sameLensScope(scope,source.scope),"scope-mismatch");
  const sourceId = lensText(raw.sourceId,2048), contentVersion = lensHash(raw.contentVersion);
  requireLens(lensHash(raw.structureVersion) === source.structureVersion,"stale-structure");
  const position = lensRecord(raw.position,["kind"],"invalid-report-position");
  requireLens(["block","before","after","child"].includes(String(position.kind)),"unsupported-report-position");
  requireLens(!source.page || position.kind === "block", "page-write-unavailable");
  const block = source.blocks.find(block => block.sourceId === sourceId);
  requireLens(!!block,"source-not-in-scope");
  requireLens(block.availability === "available" && !!block.contentVersion,"source-unavailable");
  requireLens(block.contentVersion === contentVersion,"stale-content");
  const parent = position.kind === "block" ? null : position.kind === "child" ? block : source.blocks.find(item => item.target.blockUuid === block.parentUuid);
  if (position.kind !== "block") requireLens(!!parent?.contentVersion && parent.availability === "available","parent-not-in-scope");
  return {schemaVersion:1, scope:{...scope}, sourceId, target:{...block.target}, contentVersion,
    structureVersion:source.structureVersion, position:{kind:position.kind as BodyPosition},
    parent:parent ? {sourceId:parent.sourceId, target:{...parent.target}, contentVersion:parent.contentVersion!} : null};
}
export function reportFailure(error: unknown): {ok:false; reason:string} {
  const native: Record<string,string> = {NATIVE_SCOPE_EXPIRED:"scope-mismatch",NATIVE_EDITING_OR_SCOPE_CHANGED:"editing-in-progress",NATIVE_SOURCE_EXPIRED:"source-changed-during-read",NATIVE_INPUT_UNAVAILABLE:"native-input-unavailable"};
  return {ok:false, reason:error instanceof LensInputError ? error.reason : error instanceof Error ? native[error.message]??"native-navigation-failed" : "native-navigation-failed"};
}
