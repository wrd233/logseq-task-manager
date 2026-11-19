import { button, element } from "../../host/panel-host.ts";
import type { BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { briefingParagraphs, paragraphDetails, type BriefingDetail, type BriefingParagraph, type ProgressiveReading } from "./briefing-model.ts";
import { renderMarkdown } from "./markdown.ts";
import type { ReadingMaterial } from "./reading-layout.ts";
import { numericSeries, sourceTable } from "./source-table.ts";

interface ReaderActions { locate(uuid: string): void; material(id: string): void }
const version = (value: string | null | undefined) => value ? value.slice(0, 10) : "未核验";
const byId = (source: SourceSnapshot | null) => new Map(source?.blocks.map(block => [block.sourceId, block]) ?? []);
const blockChanged = (before?: BlockSnapshot, after?: BlockSnapshot) => !before || !after || before.contentVersion !== after.contentVersion || before.parentUuid !== after.parentUuid || before.depth !== after.depth || before.order !== after.order;
const materialChanged = (before?: ReadingMaterial, after?: ReadingMaterial) => !before || !after || before.version !== after.version || before.availability !== after.availability;
const kindLabel = (kind: string | undefined) => kind === "inference" ? "推断" : kind === "suggestion" ? "建议" : "";
const stamp = (date: string) => new Date(date).toLocaleString("zh-CN", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});

function rich(markdown: string, original = false): HTMLElement {
  const body = element("div", "", "wb-progressive-markdown");
  body.innerHTML = renderMarkdown(markdown, original);
  if (!original) for (const link of Array.from(body.querySelectorAll("a"))) link.replaceWith(...Array.from(link.childNodes));
  return body;
}
function inline(markdown: string): HTMLElement {
  const body = rich(markdown), span = element("span");
  for (const node of Array.from(body.querySelectorAll("*:not(strong,em,b,i,code,br,s)"))) {
    node.replaceWith(...Array.from(node.childNodes), ...(node.tagName === "P" && node.nextSibling ? [document.createTextNode(" ")] : []));
  }
  span.append(...Array.from(body.childNodes)); return span;
}

export class ProgressiveReader {
  readonly root = element("section", "", "wb-progressive");
  private readonly meta = element("div", "", "wb-progressive-meta");
  private readonly units = element("div", "", "wb-progressive-units");
  private readonly extra = element("div", "", "wb-progressive-extra");
  private nodes = new Map<string, {node:HTMLElement; signature:string}>();
  private expanded = new Set<string>();
  private storageKey = "";
  private extraSignature = "";
  constructor(private readonly actions: ReaderActions) { this.root.append(this.meta, this.units, this.extra); }

