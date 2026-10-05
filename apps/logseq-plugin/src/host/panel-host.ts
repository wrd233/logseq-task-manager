import { sidebarLayoutSpec, type SidebarLayoutSpec } from "../sidebar-layout.ts";
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
  style.textContent = `
  html,body{margin:0;height:100%;overflow:hidden}
  #workbench-navigation{height:32px;display:flex;gap:4px;align-items:center;padding:0 14px;background:var(--ls-secondary-background-color,#f3f5f4);border-bottom:1px solid var(--ls-border-color,#ddd);box-sizing:border-box;font:13px system-ui;color:var(--ls-primary-text-color,#222)}
  #workbench-navigation button,.wb-panel button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--ls-border-color,#ddd);border-radius:5px;padding:4px 8px;background:transparent}
  #workbench-navigation button[aria-current=true]{background:var(--ls-primary-background-color,#fff);font-weight:650}
  [data-task-copilot-daily-panel]{height:calc(100% - 32px)!important}
  .wb-panel{height:calc(100% - 32px);display:flex;flex-direction:column;color:var(--ls-primary-text-color,#222);background:var(--ls-primary-background-color,#fff);font:14px/1.65 system-ui;box-sizing:border-box}
  .wb-panel[hidden],.wb-panel [hidden]{display:none!important}.wb-heading{padding:10px 14px;border-bottom:1px solid var(--ls-border-color,#ddd);flex:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.wb-heading strong{flex:1}.wb-scroll{overflow:auto;flex:1;min-height:0;padding:14px}.wb-status{padding:5px 14px;font-size:12px;opacity:.75;border-top:1px solid var(--ls-border-color,#ddd)}
  .wb-row{margin-left:calc(min(var(--depth),8)*12px);padding:7px 4px;border-bottom:1px solid var(--ls-border-color,#eee);display:grid;grid-template-columns:24px 22px minmax(0,1fr);gap:4px;align-items:start;overflow-wrap:anywhere}.wb-row:focus-visible{outline:2px solid #789789}.wb-row[data-display=quiet]{opacity:.7}.wb-row[data-display=emphasis] .wb-body{font-weight:600}.wb-row .wb-body p{margin:0 0 4px}.wb-row .wb-body pre{overflow:auto;white-space:pre-wrap}.wb-row .wb-body table{border-collapse:collapse}.wb-row .wb-body td,.wb-row .wb-body th{border:1px solid var(--ls-border-color,#ddd);padding:3px}.wb-row[data-display=compact] .wb-body:not(.expanded){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.wb-controls{grid-column:3;display:flex;gap:5px;flex-wrap:wrap;font-size:11px}.wb-controls select,.wb-panel input,.wb-panel textarea{font:inherit;color:inherit;background:var(--ls-primary-background-color,#fff);border:1px solid var(--ls-border-color,#ddd);padding:6px;border-radius:4px;box-sizing:border-box}.wb-grip{touch-action:none;cursor:grab!important}.wb-drop{outline:2px solid #789789}.wb-error{color:#b94d3b}.wb-material{display:block;width:100%;text-align:left;margin-bottom:7px}.wb-material small{display:block;opacity:.7}.wb-editor{flex:1;min-height:0;overflow:auto}.wb-conflict{padding:12px;background:var(--ls-secondary-background-color,#fff4dc)}
  .wb-reading{font-size:14px;line-height:1.8;overflow-wrap:anywhere}.wb-reading pre{overflow:auto}.wb-reading img{max-width:100%}.wb-reading table{border-collapse:collapse;max-width:100%}.wb-reading td,.wb-reading th{border:1px solid var(--ls-border-color,#ddd);padding:4px 8px}.wb-material-form{padding:10px 0;display:flex;flex-wrap:wrap;gap:8px}.wb-material-form label{width:100%}.wb-material-form input,.wb-material-form textarea{display:block;width:100%;margin-top:6px}.wb-material small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wb-heading details{margin-left:auto}.wb-heading details[open]{width:100%}
  .wb-row{grid-template-columns:16px 18px minmax(0,1fr) 26px;border-bottom-color:transparent;padding:8px 2px}.wb-row>.wb-grip,.wb-row>.wb-row-menu>summary{opacity:.4}.wb-row:hover>.wb-grip,.wb-row:focus-within>.wb-grip,.wb-row.selected>.wb-grip,.wb-row:hover>.wb-row-menu>summary,.wb-row:focus-within>.wb-row-menu>summary,.wb-row.selected>.wb-row-menu>summary{opacity:1}.wb-row>.wb-grip,.wb-row>button{border:0;padding:0;min-height:24px}.wb-row-menu{grid-column:4;grid-row:1;display:block}.wb-row-menu>summary{list-style:none;text-align:center;cursor:pointer;min-height:24px;border-radius:4px}.wb-row-menu>summary::-webkit-details-marker{display:none}.wb-row-menu:not([open])>.wb-controls{display:none}.wb-row-menu>.wb-controls{padding:5px 0 7px;gap:6px}.wb-row-menu[open]>summary{background:var(--ls-secondary-background-color,#eef2ef)}.wb-row-menu summary:focus-visible,.wb-panel button:focus-visible,.wb-panel select:focus-visible{outline:2px solid var(--ls-link-text-color,#567969);outline-offset:2px}.wb-heading>strong{min-width:0;overflow-wrap:anywhere}.wb-panel button:disabled{opacity:.45;cursor:default}.wb-row .wb-body a{word-break:break-word}
  .wb-heading>strong{min-width:min(100%,160px)}
  [data-workbench-feature=work]:has(.wb-row-menu[open])>.wb-scroll{margin-bottom:112px}.wb-row-menu[open]>.wb-controls{position:fixed;left:14px;right:14px;bottom:34px;z-index:1;padding:10px;box-sizing:border-box;border:1px solid var(--ls-border-color,#ddd);border-radius:5px;background:var(--ls-secondary-background-color,#f3f5f4)}.wb-menu-context{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}@media(max-width:480px){[data-workbench-feature=work]:has(.wb-row-menu[open])>.wb-scroll{margin-bottom:172px}}

  #workbench-navigation{justify-content:space-between}#workbench-navigation>small{opacity:.65}
  .wb-panel .wb-work-shell{flex:none;border-bottom:1px solid var(--ls-border-color,#ddd);padding:10px 14px 0}
  .wb-panel .wb-work-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wb-panel .wb-work-identity{flex:1;min-width:160px;overflow-wrap:anywhere}.wb-panel .wb-work-title{display:block;font-size:18px;font-weight:650;line-height:1.4}.wb-panel .wb-work-kind{font-size:12px;opacity:.65}
  .wb-panel .wb-work-line button,.wb-panel .wb-menu>summary{white-space:nowrap}.wb-panel .wb-content-navigation{display:flex;gap:14px;align-items:center;margin-top:7px;min-height:34px;flex-wrap:wrap}.wb-panel .wb-content-navigation button{border:0;border-bottom:2px solid transparent;border-radius:0;padding:5px 1px}.wb-panel .wb-content-navigation button[aria-current=true]{border-bottom-color:var(--ls-link-text-color,#527363);font-weight:650}.wb-panel .wb-review-entry{margin-left:auto!important;font-size:13px!important}.wb-panel .wb-attention:before{content:'●';font-size:8px;margin-right:5px}
  .wb-panel .wb-primary{background:var(--ls-secondary-background-color,#eef2ef);font-weight:550}.wb-panel .wb-work-notice{padding:6px 0 8px;font-size:13px}.wb-panel .wb-status{opacity:1;font-size:13px}.wb-panel .wb-status:empty{display:none}.wb-panel .wb-root-title-in-heading,.wb-panel .wb-root-heading-row{display:none}.wb-panel .wb-empty{max-width:34em;margin:20px auto;padding:0 12px}.wb-panel .wb-empty h2{font-size:18px;margin:0 0 8px}.wb-panel .wb-empty p{margin:6px 0 12px}
  #workbench-navigation .wb-menu,.wb-panel .wb-menu{position:relative;flex:none}#workbench-navigation .wb-menu>summary,.wb-panel .wb-menu>summary{cursor:pointer;list-style:none;font-size:13px;padding:4px 6px;border-radius:4px}#workbench-navigation .wb-menu>summary::-webkit-details-marker,.wb-panel .wb-menu>summary::-webkit-details-marker{display:none}#workbench-navigation .wb-menu>summary:after,.wb-panel .wb-menu>summary:after{content:' ▾';opacity:.6}#workbench-navigation .wb-menu>summary:focus-visible,.wb-panel .wb-menu>summary:focus-visible{outline:2px solid var(--ls-link-text-color,#527363);outline-offset:2px}
  #workbench-navigation .wb-menu-content,.wb-panel .wb-menu-content{position:absolute;right:0;top:100%;z-index:20;width:280px;max-width:calc(100vw - 28px);max-height:min(480px,70vh);overflow:auto;padding:6px;border:1px solid var(--ls-border-color,#ddd);border-radius:6px;background:var(--ls-primary-background-color,#fff);box-shadow:0 6px 22px #0002;box-sizing:border-box}#workbench-navigation .wb-menu-content{left:0;right:auto}#workbench-navigation .wb-menu-content button,.wb-panel .wb-menu-content button{display:block;width:100%;text-align:left;border:0;padding:7px 8px;white-space:normal}#workbench-navigation .wb-menu-content button:hover,.wb-panel .wb-menu-content button:hover{background:var(--ls-secondary-background-color,#eef2ef)}#workbench-navigation .wb-menu-content small,.wb-panel .wb-menu-content small{display:block;font-size:12px;opacity:.65;font-weight:400;line-height:1.5}
  .wb-panel .wb-menu-group>summary{font-size:13px;padding:7px 8px;cursor:pointer;border-top:1px solid var(--ls-border-color,#ddd)}
  .wb-panel.wb-materials-in-work .wb-heading{padding:8px 14px;border-bottom:0;font-size:13px}.wb-panel.wb-materials-in-work .wb-material-return,.wb-panel.wb-materials-in-work .wb-material-close{display:none}.wb-panel .wb-heading strong{font-size:15px}.wb-panel .wb-heading:has(.wb-work-title){font-size:inherit}
  .wb-panel>.wb-scroll{padding:12px 14px 24px;scrollbar-gutter:stable}.wb-panel .wb-review-host{flex:none;max-height:42%;overflow:auto}.wb-panel .wb-review-host>.wb-stage-bar{font-size:13px}.wb-panel .wb-row-menu[open]>.wb-controls{font-size:13px}
  @media(max-width:480px){.wb-panel .wb-work-title{font-size:17px}.wb-panel .wb-work-identity{flex-basis:100%;min-width:0}.wb-panel .wb-work-line{gap:6px}.wb-panel .wb-work-line>.wb-menu{margin-left:auto}.wb-panel .wb-content-navigation{gap:12px}.wb-panel .wb-review-host{max-height:38%}}
  `;
  document.head.append(style);
  synchronizeWorkbenchTheme();
}

