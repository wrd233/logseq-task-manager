import { button, element,hostDocument } from "../../host/panel-host.ts";
import type { BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { briefingParagraphs,paragraphDetails,readingBlockChanged as blockChanged,readingMaterialChanged as materialChanged,readingChanges,type BriefingDetail,type BriefingParagraph,type ProgressiveReading } from "./briefing-model.ts";
import { renderMarkdown } from "./markdown.ts";
import { reportMarkdown } from "./report-body.ts";
import { numericSeries,sourceTable } from "./source-table.ts";
import { pageWorkIds } from "../../workspace/page-identity.ts";

interface ReaderActions {locate(uuid:string):void;material(id:string):void;candidate?(anchor:HTMLElement):void}
const byId=(source:SourceSnapshot|null)=>new Map(source?.blocks.map(block=>[block.sourceId,block])??[]);
const stamp=(date:string)=>new Date(date).toLocaleDateString("zh-CN",{month:"long",day:"numeric"});
const rich=(markdown:string,original=false)=>{
  const body=element("div","","wb-progressive-markdown");body.innerHTML=renderMarkdown(markdown,original);
  if(!original)for(const link of Array.from(body.querySelectorAll("a")))link.replaceWith(...Array.from(link.childNodes));
  return body;
};
function icon(glyph:string,label:string,action:()=>void):HTMLButtonElement{
  const control=button(glyph,action);control.className="wb-progressive-icon";control.setAttribute("aria-label",label);control.title=label;return control;
}
function appendInline(body:HTMLElement,control:HTMLElement):void{
  const last=body.lastElementChild;
  if(last&&/^(P|H[1-6]|LI|BLOCKQUOTE)$/u.test(last.tagName))last.append(control);else body.append(control);
}
function placeCue(body:HTMLElement,phrase:string|undefined,control:HTMLButtonElement):void{
  const cue=phrase??body.querySelector("strong")?.textContent?.trim();
  if(cue&&cue.length<=100&&cue.length<body.textContent!.trim().length){
    const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
    let node:Node|null;
    while((node=walker.nextNode())){
      const text=node.textContent??"",at=text.indexOf(cue);
      if(at<0||node.parentElement?.closest("a,code,pre"))continue;
      const fragment=document.createDocumentFragment();
      fragment.append(document.createTextNode(text.slice(0,at)),control,document.createTextNode(text.slice(at+cue.length)));
      control.textContent=cue;control.setAttribute("aria-label",`${cue}，展开或收起细读`);node.parentNode!.replaceChild(fragment,node);return;
    }
  }
  control.textContent="⌄";control.classList.add("wb-progressive-branch");appendInline(body,control);
}
function difference(before:string,after:string):HTMLElement{
  const old=reportMarkdown(before),next=reportMarkdown(after),node=element("div","","wb-progressive-diff");
  let start=0,end=0;
  while(start<old.length&&start<next.length&&old[start]===next[start])start++;
  while(end<old.length-start&&end<next.length-start&&old[old.length-end-1]===next[next.length-end-1])end++;
  const changed=next.slice(start,next.length-end);
  node.append(document.createTextNode(next.slice(0,start)));
  if(changed)node.append(element("mark",changed));else if(old!==next)node.append(element("mark","…"));
  if(end)node.append(document.createTextNode(next.slice(next.length-end)));
  return node;
}

export class ProgressiveReader {
  readonly root=element("section","","wb-progressive");
  private readonly meta=element("div","","wb-progressive-meta");
  private readonly date=element("span");
  private readonly status=button("",()=>this.openStatus());
  private readonly units=element("article","","wb-progressive-units");
  private readonly all=icon("查看原文","查看全部原文及整理依据",()=>this.openRecords());
  private readonly popup=element("aside","","wb-progressive-popup");
  private readonly popupTitle=element("strong");
  private readonly popupBody=element("div","","wb-progressive-popup-body");
  private readonly close=icon("×","关闭依据",()=>this.closePopup(true));
  private nodes=new Map<string,{node:HTMLElement;signature:string}>();
  private expanded=new Set<string>();
  private storageKey="";
  private view:ProgressiveReading|null=null;
  private anchor:HTMLElement|null=null;
  private stopPopup:(()=>void)|null=null;
  constructor(private readonly actions:ReaderActions){
    this.status.className="wb-progressive-status";this.status.dataset.progressiveAnchor="status";
    this.all.dataset.progressiveAnchor="all-records";this.all.classList.add("wb-progressive-all");
    this.popup.id=`wb-progressive-source-${crypto.randomUUID()}`;this.popup.hidden=true;this.popup.setAttribute("role","dialog");this.popup.setAttribute("aria-modal","false");this.popup.setAttribute("aria-label","阅读依据");
    const heading=element("div","","wb-progressive-popup-head");heading.append(this.popupTitle,this.close);this.popup.append(heading,this.popupBody);
    this.meta.append(this.date,this.status,this.all);this.root.append(this.meta,this.units,this.popup);
  }
  private bind(view:ProgressiveReading):void{
    const scope=view.current.scope,ids=pageWorkIds(scope,localStorage),key=`workbench:progressive-open:${JSON.stringify([scope.graphId,ids[0],scope.kind??"block",view.planId])}`;
    if(key===this.storageKey)return;
    this.closePopup(false);this.storageKey=key;this.nodes.clear();this.units.replaceChildren();
    try{const saved=ids.map(id=>localStorage.getItem(`workbench:progressive-open:${JSON.stringify([scope.graphId,id,scope.kind??"block",view.planId])}`)).find(value=>value!==null);this.expanded=new Set(JSON.parse(saved??"[]"));}catch{this.expanded.clear();}
  }
  private remember():void{localStorage.setItem(this.storageKey,JSON.stringify([...this.expanded]));}
  private disclose(key:string,content:HTMLElement):HTMLButtonElement{
    const control=button("",()=>{
      if(document.getSelection()?.isCollapsed===false&&control.contains(document.getSelection()?.anchorNode??null))return;
      const scroller=control.closest<HTMLElement>(".wb-scroll"),offset=control.getBoundingClientRect().top,open=content.hidden;
      if(!open&&this.anchor&&content.contains(this.anchor))this.closePopup(false);
      if(open)this.expanded.add(key);else this.expanded.delete(key);
      content.hidden=!open;control.setAttribute("aria-expanded",String(open));
      if(scroller)scroller.scrollTop+=control.getBoundingClientRect().top-offset;
      this.remember();this.position();
    });
    control.className="wb-progressive-phrase";control.dataset.progressiveAnchor=key;content.id=`wb-progressive-detail-${crypto.randomUUID()}`;
    content.hidden=!this.expanded.has(key);control.setAttribute("aria-expanded",String(!content.hidden));control.setAttribute("aria-controls",content.id);
    control.setAttribute("aria-label","展开或收起细读");control.title="细读";return control;
  }
  private position():void{
    if(!this.anchor||this.popup.hidden)return;
    if(!this.anchor.isConnected||this.anchor.closest("[hidden]")){this.closePopup(false);return;}
    const area=this.root.closest<HTMLElement>(".wb-scroll")?.getBoundingClientRect(),bounds={left:Math.max(0,area?.left??0),top:Math.max(0,area?.top??0),right:Math.min(window.innerWidth,area?.right??window.innerWidth),bottom:Math.min(window.innerHeight,area?.bottom??window.innerHeight)};
    const rect=this.anchor.getBoundingClientRect(),margin=8;
    this.popup.style.width=`${Math.max(0,Math.min(390,bounds.right-bounds.left-margin*2))}px`;
    this.popup.style.maxHeight=`${Math.max(100,bounds.bottom-bounds.top-margin*2)}px`;
    const height=this.popup.offsetHeight,width=this.popup.offsetWidth;
    const left=Math.max(bounds.left+margin,Math.min(rect.right-width+18,bounds.right-width-margin));
    const below=rect.bottom+6,above=rect.top-height-6;
    const top=Math.max(bounds.top+margin,Math.min(below+height<=bounds.bottom-margin?below:above,bounds.bottom-height-margin));
    this.popup.style.left=`${left}px`;this.popup.style.top=`${top}px`;
  }
  private closePopup(focus:boolean):void{
    const previous=this.anchor;this.anchor=null;this.popup.hidden=true;this.stopPopup?.();this.stopPopup=null;
    previous?.setAttribute("aria-expanded","false");
    if(focus&&previous?.isConnected&&!previous.closest("[hidden]"))previous.focus({preventScroll:true});
  }
  private showPopup(anchor:HTMLElement,title:string,content:HTMLElement):void{
    if(this.anchor===anchor&&!this.popup.hidden){this.closePopup(true);return;}
    this.closePopup(false);this.anchor=anchor;anchor.setAttribute("aria-expanded","true");anchor.setAttribute("aria-haspopup","dialog");anchor.setAttribute("aria-controls",this.popup.id);
    this.popupTitle.textContent=title;this.popupBody.replaceChildren(content);this.popup.scrollTop=0;this.popup.hidden=false;this.position();this.close.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!this.popup.contains(target)&&!anchor.contains(target))this.closePopup(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!this.popup.hidden){event.preventDefault();event.stopPropagation();this.closePopup(true);}};
    const move=()=>this.position(),host=hostDocument(),scroll=this.root.closest(".wb-scroll");
    document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",escape,true);scroll?.addEventListener("scroll",move,{passive:true});window.addEventListener("resize",move);
    if(host&&host!==document)host.addEventListener("pointerdown",outside,true);
    this.stopPopup=()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);scroll?.removeEventListener("scroll",move);window.removeEventListener("resize",move);if(host&&host!==document)host.removeEventListener("pointerdown",outside,true);};
  }
  private navigate(action:()=>void):void{this.closePopup(true);action();}
  private original(block:BlockSnapshot,display?:BriefingDetail["display"]):HTMLElement{
    const content=block.content??"来源暂不可用",node=element("div","","wb-progressive-original");
    const table=display==="chart"||display==="table"?sourceTable(content):null,series=display==="chart"&&table?numericSeries(table):[];
    if(table&&(series.length||display==="table")&&table.rows.length<=12&&table.headers.length<=5){
      if(series.length)for(const column of series){
        const chart=element("div","","wb-progressive-chart");chart.append(element("small",column.label,"wb-progressive-label"));
        for(const point of column.points){
          const row=element("div","","wb-progressive-measure"),track=element("div","","wb-progressive-track"),bar=element("span");
          bar.style.width=`${point.ratio*100}%`;track.append(bar);
          const labels=element("div","","wb-progressive-chart-label");labels.append(element("span",point.label),element("strong",point.value));row.append(labels,track);chart.append(row);
        }node.append(chart);
      }else{
        const tableNode=element("table"),head=element("thead"),header=element("tr"),body=element("tbody");
        header.append(...table.headers.map(value=>element("th",value)));head.append(header);tableNode.append(head,body);
        for(const row of table.rows){const line=element("tr");line.append(...row.map(value=>element("td",value)));body.append(line);}node.append(tableNode);
      }
    }else node.append(rich(content,true));
    return node;
  }
  private sourceCard(before:BlockSnapshot|undefined,current:BlockSnapshot|undefined,display?:BriefingDetail["display"],historical=true):HTMLElement{
    const node=element("section","","wb-progressive-source"),block=current??before,changed=historical&&blockChanged(before,current);
    if(block){node.dataset.progressiveSource=block.sourceId;node.dataset.progressiveUuid=block.target.blockUuid;}
    const controls=element("div","","wb-progressive-source-tools"),raw=element("pre",before?.content??current?.content??"","wb-progressive-raw");raw.hidden=true;
    const rawButton=icon("…","原始 Markdown",()=>{raw.hidden=!raw.hidden;rawButton.setAttribute("aria-expanded",String(!raw.hidden));});
    rawButton.setAttribute("aria-expanded","false");
    controls.append(rawButton);
    if(current?.availability==="available")controls.append(icon("↗","打开原块",()=>this.navigate(()=>this.actions.locate(current.target.blockUuid))));
    node.append(controls);
    if(historical){
      if(changed)node.append(element("small","整理时所引","wb-progressive-label"));
      node.append(before?this.original(before,display):element("p","旧版原文未留存。","wb-progressive-label"));
      if(changed){
        node.append(element("small","当前原文","wb-progressive-change-label"));
        node.append(current?before&&display!=="chart"&&display!=="table"?difference(before.content??"",current.content??""):this.original(current,display):element("p","原记录已移除或不可用。","wb-progressive-label"));
      }
    }else if(current)node.append(this.original(current,display));
    node.append(raw);
    return node;
  }
  private materialCard(view:ProgressiveReading,id:string,quote?:string):HTMLElement{
    const old=view.materialBasis.find(item=>item.id===id),current=view.materials.find(item=>item.id===id),material=current??old;
    const node=element("section","","wb-progressive-source"),header=element("div","","wb-progressive-source-head");
    header.append(element("strong",material?.filename??"关联资料"));
    if(current?.availability==="available")header.append(icon("↗",current.note?"打开关联笔记":"打开材料",()=>this.navigate(()=>this.actions.material(id))));
    node.append(header);
    const body=(text:string|undefined,image:string|undefined)=>{
      if(text)node.append(rich(text,true));
      if(image){const img=element("img");img.alt=material?.filename??"来源图片";img.src=image;img.className="wb-progressive-image";node.append(img);}
      if(!text&&!image)node.append(element("small","完整内容请打开来源。","wb-progressive-label"));
    };
    const changed=materialChanged(old,current);
    if(old){if(changed)node.append(element("small","整理时所引","wb-progressive-label"));body(quote??old.excerpt,old.image);}
    if(changed){node.append(element("small",current?"当前来源":"来源已不可用","wb-progressive-change-label"));if(current)body(quote&&(current.text??current.excerpt??"").includes(quote)?quote:current.excerpt,current.image);}
    return node;
  }
  private evidence(detail:BriefingDetail):HTMLElement{
    const view=this.view!,old=byId(view.basis),current=byId(view.current),group=element("div");
    for(const id of detail.sourceIds){
      const before=old.get(id),after=current.get(id);group.append(this.sourceCard(before,after,detail.display));
      const parent=before?.parentUuid,ancestor=view.basis?.blocks.find(block=>block.target.blockUuid===parent);
      if(ancestor&&!detail.sourceIds.includes(ancestor.sourceId)){
        const context=element("details","","wb-progressive-parent");context.append(element("summary","上下文"),rich(ancestor.content??"",true));group.append(context);
      }
    }
    for(const id of detail.materialIds??[])group.append(this.materialCard(view,id,detail.materialQuotes?.find(quote=>quote.materialId===id)?.quote));
    return group;
  }
  private cite(key:string,number:number,detail:BriefingDetail,changed:boolean):HTMLButtonElement{
    const control=button(String(number),()=>this.showPopup(control,this.view?.current.scope.pageName??"工作依据",this.evidence(detail)));
    control.className=`wb-progressive-citation${changed?" wb-progressive-citation-changed":""}`;control.dataset.progressiveAnchor=key;
    control.setAttribute("aria-label",`查阅依据 ${number}${changed?"，有变化":""}`);control.title=changed?"依据有变化":"查阅依据";
    control.setAttribute("aria-haspopup","dialog");control.setAttribute("aria-expanded","false");return control;
  }
  private unit(paragraph:BriefingParagraph,key:string,firstNumber:number,view:ProgressiveReading,old:Map<string,BlockSnapshot>,current:Map<string,BlockSnapshot>):HTMLElement{
    const details=paragraph.details??[],references=[...new Set([...paragraph.sourceIds,...details.flatMap(detail=>detail.sourceIds)])],materials=details.flatMap(detail=>detail.materialIds??[]);
    const changed=(detail:Pick<BriefingDetail,"sourceIds"|"materialIds">)=>detail.sourceIds.some(id=>blockChanged(old.get(id),current.get(id)))||(detail.materialIds??[]).some(id=>materialChanged(view.materialBasis.find(item=>item.id===id),view.materials.find(item=>item.id===id)));
    const signature=JSON.stringify([paragraph,references.map(id=>[old.get(id)?.contentVersion,current.get(id)?.contentVersion,blockChanged(old.get(id),current.get(id))]),materials.map(id=>[view.materialBasis.find(item=>item.id===id)?.version,view.materials.find(item=>item.id===id)?.version])]);
    const existing=this.nodes.get(key);if(existing?.signature===signature){
      Array.from(existing.node.querySelectorAll<HTMLButtonElement>(".wb-progressive-citation")).forEach((control,index)=>{const number=String(firstNumber+index);if(control.textContent!==number){control.textContent=number;control.setAttribute("aria-label",`查阅依据 ${number}${control.classList.contains("wb-progressive-citation-changed")?"，有变化":""}`);}});
      return existing.node;
    }
    const article=existing?.node??element("section","","wb-progressive-unit");article.dataset.progressiveAnchor=`${key}/text`;
    article.dataset.progressiveUuid=(current.get(paragraph.sourceIds[0]!)??old.get(paragraph.sourceIds[0]!))?.target.blockUuid??"";
    const line=rich(paragraph.markdown);line.classList.add("wb-progressive-line");
    if(details.length){
      const context=element("div","","wb-progressive-context"),control=this.disclose(key,context);
      placeCue(line,paragraph.cue,control);
      if(changed({sourceIds:references,materialIds:materials})){control.classList.add("wb-progressive-phrase-changed");control.title="细读 · 依据有变化";}
      for(const [index,detail] of details.entries()){
        const detailKey=`${key}/detail/${detail.key}`,item=element("section","","wb-progressive-detail"),body=rich(detail.markdown);
        item.dataset.progressiveAnchor=`${detailKey}/text`;item.dataset.progressiveUuid=(current.get(detail.sourceIds[0]!)??old.get(detail.sourceIds[0]!))?.target.blockUuid??"";
        if(detail.heading)item.append(element("h3",detail.heading));
        appendInline(body,this.cite(detailKey,firstNumber+index,detail,changed(detail)));item.append(body);context.append(item);
      }
      article.replaceChildren(line,context);
    }else{
      const detail=paragraphDetails(paragraph)[0]!;
      appendInline(line,this.cite(`${key}/source`,firstNumber,detail,changed(detail)));article.replaceChildren(line);
    }
    this.nodes.set(key,{node:article,signature});return article;
  }
  private recordGroup(label:string,blocks:readonly BlockSnapshot[],historical:boolean):HTMLElement{
    const view=this.view!,current=byId(view.current),details=element("details","","wb-progressive-record-group"),body=element("div");details.append(element("summary",label),body);
    const fill=()=>{if(details.open&&!body.childElementCount)for(const block of blocks)body.append(this.sourceCard(historical?block:undefined,historical?current.get(block.sourceId):block,undefined,historical));};
    details.ontoggle=fill;if(!historical){details.open=true;fill();}return details;
  }
  private openRecords():void{
    if(!this.view)return;const view=this.view,content=element("div");
    content.append(this.recordGroup(`当前原文 · ${view.current.blocks.length} 条`,view.current.blocks,false));
    if(view.basis)content.append(this.recordGroup(`整理时原文 · ${view.basis.blocks.length} 条`,view.basis.blocks,true));
    if(view.materials.length){const materials=element("details"),body=element("div");materials.append(element("summary","关联资料"),body);materials.ontoggle=()=>{if(materials.open&&!body.childElementCount)for(const material of view.materials)body.append(this.materialCard(view,material.id));};content.append(materials);}
    this.showPopup(this.all,"工作记录",content);
  }
  private openStatus():void{
    const view=this.view;if(!view)return;
    if(view.candidate&&this.actions.candidate){this.closePopup(false);this.actions.candidate(this.status);return;}
    const changes=readingChanges(view),old=byId(view.basis),current=byId(view.current),content=element("div");
    for(const id of changes.sourceIds){
      if(!old.has(id))content.append(element("small","新增记录","wb-progressive-change-label"));
      content.append(this.sourceCard(old.get(id),current.get(id),undefined,old.has(id)));
    }
    for(const id of changes.materialIds){if(!view.materialBasis.some(item=>item.id===id))content.append(element("small","新增资料","wb-progressive-change-label"));content.append(this.materialCard(view,id));}
    if(!content.childElementCount)content.append(element("p","原始记录未变化。"));
    this.showPopup(this.status,"记录更新",content);
  }
  render(container:HTMLElement,view:ProgressiveReading):void{
    this.bind(view);this.view=view;
    if(this.root.parentElement!==container)container.replaceChildren(this.root);
    const old=byId(view.basis),current=byId(view.current),changes=readingChanges(view);
    this.date.textContent=`${stamp(view.briefing.createdAt)} 整理`;
    const count=changes.sourceIds.length+changes.materialIds.length;
    this.status.hidden=!count&&!view.candidate;this.status.textContent=view.candidate==="ready"?"待采用修订":view.candidate==="stale"?"修订需更新":`${count} 处更新`;
    const wanted=new Set<string>();let cursor=this.units.firstElementChild,number=1;
    for(const [index,paragraph] of briefingParagraphs(view.briefing).entries()){
      const key=`unit/${paragraph.key??`${paragraph.sourceIds[0]}/${index}`}`,node=this.unit(paragraph,key,number,view,old,current);number+=paragraph.details?.length||1;wanted.add(key);
      if(node!==cursor)this.units.insertBefore(node,cursor);cursor=node.nextElementSibling;
    }
    for(const [key,entry] of this.nodes)if(!wanted.has(key)){entry.node.remove();this.nodes.delete(key);}
    if(this.anchor&&!this.anchor.isConnected){const key=this.anchor.dataset.progressiveAnchor,focused=this.popup.contains(document.activeElement);this.closePopup(false);if(focused)Array.from(this.root.querySelectorAll<HTMLElement>("[data-progressive-anchor]")).find(node=>node.dataset.progressiveAnchor===key)?.focus({preventScroll:true});}
    this.position();
  }
  detach():void{this.closePopup(false);this.root.remove();}
  clear():void{this.detach();this.nodes.clear();this.units.replaceChildren();this.storageKey="";this.view=null;}
}
