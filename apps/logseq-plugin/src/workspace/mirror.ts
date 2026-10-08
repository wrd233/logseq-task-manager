import type { FileIO } from "../host/file-io.ts";
import { object, sha256, validateSnapshot, sourceAvailability, MAX_TEXT, type SourceSnapshot } from "./source-protocol.ts";
import { associationOf, guard, managedRoot, optionalRead, replaceVerified, sameScope, uuidOf, verifiedWrite, type Association, type WorkspaceManifest } from "./workspace-record.ts";

export interface MaterialReading {
  id: string; path: string; availability: "available" | "unavailable"; content: string | null; version: string | null;
}
export type AssociatedReading = {association: Association; availability: "available" | "missing" | "unavailable"; snapshot?: SourceSnapshot; material?: MaterialReading};
export interface ReadingBundle {schemaVersion: 1; workspaceId: string; primary: SourceSnapshot; sources: AssociatedReading[]; lastKnownSources?: Array<{reading: AssociatedReading; capturedAt: string}>}
export interface MirrorPointer {schemaVersion: 1; workspaceId: string; revision: string; sourceHash: string; markdownHash: string; versionHash: string; capturedAt: string}
export interface MirrorReading {pointer: MirrorPointer; bundle: ReadingBundle; markdown: string; recovered: boolean}
export interface RangeMapping {sourceId: string; contentVersion: string; sourceStart: number; sourceEnd: number; mirrorStart: number; mirrorEnd: number}

