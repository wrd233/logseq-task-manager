import DOMPurify from "dompurify";
import { marked } from "./vendor/marked.js";
import { button, element } from "../../host/panel-host.ts";
import { displayLevel, levels } from "./display.mjs";
import { workObject } from "./focus.mjs";
import type { SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";

interface Actions {
  operation(op: Record<string, unknown>): void;
  toggle(name: "collapsed" | "expanded", uuid: string): void;
  raw(uuid: string): void;
  locate(uuid: string): void;
  enter(uuid: string): void;
}
interface Entry {
  node: HTMLElement; grip: HTMLButtonElement; fold: HTMLButtonElement; body: HTMLElement;
  select: HTMLSelectElement; controls: HTMLElement; enter?: HTMLButtonElement; raw?: HTMLElement; content?: string;
}

/** The map belongs to one Graph/root, contains only current items, and owns stable UUID callbacks. */
export class WorkViewRenderer {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly container: HTMLElement, private readonly actions: Actions) {}

  private create(uuid: string): Entry {
    const node = element("article", "", "wb-row"); node.dataset.uuid = uuid; node.tabIndex = 0;
    const grip = button("⠿", () => undefined); grip.className = "wb-grip"; grip.setAttribute("aria-label", "拖动视图条目");
    let startX = 0;
    grip.onpointerdown = event => {
      if (grip.disabled) return;
      event.preventDefault(); startX = event.clientX; grip.setPointerCapture(event.pointerId);
    };
    grip.onpointerup = event => {
      if (grip.disabled) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".wb-row");
      if (target?.dataset.uuid) {
        const mode = event.clientX - startX > 24 ? "child" : event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2 ? "after" : "before";
        this.actions.operation({ type: "reorder", uuid, target: target.dataset.uuid, mode });
      }
    };
    const fold = button("·", () => this.actions.toggle("collapsed", uuid));
    const body = element("div", "", "wb-body"), controls = element("div", "", "wb-controls");
    const select = element("select"); select.setAttribute("aria-label", "展示级别");
    const labels = ["自动", "强调", "正常", "弱化", "压缩"];
    levels.forEach((level, i) => { const option = element("option", labels[i] ?? level); option.value = level; select.append(option); });
    select.onchange = () => this.actions.operation({ type: "display", uuid, level: select.value });
    controls.append(select, button("全文 / 收起", () => this.actions.toggle("expanded", uuid)), button("原文", () => this.actions.locate(uuid)), button("原始文本", () => this.actions.raw(uuid)));
    node.append(grip, fold, body, controls);
    node.onkeydown = event => {
      if ((event.target as HTMLElement).closest("button,select,a")) return;
      if (event.key === "Tab") { event.preventDefault(); this.actions.operation({ type: "indent", uuid, delta: event.shiftKey ? -1 : 1 }); }
    };
    return { node, grip, fold, body, select, controls };
  }

  render(rows: SourceRow[], state: ViewPresentation, rawBodies: ReadonlySet<string>): void {
    const focused = document.activeElement as HTMLElement | null, scroll = this.container.scrollTop;
    const bounds = this.container.getBoundingClientRect(), top = bounds.top, bottom = bounds.bottom ?? Number.POSITIVE_INFINITY;
    const anchor = Array.from(this.container.children).find(element => {
      const node = element as HTMLElement, rect = node.getBoundingClientRect();
      return !node.hidden && rect.bottom > top && rect.top < bottom;
    }) as HTMLElement | undefined;
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top - top : 0;
    const source = new Map(rows.map(row => [row.uuid, row]));
    const keep = new Set(state.items.map(item => item.uuid));
    for (const [id, entry] of this.entries) if (!keep.has(id)) { entry.node.remove(); this.entries.delete(id); }
    let hiddenDepth: number | null = null, cursor = this.container.firstElementChild;
    state.items.forEach((item, index) => {
      const row = source.get(item.uuid); if (!row) return;
      let entry = this.entries.get(item.uuid);
      if (!entry) { entry = this.create(item.uuid); this.entries.set(item.uuid, entry); }
      if (hiddenDepth !== null && item.depth <= hiddenDepth) hiddenDepth = null;
      const hidden = hiddenDepth !== null, folded = state.collapsed.includes(item.uuid);
      if (!hidden && folded) hiddenDepth = item.depth;
      const child = (state.items[index + 1]?.depth ?? -1) > item.depth;
      if (entry.node.hidden !== hidden) entry.node.hidden = hidden;
      entry.node.classList.toggle("selected", state.selected === item.uuid);
      if (entry.node.style.getPropertyValue("--depth") !== String(item.depth)) entry.node.style.setProperty("--depth", String(item.depth));
      const level = displayLevel(row.content, state.overrides[item.uuid], { root: index === 0, missing: !!row.missing }).level;
      if (entry.node.dataset.display !== level) entry.node.dataset.display = level;
      entry.grip.disabled = index === 0; entry.fold.disabled = !child;
      const foldLabel = child ? folded ? "▸" : "▾" : "·";
      if (entry.fold.textContent !== foldLabel) entry.fold.textContent = foldLabel;
      entry.fold.setAttribute("aria-label", folded ? "展开子项" : "折叠子项");
      entry.body.classList.toggle("expanded", state.expanded.includes(item.uuid));
      if (!hidden && entry.content !== row.content) {
        entry.body.innerHTML = DOMPurify.sanitize(marked.parse(row.content.replace(/^\s*id::[^\n]*(?:\n|$)/gm, ""), { breaks: true }) as string, { FORBID_TAGS: ["img", "iframe", "style", "input", "button"], FORBID_ATTR: ["style"] });
        entry.content = row.content;
      }
      const override = state.overrides[item.uuid] ?? "auto";
      if (entry.select.value !== override) entry.select.value = override;
      const canEnter = index !== 0 && !!workObject(row.content);
      if (canEnter && !entry.enter) { entry.enter = button("进入", () => this.actions.enter(item.uuid)); entry.controls.append(entry.enter); }
      if (entry.enter) entry.enter.hidden = !canEnter;
      if (rawBodies.has(item.uuid) && !entry.raw) {
        entry.raw = element("pre"); entry.raw.style.gridColumn = "3"; entry.raw.style.whiteSpace = "pre-wrap"; entry.node.append(entry.raw);
      }
      if (entry.raw) {
        entry.raw.hidden = !rawBodies.has(item.uuid);
        if (!entry.raw.hidden && entry.raw.textContent !== row.content) entry.raw.textContent = row.content;
      }
      // Do not detach unchanged nodes: focus, select and pointer capture remain on the same elements.
      if (entry.node !== cursor) this.container.insertBefore(entry.node, cursor);
      cursor = entry.node.nextElementSibling;
    });
    if (focused?.isConnected && this.container.contains(focused) && document.activeElement !== focused && !focused.closest("[hidden]")) focused.focus({ preventScroll: true });
    if (anchor?.isConnected && !anchor.hidden) {
      // Layout may already have applied the browser's scroll anchoring. Preserve that adjustment.
      const offset = anchor.getBoundingClientRect().top - top;
      this.container.scrollTop += offset - anchorOffset;
    } else this.container.scrollTop = scroll;
  }

  clear(): void { this.entries.clear(); this.container.replaceChildren(); }
}
