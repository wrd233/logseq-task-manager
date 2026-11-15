import { graphIdentity } from "../../graph-adapter.ts";
import { hostDocument } from "../../host/panel-host.ts";
import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { readSelectedPages, resolveSelectedPage } from "../agent-workspace/catalog-pages.ts";
import { collectCatalog, readCatalogBlocks } from "../agent-workspace/work-catalog.ts";
import { ancestry, workObject } from "./focus.mjs";
import { renderMarkdown } from "./markdown.ts";
import { reportProjection } from "./report-body.ts";
import { ReadingViewStore } from "./reading-store.ts";
import { briefingStatus, latestBriefing, type BriefingParagraph } from "./briefing-model.ts";
import { briefingStyle } from "./briefing-style.ts";

interface BriefWork {scope:SourceScope;title:string;location:string}
interface BriefingHost {
  source(scope:SourceScope):Promise<SourceSnapshot>;
  current():SourceScope|null;
  resume(scope:SourceScope):Promise<void>;
  agent(scope:SourceScope):Promise<void>;
}
const scopeKey=(scope:SourceScope)=>JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block"]);
export async function locateBriefingSource(uuid:string):Promise<void> {
  const block=await logseq.Editor.getBlock(uuid),page=block?.page?await logseq.Editor.getPage(block.page.id):null;
  if(!page)throw new Error("此来源已删除或暂不可读。");
  await logseq.App.pushState("page",{name:String(page.originalName??page.name)},{anchor:`block-content-${uuid}`});
}

/** A separate reading surface; never mounts a panel, changes a native block or saves source text. */
export class WorkBriefingReader {
  private readonly doc=hostDocument()!;
  private readonly dialog=this.doc.createElement("dialog");
  private readonly style=this.doc.createElement("style");
  private readonly store=new ReadingViewStore(localStorage);
  private works:BriefWork[]=[];
  private index=0;
  private request=0;
  private scroll:HTMLElement|null=null;
  private readonly positions=new Map<string,number>();
  private readonly disposers:Array<()=>void>=[];
  private refreshTimer:ReturnType<typeof setTimeout>|undefined;

