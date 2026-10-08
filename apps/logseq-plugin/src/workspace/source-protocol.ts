/** Shared, content-based reading contract. Offsets elsewhere use UTF-16 [start,end). */
export type SourceScope = { graphId: string; rootUuid: string; kind?: "page"; pageName?: string };
export type PageSource = { pageUuid: string; pageName: string; availability: "available" | "missing" | "unavailable" };
export type BlockTarget = { kind: "logseq-block"; graphId: string; blockUuid: string };
export type BlockSnapshot = {
  sourceId: string; target: BlockTarget; content: string | null; contentVersion: string | null;
  parentUuid: string | null; order: number; depth: number;
  availability: "available" | "missing" | "unavailable";
};
export type SourceSnapshot = {
  schemaVersion: 1; scope: SourceScope; blocks: readonly BlockSnapshot[];
  structureVersion: string; sourceSetVersion: string; capturedAt: string;
  page?: PageSource;
};
export function sourceAvailability(source:SourceSnapshot):BlockSnapshot["availability"] {return source.scope.kind==="page"?source.page?.availability??"unavailable":source.blocks[0]?.availability??"unavailable";}
export const MAX_BLOCKS = 10_000, MAX_TEXT = 8_000_000;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WORKSPACE_INVALID_OBJECT");
  return value as Record<string, unknown>;
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 2048 || [...value].some(c => c.charCodeAt(0) < 32)) throw new Error("WORKSPACE_INVALID_ID");
  return value;
}
export function scopeOf(value: unknown): SourceScope {
  const scope = object(value);
  if (scope.kind !== undefined && scope.kind !== "page") throw new Error("WORKSPACE_INVALID_SOURCE_KIND");
  if (scope.pageName !== undefined && scope.kind !== "page") throw new Error("WORKSPACE_INVALID_SOURCE_KIND");
  return {graphId: identifier(scope.graphId), rootUuid: identifier(scope.rootUuid), ...(scope.kind === "page" ? {kind:"page" as const,pageName:identifier(scope.pageName)} : {})};
}
export const sourceId = (graphId: string, uuid: string): string => JSON.stringify(["logseq", graphId, uuid]);
export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function snapshot(scope: SourceScope, blocks: readonly BlockSnapshot[], capturedAt = new Date().toISOString(), page?: PageSource): Promise<SourceSnapshot> {
  return {schemaVersion: 1, scope, blocks,
    structureVersion: await sha256(JSON.stringify(page ? [page.pageUuid, page.pageName, blocks.map(b => [b.sourceId,b.parentUuid,b.order,b.depth])] : blocks.map(b => [b.sourceId, b.parentUuid, b.order, b.depth]))),
    sourceSetVersion: await sha256(JSON.stringify(page ? [page.availability, blocks.map(b => [b.sourceId,b.availability,b.contentVersion])] : blocks.map(b => [b.sourceId, b.availability, b.contentVersion]))), capturedAt, ...(page ? {page} : {})};
}
/** Disk/provider data is verified before it becomes a trusted reading result. */
export async function validateSnapshot(value: unknown): Promise<SourceSnapshot> {
  const data = object(value), scope = scopeOf(data.scope);
  const rawPage = scope.kind === "page" ? object(data.page) : null;
  if (scope.kind !== "page" && data.page !== undefined) throw new Error("WORKSPACE_INVALID_PAGE");
  if (rawPage && (rawPage.pageUuid !== scope.rootUuid || rawPage.pageName !== scope.pageName || !["available","missing","unavailable"].includes(String(rawPage.availability)))) throw new Error("WORKSPACE_INVALID_PAGE");
  const page = rawPage as PageSource | null;
  if (data.schemaVersion !== 1 || !Array.isArray(data.blocks) || (!page && !data.blocks.length) || (page && page.availability !== "available" && data.blocks.length) || data.blocks.length > MAX_BLOCKS || typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) throw new Error("WORKSPACE_INVALID_SNAPSHOT");
  const blocks: BlockSnapshot[] = [], seen = new Set<string>(), ancestors: string[] = [], orders = new Map<string | null, number>(); let size = 0;
  for (const raw of data.blocks) {
    const b = object(raw), t = object(b.target), uuid = identifier(t.blockUuid);
    if (t.kind !== "logseq-block" || t.graphId !== scope.graphId || b.sourceId !== sourceId(scope.graphId, uuid) || seen.has(uuid) || !Number.isSafeInteger(b.depth) || Number(b.depth) < 0 || Number(b.depth) > 128 || !Number.isSafeInteger(b.order) || Number(b.order) < 0 || (b.parentUuid !== null && typeof b.parentUuid !== "string")) throw new Error("WORKSPACE_INVALID_BLOCK");
    seen.add(uuid);
    const depth = Number(b.depth), expectedOrder = orders.get(b.parentUuid as string | null) ?? 0;
    if (page ? uuid === page.pageUuid || depth > ancestors.length || b.parentUuid !== (depth === 0 ? page.pageUuid : ancestors[depth - 1]) || b.order !== expectedOrder : ((!blocks.length && (uuid !== scope.rootUuid || depth !== 0 || b.parentUuid === uuid)) || (blocks.length && (depth === 0 || depth > ancestors.length || b.parentUuid !== ancestors[depth - 1] || b.order !== expectedOrder)))) throw new Error("WORKSPACE_INVALID_TOPOLOGY");
    orders.set(b.parentUuid as string | null, expectedOrder + 1); ancestors.length = depth; ancestors.push(uuid);
    if (b.availability === "available") {
      if (typeof b.content !== "string" || (size += b.content.length) > MAX_TEXT || b.contentVersion !== await sha256(b.content)) throw new Error("WORKSPACE_CONTENT_VERSION_MISMATCH");
    } else if ((b.availability !== "missing" && b.availability !== "unavailable") || b.content !== null || b.contentVersion !== null) throw new Error("WORKSPACE_INVALID_AVAILABILITY");
    blocks.push({sourceId: b.sourceId as string, target: {kind: "logseq-block", graphId: scope.graphId, blockUuid: uuid}, content: b.content as string | null, contentVersion: b.contentVersion as string | null, parentUuid: b.parentUuid as string | null, order: Number(b.order), depth, availability: b.availability as BlockSnapshot["availability"]});
  }
  if (!page && blocks[0]!.parentUuid !== null && seen.has(blocks[0]!.parentUuid)) throw new Error("WORKSPACE_INVALID_TOPOLOGY");
  const result = await snapshot(scope, blocks, data.capturedAt, page ?? undefined);
  if (result.structureVersion !== data.structureVersion || result.sourceSetVersion !== data.sourceSetVersion) throw new Error("WORKSPACE_SOURCE_VERSION_MISMATCH");
  return result;
}
