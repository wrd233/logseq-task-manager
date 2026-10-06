import { workbenchShellStyle } from "./visual-style.ts";
import { readingLayoutSpec, parseSidebarWidth, type SidebarLayoutSpec } from "../sidebar-layout.ts";
import { panels, type PanelCloseReason } from "../workspace/context.ts";

export function hostDocument(): Document | null {
  try { return window.top?.document ?? null; } catch { return null; }
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}

export function button(text: string, action: () => void): HTMLButtonElement {
  const node = element("button", text); node.type = "button"; node.onclick = action; return node;
}

export function installWorkbenchStyle(): void {
  document.querySelector("style[data-workbench-shell-style]")?.remove();
  const style = element("style"); style.dataset.workbenchShellStyle = "true";
  style.textContent = workbenchShellStyle;
  document.head.append(style);
  synchronizeWorkbenchTheme();
}

interface OverlayMenu {
  root: HTMLDetailsElement; trigger: HTMLElement; content: HTMLElement;
  close(restore?: boolean): void; dispose(): void;
}
const menuOwners = new Map<Document, Set<OverlayMenu>>();

/** Anchored overlays share placement and closure without taking focus from native input. */
export function bindOverlayMenu(root: HTMLDetailsElement, trigger: HTMLElement, content: HTMLElement): OverlayMenu {
  const doc = root.ownerDocument, view = doc.defaultView;
  root.classList.add("wb-menu"); content.classList.add("wb-menu-content");
  trigger.setAttribute("aria-haspopup", "true"); trigger.setAttribute("aria-expanded", "false");
  const owners = menuOwners.get(doc) ?? new Set<OverlayMenu>(); menuOwners.set(doc, owners);
  const close = (restore = true) => {
    const focused = root.contains(doc.activeElement); root.open = false; trigger.setAttribute("aria-expanded", "false");
    if (restore && focused && trigger.isConnected && !trigger.closest("[hidden]")) trigger.focus({preventScroll:true});
  };
  const place = () => {
    if (!root.open || !root.isConnected) return;
    const rect = trigger.getBoundingClientRect(), width = view?.innerWidth ?? 360, height = view?.innerHeight ?? 640;
    if (rect.bottom < 0 || rect.top > height) { close(); return; }
    content.style.maxHeight = `${Math.max(60, height - 24)}px`;
    const size = content.getBoundingClientRect(), menuWidth = size.width || Math.min(264,width-24), menuHeight = size.height || 180;
    content.style.left = `${Math.max(12, Math.min(width-menuWidth-12, rect.right-menuWidth))}px`;
    const below = rect.bottom + 5;
    content.style.top = `${Math.max(12, Math.min(height-menuHeight-12, below+menuHeight<=height-12 ? below : rect.top-menuHeight-5))}px`;
  };
  const toggle = () => {
    trigger.setAttribute("aria-expanded", String(root.open));
    if (root.open) { for (const owner of owners) if (owner.root !== root) owner.close(false); place(); }
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.isComposing || (event.target as HTMLElement).closest("input,textarea,[contenteditable=true]") || !root.open) return;
    event.preventDefault(); event.stopPropagation(); close();
  };
  const outside = (event: MouseEvent) => { if (root.open && !root.contains(event.target as Node)) close(false); };
  const scroll = (event: Event) => { if (!content.contains(event.target as Node)) place(); };
  root.addEventListener("toggle", toggle); root.addEventListener("keydown", key);
  doc.addEventListener("click", outside, true); doc.addEventListener("scroll", scroll, true); view?.addEventListener("resize", place);
  const menu: OverlayMenu = {root, trigger, content, close, dispose: () => {
    close(false); owners.delete(menu); if (!owners.size) menuOwners.delete(doc);
    doc.removeEventListener("click", outside, true); doc.removeEventListener("scroll", scroll, true); view?.removeEventListener("resize", place);
    root.removeEventListener("keydown", key); root.removeEventListener("toggle", toggle); root.remove();
  }};
  owners.add(menu); return menu;
}
export function disclosureMenu(label: string, description: string): OverlayMenu {
  const root = element("details"), trigger = element("summary", label), content = element("div");
  trigger.setAttribute("aria-label", description); root.append(trigger, content);
  return bindOverlayMenu(root, trigger, content);
}