/** No body cleanup: line prefixes are the only transform and every span is mapped. */
export function renderMirror(bundle: ReadingBundle): {text: string; ranges: RangeMapping[]} {
  let text = `# Logseq 原文读取副本\n\n读取时间：${bundle.primary.capturedAt}。来源版本：${bundle.primary.sourceSetVersion}。\n\n`;
  const ranges: RangeMapping[] = [];
  const append = (source: SourceSnapshot) => {
    for (const b of source.blocks) {
      if (b.content === null) { text += `${"  ".repeat(b.depth)}- [${b.availability}] ${b.target.blockUuid}\n`; continue; }
      const prefix = "  ".repeat(b.depth), lines = b.content.match(/[^\n]*\n|[^\n]+$/gu) ?? [""]; let start = 0;
      lines.forEach((line, index) => {
        text += `${prefix}${index === 0 ? "- " : "  "}`;
        const mirrorStart = text.length; text += line;
        if (ranges.length >= 25_000) throw new Error("WORKSPACE_TOO_MANY_LINES");
        ranges.push({sourceId: b.sourceId, contentVersion: b.contentVersion!, sourceStart: start, sourceEnd: start + line.length, mirrorStart, mirrorEnd: text.length}); start += line.length;
      });
      if (!b.content.endsWith("\n")) text += "\n";
    }
  };
  append(bundle.primary);
  for (const source of bundle.sources) {
    text += `\n## 显式关联来源\n\n${JSON.stringify(source.association)} · ${source.availability}\n\n`;
    if (source.snapshot) append(source.snapshot);
    if (source.material) text += `材料路径：${source.material.path}\n版本：${source.material.version ?? "不可用"}\n\n${source.material.content ?? "正文不可用 / 仅外部打开"}\n`;
  }
  for (const old of bundle.lastKnownSources ?? []) {
    text += `\n## 最后已知关联副本 · 当前不可用\n\n读取时间：${old.capturedAt}。${JSON.stringify(old.reading.association)}\n\n`;
    if (old.reading.snapshot) append(old.reading.snapshot);
    if (old.reading.material) text += `${old.reading.material.content ?? "正文不可用"}\n`;
  }
  return {text, ranges};
}
export function materialReading(value: unknown, expectedId: string): MaterialReading {
  const m = object(value);
  if (m.id !== expectedId || typeof m.path !== "string" || m.path.length > 4096 || (m.availability !== "available" && m.availability !== "unavailable") || (m.content !== null && (typeof m.content !== "string" || m.content.length > MAX_TEXT)) || (m.version !== null && (typeof m.version !== "string" || !/^[a-f0-9]{64}$/u.test(m.version)))) throw new Error("WORKSPACE_INVALID_MATERIAL_READING");
  return {id: expectedId, path: m.path, availability: m.availability as MaterialReading["availability"], content: m.availability === "available" ? m.content as string | null : null, version: m.availability === "available" ? m.version as string | null : null};
}
async function associatedOf(value: unknown): Promise<AssociatedReading> {
  const s = object(value), association = associationOf(s.association);
  if (s.availability !== "available" && s.availability !== "missing" && s.availability !== "unavailable") throw new Error("WORKSPACE_INVALID_AVAILABILITY");
  const snapshot = s.snapshot ? await validateSnapshot(s.snapshot) : undefined;
  if(snapshot){
    if(association.kind==="material"||snapshot.scope.graphId!==association.graphId||snapshot.scope.rootUuid!==(association.kind==="logseq-block"?association.blockUuid:association.pageUuid)||sourceAvailability(snapshot)!==s.availability)throw new Error("WORKSPACE_SOURCE_MISMATCH");
    // Old associated-page mirrors remain readable history. Newly refreshed page
    // snapshots use the real page descriptor and contain no invented root block.
    if(association.kind==="logseq-block"&&snapshot.scope.kind!==undefined||association.kind==="logseq-page"&&snapshot.scope.kind==="page"&&snapshot.scope.pageName!==association.pageName)throw new Error("WORKSPACE_SOURCE_MISMATCH");
  }
  const material = s.material && association.kind === "material" ? materialReading(s.material, association.id) : undefined;
  if (material && material.availability !== s.availability) throw new Error("WORKSPACE_SOURCE_MISMATCH");
  if (s.availability === "available" && (association.kind === "material" ? !material : !snapshot)) throw new Error("WORKSPACE_SOURCE_MISSING");
  if (material?.content !== null && material?.content !== undefined && material.version !== await sha256(material.content)) throw new Error("WORKSPACE_MATERIAL_VERSION_MISMATCH");
  return {association, availability: s.availability as AssociatedReading["availability"], ...(snapshot ? {snapshot} : {}), ...(material ? {material} : {})};
}
export async function bundleOf(value: unknown, manifest: WorkspaceManifest): Promise<ReadingBundle> {
  if (JSON.stringify(value).length > 16_000_000) throw new Error("WORKSPACE_CONTEXT_TOO_LARGE");
  const b = object(value);
  if (b.schemaVersion !== 1 || b.workspaceId !== manifest.workspaceId || !Array.isArray(b.sources) || b.sources.length > 64) throw new Error("WORKSPACE_INVALID_BUNDLE");
  const primary = await validateSnapshot(b.primary);
  if (!sameScope(primary.scope, manifest.primarySource)) throw new Error("WORKSPACE_SOURCE_MISMATCH");
  const sources: AssociatedReading[] = [];
  for (const item of b.sources) sources.push(await associatedOf(item));
  const lastKnownSources: NonNullable<ReadingBundle["lastKnownSources"]> = [];
  if (b.lastKnownSources !== undefined) {
    if (!Array.isArray(b.lastKnownSources) || b.lastKnownSources.length > 64) throw new Error("WORKSPACE_INVALID_LAST_KNOWN");
    for (const value of b.lastKnownSources) {
      const old = object(value);
      if (typeof old.capturedAt !== "string" || !Number.isFinite(Date.parse(old.capturedAt))) throw new Error("WORKSPACE_INVALID_LAST_KNOWN");
      lastKnownSources.push({reading: await associatedOf(old.reading), capturedAt: old.capturedAt});
    }
  }
  return {schemaVersion: 1, workspaceId: manifest.workspaceId, primary, sources, ...(lastKnownSources.length ? {lastKnownSources} : {})};
}
function pointerOf(value: unknown, id: string): MirrorPointer {
  const p = object(value);
  if (p.schemaVersion !== 1 || p.workspaceId !== id || typeof p.capturedAt !== "string" || !Number.isFinite(Date.parse(p.capturedAt)) || [p.sourceHash, p.markdownHash, p.versionHash].some(h => typeof h !== "string" || !/^[a-f0-9]{64}$/u.test(h))) throw new Error("WORKSPACE_INVALID_POINTER");
  uuidOf(p.revision); return p as unknown as MirrorPointer;
}
export class MirrorPublisher {
  constructor(private readonly io: FileIO) {}
  async read(directory: string, manifest: WorkspaceManifest): Promise<MirrorReading | null> {
    const root = managedRoot(directory); let problem: unknown;
    for (const [index, name] of ["current.json", "last-good.json"].entries()) {
      try {
        const raw = await optionalRead(this.io, `${root}/${name}`, 4096); if (raw === null) continue;
        const pointer = pointerOf(JSON.parse(raw), manifest.workspaceId), path = `${root}/versions/${pointer.revision}`;
        const source = await this.io.read(`${path}/source.json`), markdown = await this.io.read(`${path}/original.md`), version = await this.io.read(`${path}/version.json`);
        if (source.length > 32_000_000 || markdown.length > 32_000_000 || version.length > 4_000_000 || await sha256(source) !== pointer.sourceHash || await sha256(markdown) !== pointer.markdownHash || await sha256(version) !== pointer.versionHash) throw new Error("WORKSPACE_MIRROR_CHECKSUM_MISMATCH");
        const bundle = await bundleOf(JSON.parse(source), manifest), rendered = renderMirror(bundle);
        const expected = {schemaVersion: 1, workspaceId: manifest.workspaceId, revision: pointer.revision, sourceHash: pointer.sourceHash, markdownHash: pointer.markdownHash, sourceSetVersion: bundle.primary.sourceSetVersion, structureVersion: bundle.primary.structureVersion, capturedAt: bundle.primary.capturedAt, ranges: rendered.ranges};
        if (markdown !== rendered.text || version !== JSON.stringify(expected) || pointer.capturedAt !== bundle.primary.capturedAt) throw new Error("WORKSPACE_MIRROR_VERSION_MISMATCH");
        return {pointer, bundle, markdown, recovered: index > 0};
      } catch (error) { problem = error; }
    }
    if (problem) throw problem; return null;
  }
  async publish(directory: string, manifest: WorkspaceManifest, bundle: ReadingBundle, valid: () => boolean): Promise<MirrorReading> {
    await bundleOf(bundle, manifest); guard(valid);
    const root = managedRoot(directory), previous = await this.read(directory, manifest); guard(valid);
    const rendered = renderMirror(bundle), revision = crypto.randomUUID(), path = `${root}/versions/${revision}`;
    await this.io.mkdir(path); guard(valid);
    const source = JSON.stringify(bundle), sourceHash = await sha256(source), markdownHash = await sha256(rendered.text);
    const version = JSON.stringify({schemaVersion: 1, workspaceId: manifest.workspaceId, revision, sourceHash, markdownHash, sourceSetVersion: bundle.primary.sourceSetVersion, structureVersion: bundle.primary.structureVersion, capturedAt: bundle.primary.capturedAt, ranges: rendered.ranges});
    if (source.length > 16_000_000 || rendered.text.length > 32_000_000 || version.length > 4_000_000) throw new Error("WORKSPACE_CONTEXT_TOO_LARGE");
    await verifiedWrite(this.io, `${path}/source.json`, source, valid);
    await verifiedWrite(this.io, `${path}/original.md`, rendered.text, valid);
    await verifiedWrite(this.io, `${path}/version.json`, version, valid);
    const pointer: MirrorPointer = {schemaVersion: 1, workspaceId: manifest.workspaceId, revision, sourceHash, markdownHash, versionHash: await sha256(version), capturedAt: bundle.primary.capturedAt};
    // The old verified pointer is durable before the only mutable publication point changes.
    if (previous) await replaceVerified(this.io, `${root}/last-good.json`, JSON.stringify(previous.pointer), valid);
    await replaceVerified(this.io, `${root}/current.json`, JSON.stringify(pointer), valid);
    return {pointer, bundle, markdown: rendered.text, recovered: false};
  }
}
