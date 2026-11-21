import { copyMaterialLink } from "../../host/clipboard.ts";
import { element, hostDocument } from "../../host/panel-host.ts";
import { canSafelyUndoSnapshot, type LiveBlockLookup, type TidySnapshotRecord } from "./snapshots.ts";
import type { NoteTidyAnchor, NoteTidyPlan, NoteTidyPreviewBlock } from "./types.ts";

interface AnchorSpanMatch {
  anchorId: string;
  exactText: string;
  colorSlot: 0 | 1 | 2 | 3 | 4;
  omitted: boolean;
  label: string;
}

function docElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text = "",
  className = ""
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function docButton(doc: Document, text: string, action: () => void): HTMLButtonElement {
  const node = docElement(doc, "button", text);
  node.type = "button";
  node.onclick = action;
  return node;
}

/** Display-only cleanup: hide technical id:: lines and raw ** around formal type markers in preview. */
function formatPreviewDisplayText(content: string, isProtected: boolean): string {
  const lines = content.split(/\r?\n/u).filter((line) => !/^\s*id::\s*[0-9a-f-]{8,}\s*$/iu.test(line));
  let cleaned = lines.join("\n").trim();
  if (!cleaned) cleaned = content.trim();
  if (isProtected) {
    cleaned = cleaned.replace(/^\*\*(\[(?:任务|事务|Project|MiniProject|Area)\])\*\*/u, "$1");
  }
  return cleaned;
}

function renderAnchoredText(
  doc: Document,
  container: HTMLElement,
  text: string,
  anchors: readonly AnchorSpanMatch[]
): void {
  container.replaceChildren();
  if (!anchors.length) {
    container.textContent = text;
    return;
  }
  const placements: Array<AnchorSpanMatch & { start: number; end: number }> = [];
  for (const anchor of anchors) {
    if (!anchor.exactText) continue;
    const idx = text.indexOf(anchor.exactText);
    if (idx < 0) continue;
    placements.push({ ...anchor, start: idx, end: idx + anchor.exactText.length });
  }
  placements.sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  for (const item of placements) {
    if (item.start < cursor) continue;
    if (item.start > cursor) {
      container.append(doc.createTextNode(text.slice(cursor, item.start)));
    }
    const span = docElement(
      doc,
      "span",
      text.slice(item.start, item.end),
      `wb-tidy-anchor${item.omitted ? " wb-tidy-anchor-omitted" : ""}`
    );
    span.dataset.tidyAnchorId = item.anchorId;
    span.dataset.slot = String(item.colorSlot);
    span.title = item.omitted ? `未带入重点：${item.label}（请核对是否需保留）` : `关键信息：${item.label}`;
    container.append(span);
    cursor = item.end;
  }
  if (cursor < text.length) {
    container.append(doc.createTextNode(text.slice(cursor)));
  }
}