  constructor(private readonly host:BriefingHost) {
    this.dialog.className="work-briefing";
    this.dialog.setAttribute("aria-label","工作简报");
    this.style.textContent=briefingStyle;this.doc.head.append(this.style);this.doc.body.append(this.dialog);
    this.dialog.addEventListener("close",()=>{this.remember();this.request++;});
    this.dialog.addEventListener("click",event=>{if(event.target===this.dialog&&!(event.clientX>=this.dialog.getBoundingClientRect().left&&event.clientX<=this.dialog.getBoundingClientRect().right&&event.clientY>=this.dialog.getBoundingClientRect().top&&event.clientY<=this.dialog.getBoundingClientRect().bottom))this.close();});
    this.dialog.addEventListener("keydown",event=>{
      if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||this.doc.getSelection()?.toString()||(event.target as Element).closest("input,textarea,[contenteditable=true],summary,a"))return;
      if(event.key==="ArrowLeft"||event.key==="ArrowRight") {event.preventDefault();this.move(event.key==="ArrowLeft"?-1:1);}
    });
    const refresh=()=>{
      if(!this.dialog.open)return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer=setTimeout(()=>{void this.load();},150);
    };
    window.addEventListener("workbench-reading-views-changed",refresh);
    this.disposers.push(()=>window.removeEventListener("workbench-reading-views-changed",refresh));
    this.disposers.push(logseq.DB.onChanged(refresh));
    this.disposers.push(logseq.App.onCurrentGraphChanged(()=>{this.close();this.works=[];this.positions.clear();}));
    const off=logseq.App.registerCommandPalette({key:"workbench-work-briefing",label:"工作台：打开工作简报"},()=>this.open());
    if(typeof off==="function")this.disposers.push(off);
  }
  private node<K extends keyof HTMLElementTagNameMap>(tag:K,text="",className=""):HTMLElementTagNameMap[K] {
    const node=this.doc.createElement(tag);node.textContent=text;node.className=className;return node;
  }
  private button(label:string,run:()=>void) {
    const node=this.node("button",label);node.type="button";node.onclick=run;return node;
  }
  private remember() {
    const work=this.works[this.index];if(work&&this.scroll)this.positions.set(scopeKey(work.scope),this.scroll.scrollTop);
  }
  close():void {this.dialog.close();}
  dispose():void {this.close();clearTimeout(this.refreshTimer);for(const dispose of this.disposers)dispose();this.dialog.remove();this.style.remove();}

  async open(target?:string|SourceScope):Promise<void> {
    this.remember();this.scroll=null;
    const request=++this.request,graph=await logseq.App.getCurrentGraph();
    const graphId=graphIdentity(graph);
    let scope=typeof target==="string"?{graphId,rootUuid:target}:target;
    if(!scope) {
      const native=this.doc.activeElement?.closest(".ls-block")?.getAttribute("blockid");
      if(native) {
        const trace=await ancestry(native,id=>logseq.Editor.getBlock(id));
        if(trace.objects.length)scope={graphId,rootUuid:trace.objects.at(-1)!.uuid};
      }
      scope??=this.host.current()??undefined;
    }
    const check=()=>{if(request!==this.request)throw new Error("简报已关闭或已切换工作。");};
    const pages=[];
    for(const selected of await readSelectedPages(graphId,check)) {
      const page=await resolveSelectedPage(selected,check);
      if(page)pages.push({uuid:page.sourceUuid??page.uuid,title:page.title});
    }
    const catalog=await collectCatalog({graphId,graphName:graph?.name||graphId,blocks:await readCatalogBlocks(),pages,formal:[],getBlock:id=>logseq.Editor.getBlock(id),check});
    if(request!==this.request)return;
    this.works=catalog.works.filter(work=>work.workRef.kind==="logseq").sort((a,b)=>b.updatedAt-a.updatedAt||a.title.localeCompare(b.title,"zh-CN")).map(work=>{
      const ref=work.workRef as {rootUuid:string;sourceKind:string};
      return {scope:{graphId,rootUuid:ref.rootUuid,...(ref.sourceKind==="page"?{kind:"page" as const,pageName:work.title}:{})},title:work.title,location:work.location};
    });
    if(!scope) {
      const page=await logseq.Editor.getCurrentPage(),name=String(page?.originalName??page?.name??"");
      if(page?.uuid&&/(?:^|[\s/])(?:Project|Area)(?:[\s/:]|$)/iu.test(name))scope={graphId,rootUuid:page.uuid,kind:"page",pageName:name};
    }
    if(scope&&!this.works.some(work=>scopeKey(work.scope)===scopeKey(scope!))) {
      const block=scope.kind==="page"?null:await logseq.Editor.getBlock(scope.rootUuid);
      this.works.unshift({scope,title:scope.pageName??workObject(block?.content??"")?.title??reportProjection(block?.content??"当前工作").markdown.split("\n")[0]!,location:graph?.name||graphId});
    }
    if(request!==this.request)return;
    this.index=scope?Math.max(0,this.works.findIndex(work=>scopeKey(work.scope)===scopeKey(scope!))):0;
    if(!this.dialog.open)this.dialog.showModal();
    await this.load(true);
  }
  private move(direction:number):void {
    const next=this.index+direction;if(next<0||next>=this.works.length)return;
    this.remember();this.scroll=null;this.index=next;void this.load(true);
  }
  private sourceNode(source:SourceSnapshot,id:string):HTMLElement {
    const block=source.blocks.find(block=>block.sourceId===id),node=this.node("div","","brief-source");
    if(!block||block.availability!=="available") {node.textContent="此来源已删除或暂不可读。";return node;}
    const body=this.node("div","","brief-markdown");body.innerHTML=renderMarkdown(reportProjection(block.content??"").markdown);
    const locate=this.button("在 Logseq 定位 ↗",()=>{
      this.close();void locateBriefingSource(block.target.blockUuid).catch(error=>logseq.UI.showMsg(String(error),"warning"));
    });
    node.append(body,locate);return node;
  }
  private paragraph(value:BriefingParagraph,source:SourceSnapshot):HTMLElement {
    const node=this.node("div","",`brief-paragraph${value.tone?` brief-${value.tone}`:""}`);
    if(value.kind!=="fact")node.append(this.node("span",value.kind==="inference"?"AI 推断":"AI 建议","brief-kind"));
    const body=this.node("div","","brief-markdown");body.innerHTML=renderMarkdown(value.markdown);node.append(body);
    const sources=this.node("details","","brief-citations");sources.append(this.node("summary",`来源 · ${value.sourceIds.length}`));
    for(const id of value.sourceIds)sources.append(this.sourceNode(source,id));
    node.append(sources);return node;
  }
  private async load(loading=false):Promise<void> {
    this.remember();const request=++this.request,work=this.works[this.index];
    const header=this.node("header","","brief-header"),navigation=this.node("nav","","brief-navigation");
    navigation.setAttribute("aria-label","切换工作简报");
    const prev=this.button("←",()=>this.move(-1)),next=this.button("→",()=>this.move(1));
    prev.setAttribute("aria-label","上一篇工作简报");next.setAttribute("aria-label","下一篇工作简报");
    prev.disabled=this.index===0;next.disabled=this.index>=this.works.length-1;
    navigation.append(prev,this.node("span",`${work?this.index+1:0} / ${this.works.length}`,"brief-counter"),next);
    const close=this.button("关闭",()=>this.close());
    header.append(this.node("span","工作简报"),navigation,close);
    if(loading){this.scroll=null;this.dialog.replaceChildren(header,this.node("p","正在读取已保存的工作…","brief-scroll"));}
    if(!work) {this.dialog.replaceChildren(header,this.node("p","还没有收录工作。照常在 Logseq 记录 [事务]、[MiniProject]，或将页面加入工作搜索后再来。","brief-scroll"));return;}
    try {
      const source=await this.host.source(work.scope);
      if(request!==this.request||!this.dialog.open)return;
      const saved=this.store.load(work.scope),plan=latestBriefing(saved?.views.map(view=>view.plan)??[]),brief=plan?.briefing;
      const content=this.node("article","","brief-scroll"),title=this.node("h1",work.title),meta=this.node("p",work.location,"brief-meta");
      content.append(title,meta);
      if(source.blocks.some(block=>block.availability!=="available")||source.page?.availability==="missing"||source.page?.availability==="unavailable") {
        content.append(this.node("p","原文暂不可读。请回到 Logseq 检查这件工作，再重新打开简报。","brief-notice"));
      } else if(brief) {
        meta.append(this.doc.createTextNode(` · AI 整理于 ${new Date(brief.createdAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}`));
        if(briefingStatus(brief,source)==="stale")content.append(this.node("p","原文已更新。这份简报基于此前记录；展开来源可查看当前原文，或请 Agent 更新简报。","brief-notice brief-stale"));
        const body=this.node("div","","brief-body");brief.paragraphs.forEach(value=>body.append(this.paragraph(value,source)));content.append(body);
        if(brief.followUps?.length) {
          const followUps=this.node("aside","","brief-followups");followUps.append(this.node("p","接下来值得关注"));
          brief.followUps.forEach(value=>followUps.append(this.paragraph(value,source)));content.append(followUps);
        }
      } else {
        content.append(this.node("p","尚未生成工作简报。先读已保存的原文，也可以到 DSH 请 Agent 整理一份工作说明。","brief-notice"));
      }
      const raw=this.node("section","","brief-raw");raw.hidden=!!brief;raw.append(this.node("p","原始记录 · 仅包含已保存内容"));
      for(const block of source.blocks) {const row=this.sourceNode(source,block.sourceId);row.style.setProperty("--depth",String(block.depth));raw.append(row);}
      if(!source.blocks.length)raw.append(this.node("p","这件工作还没有正文记录。"));
      content.append(raw);
      const footer=this.node("footer","","brief-footer"),original=this.button(brief?"查看原始记录":"收起原始记录",()=>{
        raw.hidden=!raw.hidden;original.textContent=raw.hidden?"查看原始记录":"收起原始记录";
        if(!raw.hidden)raw.scrollIntoView({block:"start",behavior:"smooth"});
      });
      original.setAttribute("aria-expanded",String(!raw.hidden));
      original.addEventListener("click",()=>original.setAttribute("aria-expanded",String(!raw.hidden)));
      const message=this.node("span","","brief-footer-message");message.setAttribute("role","status");message.hidden=true;
      const agent=this.button(brief?"在 DSH 更新简报":"在 DSH 生成简报",()=>{
        agent.disabled=true;message.hidden=false;message.textContent="正在打开对应工作对话…";
        void this.host.agent(work.scope).then(()=>{message.textContent="已打开 DSH。在工作面板点“写工作简报”，发送准备好的请求。完成后回到这里即可阅读。";}).catch(error=>{message.textContent=error instanceof Error?error.message:String(error);}).finally(()=>{agent.disabled=false;});
      });
      const resume=this.button("恢复工作 ↗",()=>{this.close();void this.host.resume(work.scope).catch(error=>logseq.UI.showMsg(String(error),"warning"));});resume.className="brief-resume";
      footer.append(original,agent,resume,message);
      this.dialog.replaceChildren(header,content,footer);this.scroll=content;content.scrollTop=this.positions.get(scopeKey(work.scope))??0;
    } catch(error) {
      if(request!==this.request||!this.dialog.open)return;
      const message=this.node("div","","brief-scroll");message.append(this.node("p",`这次未能读取工作：${error instanceof Error?error.message:String(error)}`,"brief-notice"),this.button("重试",()=>{void this.load(true);}));
      this.dialog.replaceChildren(header,message);
    }
  }
}
