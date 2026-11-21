import { workKey } from "@task-copilot/contracts";
import type { NoteCatalogWork } from "./work-catalog.ts";
import { button, disclosureMenu, element, FeaturePanel } from "../../host/panel-host.ts";
import type { WorkView } from "../work-view/controller.ts";
import type { installCatalogPublisher } from "./catalog-publisher.ts";

type NoteCatalog = ReturnType<typeof installCatalogPublisher>;
type CatalogList = Awaited<ReturnType<NoteCatalog["read"]>>;

/** A local notebook search: opening a page is not enrollment. */
export class WorkCatalogView {
  private readonly panel = new FeaturePanel("work-search", "工作搜索");
  private readonly results = element("div", "", "wb-scroll wb-search-list");
  private readonly input = element("input");
  private readonly recent = element("div", "", "wb-search-recent");
  private readonly rows = element("ul", "", "wb-search-results");
  private readonly status = element("div", "", "wb-search-status");
  private readonly settings=disclosureMenu("···","工作搜索选项");
  private readonly auto=button("",()=>void this.perform(()=>this.notes.setEnabled(!this.catalog?.enabled)));
  private readonly unsubscribe: () => void;
  private rowMenus:ReturnType<typeof disclosureMenu>[]=[];
  private catalog: CatalogList | null = null;
  private request = 0;
  private lastRemoved: NoteCatalogWork | null = null;
  private shown = "";
  private busy = false;

  constructor(private readonly notes: NoteCatalog, private readonly work: WorkView) {
    this.panel.root.setAttribute("aria-label", "找工作");
    this.input.type = "search"; this.input.placeholder = "搜索工作或笔记";
    this.input.setAttribute("aria-label", "搜索工作或笔记"); this.input.autocomplete="off";
    this.input.oninput = () => this.renderRows();
    this.input.onkeydown = event => {
      if (event.isComposing || event.key !== "ArrowDown" && event.key !== "Enter") return;
      const target = this.results.querySelector<HTMLButtonElement>(".wb-search-entry");
      if (target) { event.preventDefault(); if (event.key === "Enter") target.click(); else target.focus(); }
    };
    this.results.addEventListener("keydown",event=>{
      if(event.isComposing||!["ArrowDown","ArrowUp"].includes(event.key))return;
      const entries=Array.from(this.results.querySelectorAll<HTMLButtonElement>(".wb-search-entry")).filter(node=>!node.closest("[hidden]"));
      const index=entries.indexOf(document.activeElement as HTMLButtonElement);
      if(index<0)return;
      event.preventDefault();(entries[index+(event.key==="ArrowDown"?1:-1)]??this.input).focus();
    });
    this.status.setAttribute("role", "status");
    const heading = element("div", "", "wb-search-heading"),line=element("div","","wb-search-line");
    const current = button("阅读当前页",()=>void this.perform(()=>this.work.openPage().then(()=>this.work.focusReading())));
    current.title="打开当前 Logseq 页面，不需要收录";
    this.settings.root.classList.add("wb-icon-menu");
    this.settings.content.append(button("从当前块开始",()=>void this.perform(()=>this.work.openCurrentWork())),button("收录当前页",()=>void this.perform(()=>notes.selectCurrentPage())),this.auto);
    this.settings.content.addEventListener("click",()=>this.settings.close());
    line.append(current,this.settings.root);heading.append(this.input,line);
    this.results.append(this.recent,this.rows);
    const content=element("div","","wb-work-search");content.append(heading,this.results,this.status);this.panel.root.append(content);
    this.unsubscribe = notes.subscribe(() => { if (this.panel.visible) void this.load(); });
  }

  async open(): Promise<void> {
    if(await logseq.Editor.checkEditing()){void logseq.UI.showMsg("请先完成本次写作，再找其他工作。","warning");return;}
    if (!await this.panel.open()) return;
    if (!this.catalog) this.status.textContent="正在查找笔记…";
    await this.load();
    if (!this.panel.visible) return;
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    try {
      const catalog = await this.notes.read();
      if (request !== this.request || !this.panel.visible) return;
      if (catalog.graphId !== this.catalog?.graphId) {
        this.input.value = ""; this.lastRemoved = null; this.shown="";
      }
      this.catalog = catalog;this.auto.textContent=catalog.enabled?"不在首页显示自动发现的工作":"在首页显示自动发现的工作";
      if(!this.lastRemoved)this.status.replaceChildren();
      this.renderRows();
    } catch (error) {
      if (request === this.request && this.panel.visible) this.status.textContent = error instanceof Error ? error.message : "笔记暂不可读，请重试。";
    }
  }

