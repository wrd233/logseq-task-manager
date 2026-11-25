import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin";
import type { CatalogSnapshot, WorkRef } from "@task-copilot/contracts";
import type { StageWorkTarget } from "@task-copilot/stage-runtime";
import { graphIdentity } from "../../graph-adapter.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import { journalDayFromMs } from "../agent-workspace/journal-inbox.ts";
import type { FlowMode, PaperAnchor } from "./flow-mode.ts";

export interface PaperScene {
  graphId: string;
  kind: "block" | "page" | "journals";
  uuid: string;
  routeName: string;
  title: string;
}

export interface PaperStop {
  uuid: string;
  anchor?: string;
  text: string;
}

const STOP_PROPERTY = "tc-stop-anchor";

function sceneKey(scene: PaperScene): string {
  return `${scene.graphId}/${scene.kind}/${scene.kind === "page" ? scene.routeName.toLowerCase() : scene.uuid}`;
}

function pageScene(graphId: string, page: PageEntity): PaperScene {
  const name = page.originalName ?? page.name;
  return { kind: "page", graphId, uuid: page.uuid, routeName: name, title: name };
}

function blockScene(graphId: string, block: BlockEntity, title?: string): PaperScene {
  return { kind: "block", graphId, uuid: block.uuid, routeName: block.uuid, title: title ?? block.content?.split("\n", 1)[0] ?? "当前块" };
}

function parseStop(block: BlockEntity): PaperStop | null {
  const value = new RegExp(`^${STOP_PROPERTY}::\\s*(\\S+)`, "mu").exec(block.content ?? "")?.[1];
  if (!value) return null;
  const text = block.content?.split("\n", 1)[0]?.replace(/^上次停点 · /u, "") ?? "";
  return { uuid: block.uuid, text, ...(value !== "true" ? { anchor: value } : {}) };
}

export class PaperSceneController {
  current: PaperScene | null = null;
  stop: PaperStop | null = null;
  private readonly visited = new Set<string>();
  private readonly anchors = new Map<string, string>();
  private epoch = 0;
  private navigation = 0;
  private unsubscribe?: () => void;
  private disposed = false;

  constructor(
    readonly flow: FlowMode,
    private readonly readCatalog: () => Promise<CatalogSnapshot>,
    private readonly update: (scene: PaperScene | null, stop: PaperStop | null) => void,
  ) {}

  start(): void {
    const unsubscribe = logseq.App.onRouteChanged?.(() => {
      this.setCurrent(null);
      void this.sync().catch(() => undefined);
    });
    if (typeof unsubscribe === "function") this.unsubscribe = unsubscribe;
    this.flow.document?.addEventListener("click", this.onNativeClick, true);
    void this.sync().catch(() => undefined);
  }