function prefersReducedMotion(doc: Document): boolean {
  try {
    const view = doc.defaultView ?? window;
    return typeof view.matchMedia === "function" && view.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function escapeBlockAttr(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function findMountedNativeBlock(main: HTMLElement, blockUuids: readonly (string | null)[]): HTMLElement | null {
  for (const uuid of blockUuids) {
    if (!uuid) continue;
    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>(`.ls-block[blockid="${escapeBlockAttr(uuid)}"]`)
    );
    const match = candidates.find((el) => !el.closest(".block-content,.block-editor"));
    if (match) return match;
  }
  return null;
}

const HOST_TIDY_STYLE = `
  [data-wb-tidy-masked="true"]{opacity:.04!important;pointer-events:none!important;transition:opacity 160ms ease}
  .wb-host-tidy{position:absolute;z-index:80;box-sizing:border-box;border-radius:10px;border:1px solid var(--ls-border-color,#dce1d9);background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#29332f);box-shadow:0 10px 30px rgba(25,38,32,.11);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;overflow:visible}
  .wb-host-tidy[data-placement="centered"]{left:24px;right:24px;max-width:740px;margin:0 auto}
  .wb-host-tidy button{font:inherit;cursor:pointer;border:1px solid var(--ls-border-color,#dce1d9);background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#29332f);border-radius:6px;padding:4px 10px;line-height:1.35;font-size:12.5px}
  .wb-host-tidy button:hover:not(:disabled){background:var(--ls-secondary-background-color,#f2f4f0)}
  .wb-host-tidy button:disabled{opacity:.52;cursor:not-allowed}
  .wb-host-tidy .wb-tidy-head{position:sticky;top:6px;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--ls-border-color,#dce1d9);background:var(--ls-primary-background-color,#fff);border-radius:10px 10px 0 0}
  .wb-host-tidy .wb-tidy-head strong{margin-inline-end:auto;font-size:13px;font-weight:600;color:var(--ls-secondary-text-color,#5f6c66)}
  .wb-host-tidy .wb-tidy-toggle{display:inline-flex;border:1px solid var(--ls-border-color,#dce1d9);border-radius:7px;padding:2px;gap:2px;background:var(--ls-secondary-background-color,#f0f2ee)}
  .wb-host-tidy .wb-tidy-toggle button{border:0;border-radius:5px;padding:3px 10px;font-size:12.5px;color:var(--ls-secondary-text-color,#5f6c66);background:transparent}
  .wb-host-tidy .wb-tidy-toggle button[aria-pressed="true"]{background:var(--ls-primary-background-color,#fff);color:#2d6352;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.07)}
  .wb-host-tidy .wb-tidy-primary{background:#356958!important;color:#fff!important;border-color:#356958!important;font-weight:550}
  .wb-host-tidy .wb-tidy-primary:hover:not(:disabled){filter:brightness(.95)}
  .wb-host-tidy .wb-tidy-meta{padding:8px 16px;border-bottom:1px solid var(--ls-border-color,#e6eae4);background:var(--ls-secondary-background-color,#f8f9f6)}
  .wb-host-tidy .wb-tidy-summary{margin:0 0 6px;font-size:13px;line-height:1.55;color:var(--ls-primary-text-color,#29332f)}
  .wb-host-tidy .wb-tidy-badges{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11.5px}
  .wb-host-tidy .wb-tidy-badge{padding:2px 8px;border-radius:999px;background:rgba(100,115,108,.11);color:var(--ls-secondary-text-color,#5a6861)}
  .wb-host-tidy .wb-tidy-badge-ok{background:rgba(53,105,88,.13);color:#245a49;font-weight:550}
  .wb-host-tidy .wb-tidy-badge-attn{background:rgba(217,138,43,.18);color:#8a4f0f;font-weight:600}
  .wb-host-tidy .wb-tidy-hint{margin-inline-start:auto;color:var(--ls-secondary-text-color,#6c7872);font-size:11.5px}
  .wb-host-tidy .wb-tidy-struct-note{margin-top:6px;padding:6px 10px;border-radius:6px;border-inline-start:3px solid #c9862c;background:rgba(217,138,43,.11);font-size:12.5px;line-height:1.55;color:var(--ls-primary-text-color,#29332f)}
  .wb-host-tidy .wb-tidy-body{padding:12px 16px 16px;font-size:15.5px;line-height:1.68}
  .wb-host-tidy .wb-tidy-block{position:relative;display:flex;align-items:flex-start;gap:8px;padding:6px 10px 6px 20px;margin-bottom:4px;border-radius:7px;border-inline-start:2px solid transparent;transition:background 180ms ease}
  .wb-host-tidy .wb-tidy-block::before{content:"•";position:absolute;left:6px;top:6px;color:var(--ls-secondary-text-color,#94a09a);font-size:14px;line-height:1.65}
  .wb-host-tidy .wb-tidy-block-changed{border-inline-start-color:#356958;background:rgba(53,105,88,.045)}
  .wb-host-tidy .wb-tidy-block-protected{opacity:.86}
  .wb-host-tidy .wb-tidy-block-text{flex:1 1 auto;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
  .wb-host-tidy .wb-tidy-tag{flex:none;font-size:11px;color:var(--ls-secondary-text-color,#64726b);padding:2px 7px;border-radius:4px;background:var(--ls-secondary-background-color,#eef1ec);margin-top:2px}
  .wb-host-tidy .wb-tidy-tweak{flex:none;font-size:11.5px;padding:2px 8px;color:var(--ls-secondary-text-color,#5f6c66);margin-top:1px}
  .wb-host-tidy .wb-tidy-edit-box{width:100%;box-sizing:border-box;padding:8px 10px;font:inherit;line-height:1.62;border:1.5px solid #356958;border-radius:6px;background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#29332f);resize:vertical}
  .wb-host-tidy .wb-tidy-edit-actions{display:flex;gap:8px;margin-top:6px}
  .wb-host-tidy .wb-tidy-anchor{display:inline-block;padding:0 4px;border-radius:4px;font-weight:550;will-change:transform}
  .wb-host-tidy .wb-tidy-anchor[data-slot="0"]{background:rgba(53,105,88,.15);color:#1d5140}
  .wb-host-tidy .wb-tidy-anchor[data-slot="1"]{background:rgba(217,138,43,.20);color:#854b0c}
  .wb-host-tidy .wb-tidy-anchor[data-slot="2"]{background:rgba(52,104,162,.15);color:#234e7d}
  .wb-host-tidy .wb-tidy-anchor[data-slot="3"]{background:rgba(130,80,145,.15);color:#60346e}
  .wb-host-tidy .wb-tidy-anchor[data-slot="4"]{background:rgba(112,126,58,.17);color:#4c5922}
  .wb-host-tidy .wb-tidy-anchor-omitted{background:rgba(192,66,52,.17)!important;color:#8c241b!important;text-decoration:underline wavy rgba(192,66,52,.85);text-underline-offset:3px}
  .wb-host-tidy .wb-tidy-status{padding:6px 16px;font-size:12px;color:var(--ls-secondary-text-color,#64726b);border-top:1px solid var(--ls-border-color,#e6eae4)}.wb-host-tidy .wb-tidy-status:empty{display:none}
  .wb-host-tidy .wb-tidy-snapshot{padding:10px 0;border-bottom:1px solid var(--ls-border-color,#e6eae4)}
  .wb-host-tidy .wb-tidy-snap-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:13.5px}
  .wb-host-tidy .wb-tidy-snap-block{display:flex;align-items:flex-start;gap:8px;margin:6px 0}
  .wb-host-tidy .wb-tidy-snap-pre{flex:1 1 auto;margin:0;padding:8px 10px;border-radius:6px;background:var(--ls-secondary-background-color,#f2f4f0);font:13.5px/1.6 inherit;white-space:pre-wrap;overflow-wrap:anywhere}
  .wb-host-tidy .wb-tidy-empty{color:var(--ls-secondary-text-color,#64726b);font-size:13.5px}
  html[data-theme="dark"] .wb-host-tidy .wb-tidy-anchor[data-slot="0"],body.dark .wb-host-tidy .wb-tidy-anchor[data-slot="0"]{background:rgba(104,196,164,.22);color:#9be2c9}
  html[data-theme="dark"] .wb-host-tidy .wb-tidy-anchor[data-slot="1"],body.dark .wb-host-tidy .wb-tidy-anchor[data-slot="1"]{background:rgba(235,168,72,.24);color:#f3c478}
  html[data-theme="dark"] .wb-host-tidy .wb-tidy-anchor[data-slot="2"],body.dark .wb-host-tidy .wb-tidy-anchor[data-slot="2"]{background:rgba(108,164,224,.22);color:#a4cef8}
  html[data-theme="dark"] .wb-host-tidy .wb-tidy-anchor[data-slot="3"],body.dark .wb-host-tidy .wb-tidy-anchor[data-slot="3"]{background:rgba(190,136,208,.22);color:#dfb4ec}
  html[data-theme="dark"] .wb-host-tidy .wb-tidy-anchor[data-slot="4"],body.dark .wb-host-tidy .wb-tidy-anchor[data-slot="4"]{background:rgba(176,192,102,.22);color:#d7e396}
`;

export interface TidyPreviewCallbacks {
  onApply(plan: NoteTidyPlan, overrides: ReadonlyMap<string, string>): Promise<void>;
  onDismissProposal?(proposalId: string): Promise<void>;
  onUndoSnapshot(snapshot: TidySnapshotRecord): Promise<{ restored: boolean; reason?: string }>;
  getBlock: LiveBlockLookup;
}

export class NoteTidyPreviewOverlay {
  readonly root = element("section", "", "wb-tidy-dialog");
  private readonly fallbackHead = element("div", "", "wb-tidy-head");
  private readonly fallbackMeta = element("div", "", "wb-tidy-meta");
  private readonly fallbackBody = element("div", "", "wb-tidy-body");
  private readonly fallbackStatus = element("div", "", "wb-tidy-status");

  private activeDoc: Document = document;
  private activeShell: HTMLElement;
  private activeHead: HTMLElement;
  private activeMeta: HTMLElement;
  private activeBody: HTMLElement;
  private activeStatus: HTMLElement;

  private hostSheet: HTMLElement | null = null;
  private hostStyle: HTMLStyleElement | null = null;
  private hostContainer: HTMLElement | null = null;
  private maskedBlock: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cleanupHostListeners: (() => void) | null = null;

  private view: "after" | "before" = "after";
  private plan: NoteTidyPlan | null = null;
  private proposalId: string | null = null;
  private editingBlockId: string | null = null;
  private readonly overrides = new Map<string, string>();
  private busy = false;
  private mode: "plan" | "snapshots" | "closed" = "closed";
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly callbacks: TidyPreviewCallbacks) {
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "左侧笔记原地整理预览");
    this.fallbackStatus.setAttribute("role", "status");
    this.root.append(this.fallbackHead, this.fallbackMeta, this.fallbackBody, this.fallbackStatus);

    this.activeShell = this.root;
    this.activeHead = this.fallbackHead;
    this.activeMeta = this.fallbackMeta;
    this.activeBody = this.fallbackBody;
    this.activeStatus = this.fallbackStatus;

    this.root.onkeydown = (event) => this.handleKeydown(event);
  }

  get open(): boolean {
    return this.mode !== "closed" && (!this.root.hidden || Boolean(this.hostSheet && !this.hostSheet.hidden));
  }

  get currentView(): "after" | "before" {
    return this.view;
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const target = event.target as { closest?: (selector: string) => Element | null } | null;
    const inInteractive =
      typeof target?.closest === "function" &&
      Boolean(target.closest("textarea,input,button,select,[contenteditable=true]"));
    if (this.mode === "plan" && !this.editingBlockId && event.key === " " && !inInteractive) {
      event.preventDefault();
      event.stopPropagation();
      this.switchView(this.view === "after" ? "before" : "after");
    }
  };

  private teardownHostMount(): void {
    this.cleanupHostListeners?.();
    this.cleanupHostListeners = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.maskedBlock) {
      this.maskedBlock.removeAttribute("data-wb-tidy-masked");
      this.maskedBlock = null;
    }
    this.hostSheet?.remove();
    this.hostSheet = null;
    this.hostContainer = null;

    this.activeDoc = document;
    this.activeShell = this.root;
    this.activeHead = this.fallbackHead;
    this.activeMeta = this.fallbackMeta;
    this.activeBody = this.fallbackBody;
    this.activeStatus = this.fallbackStatus;
  }

  private mountSurface(targetUuids: readonly (string | null)[]): void {
    this.teardownHostMount();
    const hostDoc = hostDocument();
    const hostMain = hostDoc?.querySelector<HTMLElement>("#main-content-container") ?? null;

    if (!hostDoc || !hostMain) {
      this.activeDoc = document;
      this.activeShell = this.root;
      this.activeHead = this.fallbackHead;
      this.activeMeta = this.fallbackMeta;
      this.activeBody = this.fallbackBody;
      this.activeStatus = this.fallbackStatus;
      this.root.hidden = false;
      return;
    }

    // Mount directly inside Logseq's spacious left main pane (#main-content-container)
    this.root.hidden = true;
    if (!this.hostStyle || !this.hostStyle.isConnected || this.hostStyle.ownerDocument !== hostDoc) {
      hostDoc.querySelector("style[data-wb-host-tidy-style]")?.remove();
      const style = hostDoc.createElement("style");
      style.dataset.wbHostTidyStyle = "true";
      style.textContent = HOST_TIDY_STYLE;
      hostDoc.head.append(style);
      this.hostStyle = style;
    }

    const sheet = docElement(hostDoc, "section", "", "wb-host-tidy wb-tidy-dialog");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "左侧笔记原地整理预览");
    const head = docElement(hostDoc, "div", "", "wb-tidy-head");
    const meta = docElement(hostDoc, "div", "", "wb-tidy-meta");
    const body = docElement(hostDoc, "div", "", "wb-tidy-body");
    const status = docElement(hostDoc, "div", "", "wb-tidy-status");
    status.setAttribute("role", "status");
    sheet.append(head, meta, body, status);

    this.hostSheet = sheet;
    this.hostContainer = hostMain;
    this.activeDoc = hostDoc;
    this.activeShell = sheet;
    this.activeHead = head;
    this.activeMeta = meta;
    this.activeBody = body;
    this.activeStatus = status;

    const nativeBlock = targetUuids.length ? findMountedNativeBlock(hostMain, targetUuids) : null;
    if (nativeBlock) {
      this.maskedBlock = nativeBlock;
      nativeBlock.setAttribute("data-wb-tidy-masked", "true");
      sheet.dataset.placement = "inline";
      nativeBlock.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    } else {
      sheet.dataset.placement = "centered";
      sheet.style.top = `${Math.max(16, hostMain.scrollTop + 20)}px`;
    }

    hostMain.append(sheet);

    const syncGeometry = () => {
      if (!this.hostSheet || !this.hostContainer) return;
      if (this.maskedBlock && this.maskedBlock.isConnected) {
        const mRect = this.hostContainer.getBoundingClientRect();
        const bRect = this.maskedBlock.getBoundingClientRect();
        const top = Math.max(8, bRect.top - mRect.top + this.hostContainer.scrollTop - 44);
        const left = Math.max(8, bRect.left - mRect.left + this.hostContainer.scrollLeft - 8);
        const maxWidth = Math.max(320, this.hostContainer.clientWidth - left - 12);
        const width = Math.max(320, Math.min(bRect.width + 20, maxWidth));
        this.hostSheet.style.top = `${top}px`;
        this.hostSheet.style.left = `${left}px`;
        this.hostSheet.style.width = `${width}px`;
        this.activeBody.style.minHeight = `${Math.max(120, Math.round(bRect.height))}px`;
      } else if (this.hostSheet.dataset.placement === "centered") {
        this.hostSheet.style.top = `${Math.max(16, this.hostContainer.scrollTop + 20)}px`;
      }
    };
    syncGeometry();

    const hostView = hostDoc.defaultView;
    const onResize = () => syncGeometry();
    hostDoc.addEventListener("keydown", this.handleKeydown, true);
    if (hostDoc !== document) document.addEventListener("keydown", this.handleKeydown, true);
    hostView?.addEventListener("resize", onResize);
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(syncGeometry);
      this.resizeObserver.observe(hostMain);
      if (this.maskedBlock) this.resizeObserver.observe(this.maskedBlock);
    }
    this.cleanupHostListeners = () => {
      hostDoc.removeEventListener("keydown", this.handleKeydown, true);
      if (hostDoc !== document) document.removeEventListener("keydown", this.handleKeydown, true);
      hostView?.removeEventListener("resize", onResize);
    };
  }

  openPlan(plan: NoteTidyPlan, options: { proposalId?: string; anchor?: HTMLElement } = {}): void {
    this.mode = "plan";
    this.plan = plan;
    this.proposalId = options.proposalId ?? plan.meta.proposalId ?? null;
    this.view = "after";
    this.editingBlockId = null;
    this.overrides.clear();
    this.busy = false;
    this.returnFocus = options.anchor ?? null;

    const candidateUuids = plan.beforeBlocks.map((b) => b.blockUuid);
    this.mountSurface(candidateUuids);
    this.activeStatus.textContent = "";
    this.activeShell.dataset.tidyMode = "plan";
    this.renderPlan(false);
    this.activeShell.tabIndex = -1;
    this.activeShell.focus({ preventScroll: true });
  }

  async openSnapshots(
    snapshots: readonly TidySnapshotRecord[],
    anchor?: HTMLElement
  ): Promise<void> {
    this.mode = "snapshots";
    this.plan = null;
    this.proposalId = null;
    this.editingBlockId = null;
    this.busy = false;
    this.returnFocus = anchor ?? null;

    const firstSnap = snapshots[0];
    const firstCheck =
      firstSnap && !firstSnap.undone
        ? await canSafelyUndoSnapshot(firstSnap, this.callbacks.getBlock)
        : null;
    if (this.mode !== "snapshots") return;

    this.mountSurface([]);
    const doc = this.activeDoc;
    this.activeStatus.textContent = "";
    this.activeShell.dataset.tidyMode = "snapshots";
    this.activeHead.replaceChildren(
      docElement(doc, "strong", "整理前原文快照"),
      docButton(doc, "关闭", () => this.close())
    );
    this.activeMeta.replaceChildren(
      docElement(
        doc,
        "p",
        "仅保留最近 5 份本地整理快照；未续写时支持一键撤销，续写后仅提供只读查阅与复制，绝不覆盖新笔记。",
        "wb-tidy-summary"
      )
    );
    this.activeBody.replaceChildren();
    if (!snapshots.length) {
      this.activeBody.append(docElement(doc, "p", "当前工作还没有原地整理快照。", "wb-tidy-empty"));
      return;
    }

    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i]!;
      const card = docElement(doc, "section", "", "wb-tidy-snapshot");
      const titleRow = docElement(doc, "div", "", "wb-tidy-snap-head");
      const stamp = new Date(snap.createdAt).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      titleRow.append(docElement(doc, "strong", `${stamp} · ${snap.summary}`));
      const actionsRow = docElement(doc, "div", "", "wb-tidy-snap-actions");
      if (i === 0 && !snap.undone && firstCheck) {
        if (firstCheck.canUndo) {
          const undoBtn = docButton(doc, "一键撤销整理", () => void this.runUndo(snap, undoBtn));
          undoBtn.className = "wb-tidy-primary";
          actionsRow.append(undoBtn);
        } else {
          const badge = docElement(doc, "span", "已续写 · 仅只读查看", "wb-tidy-badge wb-tidy-badge-attn");
          badge.title = firstCheck.reason ?? "";
          actionsRow.append(badge);
        }
      } else if (snap.undone) {
        actionsRow.append(docElement(doc, "span", "已撤销", "wb-tidy-badge"));
      }
      titleRow.append(actionsRow);
      card.append(titleRow);

      for (const block of snap.blocks) {
        const row = docElement(doc, "div", "", "wb-tidy-snap-block");
        row.append(
          docElement(doc, "pre", block.beforeContent, "wb-tidy-snap-pre"),
          docButton(doc, "复制原句", () => {
            void copyMaterialLink(block.beforeContent)
              .then(() => { this.activeStatus.textContent = "已复制整理前原句。"; })
              .catch(() => { this.activeStatus.textContent = "复制失败。"; });
          })
        );
        card.append(row);
      }
      this.activeBody.append(card);
    }
  }

  close(): void {
    this.mode = "closed";
    this.plan = null;
    this.proposalId = null;
    this.editingBlockId = null;
    this.root.hidden = true;
    this.teardownHostMount();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && !target.closest("[hidden]")) {
      target.focus({ preventScroll: true });
    }
  }

  dispose(): void {
    this.close();
    this.hostStyle?.remove();
    this.hostStyle = null;
  }

  private async runUndo(snapshot: TidySnapshotRecord, trigger: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    trigger.disabled = true;
    this.activeStatus.textContent = "正在核对版本并还原整理前原文…";
    try {
      const result = await this.callbacks.onUndoSnapshot(snapshot);
      if (result.restored) {
        this.activeStatus.textContent = "已无损恢复整理前原文。";
        this.close();
      } else {
        this.activeStatus.textContent = result.reason ?? "无法覆盖还原，请从上方只读快照复制。";
      }
    } catch (error) {
      this.activeStatus.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      trigger.disabled = false;
    }
  }

  private resolveAfterContent(block: NoteTidyPreviewBlock): string {
    return this.overrides.get(block.id) ?? block.content;
  }

  private effectiveOmittedAnchors(plan: NoteTidyPlan): NoteTidyAnchor[] {
    const afterBlocks = plan.afterBlocks.map((b) => ({ ...b, content: this.resolveAfterContent(b) }));
    return plan.anchors.filter((anchor) => {
      if (anchor.after) {
        const target = afterBlocks.find((b) => b.id === anchor.after!.targetId);
        if (target && target.content.includes(anchor.after.exactText)) return false;
      }
      return !afterBlocks.some((b) => b.content.includes(anchor.before.exactText));
    });
  }

  switchView(next: "after" | "before"): void {
    if (!this.plan || this.view === next) return;
    this.editingBlockId = null;
    const animate = !prefersReducedMotion(this.activeDoc);
    const beforeRects = new Map<string, DOMRect>();
    if (animate) {
      for (const el of Array.from(this.activeBody.querySelectorAll<HTMLElement>("[data-tidy-anchor-id]"))) {
        const id = el.dataset.tidyAnchorId;
        if (!id) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) beforeRects.set(id, rect);
      }
    }
    this.view = next;
    this.renderPlan(false);
    if (!animate || !beforeRects.size) return;

    if (typeof this.activeBody.animate === "function") {
      this.activeBody.animate([{ opacity: 0.52 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    }
    for (const el of Array.from(this.activeBody.querySelectorAll<HTMLElement>("[data-tidy-anchor-id]"))) {
      const id = el.dataset.tidyAnchorId;
      const prev = id ? beforeRects.get(id) : undefined;
      if (!prev || typeof el.animate !== "function") continue;
      const curr = el.getBoundingClientRect();
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
    }
  }

  private renderPlan(preserveStatus: boolean): void {
    const plan = this.plan;
    if (!plan) return;
    const doc = this.activeDoc;
    if (!preserveStatus && !this.busy) this.activeStatus.textContent = "";

    const titleText = plan.meta.origin === "external-mcp" ? "外部原文改动提案" : "左侧原地整理";
    const toggleGroup = docElement(doc, "div", "", "wb-tidy-toggle");
    const afterBtn = docButton(doc, "整理后（成稿）", () => this.switchView("after"));
    afterBtn.dataset.tidyView = "after";
    afterBtn.setAttribute("aria-pressed", String(this.view === "after"));
    const beforeBtn = docButton(doc, "整理前（原文）", () => this.switchView("before"));
    beforeBtn.dataset.tidyView = "before";
    beforeBtn.setAttribute("aria-pressed", String(this.view === "before"));
    toggleGroup.append(afterBtn, beforeBtn);

    const applyBtn = docButton(doc, "应用到左侧", () => void this.handleApply());
    applyBtn.className = "wb-tidy-primary";
    applyBtn.disabled = this.busy || !plan.operations.length;

    const closeBtn = docButton(doc, "暂不应用", () => this.close());
    closeBtn.disabled = this.busy;

    this.activeHead.replaceChildren(docElement(doc, "strong", titleText), toggleGroup, applyBtn);
    if (this.proposalId && this.callbacks.onDismissProposal) {
      const dismissBtn = docButton(doc, "忽略提案", () => void this.handleDismiss());
      dismissBtn.disabled = this.busy;
      this.activeHead.append(dismissBtn);
    }
    this.activeHead.append(closeBtn);

    // Trust & transparency strip
    this.activeMeta.replaceChildren();
    this.activeMeta.append(docElement(doc, "p", plan.summary, "wb-tidy-summary"));
    const badges = docElement(doc, "div", "", "wb-tidy-badges");
    const omitted = this.effectiveOmittedAnchors(plan);
    const totalAnchors = plan.anchors.length;
    const keptCount = totalAnchors - omitted.length;
    if (totalAnchors > 0) {
      const anchorBadge = docElement(
        doc,
        "span",
        omitted.length === 0
          ? `关键信息 ${keptCount}/${totalAnchors} 已保留`
          : `注意：${omitted.length} 处原文重点未带入（${omitted.map((a) => a.label).join("、")}）`,
        `wb-tidy-badge ${omitted.length === 0 ? "wb-tidy-badge-ok" : "wb-tidy-badge-attn"}`
      );
      badges.append(anchorBadge);
    }
    if (plan.protectedBlockCount > 0) {
      badges.append(docElement(doc, "span", `${plan.protectedBlockCount} 条受保护块（TODO/正式/属性）原样不动`, "wb-tidy-badge"));
    }
    badges.append(docElement(doc, "span", "Space 切换前后对比 · Esc 关闭", "wb-tidy-hint"));
    this.activeMeta.append(badges);

    if (plan.structuralChanges.length > 0) {
      const structBox = docElement(doc, "div", "", "wb-tidy-struct-note");
      structBox.append(
        docElement(doc, "strong", "结构调整说明："),
        doc.createTextNode(plan.structuralChanges.map((c) => c.description).join("；"))
      );
      this.activeMeta.append(structBox);
    }

    // Body blocks aligned to native outline indentation
    this.activeBody.replaceChildren();
    this.activeBody.dataset.view = this.view;
    const blocks = this.view === "after" ? plan.afterBlocks : plan.beforeBlocks;
    const minDepth = blocks.length ? Math.min(...blocks.map((b) => b.depth)) : 0;
    const indentStep = this.hostSheet ? 26 : 14;
    const omittedSet = new Set(omitted.map((a) => a.id));
    const matchedAfterAnchors = new Set<string>();

    for (const block of blocks) {
      const rawText = this.view === "after" ? this.resolveAfterContent(block) : block.content;
      const displayText = formatPreviewDisplayText(rawText, block.protected);
      const row = docElement(
        doc,
        "div",
        "",
        `wb-tidy-block${block.changed ? " wb-tidy-block-changed" : ""}${block.protected ? " wb-tidy-block-protected" : ""}`
      );
      row.dataset.blockId = block.id;
      const relDepth = Math.max(0, block.depth - minDepth);
      row.style.marginInlineStart = `${Math.min(relDepth, 5) * indentStep}px`;

      if (this.view === "after" && this.editingBlockId === block.id) {
        const editWrap = docElement(doc, "div", "", "wb-tidy-block-text");
        const area = docElement(doc, "textarea", "", "wb-tidy-edit-box");
        area.value = rawText;
        area.rows = Math.max(2, Math.min(8, rawText.split("\n").length + 1));
        const saveEdit = docButton(doc, "完成微调", () => {
          this.overrides.set(block.id, area.value);
          this.editingBlockId = null;
          this.renderPlan(true);
        });
        saveEdit.className = "wb-tidy-primary";
        const cancelEdit = docButton(doc, "取消", () => {
          this.editingBlockId = null;
          this.renderPlan(true);
        });
        const editActions = docElement(doc, "div", "", "wb-tidy-edit-actions");
        editActions.append(saveEdit, cancelEdit);
        editWrap.append(area, editActions);
        row.append(editWrap);
      } else {
        const contentNode = docElement(doc, "div", "", "wb-tidy-block-text");
        const blockAnchors: AnchorSpanMatch[] = [];
        for (const anchor of plan.anchors) {
          if (this.view === "before" && anchor.before.sourceId === block.id) {
            blockAnchors.push({
              anchorId: anchor.id,
              exactText: anchor.before.exactText,
              colorSlot: anchor.colorSlot,
              omitted: omittedSet.has(anchor.id),
              label: anchor.label,
            });
          } else if (this.view === "after" && !matchedAfterAnchors.has(anchor.id)) {
            const targetText = anchor.after
              ? anchor.after.targetId === block.id
                ? displayText.includes(anchor.after.exactText)
                  ? anchor.after.exactText
                  : displayText.includes(anchor.before.exactText)
                    ? anchor.before.exactText
                    : null
                : null
              : displayText.includes(anchor.before.exactText)
                ? anchor.before.exactText
                : null;
            if (targetText) {
              matchedAfterAnchors.add(anchor.id);
              blockAnchors.push({
                anchorId: anchor.id,
                exactText: targetText,
                colorSlot: anchor.colorSlot,
                omitted: false,
                label: anchor.label,
              });
            }
          }
        }
        renderAnchoredText(doc, contentNode, displayText, blockAnchors);
        row.append(contentNode);

        if (block.protected) {
          row.append(docElement(doc, "span", "已保护 · 原样保留", "wb-tidy-tag"));
        } else if (this.view === "after" && block.changed) {
          const tweakBtn = docButton(doc, "微调", () => {
            this.editingBlockId = block.id;
            this.renderPlan(true);
            this.activeBody.querySelector<HTMLTextAreaElement>(".wb-tidy-edit-box")?.focus();
          });
          tweakBtn.className = "wb-tidy-tweak";
          row.append(tweakBtn);
        }
      }
      this.activeBody.append(row);
    }
  }

  private async handleApply(): Promise<void> {
    if (!this.plan || this.busy) return;
    this.busy = true;
    this.activeStatus.textContent = "正在校验原块版本并安全落盘…";
    this.renderPlan(true);
    try {
      await this.callbacks.onApply(this.plan, new Map(this.overrides));
      this.close();
    } catch (error) {
      this.busy = false;
      this.activeStatus.textContent = error instanceof Error ? error.message : String(error);
      this.renderPlan(true);
    }
  }

  private async handleDismiss(): Promise<void> {
    if (!this.proposalId || !this.callbacks.onDismissProposal || this.busy) return;
    this.busy = true;
    this.activeStatus.textContent = "正在忽略此提案…";
    this.renderPlan(true);
    try {
      await this.callbacks.onDismissProposal(this.proposalId);
      this.close();
    } catch (error) {
      this.busy = false;
      this.activeStatus.textContent = error instanceof Error ? error.message : String(error);
      this.renderPlan(true);
    }
  }
}