/** Host-local disclosures: native Tab/Enter, Escape and outside-click closure, no input interception. */
export function disclosureMenu(label: string, description: string) {
  const root = element("details", "", "wb-menu"), trigger = element("summary", label), content = element("div", "", "wb-menu-content");
  trigger.setAttribute("aria-label", description); root.append(trigger, content);
  const close = (restore = true) => {
    const focused = root.contains(document.activeElement); root.open = false; trigger.setAttribute("aria-expanded", "false");
    if (restore && focused) trigger.focus({ preventScroll: true });
  };
  const toggle = () => trigger.setAttribute("aria-expanded", String(root.open));
  root.addEventListener("toggle", toggle); trigger.setAttribute("aria-expanded", "false");
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.isComposing || (event.target as HTMLElement).closest("input,textarea,[contenteditable=true]") || !root.open) return;
    event.preventDefault(); event.stopPropagation(); close();
  };
  const outside = (event: MouseEvent) => { if (root.open && !root.contains(event.target as Node)) close(false); };
  root.addEventListener("keydown", key); document.addEventListener("click", outside, true);
  return { root, trigger, content, close, dispose: () => { document.removeEventListener("click", outside, true); root.removeEventListener("keydown", key); root.removeEventListener("toggle", toggle); root.remove(); } };
}

