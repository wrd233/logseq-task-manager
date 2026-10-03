import { object, scopeOf, type SourceScope } from "./source-protocol.ts";
import { ScopeExpired, type SourceReader } from "./source-reader.ts";
import type { WorkspaceRegistry, BindRequest, WorkspaceBinding } from "./registry.ts";
import { associationOf, directoryOf, guard, managedRoot, optionalRead, replaceVerified } from "./workspace-record.ts";
import { materialReading, MirrorPublisher, type AssociatedReading, type MirrorReading, type ReadingBundle } from "./mirror.ts";

export interface WorkspaceHost {
  current(): Promise<{graphId: string; materialGraph: string}>;
  persistRoot(scope: SourceScope, valid: () => boolean): Promise<void>;
  readMaterial?(id: string): Promise<unknown>;
}
export interface RefreshStatus {
  schemaVersion: 1; workspaceId: string; checkedAt: string;
  availability: "available" | "missing" | "unavailable"; publishedRevision: string | null; problem?: string;
}
export interface ContextReading {
  workspaceId: string; binding: WorkspaceBinding; freshness: "checked" | "last-known" | "unavailable";
  mirror: MirrorReading | null; status: RefreshStatus | null; observed?: ReadingBundle; problem?: string;
}
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
  const run = async () => {
    const previous = queues.get(key), next = (previous ?? Promise.resolve()).catch(() => undefined).then(action); queues.set(key, next);
    try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(`task-copilot:${key}`, run) : run();
}
const scopeKey = (scope: SourceScope): string => JSON.stringify([scope.graphId, scope.rootUuid]);
const copyReading = (reading: ContextReading): ContextReading => JSON.parse(JSON.stringify(reading)) as ContextReading;
function versions(bundle: ReadingBundle): string {
  return JSON.stringify([bundle.primary.structureVersion, bundle.primary.sourceSetVersion, bundle.sources.map(s => [s.association, s.availability, s.snapshot?.structureVersion, s.snapshot?.sourceSetVersion, s.material?.path, s.material?.version])]);
}
/** Local lifecycle, not PluginRuntime: no task setting, Kernel client or model. */
export class WorkspaceContextService {
  private epoch = 0;
  private stopped = false;
  private readonly revisions = new Map<string, number>();
  private readonly changes = new Map<string, number>();
  private readonly known = new Map<string, {scope: SourceScope; blocks: Set<string>}>();
  private readonly cache = new Map<string, ContextReading>();
  private readonly publisher: MirrorPublisher;
  constructor(readonly registry: WorkspaceRegistry, private readonly reader: SourceReader, private readonly host: WorkspaceHost) { this.publisher = new MirrorPublisher(registry.io); }
  invalidate(): void { this.epoch++; this.known.clear(); }
  dispose(): void { this.stopped = true; this.invalidate(); }
  private bump(scope: SourceScope): void { const key = scopeKey(scope); this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1); this.known.delete(key); }
  private valid(scope: SourceScope): () => boolean {
    if (this.stopped) throw new ScopeExpired();
    const epoch = this.epoch, revision = this.revisions.get(scopeKey(scope));
    return () => !this.stopped && epoch === this.epoch && revision === this.revisions.get(scopeKey(scope));
  }
  async resolve(input: SourceScope): Promise<WorkspaceBinding | null> {
    const scope = scopeOf(input), valid = this.valid(scope), hint = this.registry.hint(scope);
    let graph = hint?.materialGraph;
    if (!graph) { const current = await this.host.current(); guard(valid); if (current.graphId === scope.graphId) graph = current.materialGraph; }
    const result = await this.registry.resolve(scope, graph); guard(valid); return result;
  }
  async bind(input: BindRequest): Promise<ContextReading> {
    const scope = scopeOf(input.scope); input = {...input, scope}; this.bump(scope); const valid = this.valid(scope), current = await this.host.current(); guard(valid);
    if (current.graphId !== scope.graphId) throw new ScopeExpired();
    const directory = directoryOf(input.directory, current.materialGraph);
    const binding = await serial(`workspace-directory:${directory}`, () => this.registry.bind({...input, directory}, current.materialGraph, () => this.host.persistRoot(scope, valid), valid)); guard(valid);
    this.known.set(scopeKey(scope), {scope, blocks: new Set([scope.rootUuid])});
    const result = await this.refresh(scope);
    return {...result, binding};
  }
  async unbind(input: SourceScope): Promise<void> {
    const scope = scopeOf(input); this.bump(scope); const valid = this.valid(scope), current = await this.host.current(); guard(valid);
    if (current.graphId !== scope.graphId) throw new ScopeExpired();
    this.registry.unbind(scope, current.materialGraph);
  }
  async associate(input: {scope: SourceScope; source: unknown}): Promise<ContextReading> {
    const scope = scopeOf(input.scope), source = associationOf(input.source); this.bump(scope); const valid = this.valid(scope);
    const current = await this.host.current(); guard(valid);
    if (current.graphId !== scope.graphId || (source.kind !== "material" && source.graphId !== scope.graphId)) throw new Error("关联来源必须属于当前 Graph。");
    const binding = await this.requireBinding(scope); guard(valid);
    if (source.kind !== "material") {
      const external = await this.reader.read({graphId: source.graphId, rootUuid: source.kind === "logseq-block" ? source.blockUuid : source.pageUuid}, valid, source.kind === "logseq-page" ? source.pageName : undefined);
      if (external.blocks[0]?.availability !== "available") throw new Error("显式关联前无法核验该 Logseq 来源。");
    } else {
      if (!this.host.readMaterial) throw new Error("材料读取模块未启用。");
      materialReading(await this.host.readMaterial(source.id), source.id); guard(valid);
    }
    await serial(`workspace-directory:${binding.directory}`, () => this.registry.associate(binding, source, valid)); guard(valid);
    return this.refresh(scope);
  }
  private async requireBinding(scope: SourceScope): Promise<WorkspaceBinding> {
    const binding = await this.resolve(scope); if (!binding) throw new Error("该工作尚未建立便携记录，请显式关联目录。旧材料目录仍可使用。"); return binding;
  }
  async read(input: SourceScope): Promise<ContextReading> {
    const scope = scopeOf(input), valid = this.valid(scope), key = scopeKey(scope);
    try {
      const binding = await this.requireBinding(scope); guard(valid);
      const mirror = await this.publisher.read(binding.directory, binding.manifest); guard(valid);
      const raw = await optionalRead(this.registry.io, `${managedRoot(binding.directory)}/status.json`, 16_384); guard(valid);
      let status: RefreshStatus | null = null;
      if (raw !== null) {
        const s = object(JSON.parse(raw));
        if (s.schemaVersion !== 1 || s.workspaceId !== binding.manifest.workspaceId || (s.availability !== "available" && s.availability !== "missing" && s.availability !== "unavailable") || typeof s.checkedAt !== "string" || !Number.isFinite(Date.parse(s.checkedAt))) throw new Error("WORKSPACE_INVALID_STATUS");
        status = s as unknown as RefreshStatus;
      }
      const result: ContextReading = {workspaceId: binding.manifest.workspaceId, binding, mirror, status, freshness: mirror ? "last-known" : "unavailable", ...(mirror?.recovered ? {problem: "当前指针不可用，读取上一份已验证副本。"} : {})};
      if (mirror) this.cache.set(key, copyReading(result)); return result;
    } catch (error) {
      guard(valid);
      const previous = this.cache.get(key), hint = this.registry.hint(scope);
      // Cache never changes a destination. Unbound work cannot silently regain its old binding.
      if (previous && hint && this.registry.directories.binding(hint.materialGraph, scope.rootUuid)) return {...copyReading(previous), freshness: "last-known", problem: `目录或来源暂不可用，保留最后已知副本：${String(error)}`};
      throw error;
    }
  }
  async refresh(input: SourceScope): Promise<ContextReading> {
    const scope = scopeOf(input), valid = this.valid(scope), key = scopeKey(scope);
    return serial(`workspace-refresh:${key}`, async () => {
      guard(valid);
      const previous = await this.read(scope); guard(valid);
      const binding = previous.binding;
      // Do not write a cached binding whose directory/manifest failed current verification.
      const verified = await this.requireBinding(scope); guard(valid);
      if (verified.directory !== binding.directory || verified.manifest.workspaceId !== binding.manifest.workspaceId) throw new ScopeExpired();
      let observed: ReadingBundle | undefined, problem: string | undefined;
      let mirror = previous.mirror;
      for (let attempt = 0; attempt < 3; attempt++) {
        const change = this.changes.get(key), currentRead = () => valid() && change === this.changes.get(key);
        try {
          const primary = await this.reader.read(scope, currentRead), sources: AssociatedReading[] = [];
          for (const association of binding.manifest.associations) {
            guard(currentRead);
            if (association.kind === "material") {
              try {
                if (!this.host.readMaterial) throw new Error("材料读取不可用");
                const material = materialReading(await this.host.readMaterial(association.id), association.id); guard(currentRead);
                sources.push({association, material, availability: material.availability});
              } catch (error) { guard(currentRead); if (error instanceof ScopeExpired) throw error; sources.push({association, availability: "unavailable"}); }
            } else {
              const sourceScope = {graphId: association.graphId, rootUuid: association.kind === "logseq-block" ? association.blockUuid : association.pageUuid};
              const snapshot = await this.reader.read(sourceScope, currentRead, association.kind === "logseq-page" ? association.pageName : undefined);
              sources.push({association, snapshot, availability: snapshot.blocks[0]?.availability ?? "unavailable"});
            }
          }
          const lastKnownSources: NonNullable<ReadingBundle["lastKnownSources"]> = [];
          for (const source of sources.filter(s => s.availability !== "available")) {
            const same = (reading: AssociatedReading) => JSON.stringify(reading.association) === JSON.stringify(source.association);
            const old = mirror?.bundle.sources.find(s => same(s) && s.availability === "available");
            const retained = mirror?.bundle.lastKnownSources?.find(s => same(s.reading));
            if (old) lastKnownSources.push({reading: old, capturedAt: old.snapshot?.capturedAt ?? mirror!.bundle.primary.capturedAt});
            else if (retained) lastKnownSources.push(retained);
          }
          observed = {schemaVersion: 1, workspaceId: binding.manifest.workspaceId, primary, sources, ...(lastKnownSources.length ? {lastKnownSources} : {})}; guard(currentRead);
          if (primary.blocks[0]?.availability === "available") {
            if (!mirror || versions(mirror.bundle) !== versions(observed)) mirror = await this.publisher.publish(binding.directory, binding.manifest, observed, currentRead);
            guard(currentRead);
            this.watch(scope, observed);
          }
          break;
        } catch (error) {
          guard(valid);
          if (error instanceof ScopeExpired) {
            if (change !== this.changes.get(key)) {
              if (attempt < 2) continue;
              problem = "来源在读取期间持续变化，保留最后良好副本。请稍后刷新。"; break;
            }
            throw error;
          }
          problem = String(error); break;
        }
      }
      guard(valid);
      const availability = problem ? "unavailable" : observed?.primary.blocks[0]?.availability ?? "unavailable";
      const status: RefreshStatus = {schemaVersion: 1, workspaceId: binding.manifest.workspaceId, checkedAt: new Date().toISOString(), availability, publishedRevision: mirror?.pointer.revision ?? null, ...(problem ? {problem} : {})};
      try { await replaceVerified(this.registry.io, `${managedRoot(binding.directory)}/status.json`, JSON.stringify(status), valid); }
      catch (error) { guard(valid); problem = `刷新状态保存失败：${String(error)}`; }
      const result: ContextReading = {workspaceId: binding.manifest.workspaceId, binding, mirror, status, freshness: availability === "available" && !problem ? "checked" : mirror ? "last-known" : "unavailable", ...(observed ? {observed} : {}), ...(problem ? {problem} : {})};
      if (mirror) this.cache.set(key, copyReading(result)); return result;
    });
  }
  private watch(scope: SourceScope, bundle: ReadingBundle): void {
    const blocks = new Set([scope.rootUuid, ...bundle.primary.blocks.map(b => b.target.blockUuid)]);
    for (const source of bundle.sources) for (const block of source.snapshot?.blocks ?? []) blocks.add(block.target.blockUuid);
    this.known.set(scopeKey(scope), {scope, blocks});
  }
  changed(uuids?: readonly string[]): SourceScope[] {
    const scopes: SourceScope[] = [];
    for (const [key, entry] of this.known) {
      if (uuids && !uuids.some(uuid => entry.blocks.has(uuid))) continue;
      this.changes.set(key, (this.changes.get(key) ?? 0) + 1); scopes.push(entry.scope);
    }
    return scopes;
  }
  registeredScopes(): SourceScope[] { return [...this.known.values()].map(entry => entry.scope); }
  async restoreKnown(): Promise<SourceScope[]> {
    const epoch = this.epoch, current = await this.host.current();
    if (this.stopped || epoch !== this.epoch) return [];
    const scopes: SourceScope[] = [];
    for (const binding of this.registry.directories.bindings(current.materialGraph)) {
      const scope = {graphId: current.graphId, rootUuid: binding.sourceUuid!};
      try {
        const resolved = await this.registry.resolve(scope, current.materialGraph);
        if (this.stopped || epoch !== this.epoch) return [];
        if (resolved) { this.known.set(scopeKey(scope), {scope, blocks: new Set([scope.rootUuid])}); scopes.push(scope); }
      } catch { /* A failed known directory remains bound; explicit use reports its failure. */ }
    }
    return scopes;
  }
}
