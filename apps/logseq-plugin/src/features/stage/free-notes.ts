import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";
import { graphIdentity } from "../../graph-adapter.ts";
import { journalDayFromMs } from "../agent-workspace/journal-inbox.ts";
import type { PaperAnchor } from "./flow-mode.ts";
import type { PaperScene, PaperSceneController } from "./paper-scene.ts";

const heading = "自由随记";
type NoteScope = PaperScene & { journalPage?: string };

interface NoteBlock { uuid: string; content: string; marked?: boolean }
export interface FreeNotesPort {
  roots(scope: NoteScope): Promise<NoteBlock[]>;
  children(parent: string): Promise<NoteBlock[]>;
  createParent(scope: NoteScope): Promise<NoteBlock>;
  append(parent: string, content: string): Promise<NoteBlock>;
  update(uuid: string, content: string): Promise<void>;
  isEditing(uuid: string): Promise<boolean>;
  checkGraph(scope: NoteScope): Promise<void>;
}

export interface FloatingRow {
  uuid?: string;
  base: string;
  saved: string;
  value: string;
}

const draftRow = (block?: NoteBlock): FloatingRow => ({
  ...(block ? { uuid: block.uuid } : {}),
  base: block?.content ?? "", saved: block?.content ?? "", value: block?.content ?? "",
});

export class FreeNotesStore {
  private pending = Promise.resolve<unknown>(undefined);

  constructor(private readonly port: FreeNotesPort) {}

  enqueue<T>(write: () => Promise<T>): Promise<T> {
    const next = this.pending.then(write);
    this.pending = next.catch(() => undefined);
    return next;
  }

  async findParent(scope: NoteScope): Promise<NoteBlock | undefined> {
    return (await this.port.roots(scope)).find((block) => block.content.split("\n", 1)[0]?.trim() === heading);
  }

  append(scope: NoteScope, text: string): Promise<NoteBlock> {
    return this.enqueue(async () => {
      await this.port.checkGraph(scope);
      let parent = await this.findParent(scope);
      await this.port.checkGraph(scope);
      parent ??= await this.port.createParent(scope);
      await this.port.checkGraph(scope);
      return this.port.append(parent.uuid, text);
    });
  }

  async read(scope: NoteScope, parent: string): Promise<FloatingRow[]> {
    await this.port.checkGraph(scope);
    return (await this.port.children(parent)).map(draftRow);
  }

  sync(scope: NoteScope, parent: string, rows: FloatingRow[]): Promise<boolean> {
    return this.enqueue(async () => {
      if (!rows.some((row) => row.value !== row.saved)) return false;
      await this.port.checkGraph(scope);
      if ((await this.findParent(scope))?.uuid !== parent) throw new Error("原随记块已移动，草稿仍在悬浮窗");
      let forked = false;
      for (const row of rows) {
        const value = row.value;
        if (value === row.saved || (!row.uuid && !value.trim())) continue;
        const editing = row.uuid ? await this.port.isEditing(row.uuid) : false;
        const current = row.uuid ? (await this.port.children(parent)).find((block) => block.uuid === row.uuid) : undefined;
        await this.port.checkGraph(scope);
        if (row.uuid && current?.content === row.base && !editing) {
          await this.port.update(row.uuid, value);
          row.base = (await this.port.children(parent)).find((block) => block.uuid === row.uuid)?.content ?? value;
        } else {
          const added = await this.port.append(parent, value);
          forked ||= Boolean(row.uuid);
          row.uuid = added.uuid;
          row.base = added.content;
        }
        row.saved = value;
      }
      return forked;
    });
  }
}

