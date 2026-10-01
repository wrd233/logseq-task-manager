import { KernelClient, parsePluginKernelDescriptor, type PluginKernelDescriptor } from "@task-copilot/client/browser";
import { blockIdentityCache, type GraphIdentityState, type GraphScope } from "./block-identity.ts";
import { graphIdentity, LogseqGraphAdapter, logseqBlock } from "./graph-adapter.ts";
import { startGraphGatewayWorker, type GraphGatewayReadHost } from "./graph-gateway-worker.ts";
import { startSourceChangeObserver } from "./source-change-observer.ts";
import { isStableProjectionAnomaly } from "./formal-marker.ts";
import { readOptionalPrivateItem } from "./private-storage.ts";

const descriptorKey = "task-copilot-vnext-kernel-descriptor";
export interface AnchorIndexEntry { object: { id: string; kind: string; title?: string }; anchor: { externalId?: string; graphId?: string } | null }

function gatewayBlock(value: unknown, fallbackPage: string | null = null): { uuid: string; content: string; pageName: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>; const content = typeof item.title === "string" ? item.title : typeof item.content === "string" ? item.content : null;
  if (typeof item.uuid !== "string" || content === null) return null;
  const page = item.page && typeof item.page === "object" && !Array.isArray(item.page) ? item.page as Record<string, unknown> : null;
  return { uuid: item.uuid, content, pageName: typeof page?.name === "string" ? page.name : fallbackPage };
}

function journalPageNameFallbacks(pageName: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(pageName);
  if (!match) return [pageName];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return [pageName];
  const day = date.getDate();
  const ordinal = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]!;
  const monthLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()]!;
  return [pageName, `${monthShort} ${day}${ordinal}, ${date.getFullYear()}`, `${monthLong} ${day}${ordinal}, ${date.getFullYear()}`];
}

function graphGatewayReadHost(): GraphGatewayReadHost {
  return {
    search: async (query, limit) => {
      const rows = await logseq.DB.datascriptQuery(`[:find ?uuid ?content ?page-name :where [?b :block/uuid ?uuid] [?b :block/content ?content] [?b :block/page ?p] [?p :block/name ?page-name]]`) as unknown;
      if (!Array.isArray(rows)) return [];
      const needle = query.toLocaleLowerCase(); const matches: Array<{ uuid: string; content: string; pageName: string | null }> = [];
      for (const row of rows) {
        if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "string") continue;
        if (!row[1].toLocaleLowerCase().includes(needle)) continue;
        matches.push({ uuid: row[0], content: row[1], pageName: typeof row[2] === "string" ? row[2] : null });
        if (matches.length >= limit) break;
      }
      return matches;
    },
    readBlock: async (uuid) => gatewayBlock(await logseq.Editor.getBlock(uuid, { includeChildren: true })),
    readPage: async (pageName) => {
      let roots: Awaited<ReturnType<typeof logseq.Editor.getPageBlocksTree>> = null;
      for (const name of journalPageNameFallbacks(pageName)) {
        roots = await logseq.Editor.getPageBlocksTree(name); if (roots) break;
      }
      if (!roots) return null;
      const values: Array<{ uuid: string; content: string; pageName: string | null }> = [];
      const visit = (candidate: unknown) => {
        const item = gatewayBlock(candidate, pageName); if (item) values.push(item);
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          const children = (candidate as Record<string, unknown>).children; if (Array.isArray(children)) for (const child of children) visit(child);
        }
      };
      for (const root of roots) visit(root); return values;
    },
  };
}


/** Plugin-level resources; no panel or task UI imports. Started only when tasks are enabled. */
export class PluginRuntime {
  private running = false;
  private starting: Promise<void> | null = null;
  private disposers: Array<() => void> = [];
  private refreshPromise: { scope: GraphScope; promise: Promise<void> } | null = null;
  private lastRefreshAt = 0;
  private parsed: { raw: string; value: PluginKernelDescriptor } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly writes = new Map<string, Set<symbol>>();
  private readonly doneWrites = new Map<string, Set<symbol>>();
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(readonly identities: GraphIdentityState = blockIdentityCache) {}

  onIdentitiesChanged(callback: () => void): () => void {
    this.listeners.add(callback); return () => { this.listeners.delete(callback); };
  }
  private notify(): void { for (const callback of this.listeners) { try { callback(); } catch (error) { this.report(error); } } }
  private valid(scope: GraphScope): boolean { return this.running && this.identities.isCurrent(scope); }
  private assertCurrent(scope: GraphScope): void { if (!this.valid(scope)) throw new Error("GRAPH_SCOPE_CHANGED"); }

