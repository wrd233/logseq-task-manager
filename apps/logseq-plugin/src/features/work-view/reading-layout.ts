import { renderMarkdown } from "./review-renderer.ts";
import { reportProjection } from "./report-body.ts";
import type { ReadingUnit, VerifiedReadingPlan } from "./reading-plan.ts";

/** Narrow adapter to the material owner's real list/open service. */
export interface ReadingMaterial {
  id:string; filename:string; reference:string; availability:"available" | "unavailable";
}
export interface ReadingMaterialPort {
  list(scope:VerifiedReadingPlan["plan"]["scope"]):Promise<readonly ReadingMaterial[]>;
  open(id:string,scope:VerifiedReadingPlan["plan"]["scope"]):Promise<void>;
  delegateFileClick?(event:MouseEvent,scope:VerifiedReadingPlan["plan"]["scope"]):boolean;
}
interface LayoutActions {
  sources(ids:readonly string[],context:boolean,contextIds?:readonly string[]):void;
  material(id:string):void;
}
/** Finite DOM composition. Existing primary source nodes are reused, never
 * substituted with Agent text. Context copies have source IDs and no writable UUID. */
export class ReadingLayoutRenderer {
  private readonly nodes=new Map<string,HTMLElement>();
  constructor(private readonly actions:LayoutActions) {}
  private node(key:string,tag:string,className:string,wanted:Set<string>):HTMLElement {
    wanted.add(key);let node=this.nodes.get(key);
    if(!node||node.tagName.toLowerCase()!==tag) {
      node?.remove();node=document.createElement(tag);this.nodes.set(key,node);
    }
    node.className=className;return node;
  }
  private arrange(parent:HTMLElement,children:readonly HTMLElement[]):void {
    let cursor=parent.firstElementChild;
    for(const child of children) {
      if(child!==cursor)parent.insertBefore(child,cursor);
      cursor=child.nextElementSibling;
    }
    while(cursor) {const next=cursor.nextElementSibling;cursor.remove();cursor=next;}
  }
  render(container:HTMLElement,reading:VerifiedReadingPlan,primary:ReadonlyMap<string,HTMLElement>,materials:ReadonlyMap<string,ReadingMaterial>):void {
    const wanted=new Set<string>(),source=new Map(reading.basis.blocks.map(b=>[b.sourceId,b]));
    const headingByKey=new Map(reading.headings.map(h=>[h.key,h]));
    const interaction=(node:HTMLElement,ids:readonly string[],context:boolean,contextIds:readonly string[]=[])=>{
      node.tabIndex=0;node.setAttribute("role","button");
      node.onclick=event=>{
        if(event.defaultPrevented||(event.target as Element).closest("a,button,input,textarea,select")||document.getSelection()?.isCollapsed===false)return;
        this.actions.sources(ids,context,contextIds);
      };
      node.onkeydown=event=>{
        if(event.target!==node)return;
        if(event.isComposing)return;
        if(event.key==="Enter"||event.key===" ") {event.preventDefault();this.actions.sources(ids,context,contextIds);}
      };
    };
    const heading=(key:string,title:string):HTMLElement=>{
      const node=this.node(`heading:${key}`,"h2","wb-reading-heading",wanted),item=headingByKey.get(key)!;
      node.dataset.readingHeading=key;if(node.textContent!==title)node.textContent=title;
      node.setAttribute("aria-label",`${title} · 定位来源及上下文`);
      if(item.sourceIds.length)interaction(node,item.sourceIds,true,item.contextSourceIds);
      else {node.removeAttribute("tabindex");node.removeAttribute("role");node.onclick=null;node.onkeydown=null;}
      return node;
    };
    const contexts=(key:string,inherited:ReadonlySet<string>):HTMLElement[]=>{
      const ids=(reading.contexts.get(key)??[]).filter(id=>!inherited.has(id));
      if(!ids.length)return [];
      const group=this.node(`context-group:${key}`,"aside","wb-reading-context",wanted);
      const label=this.node(`context-label:${key}`,"div","wb-reading-context-label",wanted);label.textContent="来源上下文";
      const bodies=ids.map(id=>{
        const block=source.get(id)!,node=this.node(`context:${key}:${id}`,"div","wb-reading-context-body",wanted);
        node.dataset.readingContextSourceId=id;
        if(node.dataset.contentVersion!==block.contentVersion) {
          node.innerHTML=renderMarkdown(reportProjection(block.content!).markdown);node.dataset.contentVersion=block.contentVersion!;
        }
        interaction(node,[id],false);return node;
      });
      this.arrange(group,[label,...bodies]);return [group];
    };
    const unit=(value:ReadingUnit,inherited:ReadonlySet<string>=new Set()):HTMLElement=>{
      const node=this.node(`unit:${value.key}`,"section",`wb-reading-unit wb-reading-${value.kind==="material"?"material-slot":value.kind}`,wanted);
      node.dataset.readingUnit=value.key;
      const childContext=new Set([...inherited,...reading.contexts.get(value.key)??[]]);
      if(value.kind==="sequence"||value.kind==="paragraphs") {
        const rows=value.sourceIds.map(id=>primary.get(source.get(id)!.target.blockUuid)!).filter(Boolean);
        this.arrange(node,[...contexts(value.key,inherited),...rows]);node.hidden=rows.length>0&&rows.every(row=>row.hidden);
      } else if(value.kind==="group") {
        const children=value.children.map(value=>unit(value,childContext));this.arrange(node,[heading(value.key,value.title),...contexts(value.key,inherited),...children]);
        node.hidden=children.every(child=>child.hidden);
      } else if(value.kind==="comparison") {
        const grid=this.node(`columns:${value.key}`,"div","wb-reading-columns",wanted);
        grid.style.setProperty("--reading-columns",String(value.columns.length));
        const columns=value.columns.map(column=>{
          const node=this.node(`column:${column.key}`,"section","wb-reading-column",wanted),context=new Set([...childContext,...reading.contexts.get(column.key)??[]]),children=column.children.map(value=>unit(value,context));
          this.arrange(node,[heading(column.key,column.title),...contexts(column.key,childContext),...children]);node.hidden=children.every(child=>child.hidden);return node;
        });
        this.arrange(grid,columns);this.arrange(node,[heading(value.key,value.title),...contexts(value.key,inherited),grid]);node.hidden=columns.every(column=>column.hidden);
      } else {
        const material=materials.get(value.materialId),button=this.node(`material:${value.key}`,"button","wb-reading-material",wanted) as HTMLButtonElement;
        button.type="button";const name=material?.filename??"关联材料暂不可读";if(button.textContent!==name)button.textContent=name;button.disabled=!material||material.availability!=="available";
        button.onpointerdown=event=>event.preventDefault();button.onclick=()=>this.actions.material(value.materialId);
        if(material)button.dataset.materialReference=material.reference;else delete button.dataset.materialReference;
        this.arrange(node,[button]);node.hidden=false;
      }
      return node;
    };
    this.arrange(container,reading.plan.layout.map(value=>unit(value)));
    for(const [key,node] of this.nodes)if(!wanted.has(key)) {node.remove();this.nodes.delete(key);}
    container.dataset.readingPlanId=reading.plan.planId;
  }
  /** Call only after the owner has moved primary nodes back into its own layout. */
  clear():void {for(const node of this.nodes.values())node.remove();this.nodes.clear();}
}