export class FloatingNotesBuffer {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly commit: () => Promise<boolean>,
    private readonly onResult: (forked: boolean) => void,
    private readonly onError: (error: unknown) => void,
    private readonly delay = 500,
  ) {}

  changed(): void {
    this.cancel();
    this.timer = setTimeout(() => { void this.flush().catch(this.onError); }, this.delay);
  }

  async flush(): Promise<void> {
    this.cancel();
    const forked = await this.commit();
    this.onResult(forked);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

const freeNotesCss = `
.tc-free-tools { display: inline-flex; align-self: start; flex: none; margin-inline-start: 10px; opacity: 0; pointer-events: none; transition: opacity 150ms ease; }
.block-main-container:hover > .tc-free-tools, .tc-free-tools:focus-within { opacity: 1; pointer-events: auto; }
.tc-free-tools button, .tc-free-pad button { padding: 3px 5px; border: 0; background: transparent; color: var(--ls-secondary-text-color, #626872); font: inherit; font-size: 12px; cursor: pointer; }
.tc-free-tools button:hover, .tc-free-pad button:hover, .tc-free-tools button:focus-visible { color: var(--ls-link-text-color, #316292); }
.tc-free-pad, .tc-free-blind {
  position: fixed; z-index: 10005; padding: 12px 16px; border-top: 1px solid var(--ls-border-color, #dad6cb);
  background: var(--ls-primary-background-color, #faf9f5); color: var(--ls-primary-text-color, #1e2124);
  -webkit-app-region: no-drag;
}
.tc-free-blind { inset: 24vh auto auto 50%; transform: translateX(-50%); width: min(520px, calc(100vw - 30px)); }
.tc-free-pad { right: 30px; bottom: 52px; width: min(370px, calc(100vw - 24px)); }
.tc-free-pad header { display: flex; justify-content: space-between; gap: 8px; align-items: center; cursor: move; touch-action: none; font-size: 13px; padding-bottom: 7px; }
.tc-free-pad-lines { display: grid; gap: 10px; max-height: 55vh; overflow-y: auto; }
.tc-free-pad textarea, .tc-free-blind input {
  box-sizing: border-box; width: 100%; min-width: 0; border: 0; border-bottom: 1px solid var(--ls-border-color, #dad6cb);
  background: transparent; color: inherit; font: inherit; line-height: 1.65; outline: 0; padding: 3px 0;
}
.tc-free-pad textarea { min-height: 30px; resize: vertical; }
.tc-free-pad textarea:focus, .tc-free-blind input:focus { border-bottom-color: var(--ls-link-text-color, #316292); }
.tc-free-pad-status { margin-top: 6px; color: var(--ls-secondary-text-color, #626872); font-size: 12px; }
@media (hover: none) { .tc-free-tools { opacity: 1; pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) { .tc-free-tools { transition: none; } }
`;

const markProperty = "agent-ready";
const noteBlock = (block: BlockEntity): NoteBlock => ({
  uuid: block.uuid,
  content: block.content ?? "",
  marked: block.properties?.[markProperty] === true || block.properties?.agentReady === true ||
    /^agent-ready::\s*true\s*$/mu.test(block.content ?? ""),
});

async function directChildren(uuid: string): Promise<NoteBlock[]> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  return (block?.children ?? []).filter((child): child is BlockEntity => !Array.isArray(child)).map(noteBlock);
}

async function graphCheck(scope: NoteScope): Promise<void> {
  const graph = await logseq.App.getCurrentGraph();
  if (!graph || graphIdentity(graph) !== scope.graphId) throw new Error("自由随记所在图谱已切换");
}

async function journalName(): Promise<string | null> {
  const today = journalDayFromMs(Date.now());
  const page = (await logseq.Editor.getAllPages() ?? []).find((item) => item["journal?"] && item.journalDay === today);
  return page ? page.originalName ?? page.name : null;
}

function expectBlock(block: BlockEntity | null): NoteBlock {
  if (!block) throw new Error("自由随记写入失败");
  return noteBlock(block);
}

interface OpenPad {
  root: HTMLElement;
  scope: NoteScope;
  parent: string;
  anchor: PaperAnchor | null;
  buffer: FloatingNotesBuffer;
  closing: boolean;
}

export class FreeNotesController {
  private readonly doc: Document | null;
  private readonly style: HTMLStyleElement | undefined;
  private readonly store: FreeNotesStore;
  private observer: MutationObserver | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe?: () => void;
  private palette?: () => void;
  private tools: HTMLElement | null = null;
  private blind: HTMLElement | null = null;
  private failedText = "";
  private pad: OpenPad | null = null;
  private active = true;

