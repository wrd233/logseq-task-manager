import { safeMarkdownURI } from "../materials/links.ts";
import DOMPurify from "dompurify";
import { marked } from "./vendor/marked.js";
import { button, element } from "../../host/panel-host.ts";
import { displayLevel, levels } from "./display.mjs";
import { workObject } from "./focus.mjs";
import { indent, type SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";
import { composeWorkView, type ComposedView } from "./view-composer.ts";
import type { ReviewChange } from "./review-port.ts";

interface Actions {
  operation(op: Record<string, unknown>): void;
  toggle(name: "collapsed" | "expanded", uuid: string): void;
  raw(uuid: string): void;
  locate(uuid: string): void;
  enter(uuid: string): void;
  range(uuid: string): void;
  repaint(): void;
  reviewEdit?(uuid: string, container: HTMLElement, suggest: boolean): void;
}
interface Entry {
  node: HTMLElement; grip: HTMLButtonElement; fold: HTMLButtonElement; body: HTMLElement;
  select: HTMLSelectElement; controls: HTMLElement; enter?: HTMLButtonElement; raw?: HTMLElement; content?: string;
  menu: HTMLDetailsElement; summary: HTMLElement; expand: HTMLButtonElement; indent: HTMLButtonElement; outdent: HTMLButtonElement; range: HTMLButtonElement;
  review?: HTMLElement; editor?: HTMLElement; reviewSignature?: string; bodySignature?: string;
}
export interface ReadingBookmark {
  uuid: string | null; offset: number; scrollTop: number; fallback: string[]; focused: HTMLElement | null;
  selection?: { range: Range; contents: Array<[string, string | undefined]> };
}

/** The map belongs to one Graph/root, contains only current items, and owns stable UUID callbacks. */
export class WorkViewRenderer {
  private readonly entries = new Map<string, Entry>();
  private layout: Array<{ uuid: string; depth: number }> = [];
  private composingUuid: string | null = null;
  private historical = false;
  get composing(): boolean { return this.composingUuid !== null; }
  constructor(private readonly container: HTMLElement, private readonly actions: Actions) {
    container.addEventListener("click", event => {
      for (const entry of this.entries.values()) if (entry.menu.open && !entry.menu.contains(event.target as Node)) this.closeMenu(entry);
    });
  }

  private closeMenu(entry: Entry): void {
    const restore = entry.menu.contains(document.activeElement);
    entry.menu.open = false;
    if (restore) entry.summary.focus({ preventScroll: true });
  }

  private create(uuid: string): Entry {
    const node = element("article", "", "wb-row"); node.dataset.uuid = uuid; node.tabIndex = -1;
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
    const menu = element("details", "", "wb-row-menu"), summary = element("summary", "⋯");
    summary.setAttribute("aria-label", "条目操作"); summary.title = "条目操作";
    menu.append(summary, controls);
    menu.addEventListener("toggle", () => {
      if (menu.open) for (const entry of this.entries.values()) if (entry.menu !== menu && entry.menu.open) this.closeMenu(entry);
    });
    const select = element("select"); select.setAttribute("aria-label", "展示级别");
    const labels = ["自动", "强调", "正常", "弱化", "压缩"];
    levels.forEach((level, i) => { const option = element("option", labels[i] ?? level); option.value = level; select.append(option); });
    select.onchange = () => this.actions.operation({ type: "display", uuid, level: select.value });
    const expand = button("全文 / 收起", () => this.actions.toggle("expanded", uuid));
    const indent = button("增加视图缩进", () => this.actions.operation({ type: "indent", uuid, delta: 1 }));
    const outdent = button("减少视图缩进", () => this.actions.operation({ type: "indent", uuid, delta: -1 }));
    const range = button("只看此处", () => this.actions.range(uuid));
    controls.append(select, expand, button("在 Logseq 中打开", () => this.actions.locate(uuid)), button("查看 Markdown 原文", () => this.actions.raw(uuid)), range, indent, outdent);
    node.append(grip, fold, body, menu);
    node.addEventListener("click", event => {
      if (!(event.target as HTMLElement).closest("button,select,a,input,textarea,details") && !this.composing && !this.historical) this.actions.operation({ type: "focus", uuid });
    });
    node.addEventListener("compositionstart", () => { this.composingUuid = uuid; });
    node.addEventListener("compositionend", () => { this.composingUuid = null; queueMicrotask(() => this.actions.repaint()); });
    node.onkeydown = event => {
      if (event.key === "Escape" && menu.open && !event.isComposing && !this.composing) {
        event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus({ preventScroll: true }); return;
      }
      if (event.isComposing || this.composing || this.historical) return;
      if ((event.target as HTMLElement).closest("button,summary,select,a,input,textarea,[contenteditable=true]")) return;
      if (event.key === "Tab") { event.preventDefault(); this.actions.operation({ type: "indent", uuid, delta: event.shiftKey ? -1 : 1 }); }
    };
    return { node, grip, fold, body, select, controls, menu, summary, expand, indent, outdent, range };
  }

  render(rows: SourceRow[], state: ViewPresentation, rawBodies: ReadonlySet<string>, composition?: ComposedView, review?: {changes: ReadonlyMap<string,ReviewChange>; historical: boolean}): void {
    this.historical=!!review?.historical;
    const view = composition ?? composeWorkView(rows, state);
    this.layout = state.items.map(item => ({ ...item }));
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
    let cursor = this.container.firstElementChild;
    view.items.forEach((item, index) => {
      const row = source.get(item.uuid); if (!row) return;
      let entry = this.entries.get(item.uuid);
      if (!entry) { entry = this.create(item.uuid); this.entries.set(item.uuid, entry); }
      const { hidden, folded, child } = item;
      const change=review?.changes.get(item.uuid);
      if (entry.node.hidden !== hidden) entry.node.hidden = hidden;
      entry.node.classList.toggle("selected", state.selected === item.uuid);
      entry.node.classList.toggle("wb-lens-emphasis", item.emphasis);
      entry.node.classList.toggle("wb-lens-context", view.focused && !item.emphasis);
      if (entry.node.style.getPropertyValue("--depth") !== String(item.depth)) entry.node.style.setProperty("--depth", String(item.depth));
      const level = displayLevel(row.content, state.overrides[item.uuid], { root: index === 0, missing: !!row.missing }).level;
      if (entry.node.dataset.display !== level) entry.node.dataset.display = level;
      entry.grip.disabled = index === 0 || this.historical; entry.fold.disabled = !child || this.historical;
      entry.grip.style.visibility = index === 0 || this.historical ? "hidden" : "";
      entry.fold.style.visibility = child ? "" : "hidden";
      const foldLabel = child ? folded ? "▸" : "▾" : "";
      if (entry.fold.textContent !== foldLabel) entry.fold.textContent = foldLabel;
      entry.fold.setAttribute("aria-label", folded ? "展开子项" : "折叠子项");
      entry.body.classList.toggle("expanded", item.full || state.expanded.includes(item.uuid));
      entry.select.disabled = this.historical;
      entry.expand.hidden = level !== "compact"; entry.expand.disabled = this.historical || item.full;
      entry.indent.disabled = index === 0 || this.historical || JSON.stringify(indent(state.items,item.uuid,1)) === JSON.stringify(state.items);
      entry.outdent.disabled = index === 0 || item.depth <= 1 || this.historical;
      entry.range.disabled = this.historical;
      const inline=change?.inline&&change.after===row.content?change.inline:null;
      const bodySignature=JSON.stringify([row.content,inline]);
      if (!hidden && this.composingUuid !== item.uuid && entry.bodySignature !== bodySignature) {
        const selection = document.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          if (entry.body.contains(range.startContainer) || entry.body.contains(range.endContainer)) selection.removeAllRanges();
        }
        if(inline){
          const mark=element("mark",inline.inserted);mark.className="wb-review-insert";
          const text=element("div");text.style.whiteSpace="pre-wrap";text.append(document.createTextNode(inline.prefix),mark,document.createTextNode(inline.suffix));entry.body.replaceChildren(text);
        }else entry.body.innerHTML = DOMPurify.sanitize(marked.parse(row.content.replace(/^\s*id::[^\n]*(?:\n|$)/gm, ""), { breaks: true }) as string, { ALLOWED_URI_REGEXP: safeMarkdownURI, FORBID_TAGS: ["img", "iframe", "style", "input", "button"], FORBID_ATTR: ["style"] });
        entry.content = row.content;
        entry.bodySignature=bodySignature;
      }
      entry.node.classList.toggle("wb-review-change",!!change);
      entry.node.classList.toggle("wb-review-history",!!review?.historical);
      const reviewSignature=JSON.stringify([change,!!review?.historical,change?change.after===row.content:null]);
      if(entry.reviewSignature!==reviewSignature&&this.composingUuid!==item.uuid){
        if(change){
          if(!entry.editor){entry.editor=element("div","","wb-review-editor");entry.node.append(entry.editor);}
          if(!entry.review){entry.review=element("div","","wb-review-info");entry.node.append(entry.review);}
          const label=element("span",change.label.split(" · ")[0]);
          const correct=()=>this.actions.reviewEdit?.(item.uuid,entry!.editor!,false);
          const suggest=()=>this.actions.reviewEdit?.(item.uuid,entry!.editor!,true);
          const details=element("details"),summary=element("summary","旧文与来源");
          const old=change.before?.replace(/^\s*id::[^\n]*(?:\n|$)/gm,"")??"当时没有此块";
          details.append(summary,element("small",change.label));
          if(change.inline&&change.before!==null){
            const inline=change.inline,removed=old.slice(inline.prefix.length,old.length-inline.suffix.length);
            const previous=element("pre");previous.append(document.createTextNode(inline.prefix),element("del",removed),document.createTextNode(inline.suffix));details.append(previous);
          }else details.append(element("pre",old));
          entry.review.replaceChildren(label,button(review?.historical?"在当前内容中纠正":"修改",correct),button("建议",suggest),details);
          if(change.problem)entry.review.append(element("small",change.problem,"wb-error"));
          if(change.after!==row.content&&!review?.historical){
            const submitted=element("details");submitted.append(element("summary","当时提交的结果"),element("pre",change.after??"当时没有可读结果"));
            entry.review.append(element("small","当前原文已不同于当时结果；修改将重新读取当前版本。"),submitted);
          }
          entry.review.hidden=false;
          entry.body.onclick=event=>{if(!(event.target as HTMLElement).closest("a,button")&&!this.composing){event.stopPropagation();correct();}};
        }else{if(entry.review)entry.review.hidden=true;entry.body.onclick=null;}
        entry.reviewSignature=reviewSignature;
      }
      const override = state.overrides[item.uuid] ?? "auto";
      if (entry.select.value !== override) entry.select.value = override;
      const canEnter = index !== 0 && !this.historical && !!workObject(row.content);
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

  bookmark(): ReadingBookmark {
    const bounds = this.container.getBoundingClientRect();
    const anchor = Array.from(this.container.children).find(value => {
      const node = value as HTMLElement, rect = node.getBoundingClientRect();
      return !node.hidden && rect.bottom > bounds.top && rect.top < bounds.bottom;
    }) as HTMLElement | undefined;
    const uuid = anchor?.dataset.uuid ?? null, fallback: string[] = [];
    if (uuid) {
      const at = this.layout.findIndex(item => item.uuid === uuid); let depth = this.layout[at]?.depth ?? 0;
      for (let index = at - 1; index >= 0; index--) {
        const item = this.layout[index]!;
        if (item.depth < depth) { fallback.push(item.uuid); depth = item.depth; }
      }
    }
    const focused = document.activeElement as HTMLElement | null;
    const bookmark: ReadingBookmark = { uuid, offset: anchor ? anchor.getBoundingClientRect().top - bounds.top : 0, scrollTop: this.container.scrollTop, fallback, focused: focused && this.container.contains(focused) ? focused : null };
    const selected = document.getSelection();
    if (selected?.rangeCount) {
      const range = selected.getRangeAt(0);
      if (this.container.contains(range.startContainer) && this.container.contains(range.endContainer)) {
        const contents: Array<[string, string | undefined]> = [];
        for (const [id, entry] of this.entries) if (entry.body.contains(range.startContainer) || entry.body.contains(range.endContainer)) contents.push([id, entry.content]);
        bookmark.selection = { range: range.cloneRange(), contents };
      }
    }
    return bookmark;
  }
  restore(bookmark: ReadingBookmark, preferred: readonly string[] = []): void {
    const visible = (uuid: string) => { const node = this.entries.get(uuid)?.node; return node && node.isConnected && !node.hidden ? node : null; };
    const original = bookmark.uuid ? visible(bookmark.uuid) : null;
    const node = original ?? [...preferred, ...bookmark.fallback].map(visible).find(Boolean);
    if (node) this.container.scrollTop += node.getBoundingClientRect().top - this.container.getBoundingClientRect().top - (original ? bookmark.offset : 0);
    else this.container.scrollTop = bookmark.scrollTop;
    if (bookmark.focused?.isConnected && !bookmark.focused.closest("[hidden]")) bookmark.focused.focus({ preventScroll: true });
    else if (this.container.parentElement?.contains(document.activeElement) && document.activeElement?.closest("[hidden]")) {
      (node ?? Array.from(this.container.children).find(value => !(value as HTMLElement).hidden) as HTMLElement | undefined)?.focus({ preventScroll: true });
    }
    const selection = bookmark.selection;
    if (selection && selection.range.startContainer.isConnected && selection.range.endContainer.isConnected && selection.contents.every(([id, content]) => visible(id) && this.entries.get(id)?.content === content)) {
      const current = document.getSelection(); current?.removeAllRanges(); current?.addRange(selection.range);
    }
  }
  clear(): void { this.entries.clear(); this.layout = []; this.composingUuid = null; this.container.replaceChildren(); }
}