  async descriptor(): Promise<PluginKernelDescriptor> {
    const stored = await readOptionalPrivateItem(logseq.FileStorage, descriptorKey);
    const configured = logseq.settings?.kernelDescriptorJson;
    const raw = typeof stored === "string" && stored.trim() ? stored : typeof configured === "string" ? configured : "";
    if (!raw.trim()) throw new Error("请先运行“Task Copilot vNext：连接 Kernel”并导入 descriptor。");
    if (!this.parsed || this.parsed.raw !== raw) this.parsed = { raw, value: parsePluginKernelDescriptor(JSON.parse(raw)) };
    const value = this.parsed.value;
    if (raw !== stored) await logseq.FileStorage.setItem(descriptorKey, raw.trim());
    return value;
  }
  async connect(raw: string): Promise<void> {
    parsePluginKernelDescriptor(JSON.parse(raw));
    await logseq.FileStorage.setItem(descriptorKey, raw.trim());
    this.parsed = null;
    this.identities.invalidateScope(this.identities.scope().graphId);
    this.notify();
    if (this.running) void this.refreshQuietly();
  }
  async client(): Promise<KernelClient> { return new KernelClient(await this.descriptor()); }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.running) return Promise.resolve();
    this.running = true;
    const initial = this.identities.scope();
    const promise = (async () => {
      try {
        const graphId = graphIdentity(await logseq.App.getCurrentGraph());
        if (!this.valid(initial)) return;
        this.identities.activate(graphId);
        this.disposers.push(logseq.App.onCurrentGraphChanged(() => {
          this.identities.invalidateScope(); this.lastRefreshAt = 0; this.notify();
          const pending = this.identities.scope();
          void logseq.App.getCurrentGraph().then(graph => {
            if (!this.valid(pending)) return;
            this.identities.activate(graphIdentity(graph)); this.notify(); void this.refreshQuietly();
          }).catch(error => this.report(error));
        }));
        this.disposers.push(startGraphGatewayWorker({
          connection: async () => {
            const scope = this.identities.scope();
            this.assertCurrent(scope);
            const descriptor = await this.descriptor();
            this.assertCurrent(scope);
            return { descriptor, ...await this.adapterForCurrentGraph(), readHost: this.scopedReadHost(scope), isCurrent: () => this.valid(scope) };
          },
          onError: error => this.report(error),
        }));
        this.disposers.push(startSourceChangeObserver({
          onChanged: callback => logseq.DB.onChanged(callback),
          getBlockContext: async uuid => {
            const value = await logseq.Editor.getBlock(uuid);
            const block = logseqBlock(value);
            return block ? { pageName: typeof value?.page?.name === "string" ? value.page.name : null, content: block.content } : null;
          },
          getPageBlocksTree: async pageName => await logseq.Editor.getPageBlocksTree(pageName) as Array<{ uuid: string; content?: string; children?: unknown[] }> | null,
        }, {
          client: () => this.client(),
          scope: () => this.identities.scope(),
          isCurrent: scope => this.valid(scope),
          isSelfWritten: uuid => this.isSelfWritten(uuid),
          onError: error => this.report(error),
        }));
        const timer = setInterval(() => void this.refreshQuietly(), 30_000);
        this.disposers.push(() => clearInterval(timer));
        void this.refreshQuietly();
      } catch (error) { this.stop(); throw error; }
    })();
    this.starting = promise;
    void promise.finally(() => { if (this.starting === promise) this.starting = null; }).catch(() => undefined);
    return promise;
  }

  stop(): void {
    this.running = false;
    this.identities.invalidateScope();
    for (const off of this.disposers.splice(0).reverse()) { try { off(); } catch (error) { this.report(error); } }
    for (const timer of this.cleanupTimers) clearTimeout(timer);
    this.cleanupTimers.clear(); this.writes.clear(); this.doneWrites.clear();
    this.refreshPromise = null; this.lastRefreshAt = 0; this.parsed = null;
    this.notify();
  }
  private report(error: unknown): void {
    if (error instanceof Error && /请先运行|GRAPH_SCOPE_CHANGED/u.test(error.message)) return;
    console.warn("plugin-runtime", error);
  }
  private async refreshQuietly(): Promise<void> {
    try { await this.refreshIdentities(); } catch (error) { this.report(error); }
  }
  async refreshIdentities(api?: KernelClient): Promise<void> {
    const scope = this.identities.scope();
    if (!this.valid(scope) || !scope.graphId) return;
    if (this.refreshPromise && this.identities.isCurrent(this.refreshPromise.scope)) return this.refreshPromise.promise;
    this.lastRefreshAt = Date.now();
    const promise = (async () => {
      const connection = api ?? await this.client();
      if (!this.valid(scope)) return;
      const [result, obligationsResult, recoveryResult] = await Promise.all([
        connection.listObjectAnchorIndex(), connection.listProjectionObligations(), connection.listRecovery(),
      ]);
      if (!this.valid(scope)) return;
      const anomalies = new Set(obligationsResult.obligations.filter(isStableProjectionAnomaly).map(item => item.workObjectId));
      for (const item of recoveryResult.recovery) if (item.action === "MANUAL_RECONCILIATION" && item.commit.targetId) anomalies.add(item.commit.targetId);
      this.identities.replace(result.objects.map(entry => anomalies.has(entry.object.id) ? { ...entry, consistency: "WARNING" as const } : entry), scope);
      this.notify();
    })();
    this.refreshPromise = { scope, promise };
    try { await promise; } finally { if (this.refreshPromise?.promise === promise) this.refreshPromise = null; }
  }
  async refreshIfStale(uuid: string): Promise<void> {
    if (this.identities.isStale(uuid) && Date.now() - this.lastRefreshAt > 5_000) await this.refreshIdentities();
  }
  async revalidateIdentity(api: KernelClient, uuid: string): Promise<AnchorIndexEntry | null> {
    const scope = this.identities.scope(); this.assertCurrent(scope);
    const result = await api.listObjectAnchorIndex(); this.assertCurrent(scope);
    const entry = result.objects.find(item => (item.anchor as AnchorIndexEntry["anchor"])?.graphId === scope.graphId && (item.anchor as AnchorIndexEntry["anchor"])?.externalId === uuid) as AnchorIndexEntry | undefined;
    if (!entry) { this.identities.invalidate(uuid, scope); this.notify(); return null; }
    if (entry.object.kind === "TASK" || entry.object.kind === "MINI_PROJECT" || entry.object.kind === "PROJECT") {
      this.identities.setFormal(uuid, { kind: "FORMAL", workObjectId: entry.object.id, objectKind: entry.object.kind, ...(entry.object.title !== undefined ? { title: entry.object.title } : {}) }, scope);
      this.notify();
    }
    return entry;
  }

  private async scoped<T>(scope: GraphScope, action: () => Promise<T>): Promise<T> {
    this.assertCurrent(scope);
    if (graphIdentity(await logseq.App.getCurrentGraph()) !== scope.graphId) throw new Error("GRAPH_SCOPE_CHANGED");
    this.assertCurrent(scope);
    const result = await action(); this.assertCurrent(scope); return result;
  }
  async adapterForCurrentGraph(): Promise<{ adapter: LogseqGraphAdapter; graphId: string; scope: GraphScope }> {
    const before = this.identities.scope();
    const graphId = graphIdentity(await logseq.App.getCurrentGraph());
    this.assertCurrent(before);
    if (graphId !== before.graphId) throw new Error("GRAPH_SCOPE_CHANGED");
    const scope = before;
    const adapter = new LogseqGraphAdapter({
      getBlock: (uuid, options) => this.scoped(scope, () => logseq.Editor.getBlock(uuid, options)),
      insertBlock: (target, content, options) => this.withSelfWrite(options.customUUID, () => this.scoped(scope, () => logseq.Editor.insertBlock(target, content, options)), false, scope),
      updateBlock: (uuid, content) => this.withSelfWrite(uuid, () => this.scoped(scope, () => logseq.Editor.updateBlock(uuid, content)), false, scope),
      removeBlock: uuid => this.withSelfWrite(uuid, () => this.scoped(scope, () => logseq.Editor.removeBlock(uuid)), false, scope),
    }, graphId);
    const apply = adapter.applyGraphEffect.bind(adapter);
    adapter.applyGraphEffect = effect => this.withSelfWrite(effect.sourceBlockUuid, () => apply(effect), effect.type === "CHANGE_CLOSURE_FIELDS" && effect.expectedSourceMarker !== "DONE" && effect.resultingSourceMarker === "DONE", scope);
    return { adapter, graphId, scope };
  }
  private scopedReadHost(scope: GraphScope): GraphGatewayReadHost {
    const host = graphGatewayReadHost();
    return {
      search: (query, limit) => this.scoped(scope, () => host.search(query, limit)),
      readBlock: uuid => this.scoped(scope, () => host.readBlock(uuid)),
      readPage: name => this.scoped(scope, () => host.readPage(name)),
    };
  }
  async updateSource(graphId: string, uuid: string, content: string): Promise<void> {
    const scope = this.identities.scope();
    if (graphId !== scope.graphId) throw new Error("GRAPH_SCOPE_CHANGED");
    await this.withSelfWrite(uuid, () => this.scoped(scope, () => logseq.Editor.updateBlock(uuid, content)), false, scope);
  }
  isSelfWritten(uuid: string, doneOnly = false): boolean {
    return (doneOnly ? this.doneWrites : this.writes).has(`${this.identities.scope().generation}:${uuid}`);
  }
  async withSelfWrite<T>(uuid: string, action: () => Promise<T>, done = false, scope = this.identities.scope()): Promise<T> {
    this.assertCurrent(scope);
    const key = `${scope.generation}:${uuid}`, token = Symbol();
    const maps = done ? [this.writes, this.doneWrites] : [this.writes];
    for (const map of maps) { const tokens = map.get(key) ?? new Set<symbol>(); tokens.add(token); map.set(key, tokens); }
    try { return await action(); }
    finally {
      if (this.valid(scope)) {
        const timer = setTimeout(() => {
          this.cleanupTimers.delete(timer);
          for (const map of maps) { const tokens = map.get(key); tokens?.delete(token); if (!tokens?.size) map.delete(key); }
        }, 1_000);
        this.cleanupTimers.add(timer);
      } else for (const map of maps) map.delete(key);
    }
  }
}

export const pluginRuntime = new PluginRuntime();
