import { hostDocument, type FeaturePanel } from "./panel-host.ts";

/** Generic host UI only; source membership and versions belong to the consumer. */
export class NativeEditorHost {
  private readonly document = hostDocument();
  private composing = false;
  private disposed = false;
  private control: HTMLButtonElement | null = null;
  private readonly drops = new Set<() => void>();
  private readonly start = () => { this.composing = true; };
  private readonly end = () => { this.composing = false; this.onCompositionEnd(); };
  constructor(private readonly onReturn: () => void, private readonly onCompositionEnd: () => void = () => undefined) {
    this.document?.addEventListener("compositionstart",this.start,true);
    this.document?.addEventListener("compositionend",this.end,true);
  }
  get isComposing(): boolean { return this.composing; }
  async editing(): Promise<string | boolean> { return this.disposed ? true : logseq.Editor.checkEditing(); }
  async available(): Promise<boolean> { const editing=await this.editing(); return !this.disposed && !this.composing && !editing; }
  async expose(panel: FeaturePanel): Promise<"beside" | "switch"> {
    const mode=await panel.exposeNative(() => this.showReturn());
    if (mode === "switch") this.showReturn(); else this.hideReturn();
    return mode;
  }
  showReturn(): void {
    if (this.disposed || this.control || !this.document) return;
    const control = this.document.createElement("button"); control.type = "button";
    control.dataset.nativeReportReturn = "true"; control.textContent = "返回正文"; control.title = "返回正文 · Cmd/Ctrl+Alt+R";
    control.setAttribute("aria-label","返回正文");
    control.style.cssText = "font:inherit;font-size:13px;padding:4px 9px;border:1px solid var(--ls-border-color,#aaa);border-radius:4px;color:var(--ls-primary-text-color,#222);background:var(--ls-primary-background-color,#fff);cursor:pointer;margin:4px;flex:none";
    // Keep the native editor focused until the consumer has checked for a draft.
    control.onpointerdown = event => event.preventDefault();
    control.addEventListener("mousedown", event => event.preventDefault());
    control.onclick = () => { this.onReturn(); };
    const header = this.document.querySelector(".cp__header");
    if (header) header.append(control);
    else { control.style.position="fixed"; control.style.top="8px"; control.style.right="16px"; control.style.zIndex="1000"; this.document.body.append(control); }
    this.control = control;
  }
  hideReturn(): void { this.control?.remove(); this.control = null; }
  /** Reuse the exact live editor without reloading its value or changing its selection. */
  focusExisting(uuid: string, valid: () => boolean): boolean {
    if (this.disposed || !valid() || this.composing) return false;
    const input=this.input(uuid);
    if (!input || !input.isConnected) return false;
    if (!this.visible(input)) return false;
    input.focus({preventScroll:true}); return true;
  }
  private visible(input: HTMLElement): boolean {
    const view=this.document?.defaultView;
    return !!view && view.getComputedStyle(input).visibility !== "hidden" && view.getComputedStyle(input).display !== "none";
  }
  private input(uuid: string): HTMLTextAreaElement | undefined {
    return Array.from(this.document?.querySelectorAll<HTMLTextAreaElement>("#main-content-container .block-editor textarea") ?? [])
      .find(node=>node.closest(".ls-block")?.getAttribute("blockid") === uuid);
  }
  private block(uuid: string): HTMLElement | undefined {
    return Array.from(this.document?.querySelectorAll<HTMLElement>("#main-content-container .ls-block[blockid]") ?? [])
      .find(node=>node.getAttribute("blockid") === uuid);
  }
  private async frames(): Promise<void> {
    const view=this.document?.defaultView;
    if (view) await new Promise<void>(resolve=>{
      const timer=setTimeout(resolve,80);
      view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
    });
  }
  private async inputReady(uuid: string, valid: () => boolean): Promise<boolean> {
    for (let attempt=0;attempt<24;attempt++) {
      if (this.disposed || !valid()) throw new Error("NATIVE_SCOPE_EXPIRED");
      const input=this.input(uuid);
      if (input?.isConnected && this.visible(input)) {
        await this.frames();
        if (!valid()) throw new Error("NATIVE_SCOPE_EXPIRED");
        if (this.input(uuid) === input && await this.editing() === uuid && valid() && !this.composing && (this.document?.activeElement === input || this.focusExisting(uuid,valid))) return true;
      }
      await new Promise<void>(resolve=>setTimeout(resolve,20));
    }
    return false;
  }
  /** Opt-in consumer port. Observe real native bodies only; ownership/preventDefault remains with materials. */
  observeDrops(consume: (event: DragEvent, uuid: string) => void): () => void {
    const main=this.document?.querySelector("#main-content-container");
    if (this.disposed || !main) return () => undefined;
    const handler=(event: Event) => {
      const drop=event as DragEvent, target=drop.target as Element | null;
      if (this.disposed || !drop.isTrusted || drop.defaultPrevented || this.composing || typeof target?.closest !== "function") return;
      const body=target.closest(".block-content,.block-editor"), block=body?.closest(".ls-block[blockid]"), uuid=block?.getAttribute("blockid");
      if (body && main.contains(body) && uuid) consume(drop,uuid);
    };
    main.addEventListener("drop",handler,true);
    const stop=()=>{main.removeEventListener("drop",handler,true);this.drops.delete(stop);};
    this.drops.add(stop);return stop;
  }
  async open(uuid: string, page: string, valid: () => boolean, verify: () => Promise<boolean>): Promise<void> {
    if (!valid()) throw new Error("NATIVE_SCOPE_EXPIRED");
    if (!await this.available() || !valid()) throw new Error("NATIVE_EDITING_OR_SCOPE_CHANGED");
    // Avoid resetting an already rendered page. SDK routing acknowledgements precede its native DOM.
    if (!this.block(uuid)) {
      // SDK 0.3.4 scrollToBlockInPage discards pushState's promise; await the actual routing API.
      await logseq.App.pushState("page",{name:page},{anchor:`block-content-${uuid}`});
      // pushState is typed void by SDK 0.3.4. Its acknowledgement does not mean
      // that the installed Desktop has mounted the destination native page.
      for (let attempt=0; !this.block(uuid) && attempt<60; attempt++) {
        if (!valid()) throw new Error("NATIVE_SCOPE_EXPIRED");
        if (!await this.available()) throw new Error("NATIVE_EDITING_OR_SCOPE_CHANGED");
        await new Promise<void>(resolve=>setTimeout(resolve,25));
      }
      if (!this.block(uuid)) throw new Error("NATIVE_INPUT_UNAVAILABLE");
    }
    await this.frames();
    this.block(uuid)?.scrollIntoView?.({block:"nearest",inline:"nearest"});
    if (!valid() || !await this.available()) throw new Error("NATIVE_EDITING_OR_SCOPE_CHANGED");
    if (!valid() || !await verify() || !valid()) throw new Error("NATIVE_SOURCE_EXPIRED");
    await logseq.Editor.editBlock(uuid);
    if (await this.inputReady(uuid,valid)) return;
    // A delayed route can cancel the first edit. Retry once only if no native input is active.
    if (!valid() || !await this.available() || !await verify() || !valid()) throw new Error("NATIVE_INPUT_UNAVAILABLE");
    await logseq.Editor.editBlock(uuid);
    if (!await this.inputReady(uuid,valid)) throw new Error("NATIVE_INPUT_UNAVAILABLE");
  }
  dispose(): void {
    this.disposed=true;
    for (const stop of [...this.drops]) stop();
    this.hideReturn(); this.document?.removeEventListener("compositionstart",this.start,true); this.document?.removeEventListener("compositionend",this.end,true);
  }
}