  constructor(private readonly paper: PaperSceneController, private readonly notify: (error: unknown) => void) {
    this.doc = paper.flow.document;
    this.store = new FreeNotesStore({
      checkGraph: graphCheck,
      roots: async scope => {
        if (scope.kind === "block") return directChildren(scope.uuid);
        const page = scope.kind === "journals" ? scope.journalPage : scope.routeName;
        return page ? (await logseq.Editor.getPageBlocksTree(page) ?? []).map(noteBlock) : [];
      },
      children: directChildren,
      createParent: async scope => {
        const options = { sibling: false, end: true, focus: false, properties: {} };
        if (scope.kind === "block") return expectBlock(await logseq.Editor.insertBlock(scope.uuid, heading, options));
        const name = scope.kind === "journals" ? scope.journalPage : scope.routeName;
        if (!name) throw new Error("请先打开今日日记");
        return expectBlock(await logseq.Editor.appendBlockInPage(name, heading, options));
      },
      append: async (parent, content) => {
        const options = { sibling: false, end: true, focus: false };
        return expectBlock(await logseq.Editor.insertBlock(parent, content, options));
      },
      update: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
      isEditing: async uuid => {
        const editing = await logseq.Editor.checkEditing();
        return editing === true || editing === uuid;
      },
    });
    if (this.doc) {
      this.style = this.doc.createElement("style");
      this.style.textContent = freeNotesCss;
      this.doc.head.append(this.style);
    }
  }

  start(): void {
    if (!this.doc) return;
    const removePalette = logseq.App.registerCommandPalette({ key: "paper-free-notes", label: "自由随记" }, () => this.openBlind());
    if (typeof removePalette === "function") this.palette = removePalette;
    this.doc.addEventListener("keydown", this.onShortcut, true);
    const unsubscribe = logseq.App.onRouteChanged?.(() => this.queueToolsRefresh());
    if (typeof unsubscribe === "function") this.unsubscribe = unsubscribe;
    const HostObserver = this.doc.defaultView?.MutationObserver;
    if (HostObserver) {
      this.observer = new HostObserver((entries) => {
        if (entries.some(({ target }) => (target as Element).closest?.("#main-content-container") && !(target as Element).closest?.(".tc-free-tools"))) this.queueToolsRefresh();
      });
      this.observer.observe(this.doc.body, { childList: true, subtree: true });
    }
    this.queueToolsRefresh();
  }

  private onShortcut = (event: KeyboardEvent) => {
    if (event.isComposing || this.paper.flow.isComposing || event.repeat || event.defaultPrevented) return;
    const setting: unknown = logseq.settings?.freeNotesShortcut ?? "mod+.";
    if (typeof setting !== "string" || !setting.trim()) return;
    const keys = setting.toLowerCase().split("+").map(key => key.trim());
    const key = keys.pop();
    if (key !== event.key.toLowerCase() && !(key === "." && event.code === "Period")) return;
    const modifiersMatch = event.altKey === keys.includes("alt") && event.shiftKey === keys.includes("shift") &&
      (keys.includes("mod") ? event.ctrlKey !== event.metaKey : event.metaKey === keys.includes("cmd") && event.ctrlKey === keys.includes("ctrl"));
    if (!modifiersMatch || (event.target as Element | null)?.closest?.(".tc-free-pad, .tc-free-blind, .tcs-lsq-focus-slip")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.openBlind();
  };

  private async currentScope(): Promise<NoteScope | null> {
    const scene = await this.paper.readCurrent();
    if (scene?.kind !== "journals") return scene;
    const journalPage = await journalName();
    return journalPage ? { ...scene, journalPage } : null;
  }

  private openBlind(): void {
    const doc = this.doc;
    if (!doc || !this.active || this.blind || this.paper.flow.isComposing) return;
    const route = doc.defaultView?.location.hash;
    if (route && route !== "#/" && route !== "#/journals" && !route.startsWith("#/page/")) return;
    const anchor = this.paper.flow.captureAnchor();
    const scope = this.currentScope().catch(() => null);
    const strip = doc.createElement("div");
    strip.className = "tc-free-blind";
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", heading);
    input.placeholder = "记下一句";
    input.value = this.failedText;
    strip.append(input);
    this.blind = strip;
    doc.body.append(strip);
    input.focus();

    input.addEventListener("keydown", (event) => {
      if (event.isComposing || this.paper.flow.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
      event.preventDefault();
      event.stopPropagation();
      const text = input.value;
      strip.remove();
      this.blind = null;
      this.failedText = "";
      void scope.then(async scene => {
        if (event.key === "Enter" && text.trim()) {
          if (!scene || !this.active) throw new Error("当前未打开可记笔记的页面");
          await this.store.append(scene, text);
          this.queueToolsRefresh();
          // Native insertions finish reconciling the outline on the next frame.
          await new Promise<void>(resolve => setTimeout(resolve, 60));
        }
        if (!this.blind && !this.pad?.root.contains(doc.activeElement)) await this.paper.returnToAnchor(anchor, scene, false);
      }).catch(error => {
        this.failedText = text;
        this.notify(error);
      });
    });
  }

  private queueToolsRefresh(): void {
    if (!this.active || this.refreshTimer !== undefined) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshTools().catch(() => undefined);
    }, 90);
  }