  async readCurrent(): Promise<PaperScene | null> {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph) return null;
    const graphId = graphIdentity(graph);
    const page = await logseq.Editor.getCurrentPage();
    if (page && "name" in page && typeof page.name === "string" && page.uuid) return pageScene(graphId, page as PageEntity);
    if (page && "page" in page && page.uuid) return blockScene(graphId, page as BlockEntity);
    const route = this.flow.document?.defaultView?.location.hash;
    if (route === "#/" || route === "#/journals") return { kind: "journals", graphId, uuid: "today", routeName: "", title: "今日日记" };
    return null;
  }

  async sync(): Promise<void> {
    const epoch = ++this.epoch;
    const scene = await this.readCurrent();
    if (this.disposed || epoch !== this.epoch) return;
    if (!scene) { this.setCurrent(null); return; }
    const nativePage = scene.kind === "page" ? await logseq.Editor.getPage(scene.routeName) : null;
    let isWork = scene.kind === "journals" || nativePage?.["journal?"] === true || this.visited.has(sceneKey(scene));
    if (!isWork) {
      const catalog = await this.readCatalog().catch(() => null);
      isWork = Boolean(catalog?.works.some(({ workRef, title, objectType }) =>
        workRef.kind === "logseq" && workRef.graphId === scene.graphId && workRef.sourceKind === scene.kind &&
        (workRef.rootUuid === scene.uuid || (scene.kind === "page" && title.toLowerCase() === scene.routeName.toLowerCase())) &&
        (objectType === "Project" || objectType === "MiniProject" || objectType === "Task")));
    }
    if (this.disposed || epoch !== this.epoch) return;
    this.setCurrent(isWork ? scene : null);
    if (isWork && scene.kind !== "journals") {
      const stop = await this.readStop(scene);
      if (this.disposed || epoch !== this.epoch) return;
      this.stop = stop;
      this.update(scene, stop);
    }
  }

  private setCurrent(scene: PaperScene | null): void {
    const key = scene ? sceneKey(scene) : null;
    if (key === (this.current ? sceneKey(this.current) : null)) return;
    this.current = scene;
    this.stop = null;
    this.flow.setScene(key);
    this.update(scene, null);
  }

  remember(anchor: PaperAnchor): void {
    if (!this.current || anchor.uuid === this.stop?.uuid) return;
    const key = sceneKey(this.current);
    if (this.anchors.get(key) === anchor.uuid) return;
    this.anchors.set(key, anchor.uuid);
    try { this.flow.document?.defaultView?.localStorage.setItem(`tc-paper-anchor/${key}`, anchor.uuid); } catch { /* Host storage may be unavailable. */ }
  }

  private recentAnchor(scene: PaperScene): string | null {
    const key = sceneKey(scene);
    try { return this.anchors.get(key) ?? this.flow.document?.defaultView?.localStorage.getItem(`tc-paper-anchor/${key}`) ?? null; }
    catch { return this.anchors.get(key) ?? null; }
  }

  private routeMatches(scene: PaperScene): boolean {
    const hash = this.flow.document?.defaultView?.location.hash;
    if (scene.kind === "journals") return hash === "#/" || hash === "#/journals";
    const path = hash?.split("?")[0];
    return path?.toLowerCase() === `#/page/${encodeURIComponent(scene.routeName)}`.toLowerCase();
  }

  async returnToAnchor(anchor: PaperAnchor | null, scene = this.current, beacon = true): Promise<boolean> {
    if (!scene || !anchor || this.flow.isComposing) return false;
    return this.flow.jump(anchor, async (target) => {
      await logseq.Editor.editBlock(target.uuid, target.start === undefined ? undefined : { pos: target.start });
    }, () => this.routeMatches(scene), beacon);
  }

  private async sceneForRef(ref: WorkRef, pageTitle?: string, title?: string): Promise<PaperScene> {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph || ref.kind !== "logseq" || graphIdentity(graph) !== ref.graphId) throw new Error("这条记录不在当前图谱");
    if (ref.sourceKind === "block") {
      const block = await logseq.Editor.getBlock(ref.rootUuid);
      if (!block) throw new Error("找不到原块");
      return blockScene(ref.graphId, block, title);
    }
    let page = await logseq.Editor.getPage(ref.rootUuid).catch(() => null);
    if (!page) {
      const source = await logseq.Editor.getBlock(ref.rootUuid).catch(() => null);
      if (source?.page?.id) page = await logseq.Editor.getPage(source.page.id);
    }
    if (!page && pageTitle) page = await logseq.Editor.getPage(pageTitle);
    if (!page) throw new Error("找不到原页");
    return pageScene(ref.graphId, page);
  }

  async open(target: StageWorkTarget): Promise<boolean> {
    if (this.flow.isComposing) return false;
    const request = ++this.navigation;
    const from = this.flow.document?.defaultView?.location.hash;
    const scene = await this.sceneForRef(target.workRef, target.pageTitle ?? target.title, target.title);
    const stop = await this.readStop(scene);
    if (this.flow.isComposing || this.disposed || request !== this.navigation || this.flow.document?.defaultView?.location.hash !== from) return false;
    this.visited.add(sceneKey(scene));
    if (!this.routeMatches(scene)) await logseq.App.pushState("page", { name: scene.routeName });
    if (request !== this.navigation || this.disposed) return false;
    this.setCurrent(scene);
    this.stop = stop;
    this.update(scene, stop);

    const anchor = target.lastBlockUuid ?? this.recentAnchor(scene) ?? stop?.anchor ?? (scene.kind === "block" ? scene.uuid : null);
    if (anchor) await this.returnToAnchor({ uuid: anchor }, scene);
    return true;
  }

  async openJournal(): Promise<boolean> {
    const graph = await logseq.App.getCurrentGraph();
    const today = journalDayFromMs(Date.now());
    const page = (await logseq.Editor.getAllPages() ?? []).find((item) => item["journal?"] && item.journalDay === today);
    if (this.flow.isComposing || this.disposed || !graph) return false;
    if (page) return this.open({ workRef: { kind: "logseq", graphId: graphIdentity(graph), sourceKind: "page", rootUuid: page.uuid }, title: page.originalName ?? page.name });
    await logseq.App.pushState("home");
    await this.sync();
    return true;
  }

  private async children(scene: PaperScene): Promise<BlockEntity[]> {
    if (scene.kind === "page") return await logseq.Editor.getPageBlocksTree(scene.routeName) ?? [];
    if (scene.kind === "journals") return [];
    const block = await logseq.Editor.getBlock(scene.uuid, { includeChildren: true });
    return (block?.children ?? []).filter((child): child is BlockEntity => !Array.isArray(child));
  }

  private async readStop(scene: PaperScene): Promise<PaperStop | null> {
    for (const block of await this.children(scene)) {
      const stop = parseStop(block);
      if (stop) return stop;
    }
    return null;
  }

  private async stabilizeAnchor(anchorUuid: string, scene: PaperScene): Promise<void> {
    const isDbGraph = await currentGraphIsDb(logseq.App);
    if (isDbGraph) return;
    const uuids = new Set([anchorUuid, ...(scene.kind === "block" ? [scene.uuid] : [])]);
    for (const uuid of uuids) {
      const block = await logseq.Editor.getBlock(uuid);
      if (typeof block?.content !== "string" || block.properties?.id === uuid) continue;
      await ensurePersistentSourceIdentity({
        getBlock: id => logseq.Editor.getBlock(id),
        upsertBlockProperty: async (id, property, value) => {
          const current = await logseq.App.getCurrentGraph();
          if (!current || graphIdentity(current) !== scene.graphId || this.flow.isComposing) throw new Error("停笔行所在图谱已切换");
          await logseq.Editor.upsertBlockProperty(id, property, value);
        },
      }, { uuid, content: block.content, isDbGraph });
    }
  }

  async prepareDraft(uuid: string, scene: PaperScene | null): Promise<string | undefined> {
    if (scene && !this.flow.isComposing) await this.stabilizeAnchor(uuid, scene);
    return (await logseq.Editor.getBlock(uuid))?.content?.split("\n", 1)[0]?.trim().slice(0, 160);
  }

  async saveStop(scene: PaperScene | null, text: string, anchor: PaperAnchor | null): Promise<void> {
    if (!scene || this.flow.isComposing) return;
    if (scene.kind === "journals") {
      const today = journalDayFromMs(Date.now());
      const page = (await logseq.Editor.getAllPages() ?? []).find((item) => item["journal?"] && item.journalDay === today);
      if (!page) return;
      scene = pageScene(scene.graphId, page);
    }
    if (anchor) await this.stabilizeAnchor(anchor.uuid, scene);
    const stop = await this.readStop(scene);
    if (this.flow.isComposing || graphIdentity(await logseq.App.getCurrentGraph()) !== scene.graphId || this.flow.isComposing) return;
    const content = `上次停点 · ${text}\n${STOP_PROPERTY}:: ${anchor?.uuid ?? stop?.anchor ?? "true"}`;
    let uuid = stop?.uuid;
    if (uuid) {
      await logseq.Editor.updateBlock(uuid, content);
    } else if (scene.kind === "page") {
      uuid = (await logseq.Editor.prependBlockInPage(scene.routeName, content))?.uuid;
    } else {
      const first = (await this.children(scene))[0];
      if (this.flow.isComposing) return;
      const options = { sibling: Boolean(first), before: Boolean(first), focus: false };
      uuid = (await logseq.Editor.insertBlock(first?.uuid ?? scene.uuid, content, options))?.uuid;
    }
    if (!uuid) throw new Error("停点块写入失败");
    if (this.current && sceneKey(this.current) === sceneKey(scene)) {
      this.stop = { uuid, text, ...(anchor?.uuid ? { anchor: anchor.uuid } : {}) };
      this.update(this.current, this.stop);
    }
  }

  private onNativeClick = (event: MouseEvent) => {
    const anchor = this.stop?.anchor;
    const target = event.target as Element | null;
    if (!anchor || this.flow.isComposing || target?.closest?.(".block-content")?.closest(".ls-block")?.getAttribute("blockid") !== this.stop?.uuid) return;
    event.preventDefault();
    event.stopPropagation();
    void this.returnToAnchor({ uuid: anchor });
  };

  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.unsubscribe?.();
    this.flow.document?.removeEventListener("click", this.onNativeClick, true);
    this.setCurrent(null);
  }
}
