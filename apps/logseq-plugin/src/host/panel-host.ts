import { sidebarLayoutSpec } from "../sidebar-layout.ts";
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
  .wb-reading{font-size:14px;line-height:1.8;overflow-wrap:anywhere}.wb-reading pre{overflow:auto}.wb-reading img{max-width:100%}.wb-reading table{border-collapse:collapse;max-width:100%}.wb-reading td,.wb-reading th{border:1px solid var(--ls-border-color,#ddd);padding:4px 8px}.wb-material-form{padding:10px 0;display:flex;flex-wrap:wrap;gap:8px}.wb-material-form label{width:100%}.wb-material-form input,.wb-material-form textarea{display:block;width:100%;margin-top:6px}.wb-material small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wb-heading details{margin-left:auto}.wb-heading details[open]{width:100%}
  .wb-row{grid-template-columns:16px 18px minmax(0,1fr) 26px;border-bottom-color:transparent;padding:8px 2px}.wb-row>.wb-grip,.wb-row>.wb-row-menu>summary{opacity:.4}.wb-row:hover>.wb-grip,.wb-row:focus-within>.wb-grip,.wb-row.selected>.wb-grip,.wb-row:hover>.wb-row-menu>summary,.wb-row:focus-within>.wb-row-menu>summary,.wb-row.selected>.wb-row-menu>summary{opacity:1}.wb-row>.wb-grip,.wb-row>button{border:0;padding:0;min-height:24px}.wb-row-menu{grid-column:4;grid-row:1;display:block}.wb-row-menu>summary{list-style:none;text-align:center;cursor:pointer;min-height:24px;border-radius:4px}.wb-row-menu>summary::-webkit-details-marker{display:none}.wb-row-menu:not([open])>.wb-controls{display:none}.wb-row-menu>.wb-controls{padding:5px 0 7px;gap:6px}.wb-row-menu[open]>summary{background:var(--ls-secondary-background-color,#eef2ef)}.wb-row-menu summary:focus-visible,.wb-panel button:focus-visible,.wb-panel select:focus-visible{outline:2px solid var(--ls-link-text-color,#567969);outline-offset:2px}.wb-heading>strong{min-width:0;overflow-wrap:anywhere}.wb-panel button:disabled{opacity:.45;cursor:default}.wb-row .wb-body a{word-break:break-word}
  [data-workbench-feature=work]:has(.wb-row-menu[open])>.wb-scroll{margin-bottom:112px}.wb-row-menu[open]>.wb-controls{position:fixed;left:14px;right:14px;bottom:34px;z-index:1;padding:10px;box-sizing:border-box;border:1px solid var(--ls-border-color,#ddd);border-radius:5px;background:var(--ls-secondary-background-color,#f3f5f4)}.wb-menu-context{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}@media(max-width:480px){[data-workbench-feature=work]:has(.wb-row-menu[open])>.wb-scroll{margin-bottom:172px}}
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
  constructor(readonly name: string, readonly label: string, private readonly beforeClose: (reason: PanelCloseReason) => void | Promise<void> = () => undefined) {
    this.root.dataset.workbenchFeature = name; this.root.hidden = true;
    document.body.append(this.root); panels.register(name, reason => this.close(false, reason));
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
  async close(cancelPending = true, reason: PanelCloseReason = "close"): Promise<void> {
    if (!this.visible) { panels.release(this.name); return; }
    if (cancelPending) panels.reserve();
    await this.beforeClose(reason); this.root.hidden = true;
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
