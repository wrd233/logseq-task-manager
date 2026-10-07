import type { SourceRow } from "./model.mjs";
import { lensArray, lensHash, lensRecord, lensText, requireLens } from "./lens-input.ts";

import { snapshot, sha256, sourceId, scopeOf, validateSnapshot, type SourceScope as LensScope, type BlockSnapshot as LensBlock, type SourceSnapshot as LensSourceSnapshot } from "../../workspace/source-protocol.ts";
export type { SourceScope as LensScope, BlockSnapshot as LensBlock, SourceSnapshot as LensSourceSnapshot } from "../../workspace/source-protocol.ts";
export interface LensSourcePort { read(scope: LensScope): Promise<unknown>; version?(scope:LensScope):string }

export const logseqSourceId = sourceId;
export const sameLensScope = (a: LensScope, b: LensScope): boolean => a.graphId === b.graphId && a.rootUuid === b.rootUuid && a.kind === b.kind && a.pageName === b.pageName;
export const sourceHash = sha256;
export function readLensScope(value: unknown): LensScope {
  const scope = lensRecord(value, ["graphId", "rootUuid", "kind", "pageName"]);
  return scopeOf(scope);
}
/** Only committed SDK rows enter here. Drafts, display order and seq are deliberately absent. */
export async function captureLensSource(scope: LensScope, committed: readonly SourceRow[], availability: LensBlock["availability"] = "available"): Promise<LensSourceSnapshot> {
  const rows = committed.filter(row => !row.outside && !row.missing);
  const readable = availability === "available" && rows[0]?.uuid === scope.rootUuid;
  const counts = new Map<string | null, number>();
  const blocks: LensBlock[] = readable ? await Promise.all(rows.map(async row => {
    const parentUuid = row.sourceParent ?? null, order = counts.get(parentUuid) ?? 0;
    counts.set(parentUuid, order + 1);
    return {
      sourceId: logseqSourceId(scope.graphId, row.uuid),
      target: { kind: "logseq-block" as const, graphId: scope.graphId, blockUuid: row.uuid },
      content: row.content, contentVersion: await sourceHash(row.content),
      parentUuid, order, depth: row.depth, availability: "available" as const,
    };
  })) : [{
    sourceId: logseqSourceId(scope.graphId, scope.rootUuid),
    target: { kind: "logseq-block", graphId: scope.graphId, blockUuid: scope.rootUuid },
    content: null, contentVersion: null, parentUuid: null, order: 0, depth: 0,
    availability: availability === "available" ? "missing" : availability,
  }];
  return snapshot(scope, blocks);
}

/** Validate installed providers too; a caller-supplied version/capability is never proof. */
export async function validateLensSource(value: unknown, expected: LensScope): Promise<LensSourceSnapshot> {
  if (expected.kind === "page") {
    const result=await validateSnapshot(value);requireLens(sameLensScope(result.scope,expected),"scope-mismatch");return result;
  }
  const raw = lensRecord(value, ["schemaVersion", "scope", "blocks", "structureVersion", "sourceSetVersion", "capturedAt"], "invalid-source");
  requireLens(raw.schemaVersion === 1, "unsupported-source-schema");
  const scope = readLensScope(raw.scope); requireLens(sameLensScope(scope, expected), "scope-mismatch");
  const items = lensArray(raw.blocks, 10_000, 1), blocks: LensBlock[] = [], seen = new Set<string>();
  const counts = new Map<string | null, number>(), stack: string[] = [];
  let size = 0;
  for (const [index, value] of items.entries()) {
    const item = lensRecord(value, ["sourceId", "target", "content", "contentVersion", "parentUuid", "order", "depth", "availability"], "invalid-source");
    const target = lensRecord(item.target, ["kind", "graphId", "blockUuid"], "invalid-source");
    const uuid = lensText(target.blockUuid, 256);
    requireLens(target.kind === "logseq-block" && target.graphId === scope.graphId && item.sourceId === logseqSourceId(scope.graphId, uuid) && !seen.has(uuid), "invalid-source-identity");
    requireLens(Number.isSafeInteger(item.depth) && (item.depth as number) >= 0 && (item.depth as number) <= 512 && Number.isSafeInteger(item.order) && (item.order as number) >= 0, "invalid-source-structure");
    const depth = item.depth as number, order = item.order as number;
    requireLens(item.parentUuid === null || typeof item.parentUuid === "string", "invalid-source-structure");
    const parentUuid = item.parentUuid === null ? null : lensText(item.parentUuid, 256, "invalid-source-structure");
    // The scope root retains its actual parent and sibling order. Its parent
    // lies outside this snapshot; only descendants start their local counts.
    requireLens(index === 0 ? uuid === scope.rootUuid && parentUuid !== uuid && depth === 0 : depth > 0 && parentUuid === stack[depth - 1], "invalid-source-structure");
    if (index > 0) {
      requireLens(order === (counts.get(parentUuid) ?? 0), "invalid-source-structure");
      counts.set(parentUuid, order + 1);
    }
    stack.length = depth; stack[depth] = uuid; seen.add(uuid);
    requireLens(["available", "missing", "unavailable"].includes(String(item.availability)), "invalid-source-availability");
    const availability = item.availability as LensBlock["availability"];
    const content = availability === "available" ? lensText(item.content, 2_000_000, "invalid-source-content", true) : null;
    const contentVersion = availability === "available" ? lensHash(item.contentVersion) : null;
    requireLens(availability === "available" || (item.content === null && item.contentVersion === null), "unavailable-source-has-content");
    size += content?.length ?? 0; requireLens(size <= 8_000_000, "input-too-large");
    blocks.push({ sourceId: item.sourceId as string, target: { kind: "logseq-block", graphId: scope.graphId, blockUuid: uuid }, content, contentVersion, parentUuid, order, depth, availability });
  }
  requireLens(blocks[0]!.parentUuid === null || !seen.has(blocks[0]!.parentUuid), "invalid-source-structure");
  const capturedAt = lensText(raw.capturedAt, 64);
  requireLens(Number.isFinite(Date.parse(capturedAt)), "invalid-captured-at");
  await Promise.all(blocks.map(async block => {
    if (block.content !== null) requireLens(await sourceHash(block.content) === block.contentVersion, "source-version-mismatch");
  }));
  const structureVersion = lensHash(raw.structureVersion), sourceSetVersion = lensHash(raw.sourceSetVersion);
  const versions = await snapshot(scope, blocks, capturedAt);
  requireLens(versions.structureVersion === structureVersion && versions.sourceSetVersion === sourceSetVersion, "source-version-mismatch");
  return { schemaVersion: 1, scope, blocks, structureVersion, sourceSetVersion, capturedAt };
}