  private async refreshTools(): Promise<void> {
    const doc = this.doc;
    if (!doc || !this.active) return;
    const route = doc.defaultView?.location.hash;
    const scope = await this.currentScope();
    const parent = scope ? await this.store.findParent(scope) : undefined;
    if (!this.active || route !== doc.defaultView?.location.hash) return;
    if (!scope || !parent) { this.tools?.remove(); this.tools = null; return; }
    const row = this.paper.flow.findBlock(parent.uuid)?.querySelector(".block-main-container");
    if (this.tools?.parentElement === row) return;
    this.tools?.remove();
    this.tools = null;
    if (!row) return;
    const tools = doc.createElement("span");
    tools.className = "tc-free-tools";
    tools.addEventListener("pointerdown", event => event.preventDefault());
    const mark = this.button(parent.marked ? "已标给 Agent" : "标给 Agent", "mark");
    const floating = this.button("悬浮", "float");
    mark.addEventListener("click", event => {
      event.stopPropagation();
      if (this.paper.flow.isComposing) return;
      void this.store.enqueue(async () => {
        await graphCheck(scope);
        const live = await this.store.findParent(scope);
        if (!live || live.uuid !== parent.uuid) return;
        if (live.marked) await logseq.Editor.removeBlockProperty(parent.uuid, markProperty);
        else await logseq.Editor.upsertBlockProperty(parent.uuid, markProperty, true);
        mark.textContent = live.marked ? "标给 Agent" : "已标给 Agent";
      }).catch(this.notify);
    });
    floating.addEventListener("click", event => {
      event.stopPropagation();
      if (!this.paper.flow.isComposing) void this.openPad(scope, parent.uuid).catch(this.notify);
    });
    tools.append(mark, floating);
    row.append(tools);
    this.tools = tools;
  }

  private button(label: string, action: string): HTMLButtonElement {
    const button = this.doc!.createElement("button");
    button.type = "button";
    button.dataset.freeAction = action;
    button.textContent = label;
    return button;
  }