  private renderRows(): void {
    const catalog=this.catalog;if(!catalog)return;
    const query=this.input.value.trim().toLocaleLowerCase(),words=query.split(/\s+/u);
    const matches=(name:string)=>words.every(word=>name.toLocaleLowerCase().includes(word));
    const recent=this.work.recentReadings(catalog.graphId).slice(0,5);
    const recentKeys=new Set(recent.map(item=>item.scope.kind==="page"?item.scope.pageName?.toLocaleLowerCase():item.scope.rootUuid));
    const works=catalog.works.filter(work=>query?matches(`${work.title} ${work.location}`):
      (catalog.enabled||work.reason==="你手动加入的笔记")&&!recentKeys.has(work.workRef.kind==="logseq"&&work.workRef.sourceKind==="block"?work.workRef.rootUuid:work.title.toLocaleLowerCase()))
      .sort((a,b)=>b.updatedAt-a.updatedAt||a.title.localeCompare(b.title,"zh-CN"));
    const listedPages=new Set(works.flatMap(work=>work.pageSourceUuid?[work.pageSourceUuid]:[]));
    const ordinary=catalog.notes.filter(note=>!listedPages.has(note.uuid)&&(query?matches(note.name):note.hasFile&&!recentKeys.has(note.name.toLocaleLowerCase())))
      .sort((a,b)=>b.updatedAt-a.updatedAt||a.name.localeCompare(b.name,"zh-CN"));
    const visibleWorks=works.slice(0,query?50:20),visibleNotes=ordinary.slice(0,query?50:recent.length?8:12);
    const sig=JSON.stringify([query,recent,visibleWorks.map(work=>[work.workRef,work.title,work.location,work.pageSourceUuid]),visibleNotes.map(note=>[note.uuid,note.name]),catalog.enabled,works.length,ordinary.length]);
    if (sig===this.shown)return;this.shown=sig;
    const focused=document.activeElement as HTMLElement|null,key=focused?.closest<HTMLElement>("[data-key]")?.dataset.key;
    const scroll=this.results.scrollTop;
    for(const menu of this.rowMenus)menu.dispose();this.rowMenus=[];
    this.recent.replaceChildren();this.recent.hidden=!!query||!recent.length;
    if(!this.recent.hidden){
      this.recent.append(element("div","最近工作","wb-search-section"));
      recent.forEach((item,index)=>{
        const entry=button("",()=>void this.perform(()=>this.work.resumeRecent(item.scope)));
        entry.dataset.key=item.scope.rootUuid;entry.className="wb-search-entry"+(index===0?" wb-search-resume":"");
        entry.append(element("span",item.title,"wb-search-title"));
        if(index===0)entry.append(element("small",item.excerpt?`上次读到：${item.excerpt}`:"继续上次阅读"));
        this.recent.append(entry);
      });
    }
    const nodes:HTMLElement[]=[];
    if(visibleWorks.length){nodes.push(element("li","已有工作","wb-search-section"));nodes.push(...visibleWorks.map(work=>this.renderWork(work)));}
    if(visibleNotes.length){
      nodes.push(element("li",query?"其他笔记":"近期笔记","wb-search-section"));
      for(const note of visibleNotes){
        const row=element("li","","wb-search-row");row.dataset.key=note.uuid;
        const open=button(note.name,()=>void this.perform(()=>this.work.openPage(note.name,true).then(()=>this.work.focusReading())));
        open.className="wb-search-entry";open.title=note.name;row.append(open);nodes.push(row);
      }
    }
    if(!nodes.length&&this.recent.hidden)nodes.push(element("li",query?"没有找到匹配的笔记。试试简短的名称。":"还没有打开过笔记。可以直接阅读当前页。","wb-search-empty"));
    if(works.length>visibleWorks.length||ordinary.length>visibleNotes.length&&query)nodes.push(element("li","输入更具体的名称以缩小范围。","wb-search-empty"));
    this.rows.replaceChildren(...nodes);this.results.scrollTop=scroll;
    if(key){const target=Array.from(this.results.querySelectorAll<HTMLElement>("[data-key]")).find(node=>node.dataset.key===key);
      (target?.matches("button")?target:target?.querySelector<HTMLElement>("button")??this.input).focus({preventScroll:true});}
  }

  private renderWork(work: NoteCatalogWork): HTMLLIElement {
    const row=element("li","","wb-search-row");row.dataset.key=workKey(work.workRef);
    const missing=work.workRef.kind==="logseq"&&work.workRef.sourceKind==="page"&&!work.pageSourceUuid;
    const open=button("",()=>void this.perform(async()=>{
      if(missing){await this.notes.selectCurrentPage(false,work);return;}
      const source=await this.notes.resolve(work);
      if(!source)throw Error("原笔记暂不可读，请刷新后再试。");
      if(source.kind==="page")await this.work.openPage(source.name,true);else await this.work.open(source.uuid,true);
      this.work.focusReading();
    }));
    open.className="wb-search-entry";open.title=work.title;
    open.append(element("span",work.title,"wb-search-title"));
    if(missing)open.append(element("small","原笔记失联 · 可用当前页重新关联"));
    else if(work.workRef.kind==="logseq"&&work.workRef.sourceKind==="block")open.append(element("small",work.location.split(" / ").slice(1).join(" / ")));
    const menu=disclosureMenu("···",`${work.title} 的选项`);menu.root.classList.add("wb-icon-menu");this.rowMenus.push(menu);
    const original=button("打开 Logseq 原页",()=>void this.perform(async()=>{
      const source=await this.notes.resolve(work);
      if(!source)throw Error("暂时找不到原笔记。");
      if(await logseq.Editor.checkEditing())throw Error("请先结束当前输入。");
      await this.panel.close();await logseq.App.pushState("page",{name:source.name},source.kind==="block"?{anchor:`block-content-${source.uuid}`}:undefined);
    }));
    original.hidden=missing;
    menu.content.append(original,button("不在工作列表显示",()=>void this.perform(async()=>{await this.notes.setExcluded(work,true);this.lastRemoved=work;})));
    menu.content.addEventListener("click",()=>menu.close());
    row.append(open,menu.root);return row;
  }

  private async perform(operation: () => Promise<void>): Promise<void> {
    if(this.busy)return;this.busy=true;
    try{
      await operation();if(!this.panel.visible)return;await this.load();
      if(this.lastRemoved){const removed=this.lastRemoved;this.status.replaceChildren(element("span",`已移出 ${removed.title}`),button("撤销",()=>void this.perform(async()=>{await this.notes.setExcluded(removed,false);this.lastRemoved=null;})));}
    }catch(error){if(this.panel.visible)this.status.textContent=error instanceof Error?error.message:String(error);}
    finally{this.busy=false;}
  }
  dispose(): void {this.request++;this.unsubscribe();this.settings.dispose();for(const menu of this.rowMenus)menu.dispose();void this.panel.dispose();}
}
