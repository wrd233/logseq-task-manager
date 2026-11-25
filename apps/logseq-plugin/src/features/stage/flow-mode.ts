import { hostDocument } from "../../host/panel-host.ts";

const editorSelector = "#main-content-container .editor-wrapper textarea";
const FLOW_CSS = `
body.tc-paper-scene :is(.cp__header, #left-sidebar, .cp__right-sidebar, .cp__sidebar-help-btn, .tcs-lsq-focus-bar) { transition: opacity 180ms ease; }
body.tc-in-flow :is(.cp__header, #left-sidebar, .cp__right-sidebar, .cp__sidebar-help-btn, .tcs-lsq-focus-bar) { opacity: 0; pointer-events: none; transition-duration: 600ms; }
body.tc-in-flow :is(.cp__header, #left-sidebar, .cp__right-sidebar, .tcs-lsq-focus-bar):focus-within:not(:has(.editor-wrapper textarea:focus)) { opacity: 1; pointer-events: auto; transition-duration: 180ms; }
@supports selector(.ls-block:has(.editor-wrapper)) {
  body.tc-in-flow.tc-para-focus #main-content-container :has(> .ls-block .editor-wrapper textarea:focus)
    > .ls-block:not(:has(.editor-wrapper textarea:focus)) > .block-main-container {
    opacity: .32;
    transition: opacity 600ms ease;
  }
  body.tc-in-flow.tc-para-focus #main-content-container :has(> .ls-block .editor-wrapper textarea:focus)
    > .ls-block:not(:has(.editor-wrapper textarea:focus)):hover > .block-main-container { opacity: .78; }
}
.tc-beacon > .block-main-container { animation: tc-paper-glow 1500ms ease-out; }
@keyframes tc-paper-glow {
  0%, 60% { background: color-mix(in srgb, var(--ls-link-text-color, #316292) 12%, transparent); }
  100% { background: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  body.tc-paper-scene :is(.cp__header, #left-sidebar, .cp__right-sidebar, .cp__sidebar-help-btn, .tcs-lsq-focus-bar, .block-main-container) { transition: none !important; }
  .tc-beacon > .block-main-container { animation: none; }
}
`;

export interface PaperAnchor {
  uuid: string;
  start?: number;
  end?: number;
  direction?: "forward" | "backward" | "none";
}

function isTextarea(element: Element | null): element is HTMLTextAreaElement {
  return element?.matches?.(editorSelector) === true;
}

export class FlowMode {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private composing = false;
  private scene: string | null = null;
  private paragraphFocus = true;
  private lastAnchor: PaperAnchor | null = null;
  private version = 0;
  private disposed = false;
  private readonly style: HTMLStyleElement | undefined;
  private readonly compositionDocuments: Document[];

  constructor(
    readonly document = hostDocument(),
    private readonly onAnchor: (anchor: PaperAnchor) => void = () => undefined,
    private readonly typingDelay = 1000,
  ) {
    this.compositionDocuments = [...new Set([document, globalThis.document].filter((doc): doc is Document => Boolean(doc)))];
    if (document) {
      this.style = document.createElement("style");
      this.style.id = "tc-paper-flow-style";
      this.style.textContent = FLOW_CSS;
      document.head.append(this.style);
      document.addEventListener("input", this.onInput, true);
      document.addEventListener("focusin", this.onFocus, true);
      document.addEventListener("keydown", this.onKeyDown, true);
      document.addEventListener("mousemove", this.onMouseMove, true);
    }
    for (const doc of this.compositionDocuments) {
      doc.addEventListener("compositionstart", this.startComposition, true);
      doc.addEventListener("compositionend", this.endComposition, true);
    }
  }

  get isComposing(): boolean { return this.composing; }
  get isParagraphFocusEnabled(): boolean { return this.paragraphFocus; }
  get isHidden(): boolean { return this.document?.body.classList.contains("tc-in-flow") ?? false; }

  setScene(key: string | null): void {
    if (this.scene === key) return;
    this.scene = key;
    this.lastAnchor = null;
    this.showChrome();
    this.document?.body.classList.toggle("tc-paper-scene", Boolean(key));
  }

  toggleParagraphFocus(): boolean {
    this.paragraphFocus = !this.paragraphFocus;
    this.document?.body.classList.toggle("tc-para-focus", this.paragraphFocus);
    return this.paragraphFocus;
  }