  private async openPad(scope: NoteScope, parent: string): Promise<void> {
    if (this.pad?.parent === parent) { this.pad.root.querySelector("textarea")?.focus(); return; }
    if (this.pad) await this.closePad(this.pad);
    const anchor = this.paper.flow.captureAnchor();
    const rows = await this.store.read(scope, parent);
    if (!this.active || this.pad || this.paper.flow.isComposing) return;
    const doc = this.doc!;
    const root = doc.createElement("section");
    root.className = "tc-free-pad";
    root.setAttribute("aria-label", heading);
    const header = doc.createElement("header");
    const title = doc.createElement("span");
    title.textContent = heading;
    const actions = doc.createElement("div");
    const dock = this.button("贴回页内", "dock");
    const close = this.button("关闭", "close");
    actions.append(dock, close);
    header.append(title, actions);
    const lines = doc.createElement("div");
    lines.className = "tc-free-pad-lines";
    const status = doc.createElement("div");
    status.className = "tc-free-pad-status";
    status.setAttribute("role", "status");
    const buffer = new FloatingNotesBuffer(
      () => this.store.sync(scope, parent, rows),
      forked => { if (forked) status.textContent = "原块已更新，已把这段另存为随记"; },
      error => { status.textContent = error instanceof Error ? error.message : "随记尚未写回"; },
    );
    const appendLine = (row: FloatingRow, isNew = false) => {
      const input = doc.createElement("textarea");
      input.setAttribute("aria-label", isNew ? "补一条随记" : "编辑随记");
      input.rows = Math.max(1, Math.min(4, row.value.split("\n").length));
      input.value = row.value;
      if (isNew) input.placeholder = "补一条";
      input.addEventListener("input", (event) => {
        row.value = input.value;
        if (!(event as InputEvent).isComposing && !this.paper.flow.isComposing) buffer.changed();
      });
      input.addEventListener("compositionstart", () => buffer.cancel());
      input.addEventListener("compositionend", () => buffer.changed());
      if (isNew) input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || this.paper.flow.isComposing || !input.value.trim()) return;
        event.preventDefault();
        event.stopPropagation();
        input.placeholder = "";
        input.setAttribute("aria-label", "编辑随记");
        if (input === lines.lastElementChild) {
          const next = draftRow();
          rows.push(next);
          appendLine(next, true).focus();
        }
      });
      lines.append(input);
      return input;
    };
    rows.forEach(row => appendLine(row));
    const extra = draftRow();
    rows.push(extra);
    appendLine(extra, true);
    const pad: OpenPad = { root, scope, parent, anchor, buffer, closing: false };
    this.pad = pad;
    for (const button of [dock, close]) button.addEventListener("click", () => { void this.closePad(pad).catch(this.notify); });
    root.addEventListener("keydown", event => {
      if (event.key !== "Escape" || this.paper.flow.isComposing || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      void this.closePad(pad).catch(this.notify);
    });
    this.allowDrag(header, root);
    root.append(header, lines, status);
    doc.body.append(root);
    lines.querySelector("textarea")?.focus();
  }

  private allowDrag(header: HTMLElement, root: HTMLElement): void {
    let drag: { x: number; y: number; left: number; top: number } | null = null;
    header.addEventListener("pointerdown", event => {
      if (event.button !== 0 || (event.target as Element).closest("button")) return;
      const box = root.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener("pointermove", event => {
      const win = this.doc?.defaultView;
      if (!drag || !win) return;
      root.style.left = `${Math.max(0, Math.min(win.innerWidth - root.offsetWidth, drag.left + event.clientX - drag.x))}px`;
      root.style.top = `${Math.max(0, Math.min(win.innerHeight - header.offsetHeight, drag.top + event.clientY - drag.y))}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    });
    header.addEventListener("lostpointercapture", () => { drag = null; });
  }

  private async closePad(pad: OpenPad): Promise<void> {
    if (pad.closing || this.paper.flow.isComposing) return;
    pad.closing = true;
    const fields = Array.from(pad.root.querySelectorAll<HTMLTextAreaElement>("textarea"));
    fields.forEach(field => { field.disabled = true; });
    try {
      await pad.buffer.flush();
      pad.root.remove();
      if (this.pad === pad) this.pad = null;
      if (this.active) await this.paper.returnToAnchor(pad.anchor, pad.scope, false);
    } finally {
      fields.forEach(field => { field.disabled = false; });
      pad.closing = false;
    }
  }

  async dispose(): Promise<void> {
    this.active = false;
    this.unsubscribe?.();
    this.palette?.();
    this.observer?.disconnect();
    clearTimeout(this.refreshTimer);
    this.doc?.removeEventListener("keydown", this.onShortcut, true);
    this.tools?.remove();
    this.blind?.remove();
    const pad = this.pad;
    if (pad) {
      await this.closePad(pad).catch(this.notify);
      pad.buffer.cancel();
      pad.root.remove();
    }
    this.style?.remove();
  }
}