let themeCleanup: (() => void) | null = null;
function synchronizeWorkbenchTheme(): void {
  themeCleanup?.(); themeCleanup=null; const doc = hostDocument(); if (!doc || doc === document) return;
  const properties = ["--ls-primary-background-color", "--ls-secondary-background-color", "--ls-primary-text-color", "--ls-secondary-text-color", "--ls-border-color", "--ls-link-text-color", "--ls-selection-background-color"];
  const original = new Map(properties.map(name => [name, document.documentElement.style.getPropertyValue(name)]));
  const oldTheme = document.documentElement.getAttribute("data-wb-theme");
  const oldScheme = document.documentElement.style.colorScheme;
  const sync = () => {
    const computed = doc.defaultView?.getComputedStyle(doc.documentElement); if (!computed) return;
    for (const name of properties) {
      const value = computed.getPropertyValue(name).trim();
      if (value) document.documentElement.style.setProperty(name, value);
    }
    const theme = doc.documentElement.getAttribute("data-theme") ?? doc.body.getAttribute("data-theme") ?? "";
    const rgb = computed.getPropertyValue("--ls-primary-background-color").match(/[\d.]+/g)?.slice(0,3).map(Number);
    const dark = theme.includes("dark") || doc.documentElement.classList.contains("dark") || doc.body.classList.contains("dark") || !!rgb && rgb.length===3 && rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722 < 110;
    document.documentElement.dataset.wbTheme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  };
  const observer = new MutationObserver(sync); observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] }); observer.observe(doc.body, { attributes: true, attributeFilter: ["data-theme", "class", "style"] }); sync();
  themeCleanup = () => {
    observer.disconnect();
    for (const [name,value] of original) { if(value) document.documentElement.style.setProperty(name,value); else document.documentElement.style.removeProperty(name); }
    if(oldTheme===null) document.documentElement.removeAttribute("data-wb-theme"); else document.documentElement.setAttribute("data-wb-theme",oldTheme);
    document.documentElement.style.colorScheme=oldScheme;
  };
}

export function installNavigation(actions: Record<string, () => void>): () => void {
  const nav = element("nav"); nav.id = "workbench-navigation"; nav.setAttribute("aria-label", "工作台入口");
  const menu = disclosureMenu("工作台", "切换工作与其他入口");
  for (const [name, action] of Object.entries(actions)) {
    const item = button(name, () => { menu.close(); action(); }); item.dataset.module = name; menu.content.append(item);
  }
  nav.append(menu.root, button("关闭工作台", () => void panels.closeActive())); document.body.prepend(nav);
  return () => { menu.dispose(); nav.remove(); themeCleanup?.(); themeCleanup = null; document.querySelector("style[data-workbench-shell-style]")?.remove(); };
}

export function markNavigation(label: string): void {
  document.querySelectorAll<HTMLElement>("#workbench-navigation [data-module]").forEach(node => node.setAttribute("aria-current", String(node.dataset.module === label)));
}