let themeCleanup: (() => void) | null = null;
function synchronizeWorkbenchTheme(): void {
  themeCleanup?.(); const doc = hostDocument(); if (!doc || doc === document) return;
  const properties = ["--ls-primary-background-color", "--ls-secondary-background-color", "--ls-primary-text-color", "--ls-secondary-text-color", "--ls-border-color", "--ls-link-text-color", "--ls-selection-background-color"];
  const sync = () => {
    const computed = doc.defaultView?.getComputedStyle(doc.documentElement); if (!computed) return;
    for (const name of properties) {
      const value = computed.getPropertyValue(name).trim();
      if (value) document.documentElement.style.setProperty(name, value);
    }
    const theme = doc.documentElement.getAttribute("data-theme") ?? doc.body.getAttribute("data-theme") ?? "";
    document.documentElement.style.colorScheme = theme.includes("dark") || doc.documentElement.classList.contains("dark") ? "dark" : "light";
  };
  const observer = new MutationObserver(sync); observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] }); observer.observe(doc.body, { attributes: true, attributeFilter: ["data-theme", "class", "style"] }); sync();
  themeCleanup = () => observer.disconnect();
}

export function installNavigation(actions: Record<string, () => void>): () => void {
  const nav = element("nav"); nav.id = "workbench-navigation"; nav.setAttribute("aria-label", "工作台入口");
  const menu = disclosureMenu("工作台", "切换工作与其他入口");
  for (const [name, action] of Object.entries(actions)) {
    const item = button(name, () => { menu.close(); action(); }); item.dataset.module = name; menu.content.append(item);
  }
  nav.append(menu.root, button("关闭工作台", () => void panels.closeActive())); document.body.prepend(nav);
  return () => { menu.dispose(); nav.remove(); themeCleanup?.(); themeCleanup = null; };
}