  showChrome(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.document?.body.classList.remove("tc-in-flow");
  }

  captureAnchor(): PaperAnchor | null {
    const focused = this.readAnchor(this.document?.activeElement ?? null);
    return focused ?? this.lastAnchor;
  }

  private readAnchor(target: Element | null): PaperAnchor | null {
    if (!isTextarea(target)) return null;
    const uuid = target.closest(".ls-block[blockid]")?.getAttribute("blockid");
    return uuid ? { uuid, start: target.selectionStart, end: target.selectionEnd, direction: target.selectionDirection } : null;
  }

  private remember(target: EventTarget | null): void {
    const anchor = this.readAnchor(target as Element | null);
    if (!anchor || !this.scene) return;
    const changed = anchor.uuid !== this.lastAnchor?.uuid;
    this.lastAnchor = anchor;
    if (changed) this.onAnchor(anchor);
  }

  private onFocus = (event: FocusEvent) => { this.remember(event.target); };
  private onInput = (event: Event) => {
    const target = event.target as Element | null;
    if (!isTextarea(target) || !this.scene) return;
    this.version++;
    this.remember(target);
    if (this.timer !== undefined || this.isHidden) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.scene || !isTextarea(this.document?.activeElement ?? null)) return;
      this.document?.body.classList.toggle("tc-para-focus", this.paragraphFocus);
      this.document?.body.classList.add("tc-in-flow");
    }, this.typingDelay);
  };

  private startComposition = () => { this.composing = true; this.version++; };
  private endComposition = () => { this.composing = false; };
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.isComposing && !this.composing) this.showChrome();
  };
  private onMouseMove = (event: MouseEvent) => {
    if (event.clientY <= 12) this.showChrome();
  };

  findBlock(uuid: string): HTMLElement | undefined {
    return Array.from(this.document?.querySelectorAll<HTMLElement>("#main-content-container .ls-block[blockid]") ?? [])
      .find((block) => block.getAttribute("blockid") === uuid);
  }

  private prefersReducedMotion(): boolean {
    return this.document?.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  async jump(anchor: PaperAnchor, edit: (anchor: PaperAnchor) => Promise<void>, onThisRoute: () => boolean, beacon = true): Promise<boolean> {
    const version = ++this.version;
    const original = this.readAnchor(this.document?.activeElement ?? null);
    const ready = () => version === this.version && !this.composing && !this.disposed;
    for (let attempt = 0; attempt <= 20 && ready(); attempt++) {
      const block = onThisRoute() ? this.findBlock(anchor.uuid) : undefined;
      if (block) {
        const editing = this.readAnchor(this.document?.activeElement ?? null);
        if (editing && editing.uuid !== anchor.uuid && editing.uuid !== original?.uuid) return false;
        block.scrollIntoView?.({ block: "center", behavior: this.prefersReducedMotion() ? "instant" : "smooth" });
        if (beacon) {
          block.classList.remove("tc-beacon");
          void block.offsetWidth;
          block.classList.add("tc-beacon");
          setTimeout(() => block.classList.remove("tc-beacon"), 1500);
        }
        if (!ready()) return false;
        if (editing?.uuid !== anchor.uuid) await edit(anchor);
        if (anchor.start !== undefined && ready() && onThisRoute()) {
          for (let tries = 0; tries < 8 && ready(); tries++) {
            const active = this.document?.activeElement ?? null;
            if (isTextarea(active) && this.readAnchor(active)?.uuid === anchor.uuid) {
              active.setSelectionRange(anchor.start, anchor.end ?? anchor.start, anchor.direction);
              break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
          }
        }
        return true;
      }
      if (attempt < 20) await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.setScene(null);
    this.document?.body.classList.remove("tc-para-focus");
    this.style?.remove();
    this.document?.removeEventListener("input", this.onInput, true);
    this.document?.removeEventListener("focusin", this.onFocus, true);
    this.document?.removeEventListener("keydown", this.onKeyDown, true);
    this.document?.removeEventListener("mousemove", this.onMouseMove, true);
    for (const doc of this.compositionDocuments) {
      doc.removeEventListener("compositionstart", this.startComposition, true);
      doc.removeEventListener("compositionend", this.endComposition, true);
    }
  }
}