  private bind(view: ProgressiveReading) {
    const scope = view.current.scope, key = `workbench:progressive-open:${JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block",view.planId])}`;
    if (key === this.storageKey) return;
    this.storageKey = key; this.nodes.clear(); this.units.replaceChildren(); this.extra.replaceChildren(); this.extraSignature = "";
    try { this.expanded = new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { this.expanded.clear(); }
  }
  private remember() { try { localStorage.setItem(this.storageKey, JSON.stringify([...this.expanded])); } catch { /* Live disclosures remain usable. */ } }
  private disclose(key: string, label: string | HTMLElement, content: HTMLElement, fill: () => void, className = "") {
    const control = button("", () => {
      if (document.getSelection()?.isCollapsed === false && control.contains(document.getSelection()?.anchorNode ?? null)) return;
      const scroller=control.closest<HTMLElement>(".wb-scroll"), offset=control.getBoundingClientRect().top;
      const open = content.hidden;
      if (open) { this.expanded.add(key); fill(); } else this.expanded.delete(key);
      content.hidden = !open; control.setAttribute("aria-expanded", String(open)); caret.textContent = open ? "▾" : "▸";
      if(scroller)scroller.scrollTop+=control.getBoundingClientRect().top-offset;
      this.remember();
    });
    control.className = `wb-progressive-disclose ${className}`; control.dataset.progressiveAnchor = key;
    const caret = element("span", "▸", "wb-progressive-caret"); caret.setAttribute("aria-hidden", "true");
    control.append(typeof label === "string" ? document.createTextNode(label) : label, caret);
    content.hidden = !this.expanded.has(key); content.id = `wb-progressive-${crypto.randomUUID()}`;
    control.setAttribute("aria-expanded", String(!content.hidden)); control.setAttribute("aria-controls", content.id);
    if (!content.hidden) { caret.textContent = "▾"; fill(); }
    return control;
  }
  private original(block: BlockSnapshot, display?: BriefingDetail["display"]): HTMLElement {
    const content = block.content ?? "来源暂不可用", node = element("div", "", "wb-progressive-original");
    const table = display === "chart" || display === "table" ? sourceTable(content) : null;
    const series = display === "chart" && table ? numericSeries(table) : [];
    if (table && (series.length || display === "table") && table.rows.length <= 12 && table.headers.length <= 5) {
      if (series.length) for (const column of series) {
        const chart = element("div", "", "wb-progressive-chart"); chart.append(element("small", column.label, "wb-progressive-label"));
        for (const point of column.points) {
          const row = element("div", "", "wb-progressive-measure"), track = element("div", "", "wb-progressive-track"), bar = element("span");
          bar.style.width = `${point.ratio * 100}%`; track.append(bar);
          const labels = element("div", "", "wb-progressive-chart-label"); labels.append(element("span", point.label), element("strong", point.value)); row.append(labels, track); chart.append(row);
        }
        node.append(chart);
      } else {
        const tableNode = element("table"), header = element("tr"), head = element("thead"), body = element("tbody");
        header.append(...table.headers.map(value => element("th", value))); head.append(header); tableNode.append(head, body);
        for (const row of table.rows) { const line=element("tr"); line.append(...row.map(value=>element("td",value))); body.append(line); }
        node.append(tableNode);
      }
      const exact = element("details"); exact.append(element("summary", "查看完整原句"),rich(content, true)); node.append(exact);
    } else node.append(rich(content, true));
    const raw = element("details", "", "wb-progressive-raw"); raw.append(element("summary", "原始 Markdown"), element("pre", content)); node.append(raw);
    return node;
  }
  private sourceCard(before: BlockSnapshot | undefined, current: BlockSnapshot | undefined, key: string, display?: BriefingDetail["display"], historical = true): HTMLElement {
    const node = element("section", "", "wb-progressive-source"), block = current ?? before;
    node.dataset.progressiveAnchor = key; if (block) {node.dataset.progressiveSource = block.sourceId;node.dataset.progressiveUuid=block.target.blockUuid;}
    const header = element("div", "", "wb-progressive-source-head"), identity = element("small", block ? `原块 · ${block.target.blockUuid.slice(0,8)}` : "原块", "wb-progressive-label");
    if (block) identity.title = block.target.blockUuid;
    header.append(identity);
    if (current?.availability === "available") {const open=button("打开原块", () => this.actions.locate(current.target.blockUuid));open.dataset.progressiveAnchor=`${key}/open`;header.append(open);}
    node.append(header);
    if (historical) {
      const caption = element("small", `当时依据 · ${version(before?.contentVersion)}`, "wb-progressive-version"); caption.title = before?.contentVersion ?? "未保存当时原句"; node.append(caption);
      node.append(before ? this.original(before, display) : element("p", "此旧版未保存当时原句。", "wb-progressive-label"));
      if (!blockChanged(before,current)) return node;
    }
    const caption = element("small", `当前原文 · ${version(current?.contentVersion)}${historical?" · 有变化":""}`, historical ? "wb-progressive-changed" : "wb-progressive-version"); caption.title=current?.contentVersion??"当前来源不存在";
    node.append(caption,current ? this.original(current, display) : element("p","当前工作范围已无此块。","wb-progressive-label"));
    return node;
  }
  private materialCard(id: string, view: ProgressiveReading): HTMLElement {
    const before=view.materialBasis.find(material=>material.id===id),current=view.materials.find(material=>material.id===id), material=current??before;
    const node=element("section","","wb-progressive-source"),head=element("div","","wb-progressive-source-head");
    head.append(element("strong",material?.filename??"关联材料"));
    head.append(button("查看材料",()=>this.actions.material(id))); node.append(head);
    if(before){const label=element("small",`当时材料 · ${version(before.version)}`,"wb-progressive-version");label.title=before.version??"未取得内容版本";node.append(label);if(before.excerpt)node.append(rich(before.excerpt,true));}
    if(materialChanged(before,current)){
      const label=element("small",`当前材料 · ${current?version(current.version):"需重新核验"}`,"wb-progressive-changed");label.title=current?.version??"未取得当前版本";node.append(label);if(current?.excerpt)node.append(rich(current.excerpt,true));
    }
    if(!before?.excerpt&&!current?.excerpt)node.append(element("small","打开完整文件或图片查看内容。","wb-progressive-label"));
    return node;
  }
  private unit(paragraph: BriefingParagraph, key: string, view: ProgressiveReading, old: Map<string,BlockSnapshot>, current: Map<string,BlockSnapshot>): HTMLElement {
    const detailList=paragraphDetails(paragraph),refs=[...new Set([...paragraph.sourceIds,...detailList.flatMap(detail=>detail.sourceIds)])];
    const materials=[...new Set(detailList.flatMap(detail=>detail.materialIds??[]))];
    const changed=refs.some(id=>blockChanged(old.get(id),current.get(id))) || materials.some(id=>materialChanged(view.materialBasis.find(item=>item.id===id),view.materials.find(item=>item.id===id)));
    const sig=JSON.stringify([paragraph,refs.map(id=>[old.get(id),current.get(id)]),materials.map(id=>[view.materialBasis.find(item=>item.id===id),view.materials.find(item=>item.id===id)])]);
    const existing=this.nodes.get(key); if(existing?.signature===sig)return existing.node;
    const article=existing?.node??element("article","","wb-progressive-unit");
    article.dataset.tone=paragraph.tone??"";
    article.dataset.progressiveUuid=(current.get(paragraph.sourceIds[0]!)??old.get(paragraph.sourceIds[0]!))?.target.blockUuid??"";
    const line=element("p","","wb-progressive-line"),context=element("div","","wb-progressive-context");
    const fill=()=>{
      if(context.childElementCount)return;
      for(const detail of detailList){
        const detailKey=`${key}/detail/${detail.key}`,item=element("section","","wb-progressive-detail"),evidence=element("div","","wb-progressive-evidence");
        const loadEvidence=()=>{
          if(evidence.childElementCount)return;
          for(const id of detail.sourceIds){
            const before=old.get(id),after=current.get(id);
            evidence.append(this.sourceCard(before,after,`${detailKey}/source/${id}`,detail.display));
            const parent=before?.parentUuid,ancestor=view.basis?.blocks.find(block=>block.target.blockUuid===parent);
            if(ancestor&&!detail.sourceIds.includes(ancestor.sourceId)){
              const context=element("details","","wb-progressive-parent");context.append(element("summary","当时上层语境"),rich(ancestor.content??"",true));evidence.append(context);
            }
          }
          for(const id of detail.materialIds??[])evidence.append(this.materialCard(id,view));
        };
        item.dataset.progressiveUuid=(current.get(detail.sourceIds[0]!)??old.get(detail.sourceIds[0]!))?.target.blockUuid??"";
        if(detail.heading)item.append(element("h3",detail.heading));
        if(detail.kind&&kindLabel(detail.kind))item.append(element("small",kindLabel(detail.kind),"wb-progressive-tag"));
        const description=rich(detail.markdown);
        const simple=description.childElementCount===1&&description.firstElementChild?.tagName==="P";
        if(detail.markdown&&!simple)item.append(description);
        const label=detail.markdown&&simple?inline(detail.markdown):"查看原句与依据";
        item.append(this.disclose(detailKey,label,evidence,loadEvidence,"wb-progressive-detail-link"),evidence);context.append(item);
      }
    };
    if(kindLabel(paragraph.kind))line.append(element("small",kindLabel(paragraph.kind),"wb-progressive-tag"));
    line.append(this.disclose(key,inline(paragraph.markdown),context,fill,"wb-progressive-phrase"));
    article.replaceChildren(line);
    if(changed)article.append(element("small","相关依据有变化","wb-progressive-changed"));
    article.append(context);this.nodes.set(key,{node:article,signature:sig});return article;
  }
  render(container: HTMLElement, view: ProgressiveReading): void {
    this.bind(view);
    if(this.root.parentElement!==container)container.replaceChildren(this.root);
    const old=byId(view.basis),current=byId(view.current),newBlocks=view.current.blocks.filter(block=>view.basis&&!old.has(block.sourceId));
    const stale=view.briefing.basisVersion!==view.current.sourceSetVersion||!!view.basis&&view.basis.structureVersion!==view.current.structureVersion||view.materialBasis.some(material=>materialChanged(material,view.materials.find(item=>item.id===material.id)));
    const title=`${stamp(view.briefing.createdAt)} 整理 · ${version(view.briefing.basisVersion)}`;
    const meta=stale?`${title} · 依据有更新`:`${title} · ${view.basis?"生成时依据已保存":"旧版依据未留存"}`;
    if(this.meta.textContent!==meta)this.meta.textContent=meta;
    this.meta.classList.toggle("wb-progressive-changed",stale);this.meta.title=`生成依据：${view.briefing.basisVersion}\n当前记录：${view.current.sourceSetVersion}`;
    const wanted=new Set<string>();let cursor=this.units.firstElementChild;
    for(const [index,paragraph] of briefingParagraphs(view.briefing).entries()){
      const key=`unit/${paragraph.key??`${paragraph.sourceIds[0]}/${index}`}`,node=this.unit(paragraph,key,view,old,current);wanted.add(key);
      if(node!==cursor)this.units.insertBefore(node,cursor);cursor=node.nextElementSibling;
    }
    for(const [key,entry] of this.nodes)if(!wanted.has(key)){entry.node.remove();this.nodes.delete(key);}
    const extraSignature=JSON.stringify([view.current.sourceSetVersion,view.current.structureVersion,view.briefing.basisVersion,view.basis?.structureVersion,stale]);
    if(this.extraSignature!==extraSignature){
      this.extraSignature=extraSignature;this.extra.replaceChildren();
      const group=(key:string,label:string,blocks:readonly BlockSnapshot[],historical=false)=>{
        const section=element("section","","wb-progressive-full"),body=element("div","","wb-progressive-evidence");
        section.append(this.disclose(key,label,body,()=>{if(!body.childElementCount)for(const block of blocks)body.append(this.sourceCard(historical?block:undefined,historical?current.get(block.sourceId):block,`${key}/${block.sourceId}`,undefined,historical));}),body);this.extra.append(section);
      };
      if(newBlocks.length)group("new",`新增记录 · ${newBlocks.length} 条（尚未整理）`,newBlocks);
      group("full",`查看全部当前原始记录 · ${view.current.blocks.length} 条`,view.current.blocks);
      if(stale&&view.basis)group("basis",`查看生成时完整原始记录 · ${view.basis.blocks.length} 条`,view.basis.blocks,true);
    }
  }
  detach():void {this.root.remove();}
  clear():void {this.detach();this.nodes.clear();this.units.replaceChildren();this.extra.replaceChildren();this.storageKey="";this.extraSignature="";}
}