export class FeaturePanel {
  readonly root = element("section", "", "wb-panel");
  private resize: (() => void) | null = null;
  private nativeExposure = false;
  private width = parseSidebarWidth(localStorage.getItem("workbench:panel-width"));
  private readonly splitter = hostDocument()?.createElement("div") ?? element("div");
  private dragging: {x:number;width:number} | null = null;
  private onNativeSwitch: (() => void) | null = null;
  private stopLayout: (() => void) | null = null;
  private hostStyle: HTMLStyleElement | null = null;
  private lifetime = 0;
  private disposed = false;
  private readonly unregister: () => void;
  constructor(readonly name: string, readonly label: string, private readonly beforeClose: (reason: PanelCloseReason) => void | Promise<void> = () => undefined) {
    this.root.dataset.workbenchFeature = name; this.root.hidden = true;
    document.body.append(this.root); this.unregister = panels.register(name, reason => this.close(false, reason));
    this.splitter.setAttribute("role","separator");this.splitter.setAttribute("aria-label","调整阅读与原生写作宽度");this.splitter.setAttribute("aria-orientation","vertical");this.splitter.tabIndex=0;
    this.splitter.className="wb-reading-divider";this.splitter.dataset.workbenchDivider=name;
    this.splitter.setAttribute("aria-valuemin","300");this.splitter.setAttribute("aria-valuemax","520");
    this.splitter.style.cssText="position:fixed;bottom:0;width:6px;cursor:col-resize;z-index:10001;touch-action:none;border-left:1px solid var(--ls-border-color,#ddd)";
    // Capture in the host document: moving the plugin iframe during a drag can
    // cancel an iframe's pointer capture before pointerup reaches its listener.
    this.splitter.onpointerdown=event=>{event.preventDefault();this.dragging={x:event.clientX,width:this.width};this.splitter.setPointerCapture?.(event.pointerId);};
    this.splitter.onpointermove=event=>{if(this.dragging){this.width=parseSidebarWidth(this.dragging.width+this.dragging.x-event.clientX);this.layout();}};
    this.splitter.onpointerup=()=>{if(this.dragging){this.dragging=null;localStorage.setItem("workbench:panel-width",String(this.width));}};
    this.splitter.onpointercancel=this.splitter.onpointerup;
    this.splitter.onkeydown=event=>{if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();this.width=parseSidebarWidth(this.width+(event.key==="ArrowLeft"?16:-16));localStorage.setItem("workbench:panel-width",String(this.width));this.layout();};
  }
  get visible(): boolean { return !this.root.hidden; }
  async open(revision?: number): Promise<boolean> {
    const lifetime = ++this.lifetime;
    if (this.disposed || !await panels.activate(this.name, revision)) return false;
    if (this.disposed || lifetime !== this.lifetime) { if (!this.visible) panels.release(this.name); return false; }
    this.nativeExposure=false;
    this.onNativeSwitch=null;
    this.root.hidden = false; markNavigation(this.label);
    logseq.setMainUIInlineStyle({ display: "" });
    hostDocument()?.body.append(this.splitter);
    this.layout();
    if (!this.resize) {
      this.resize = () => {
        if (!this.visible || this.disposed) return;
        if (this.layout()?.mode === "COMPACT" && this.nativeExposure) {
          const switched = this.onNativeSwitch;
          void this.close(true,"switch",false).then(() => { if (!this.disposed && !this.visible) switched?.(); });
        }
      };
      window.top?.addEventListener("resize", this.resize);
      this.observeLayout();
    }
    logseq.showMainUI({ autoFocus: false });
    return true;
  }
  async close(cancelPending = true, reason: PanelCloseReason = "close", restoreEditingCursor = true): Promise<void> {
    const lifetime = ++this.lifetime;
    this.nativeExposure=false;
    this.onNativeSwitch=null;
    if (!this.visible) { panels.release(this.name); return; }
    if (cancelPending) panels.reserve();
    await this.beforeClose(reason);
    if (lifetime !== this.lifetime) return;
    this.root.hidden = true;
    this.dragging=null; this.splitter.remove();
    if (this.resize) window.top?.removeEventListener("resize", this.resize); this.resize = null;
    this.stopLayout?.(); this.stopLayout=null;
    this.hostStyle?.remove(); this.hostStyle=null;
    if (panels.active === this.name) {
      hostDocument()?.body.classList.remove("tc-sidebar-docked", "tc-sidebar-compact");
      panels.release(this.name);
      const doc=hostDocument(), focused=doc?.activeElement;
      // Desktop 0.10.15 hideMainUI unconditionally blurs activeElement, even
      // with restoreEditingCursor:false. Yield visually without interrupting
      // an existing native draft or composition; the next open clears display.
      if (!restoreEditingCursor && focused?.matches("#main-content-container .block-editor textarea")) logseq.setMainUIInlineStyle({ display: "none" });
      else logseq.hideMainUI({ restoreEditingCursor });
    }
  }
  async exposeNative(onSwitch?: () => void): Promise<"beside" | "switch"> {
    if (this.visible && this.layout()?.mode === "DOCKED") { this.nativeExposure=true;this.onNativeSwitch=onSwitch??null;return "beside"; }
    await this.close(true,"switch",false); return "switch";
  }
  private observeLayout(): void {
    const doc=hostDocument(), view=doc?.defaultView;
    if (!doc || !view) return;
    const selectors="#left-sidebar,.cp__right-sidebar";
    const observed=new Set<Element>();
    const observer=typeof view.ResizeObserver === "function" ? new view.ResizeObserver(() => this.resize?.()) : null;
    const observe=() => doc.querySelectorAll(selectors).forEach(node => { if (!observed.has(node)) { observed.add(node); observer?.observe(node); } });
    observe();
    const mutation=new view.MutationObserver(records => {
      if (!records.some(record => record.target === doc.body || (record.target as Element).closest?.(selectors) || [...Array.from(record.addedNodes),...Array.from(record.removedNodes)].some(node => (node as Element).matches?.(selectors) || (node as Element).querySelector?.(selectors)))) return;
      observe(); this.resize?.();
    });
    mutation.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","style","hidden"]});
    this.stopLayout=() => { observer?.disconnect(); mutation.disconnect(); observed.clear(); };
  }
  private layout(): SidebarLayoutSpec | null {
    const doc = hostDocument(); if (!doc) return null;
    const visibleWidth = (selector: string) => {
      const node = doc.querySelector(selector), style=node && doc.defaultView?.getComputedStyle(node);
      return node && style?.display !== "none" && style?.visibility !== "hidden" ? Math.round(node.getBoundingClientRect().width) : 0;
    };
    const spec = readingLayoutSpec({ viewportWidth: doc.documentElement.clientWidth, sidebarWidth: this.width, mainMinWidth:440, leftReserved: visibleWidth("#left-sidebar"), rightReserved: visibleWidth(".cp__right-sidebar") });
    if (!this.hostStyle) {
      this.hostStyle=doc.createElement("style"); this.hostStyle.dataset.workbenchHostLayout=this.name;
      // Cover native content without visibility:hidden, which blurs a live
      // textarea and makes its read-only focus lease unavailable in Desktop.
      this.hostStyle.textContent="body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}body.tc-sidebar-compact #main-content-container{opacity:0;pointer-events:none}";
      doc.head.append(this.hostStyle);
    }
    this.splitter.hidden=spec.mode!=="DOCKED"; this.splitter.setAttribute("aria-valuenow",String(spec.sidebarWidth));
    doc.documentElement.style.setProperty("--tc-sidebar-width", `${spec.sidebarWidth}px`);
    for (const [name,enabled] of [["tc-sidebar-docked",spec.mode === "DOCKED"],["tc-sidebar-compact",spec.mode === "COMPACT" && !this.nativeExposure]] as const) {
      if (doc.body.classList.contains(name) !== enabled) doc.body.classList.toggle(name,enabled);
    }
    const top = Math.round(doc.querySelector(".cp__header")?.getBoundingClientRect().height ?? 48);
    this.splitter.style.left=`${spec.panelLeft}px`; this.splitter.style.top=`${top+32}px`;
    logseq.setMainUIInlineStyle({ position: "fixed", top: `${top}px`, left: `${spec.panelLeft}px`, right: spec.mode === "DOCKED" ? "auto" : `${spec.panelRight}px`, width: spec.mode === "DOCKED" ? `${spec.panelWidth}px` : "auto", height: `calc(100vh - ${top}px)`, zIndex: 10000 });
    return spec;
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed=true;
    await this.close(); this.splitter.remove(); this.unregister(); this.root.remove();
  }
}
