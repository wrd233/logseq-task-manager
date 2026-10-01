import { sidebarLayoutSpec } from "../sidebar-layout.ts";
import { panels } from "../workspace/context.ts";

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
  const style = element("style");
  style.textContent = `
  html,body{margin:0;height:100%;overflow:hidden}
  #workbench-navigation{height:40px;display:flex;gap:4px;align-items:center;padding:0 10px;background:var(--ls-secondary-background-color,#f3f5f4);border-bottom:1px solid var(--ls-border-color,#ddd);box-sizing:border-box;font:13px system-ui;color:var(--ls-primary-text-color,#222)}
  #workbench-navigation button,.wb-panel button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--ls-border-color,#ddd);border-radius:5px;padding:4px 8px;background:transparent}
  #workbench-navigation button[aria-current=true]{background:var(--ls-primary-background-color,#fff);font-weight:650}
  [data-task-copilot-daily-panel]{height:calc(100% - 40px)!important}
  .wb-panel{height:calc(100% - 40px);display:flex;flex-direction:column;color:var(--ls-primary-text-color,#222);background:var(--ls-primary-background-color,#fff);font:13px/1.6 system-ui;box-sizing:border-box}
  .wb-panel[hidden],.wb-panel [hidden]{display:none!important}.wb-heading{padding:10px 14px;border-bottom:1px solid var(--ls-border-color,#ddd);flex:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.wb-heading strong{flex:1}.wb-scroll{overflow:auto;flex:1;min-height:0;padding:14px}.wb-status{padding:5px 14px;font-size:12px;opacity:.75;border-top:1px solid var(--ls-border-color,#ddd)}
  .wb-row{margin-left:calc(min(var(--depth),8)*12px);padding:7px 4px;border-bottom:1px solid var(--ls-border-color,#eee);display:grid;grid-template-columns:24px 22px minmax(0,1fr);gap:4px;align-items:start;overflow-wrap:anywhere}.wb-row:focus-visible{outline:2px solid #789789}.wb-row[data-display=quiet]{opacity:.7}.wb-row[data-display=emphasis] .wb-body{font-weight:600}.wb-row .wb-body p{margin:0 0 4px}.wb-row .wb-body pre{overflow:auto;white-space:pre-wrap}.wb-row .wb-body table{border-collapse:collapse}.wb-row .wb-body td,.wb-row .wb-body th{border:1px solid var(--ls-border-color,#ddd);padding:3px}.wb-row[data-display=compact] .wb-body:not(.expanded){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.wb-controls{grid-column:3;display:flex;gap:5px;flex-wrap:wrap;font-size:11px}.wb-controls select,.wb-panel input,.wb-panel textarea{font:inherit;color:inherit;background:var(--ls-primary-background-color,#fff);border:1px solid var(--ls-border-color,#ddd);padding:6px;border-radius:4px;box-sizing:border-box}.wb-grip{touch-action:none;cursor:grab!important}.wb-drop{outline:2px solid #789789}.wb-error{color:#b94d3b}.wb-material{display:block;width:100%;text-align:left;margin-bottom:7px}.wb-material small{display:block;opacity:.7}.wb-editor{flex:1;min-height:0;overflow:auto}.wb-conflict{padding:12px;background:var(--ls-secondary-background-color,#fff4dc)}
  `;
  document.head.append(style);
}

export function installNavigation(actions: Record<string, () => void>): () => void {
  const nav = element("nav"); nav.id = "workbench-navigation"; nav.setAttribute("aria-label", "工作入口");
  for (const [name, action] of Object.entries(actions)) {
    const item = button(name, action); item.dataset.module = name; nav.append(item);
  }
  document.body.prepend(nav);
  return () => nav.remove();
}

export function markNavigation(label: string): void {
  document.querySelectorAll<HTMLElement>("#workbench-navigation button").forEach(node => node.setAttribute("aria-current", String(node.dataset.module === label)));
}

export class FeaturePanel {
  readonly root = element("section", "", "wb-panel");
  private resize: (() => void) | null = null;
  constructor(readonly name: string, readonly label: string, private readonly beforeClose: () => void | Promise<void> = () => undefined) {
    this.root.dataset.workbenchFeature = name; this.root.hidden = true;
    document.body.append(this.root); panels.register(name, () => this.close(false));
  }
  get visible(): boolean { return !this.root.hidden; }
  async open(revision?: number): Promise<boolean> {
    if (!await panels.activate(this.name, revision)) return false;
    this.root.hidden = false; markNavigation(this.label);
    this.layout();
    if (!this.resize) { this.resize = () => this.layout(); window.top?.addEventListener("resize", this.resize); }
    logseq.showMainUI({ autoFocus: false });
    return true;
  }
  async close(cancelPending = true): Promise<void> {
    if (!this.visible) { panels.release(this.name); return; }
    if (cancelPending) panels.reserve();
    await this.beforeClose(); this.root.hidden = true;
    if (this.resize) window.top?.removeEventListener("resize", this.resize); this.resize = null;
    const doc = hostDocument(); doc?.body.classList.remove("tc-sidebar-docked", "tc-sidebar-compact");
    panels.release(this.name); logseq.hideMainUI({ restoreEditingCursor: true });
  }
  private layout(): void {
    const doc = hostDocument(); if (!doc) return;
    const visibleWidth = (selector: string) => {
      const node = doc.querySelector(selector); return node && doc.defaultView?.getComputedStyle(node).display !== "none" ? Math.round(node.getBoundingClientRect().width) : 0;
    };
    const spec = sidebarLayoutSpec({ viewportWidth: doc.documentElement.clientWidth, sidebarWidth: 560, leftReserved: visibleWidth("#left-sidebar"), rightReserved: visibleWidth(".cp__right-sidebar") });
    doc.documentElement.style.setProperty("--tc-sidebar-width", `${spec.sidebarWidth}px`);
    doc.body.classList.toggle("tc-sidebar-docked", spec.mode === "DOCKED");
    doc.body.classList.toggle("tc-sidebar-compact", spec.mode === "COMPACT");
    const top = Math.round(doc.querySelector(".cp__header")?.getBoundingClientRect().height ?? 48);
    logseq.setMainUIInlineStyle({ position: "fixed", top: `${top}px`, left: `${spec.panelLeft}px`, right: spec.mode === "DOCKED" ? "auto" : `${spec.panelRight}px`, width: spec.mode === "DOCKED" ? `${spec.panelWidth}px` : "auto", height: `calc(100vh - ${top}px)`, zIndex: 10000 });
  }
}
