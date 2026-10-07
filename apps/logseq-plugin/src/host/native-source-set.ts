import { hostDocument } from "./panel-host.ts";

export interface NativeSourceTarget {sourceId:string; uuid:string; page:string}
export interface NativeSourceLocation {
  status:"highlighted" | "partial" | "unavailable";
  requestedSourceIds:string[]; mountedSourceIds:string[]; highlightedSourceIds:string[]; visibleSourceIds:string[]; unavailableSourceIds:string[];
  navigation:"unchanged" | "routed" | "blocked-by-input";
}
/** Read-only native DOM/location port. It never enters editing, sets a collapsed
 * property, updates a block, replaces a textarea or restores an input value. */
export class NativeSourceSetHost {
  private readonly document=hostDocument();
  private readonly token=crypto.randomUUID();
  private readonly attribute="data-task-copilot-source-set";
  private generation=0;
  private disposed=false;
  private composing=false;
  private targets:readonly NativeSourceTarget[]=[];
  private valid:()=>boolean=()=>false;
  private observer:MutationObserver|null=null;
  private style:HTMLStyleElement|null=null;
  private readonly marked=new Set<HTMLElement>();
  private readonly start=()=>{this.composing=true;};
  private readonly end=()=>{this.composing=false;};
  private readonly escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!event.isComposing&&!this.composing)this.clear();};
  constructor() {
    this.document?.addEventListener("compositionstart",this.start,true);
    this.document?.addEventListener("compositionend",this.end,true);
    this.document?.addEventListener("keydown",this.escape,true);
  }
  private bodies():Map<string,HTMLElement[]> {
    const result=new Map<string,HTMLElement[]>();
    for(const block of Array.from(this.document?.querySelectorAll<HTMLElement>("#main-content-container .ls-block[blockid]")??[])) {
      // Source HTML and embedded content cannot impersonate the host's block wrapper.
      if(block.closest(".block-content,.block-editor"))continue;
      const uuid=block.getAttribute("blockid");if(!uuid)continue;
      const body=Array.from(block.querySelectorAll<HTMLElement>(".block-content,.block-editor"))
        .find(node=>node.closest(".ls-block")===block);
      if(!body||!this.displayed(body))continue;
      const list=result.get(uuid)??[];list.push(body);result.set(uuid,list);
    }
    return result;
  }
  private displayed(node:HTMLElement):boolean {
    const view=this.document?.defaultView;if(!view||!node.isConnected)return false;
    let ancestor:HTMLElement|null=node;
    while(ancestor) {
      const style=view.getComputedStyle(ancestor);
      if(ancestor.hidden||style.display==="none"||style.visibility==="hidden"||style.opacity==="0")return false;
      ancestor=ancestor.parentElement;
    }
    return node.getClientRects().length>0;
  }
  private visible(node:HTMLElement):boolean {
    const rect=node.getBoundingClientRect(),view=this.document?.defaultView;
    return !!view&&rect.bottom>0&&rect.top<view.innerHeight&&rect.right>0&&rect.left<view.innerWidth;
  }
  private unmark():void {
    for(const node of this.marked)if(node.getAttribute(this.attribute)===this.token)node.removeAttribute(this.attribute);
    this.marked.clear();
  }
  private paint():void {
    if(this.disposed||!this.valid()) {this.clear();return;}
    const bodies=this.bodies();this.unmark();
    for(const target of this.targets)for(const node of bodies.get(target.uuid)??[]) {node.setAttribute(this.attribute,this.token);this.marked.add(node);}
  }
  read(navigation:NativeSourceLocation["navigation"]="unchanged"):NativeSourceLocation {
    if(this.disposed||!this.valid())return {status:"unavailable",requestedSourceIds:[],mountedSourceIds:[],highlightedSourceIds:[],visibleSourceIds:[],unavailableSourceIds:[],navigation};
    const bodies=this.bodies(),mounted:string[]=[],highlighted:string[]=[],visible:string[]=[],unavailable:string[]=[];
    for(const target of this.targets) {
      const nodes=bodies.get(target.uuid)??[];
      if(nodes.length) {
        mounted.push(target.sourceId);
        if(this.style?.isConnected&&nodes.some(node=>node.getAttribute(this.attribute)===this.token))highlighted.push(target.sourceId);
        if(nodes.some(node=>this.visible(node)))visible.push(target.sourceId);
      }
      else unavailable.push(target.sourceId);
    }
    return {status:highlighted.length===this.targets.length?"highlighted":highlighted.length?"partial":"unavailable",requestedSourceIds:this.targets.map(target=>target.sourceId),mountedSourceIds:mounted,highlightedSourceIds:highlighted,visibleSourceIds:visible,unavailableSourceIds:unavailable,navigation};
  }
  async locate(targets:readonly NativeSourceTarget[],valid:()=>boolean,verify:()=>Promise<boolean>,primarySourceId?:string):Promise<NativeSourceLocation> {
    this.clear();const generation=this.generation,current=()=>!this.disposed&&generation===this.generation&&valid();
    if(!this.document||!targets.length||!current())throw new Error("NATIVE_SOURCE_SET_UNAVAILABLE");
    const primary=targets.find(target=>target.sourceId===primarySourceId)??targets[0]!;
    const body=this.bodies(),missing=!body.has(primary.uuid)?primary:targets.find(target=>!body.has(target.uuid));
    let navigation:NativeSourceLocation["navigation"]="unchanged";
    if(missing) {
      if(this.composing||await logseq.Editor.checkEditing())navigation="blocked-by-input";
      else {
        if(!current())throw new Error("NATIVE_SOURCE_SCOPE_EXPIRED");
        await logseq.App.pushState("page",{name:missing.page},{anchor:`block-content-${missing.uuid}`});navigation="routed";
        for(let attempt=0;attempt<48&&!this.bodies().has(missing.uuid);attempt++) {
          if(!current())throw new Error("NATIVE_SOURCE_SCOPE_EXPIRED");
          if(this.composing||await logseq.Editor.checkEditing()) {navigation="blocked-by-input";break;}
          await new Promise<void>(resolve=>setTimeout(resolve,25));
        }
      }
    }
    if(!current()||!await verify()||!current())throw new Error("NATIVE_SOURCE_VERSION_CHANGED");
    this.targets=targets.map(target=>({...target}));this.valid=current;
    if(!this.style) {
      const style=this.document.createElement("style");style.dataset.taskCopilotSourceSetStyle="true";
      style.textContent=`[${this.attribute}="${this.token}"]{outline:2px solid var(--ls-link-text-color,#4b8a79);outline-offset:3px;background:var(--ls-secondary-background-color,#edf4ef)!important}`;
      this.document.head.append(style);this.style=style;
    }
    this.paint();
    const view=this.document.defaultView;
    if(view&&!this.observer) {
      this.observer=new view.MutationObserver(()=>this.paint());
      // A normal host route may replace the main container itself. Observe its
      // document lifetime; painting still accepts only actual native block bodies.
      this.observer.observe(this.document.body,{childList:true,subtree:true});
    }
    if(!this.composing&&!await logseq.Editor.checkEditing()&&current())this.bodies().get(primary.uuid)?.[0]?.scrollIntoView?.({block:"nearest",inline:"nearest"});
    return this.read(navigation);
  }
  clear():void {this.generation++;this.observer?.disconnect();this.observer=null;this.unmark();this.targets=[];this.valid=()=>false;}
  dispose():void {
    this.disposed=true;this.clear();this.style?.remove();this.style=null;
    this.document?.removeEventListener("compositionstart",this.start,true);this.document?.removeEventListener("compositionend",this.end,true);this.document?.removeEventListener("keydown",this.escape,true);
  }
}