export function markNavigation(label: string): void {
  document.querySelectorAll<HTMLElement>("#workbench-navigation [data-module]").forEach(node => node.setAttribute("aria-current", String(node.dataset.module === label)));
}

export class FeaturePanel {
  readonly root = element("section", "", "wb-panel");
  private resize: (() => void) | null = null;
  private nativeExposure = false;
  constructor(readonly name: string, readonly label: string, private readonly beforeClose: (reason: PanelCloseReason) => void | Promise<void> = () => undefined) {
    this.root.dataset.workbenchFeature = name; this.root.hidden = true;
    document.body.append(this.root); panels.register(name, reason => this.close(false, reason));
  }
  get visible(): boolean { return !this.root.hidden; }
  async open(revision?: number): Promise<boolean> {
    if (!await panels.activate(this.name, revision)) return false;
    this.nativeExposure=false;
    this.root.hidden = false; markNavigation(this.label);
    this.layout();
    if (!this.resize) {
      this.resize = () => { if (this.layout()?.mode === "COMPACT" && this.nativeExposure) void this.close(true,"switch",false); };
      window.top?.addEventListener("resize", this.resize);
    }
    logseq.showMainUI({ autoFocus: false });
    return true;
  }
  async close(cancelPending = true, reason: PanelCloseReason = "close", restoreEditingCursor = true): Promise<void> {
    this.nativeExposure=false;
    if (!this.visible) { panels.release(this.name); return; }
    if (cancelPending) panels.reserve();
    await this.beforeClose(reason); this.root.hidden = true;
    if (this.resize) window.top?.removeEventListener("resize", this.resize); this.resize = null;
    const doc = hostDocument(); doc?.body.classList.remove("tc-sidebar-docked", "tc-sidebar-compact");
    panels.release(this.name); logseq.hideMainUI({ restoreEditingCursor });
  }
  async exposeNative(): Promise<"beside" | "switch"> {
    if (this.visible && this.layout()?.mode === "DOCKED") { this.nativeExposure=true;return "beside"; }
    await this.close(true,"switch",false); return "switch";
  }
  private layout(): SidebarLayoutSpec | null {
    const doc = hostDocument(); if (!doc) return null;
    const visibleWidth = (selector: string) => {
      const node = doc.querySelector(selector); return node && doc.defaultView?.getComputedStyle(node).display !== "none" ? Math.round(node.getBoundingClientRect().width) : 0;
    };
    const spec = sidebarLayoutSpec({ viewportWidth: doc.documentElement.clientWidth, sidebarWidth: 560, leftReserved: visibleWidth("#left-sidebar"), rightReserved: visibleWidth(".cp__right-sidebar") });
    doc.documentElement.style.setProperty("--tc-sidebar-width", `${spec.sidebarWidth}px`);
    doc.body.classList.toggle("tc-sidebar-docked", spec.mode === "DOCKED");
    doc.body.classList.toggle("tc-sidebar-compact", spec.mode === "COMPACT");
    const top = Math.round(doc.querySelector(".cp__header")?.getBoundingClientRect().height ?? 48);
    logseq.setMainUIInlineStyle({ position: "fixed", top: `${top}px`, left: `${spec.panelLeft}px`, right: spec.mode === "DOCKED" ? "auto" : `${spec.panelRight}px`, width: spec.mode === "DOCKED" ? `${spec.panelWidth}px` : "auto", height: `calc(100vh - ${top}px)`, zIndex: 10000 });
    return spec;
  }
}
