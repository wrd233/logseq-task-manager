import { extractObjectNavigationLabel } from "../canonical-writing.ts";
import { hostDocument } from "./panel-host.ts";

/** Navigation-only controls beside saved work titles. Never slot/replace a native body. */
export function installReadingEntries(open: (uuid: string) => Promise<void>, openPage: () => Promise<void>, fail: (error: unknown) => void) {
  const doc = hostDocument();
  let disposed = false, generation = 0, scheduled: ReturnType<typeof setTimeout> | null = null, scanning = false, again = false;
  const saved = new Map<string, string | null>();
  const controls = new Set<HTMLElement>();
  const style = doc?.createElement("style");
  if (style) { style.dataset.workReadingStyle = "true"; style.textContent = "[data-work-reading]{flex:none;font:inherit;font-size:12px;line-height:1.5;padding:0 6px;margin:0 6px;border:1px solid var(--ls-border-color,#ddd);border-radius:4px;color:var(--ls-link-text-color,#567969);background:transparent;cursor:pointer;align-self:flex-start}[data-work-reading]:focus-visible{outline:2px solid currentColor;outline-offset:2px}"; doc!.head.append(style); }
  const remove = (node: Element) => { node.querySelectorAll<HTMLElement>(":scope > [data-work-reading]").forEach(control => { controls.delete(control); control.remove(); }); };
  const add = (parent: Element, key: string, title: string, run: () => Promise<void>) => {
    const existing = parent.querySelector<HTMLElement>(":scope > [data-work-reading]");
    if (existing?.dataset.workReading === key) { existing.setAttribute("aria-label", `阅读：${title}`); return; }
    remove(parent);
    const control = parent.ownerDocument.createElement("button"); control.type = "button";
    control.dataset.workReading = key; control.textContent = "阅读"; control.title = `阅读：${title}`; control.setAttribute("aria-label", control.title);
    // Prevent the browser/Logseq click boundary from blurring or saving a live textarea.
    for (const type of ["pointerdown", "mousedown"]) control.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); });
    control.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); if (!disposed) void run().catch(fail); });
    parent.append(control); controls.add(control);
  };
  const scan = async () => {
    if (!doc || disposed) return;
    if (scanning) { again = true; return; }
    scanning = true; const ticket = generation;
    try {
      const blocks = Array.from(doc.querySelectorAll<HTMLElement>("#main-content-container .ls-block[blockid],.cp__right-sidebar .ls-block[blockid]")).slice(0, 500);
      let cursor = 0;
      await Promise.all(Array.from({length:Math.min(4,blocks.length)}, async () => {
        while (cursor < blocks.length && !disposed && ticket === generation) {
          const block = blocks[cursor++]!, uuid = block.getAttribute("blockid")!, main = block.querySelector(":scope > .block-main-container");
          if (!main) continue;
          if (!saved.has(uuid)) { const source = await logseq.Editor.getBlock(uuid); if (disposed || ticket !== generation) return; saved.set(uuid, typeof source?.content === "string" ? source.content : null); }
          if (!block.isConnected || block.getAttribute("blockid") !== uuid) continue;
          const label = extractObjectNavigationLabel(saved.get(uuid) ?? "");
          if (label) add(main,uuid,label.title,()=>open(uuid)); else remove(main);
        }
      }));
      if (disposed || ticket !== generation) return;
      const heading = doc.querySelector("#main-content-container .page-title");
      if (heading && typeof logseq.Editor.getCurrentPage === "function") {
        const page = await logseq.Editor.getCurrentPage();
        if (disposed || ticket !== generation || !heading.isConnected) return;
        const name = String(page?.originalName ?? page?.name ?? "");
        if (page?.uuid && /(?:^|[\s/])(?:Project|Area)(?:[\s/:]|$)/iu.test(name)) add(heading,`page:${page.uuid}`,name,openPage); else remove(heading);
      }
    } catch (error) { if (!disposed && ticket === generation) fail(error); }
    finally { scanning = false; if (again) { again=false; schedule(); } }
  };
  function schedule() { if (!disposed && !scheduled) scheduled=setTimeout(()=>{scheduled=null;void scan();},60); }
  const observer = doc ? new doc.defaultView!.MutationObserver(records => {
    if (records.some(record => !((record.target as Element).closest?.("[data-work-reading]") || [...Array.from(record.addedNodes),...Array.from(record.removedNodes)].every(node => node instanceof doc.defaultView!.Element && (node as Element).matches("[data-work-reading]"))))) schedule();
  }) : null;
  observer?.observe(doc!.body,{childList:true,subtree:true});
  const offDB=logseq.DB.onChanged(event=>{
    const blocks=(event as {blocks?: Array<{uuid?:string;content?:string}>})?.blocks;
    if(Array.isArray(blocks)&&blocks.length){for(const block of blocks)if(typeof block.uuid==="string")saved.delete(block.uuid);}
    else saved.clear();
    schedule();
  });
  const offGraph=logseq.App.onCurrentGraphChanged(()=>{generation++;saved.clear();for(const control of controls)control.remove();controls.clear();schedule();});
  const preserveToolbarInput=(event:Event)=>{if((event.target as Element)?.closest?.("[data-workbench-toolbar]")){event.preventDefault();event.stopPropagation();}};
  doc?.addEventListener("mousedown",preserveToolbarInput,true);doc?.addEventListener("pointerdown",preserveToolbarInput,true);
  schedule();
  return {rescan:schedule,dispose:()=>{disposed=true;generation++;if(scheduled)clearTimeout(scheduled);observer?.disconnect();doc?.removeEventListener("mousedown",preserveToolbarInput,true);doc?.removeEventListener("pointerdown",preserveToolbarInput,true);offDB();offGraph();for(const control of controls)control.remove();controls.clear();style?.remove();}};
}
