import { reportProjection } from "./report-body.ts";
import { highlightReview, renderMarkdown, renderReviewInfo } from "./review-renderer.ts";
import { bindOverlayMenu, button, element } from "../../host/panel-host.ts";
import { displayLevel, levels } from "./display.mjs";
import { workObject } from "./focus.mjs";
import { indent, type SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";
import { composeWorkView, type ComposedView } from "./view-composer.ts";
import type { ReviewChange } from "./review-port.ts";
import type { ReportComposition } from "./report-model.ts";
import { ReadingLayoutRenderer } from "./reading-layout.ts";

interface Actions {
  operation(op: Record<string, unknown>): void;
  toggle(name: "collapsed" | "expanded", uuid: string): void;
  raw(uuid: string): void;
  locate(uuid: string): void;
  enter(uuid: string): void;
  range(uuid: string): void;
  repaint(): void;
  reviewEdit?(uuid: string, container: HTMLElement, suggest: boolean): void;
  sources?(ids:readonly string[],context:boolean,contextIds?:readonly string[]):void;
  clearSources?():void;
  material?(id:string):void;
  fileClick?(event:MouseEvent):boolean;
}
interface Entry {
  node: HTMLElement; grip: HTMLButtonElement; fold: HTMLButtonElement; body: HTMLElement;
  select: HTMLSelectElement; controls: HTMLElement; enter?: HTMLButtonElement; raw?: HTMLElement; content?: string;
  menu: HTMLDetailsElement; summary: HTMLElement; expand: HTMLButtonElement; indent: HTMLButtonElement; outdent: HTMLButtonElement; range: HTMLButtonElement;
  nativeEdit: HTMLButtonElement;
  label: HTMLElement; disposeMenu(): void;
  compare: HTMLButtonElement;
  menuContext: HTMLElement;
  review?: HTMLElement; editor?: HTMLElement; reviewSignature?: string; bodySignature?: string;
}
export interface ReadingBookmark {
  uuid: string | null; offset: number; scrollTop: number; fallback: string[]; focused: HTMLElement | null;
  selection?: { range: Range; contents: Array<[string, string | undefined]> };
  selectionAnchors?:{start:Node;startOffset:number;end:Node;endOffset:number};
}

/** The map belongs to one Graph/root, contains only current items, and owns stable UUID callbacks. */
export class WorkViewRenderer {
  private readonly entries = new Map<string, Entry>();
  private layout: Array<{ uuid: string; depth: number }> = [];
  private composingUuid: string | null = null;
  private historical = false;
  private reporting = false;
  private readonly headings = new Map<string,HTMLElement>();
  private readonly readingLayout:ReadingLayoutRenderer;
  get composing(): boolean { return this.composingUuid !== null; }
  constructor(private readonly container: HTMLElement, private readonly actions: Actions) {
    this.readingLayout=new ReadingLayoutRenderer({sources:(ids,context,contextIds)=>this.actions.sources?.(ids,context,contextIds),material:id=>this.actions.material?.(id)});
    container.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&!event.isComposing&&!this.composing&&!this.historical&&!(event.target as HTMLElement).closest("input,textarea,[contenteditable=true]"))this.actions.clearSources?.();
    });
    container.addEventListener("click", event => {
      if(!event.defaultPrevented&&!this.historical)this.actions.fileClick?.(event);
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
    const menuContext = element("small", "", "wb-menu-context");
    summary.setAttribute("aria-label", "条目操作"); summary.title = "条目操作";
    summary.onpointerdown=event => event.preventDefault();
    menu.append(summary, controls);
    const overlay = bindOverlayMenu(menu, summary, controls);
    const label = element("h3", "", "wb-local-heading"); label.hidden = true;
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
    const nativeEdit = button("编辑原文", () => { menu.open = false; this.actions.locate(uuid); });
    nativeEdit.setAttribute("aria-label","编辑此处原文");
    nativeEdit.onpointerdown=event => event.preventDefault();
    const compare=button("查看 Markdown 原文", () => this.actions.raw(uuid));
    compare.onpointerdown=event => event.preventDefault();
    controls.append(menuContext, select, expand, nativeEdit, compare, range, indent, outdent);
    node.append(grip, fold, label, body, menu);
    node.addEventListener("click", event => {
      if(!event.defaultPrevented&&!this.historical&&this.actions.fileClick?.(event))return;
      if(event.defaultPrevented||(event.target as HTMLElement).closest("button,select,a,input,textarea,details,[contenteditable=true]")||this.composing||this.historical||document.getSelection()?.isCollapsed===false)return;
      if(this.reporting) {
        if(node.dataset.reportSourceId&&!node.classList.contains("wb-review-change")) {
          this.actions.operation({type:"focus",uuid});this.actions.sources?.([node.dataset.reportSourceId],false);
        }
      } else this.actions.operation({ type: "focus", uuid });
    });
    node.addEventListener("compositionstart", () => { this.composingUuid = uuid; });
    node.addEventListener("compositionend", () => { this.composingUuid = null; queueMicrotask(() => this.actions.repaint()); });
    node.addEventListener("dblclick",event => {
      if (this.reporting && event.altKey && !this.composing && !this.historical && !node.classList.contains("wb-review-change") && !(event.target as HTMLElement).closest("a,button,select,details,input,textarea")) this.actions.locate(uuid);
    });
    node.onkeydown = event => {
      if (event.key === "Escape" && menu.open && !event.isComposing && !this.composing && !(event.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) {
        event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus({ preventScroll: true }); return;
      }
      if (event.isComposing || this.composing || this.historical) return;
      if ((event.target as HTMLElement).closest("button,summary,select,a,input,textarea,[contenteditable=true]")) return;
      if (this.reporting) {
        if((event.key==="Enter"||event.key===" ")&&node.dataset.reportSourceId&&!node.classList.contains("wb-review-change")) {event.preventDefault();this.actions.operation({type:"focus",uuid});this.actions.sources?.([node.dataset.reportSourceId],false);}
        return;
      }
      if (event.key === "Tab") { event.preventDefault(); this.actions.operation({ type: "indent", uuid, delta: event.shiftKey ? -1 : 1 }); }
    };
    return { node, grip, fold, body, select, controls, menu, summary, expand, indent, outdent, range, menuContext, nativeEdit, compare, label, disposeMenu: overlay.dispose };
  }

  render(rows: SourceRow[], state: ViewPresentation, rawBodies: ReadonlySet<string>, composition?: ComposedView, review?: {changes: ReadonlyMap<string,ReviewChange>; historical: boolean}, report?: ReportComposition): void {
    this.historical=!!review?.historical;
    this.reporting=!!report;
    if(report){this.container.dataset.reportRange=report.coverage.range;this.container.dataset.reportAvailable=String(report.coverage.available);this.container.dataset.reportShown=String(report.coverage.shown);}
    else {delete this.container.dataset.reportRange;delete this.container.dataset.reportAvailable;delete this.container.dataset.reportShown;}
    const view = composition ?? composeWorkView(rows, state);
    const reading=this.bookmark();
    this.layout = view.items.map(item => ({uuid:item.uuid,depth:item.depth}));
    const focused = document.activeElement as HTMLElement | null;
    const bounds = this.container.getBoundingClientRect(), top = bounds.top, bottom = bounds.bottom ?? Number.POSITIVE_INFINITY;
    const anchor = this.sourceNodes().find(element => {
      const node = element as HTMLElement, rect = node.getBoundingClientRect();
      return !!node.dataset.uuid && !node.hidden && rect.bottom > top && rect.top < bottom;
    }) as HTMLElement | undefined;
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top - top : 0;
    const source = new Map(rows.map(row => [row.uuid, row]));
    const keep = new Set(view.items.map(item => item.uuid));
    for (const [id, entry] of this.entries) if (!keep.has(id)) { entry.disposeMenu(); entry.node.remove(); this.entries.delete(id); }
    const wantedHeadings=new Set(report?.headings.map(heading=>heading.key));
    for (const [key,node] of this.headings) if (!wantedHeadings.has(key)) { node.remove(); this.headings.delete(key); }
    const headings=new Map(report?.headings.map(heading=>[heading.beforeUuid,heading]));
    const fragments=new Map(report?.fragments.map(fragment=>[fragment.target.blockUuid,fragment]));
    const lastMarkers = new Map<string | null, string | null>();
    let cursor = this.container.firstElementChild;
    view.items.forEach((item, index) => {
      const row = source.get(item.uuid); if (!row) return;
      let entry = this.entries.get(item.uuid);
      if (!entry) { entry = this.create(item.uuid); this.entries.set(item.uuid, entry); }
      const { hidden, folded, child } = item;
      const heading=headings.get(item.uuid);
      if (heading) {
        let node=this.headings.get(heading.key);
        if (!node) { node=element("h2","","wb-report-section"); node.dataset.reportSection=heading.key; this.headings.set(heading.key,node); }
        if (node.textContent!==heading.title) node.textContent=heading.title;
        node.tabIndex=0;node.setAttribute("role","button");
        node.onclick=event=>{if(!event.defaultPrevented&&document.getSelection()?.isCollapsed!==false)this.actions.sources?.(heading.sourceIds,true);};
        node.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();this.actions.sources?.(heading.sourceIds,true);}};
        node.style.setProperty("--report-depth",String(heading.depth));node.setAttribute("aria-level",String(Math.min(6,heading.depth+1)));
        if (node!==cursor) this.container.insertBefore(node,cursor); cursor=node.nextElementSibling;
      }
      entry.node.classList.toggle("wb-report-row",!!report); entry.node.tabIndex=report ? 0 : -1;
      const fragment=fragments.get(item.uuid);
      if (fragment) { entry.node.dataset.reportSourceId=fragment.sourceId; entry.node.dataset.reportContentVersion=fragment.contentVersion; entry.node.dataset.reportStructureVersion=report!.structureVersion; }
      else { delete entry.node.dataset.reportSourceId; delete entry.node.dataset.reportContentVersion; delete entry.node.dataset.reportStructureVersion; }
      entry.node.toggleAttribute("data-report-root",!!report&&index===0);
      if (fragment?.objectKind) entry.node.dataset.objectKind=fragment.objectKind; else delete entry.node.dataset.objectKind;
      const projection = report && !review?.historical ? reportProjection(row.content) : null;
      const marker = projection?.marker ?? null, parent = row.sourceParent ?? null;
      const sameGroup = marker !== null && marker !== "object" && lastMarkers.get(parent) === marker;
      if (!hidden) lastMarkers.set(parent, marker);
      const groupedHeading = report?.headings.some(section => section.depth===item.depth && section.sourceIds.includes(fragment?.sourceId ?? "") && section.title===({goal:"目标",idea:"思考",note:"记录与说明",record:"记录与说明"} as Record<string,string>)[marker ?? ""]);
      const label = [!sameGroup && !groupedHeading ? projection?.label : null, projection?.task].filter(Boolean).join(" · ");
      entry.label.hidden = !label; if(entry.label.textContent!==label) entry.label.textContent=label;
      entry.body.style.gridRow = label ? "2" : "1";
      if(marker) entry.node.dataset.reportMarker=marker; else delete entry.node.dataset.reportMarker;
      entry.node.dataset.reportProjection = JSON.stringify(projection?.removed ?? []);
      const change=review?.changes.get(item.uuid);
      if (entry.node.hidden !== hidden) entry.node.hidden = hidden;
      entry.node.classList.toggle("selected", state.selected === item.uuid);
      entry.node.classList.toggle("wb-lens-emphasis", item.emphasis);
      entry.node.classList.toggle("wb-lens-context", view.focused && !item.emphasis);
      if (entry.node.style.getPropertyValue("--depth") !== String(item.depth)) entry.node.style.setProperty("--depth", String(item.depth));
      const level = displayLevel(row.content, state.overrides[item.uuid], { root: index === 0, missing: !!row.missing }).level;
      if (entry.node.dataset.display !== level) entry.node.dataset.display = level;
      entry.grip.disabled = index === 0 || this.historical || !!report; entry.fold.disabled = !child || this.historical;
      entry.grip.style.visibility = index === 0 || this.historical ? "hidden" : "";
      entry.fold.style.visibility = child ? "" : "hidden";
      const foldLabel = child ? folded ? "▸" : "▾" : "";
      if (entry.fold.textContent !== foldLabel) entry.fold.textContent = foldLabel;
      entry.fold.setAttribute("aria-label", folded ? "展开子项" : "折叠子项");
      entry.body.classList.toggle("expanded", item.full || state.expanded.includes(item.uuid));
      entry.select.disabled = this.historical;
      entry.expand.hidden = level !== "compact"; entry.expand.disabled = this.historical || item.full;
      entry.indent.disabled = index === 0 || this.historical || !!report || JSON.stringify(indent(state.items,item.uuid,1)) === JSON.stringify(state.items);
      entry.outdent.disabled = index === 0 || item.depth <= 1 || this.historical || !!report;
      entry.range.disabled = this.historical;
      entry.nativeEdit.disabled = this.historical;
      entry.compare.textContent=report ? "对照原文" : "查看 Markdown 原文";
      const menuContext = `条目操作 · ${row.content.split("\n")[0]?.replace(/\*\*|__/g, "").slice(0,48) ?? ""}`;
      if(entry.menuContext.textContent!==menuContext)entry.menuContext.textContent=menuContext;
      const bodySignature=JSON.stringify([row.content,change?.kind,change?.before,change?.after,!!report,this.historical]);
      if (!hidden && this.composingUuid !== item.uuid && entry.bodySignature !== bodySignature) {
        const selection = document.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          if (entry.body.contains(range.startContainer) || entry.body.contains(range.endContainer)) selection.removeAllRanges();
        }
        entry.body.innerHTML = renderMarkdown(projection?.markdown ?? row.content);
        highlightReview(entry.body,change,row.content,!!projection);
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
          const correct=()=>this.actions.reviewEdit?.(item.uuid,entry!.editor!,false);
          const suggest=()=>this.actions.reviewEdit?.(item.uuid,entry!.editor!,true);
          renderReviewInfo(entry.review,change,{historical:!!review?.historical,current:row.content,correct,suggest,
            parentName:uuid=>uuid===null?"页面":source.get(uuid)?.content.split("\n")[0]?.replace(/\*\*|__/g,"").slice(0,48)??`已缺失父块 ${uuid.slice(0,8)}`});
          entry.review.hidden=false;
          entry.body.onclick=event=>{if(!this.reporting && !review?.historical && change.kind!=="removed" && !(event.target as HTMLElement).closest("a,button")&&!this.composing){event.stopPropagation();correct();}};
        }else{if(entry.review)entry.review.hidden=true;entry.body.onclick=null;}
        entry.reviewSignature=reviewSignature;
      }
      const override = state.overrides[item.uuid] ?? "auto";
      if (entry.select.value !== override) entry.select.value = override;
      const canEnter = index !== 0 && !this.historical && !!workObject(row.content);
      if (canEnter && !entry.enter) { entry.enter = button("进入", () => this.actions.enter(item.uuid)); entry.controls.append(entry.enter); }
      if (entry.enter) entry.enter.hidden = !canEnter;
      if (rawBodies.has(item.uuid) && !entry.raw) {
        entry.raw = element("pre"); entry.raw.style.gridColumn = "3"; entry.raw.style.whiteSpace = "pre-wrap"; entry.raw.setAttribute("aria-label","原文对照"); entry.node.append(entry.raw);
      }
      if (entry.raw) {
        if (fragment) { entry.raw.dataset.sourceId=fragment.sourceId; entry.raw.dataset.contentVersion=fragment.contentVersion; }
        else { delete entry.raw.dataset.sourceId; delete entry.raw.dataset.contentVersion; }
        entry.raw.hidden = !rawBodies.has(item.uuid);
        if (!entry.raw.hidden && entry.raw.textContent !== row.content) entry.raw.textContent = row.content;
      }
      // Do not detach unchanged nodes: focus, select and pointer capture remain on the same elements.
      if (entry.node !== cursor) this.container.insertBefore(entry.node, cursor);
      cursor = entry.node.nextElementSibling;
    });
    if(report?.reading) {
      this.readingLayout.render(this.container,report.reading.verified,new Map([...this.entries].map(([id,entry])=>[id,entry.node])),report.reading.materials);
    } else {
      // The loop above has already moved every primary node out of its old wrapper.
      this.readingLayout.clear();delete this.container.dataset.readingPlanId;
    }
    if (focused?.isConnected && this.container.contains(focused) && document.activeElement !== focused && !focused.closest("[hidden]")) focused.focus({ preventScroll: true });
    if (anchor?.isConnected && !anchor.hidden) {
      // Layout may already have applied the browser's scroll anchoring. Preserve that adjustment.
      const offset = anchor.getBoundingClientRect().top - top;
      this.container.scrollTop += offset - anchorOffset;
    } else this.restore(reading,[],false);
    this.restoreSelection(reading);
  }

  bookmark(): ReadingBookmark {
    const bounds = this.container.getBoundingClientRect();
    const anchor = this.sourceNodes().find(value => {
      const node = value as HTMLElement, rect = node.getBoundingClientRect();
      return !!node.dataset.uuid && !node.hidden && rect.bottom > bounds.top && rect.top < bounds.bottom;
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
        for (const [id, entry] of this.entries) if (range.intersectsNode(entry.body)) contents.push([id, entry.content]);
        bookmark.selection = { range: range.cloneRange(), contents };
        bookmark.selectionAnchors={start:range.startContainer,startOffset:range.startOffset,end:range.endContainer,endOffset:range.endOffset};
      }
    }
    return bookmark;
  }
  restore(bookmark: ReadingBookmark, preferred: readonly string[] = [], restoreFocus = true): void {
    const visible = (uuid: string) => { const node = this.entries.get(uuid)?.node; return node && node.isConnected && !node.hidden ? node : null; };
    const original = bookmark.uuid ? visible(bookmark.uuid) : null;
    const node = original ?? [...preferred, ...bookmark.fallback].map(visible).find(Boolean);
    if (node) this.container.scrollTop += node.getBoundingClientRect().top - this.container.getBoundingClientRect().top - (original ? bookmark.offset : 0);
    else this.container.scrollTop = bookmark.uuid ? 0 : bookmark.scrollTop;
    if (restoreFocus && bookmark.focused?.isConnected && !bookmark.focused.closest("[hidden]")) bookmark.focused.focus({ preventScroll: true });
    else if (restoreFocus && this.container.parentElement?.contains(document.activeElement) && document.activeElement?.closest("[hidden]")) {
      (node ?? Array.from(this.container.children).find(value => !(value as HTMLElement).hidden) as HTMLElement | undefined)?.focus({ preventScroll: true });
    }
    if (restoreFocus) this.restoreSelection(bookmark);
  }
  private restoreSelection(bookmark: ReadingBookmark): void {
    const selection=bookmark.selection;
    const anchors=bookmark.selectionAnchors;
    const connected=anchors?anchors.start.isConnected&&anchors.end.isConnected:selection?.range.startContainer.isConnected&&selection.range.endContainer.isConnected;
    if (selection && connected && selection.contents.every(([id, content]) => this.entries.get(id)?.node.isConnected && !this.entries.get(id)?.node.hidden && this.entries.get(id)?.content === content)) {
      if(anchors?.start.isConnected&&anchors.end.isConnected) {
        const range=document.createRange();
        try {range.setStart(anchors.start,anchors.startOffset);range.setEnd(anchors.end,anchors.endOffset);}catch{return;}
        const current=document.getSelection();current?.removeAllRanges();current?.addRange(range);
      } else {
        const current = document.getSelection(); current?.removeAllRanges(); current?.addRange(selection.range);
      }
    }
  }
  sourceRow(target:Element):HTMLElement|null {
    let node:Element|null=target;
    while(node&&node!==this.container) {
      const uuid:string|undefined=(node as HTMLElement).dataset?.uuid;
      if(uuid&&this.entries.get(uuid)?.node===node)return node as HTMLElement;
      node=node.parentElement;
    }
    return null;
  }
  private sourceNodes():HTMLElement[] {
    // DOM order follows both manual layouts and composed nested reading units.
    // Only nodes owned by this renderer can supply a source bookmark.
    return Array.from(this.container.querySelectorAll<HTMLElement>(".wb-row[data-uuid]"))
      .filter(node=>this.entries.get(node.dataset.uuid!)?.node===node&&!node.closest("[hidden]"));
  }
  clear(): void { for (const entry of this.entries.values()) entry.disposeMenu(); this.entries.clear(); this.headings.clear();this.readingLayout.clear(); this.layout = []; this.composingUuid = null; this.container.replaceChildren(); }
}
