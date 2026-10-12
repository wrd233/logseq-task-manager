import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { lensRecord, lensText, LensInputError, requireLens } from "./lens-input.ts";
import { sameLensScope } from "./lens-source.ts";
import type { LensResult } from "./lens-controller.ts";
import { decodeReadingPlan, readingBasisChanged, validateReadingPlan, refreshReadingPlan, type ReadingPlan, type VerifiedReadingPlan } from "./reading-plan.ts";
import { ReadingViewStore, type ReadingStorage, type SavedReadingView } from "./reading-store.ts";

interface ReadingHost {
  scope():SourceScope|null; version?():string; unavailable():string|null;
  source():Promise<LensResult<SourceSnapshot>>; materials():Promise<ReadonlySet<string>>; changed():void;
  storage?:ReadingStorage; defaultMode?:"report"|"structure";
}
interface Invitation {scope:SourceScope; purpose:string; structureVersion:string; sourceSetVersion:string; selection:number; revisions:Map<string,number>}
interface View extends SavedReadingView {verified?:VerifiedReadingPlan}
const same=(a:SourceScope,b:SourceScope)=>sameLensScope(a,b)&&a.kind===b.kind&&a.pageName===b.pageName;
const failed=(error:unknown):LensResult<never>=>({ok:false,reason:error instanceof LensInputError?error.reason:"reading-unavailable"});

/** Work-owned presentation; invitations remain request-owned in the transport. */
export class ReadingPlanController {
  private generation=0; private reads=0; private disposed=false;
  private bound:SourceScope|null=null; private boundVersion="";
  private source:SourceSnapshot|null=null; private available=false;
  private materialScope:ReadonlySet<string>|null=null;
  private readonly invitations=new Map<string,Invitation>();
  private readonly plans=new Map<string,View>();
  private selected:string|null=null; private mode:"report"|"structure";
  private selection=0; private persistenceError=false;
  private readonly store:ReadingViewStore|null;
  readonly api={read:()=>this.read(),refresh:()=>this.refresh(),request:(input:unknown)=>this.request(input),
    submit:(input:unknown)=>this.submit(input),select:(id:unknown)=>this.select(id),restore:(id:unknown)=>this.restore(id),
    setMode:(mode:"report"|"structure")=>this.setMode(mode),cancel:(id?:unknown)=>this.cancel(id),original:()=>this.select(null)};
  constructor(private readonly host:ReadingHost) {this.mode=host.defaultMode??"report";this.store=host.storage?new ReadingViewStore(host.storage):null;}
  private save():void {
    if(!this.bound||!this.store)return;
    try {this.store.save(this.bound,{schemaVersion:1,mode:this.mode,selected:this.selected,
      views:[...this.plans.values()].map(({plan,revision,previous})=>({plan,revision,...(previous?{previous}:{})}))});this.persistenceError=false;}
    catch {this.persistenceError=true;}
  }
  private synchronize():void {
    const scope=this.disposed?null:this.host.scope(),version=scope?this.host.version?.()??"":"";
    if(!scope&&!this.bound||scope&&this.bound&&same(scope,this.bound)&&version===this.boundVersion)return;
    const changedWork=!scope||!this.bound||!same(scope,this.bound);
    this.generation++;this.bound=scope?{...scope}:null;this.boundVersion=version;
    this.source=null;this.available=false;this.materialScope=null;this.invitations.clear();
    if(!changedWork)return;
    this.plans.clear();this.selected=null;this.mode=this.host.defaultMode??"report";this.selection++;
    const saved=scope?this.store?.load(scope):null;
    if(saved) {
      for(const value of saved.views.slice(-8))try {const plan=decodeReadingPlan(value.plan);if(same(plan.scope,scope!))this.plans.set(plan.planId,{plan,revision:value.revision??1,...(value.previous?{previous:value.previous}:{})});}catch{ /* An unreadable view does not block the work. */ }
      this.mode=saved.mode==="structure"?"structure":"report";
      this.selected=saved.selected&&this.plans.has(saved.selected)?saved.selected:null;
    }
  }
  private ready():SourceScope {requireLens(!this.disposed,"reading-disposed");this.synchronize();const reason=this.host.unavailable();requireLens(!reason,reason??"reading-unavailable");requireLens(this.bound,"scope-mismatch");return {...this.bound};}
  private valid(scope:SourceScope,generation:number):void {requireLens(!this.disposed,"reading-disposed");const current=this.host.scope();requireLens(this.generation===generation&&current&&same(scope,current)&&(this.host.version?.()??"")===this.boundVersion,"reading-request-revoked");const reason=this.host.unavailable();requireLens(!reason,reason??"reading-unavailable");}
  private async fresh(scope:SourceScope,generation:number):Promise<SourceSnapshot> {
    const ticket=++this.reads,result=await this.host.source();this.valid(scope,generation);requireLens(ticket===this.reads,"superseded-reading-source");
    if(!result.ok){this.available=false;this.host.changed();}requireLens(result.ok,result.ok?"reading-unavailable":result.reason);
    requireLens(same(scope,result.value.scope),"scope-mismatch");this.noteSource(result.value);return result.value;
  }
  noteSource(source:SourceSnapshot):void {
    this.synchronize();if(!this.bound||!same(this.bound,source.scope))return;
    this.source=structuredClone(source);this.available=(source.page?source.page.availability==="available":source.blocks.length>0)&&source.blocks.every(b=>b.availability==="available");
    if(!this.available){this.host.changed();return;}
    for(const view of this.plans.values()) {
      try {
        const plan=refreshReadingPlan(view.plan,source),materials=this.materialScope??new Set(this.materialIds(plan));
        view.verified=validateReadingPlan(plan,source,materials);
        if(JSON.stringify(view.plan)!==JSON.stringify(plan)){view.plan=plan;this.save();}
      }catch {delete view.verified;}
    }
  }
  private materialIds(plan:ReadingPlan):string[] {const ids:string[]=[];const walk=(units:ReadingPlan["layout"])=>{for(const unit of units)if(unit.kind==="material")ids.push(unit.materialId);else if(unit.kind==="group")walk(unit.children);else if(unit.kind==="comparison")unit.columns.forEach(column=>walk(column.children));};walk(plan.layout);return ids;}
  private noteMaterials(ids:ReadonlySet<string>):void {this.materialScope=new Set(ids);if(this.source)this.noteSource(this.source);this.host.changed();}
  active(source:SourceSnapshot):VerifiedReadingPlan|null {this.synchronize();const view=this.selected?this.plans.get(this.selected):null;return this.available&&view?.verified&&!readingBasisChanged(view.verified,source)?view.verified:null;}
  read() {
    this.synchronize();const active=this.source?this.active(this.source):null;
    return {schemaVersion:1,scope:this.bound?{...this.bound}:null,mode:this.mode,activePlanId:active?this.selected:null,selectedPlanId:this.selected,
      activePlan:active?structuredClone(active.plan):null,sourceAvailability:this.available?"available":this.source?"unavailable":"unverified",
      plans:[...this.plans.values()].map(view=>({planId:view.plan.planId,name:view.plan.name,revision:view.revision,canRestore:!!view.previous,
        status:!this.available?"unverified":view.verified?"current":this.materialScope&&this.materialIds(view.plan).some(id=>!this.materialScope!.has(id))?"material-unavailable":"stale",
        structureVersion:view.plan.structureVersion,sourceSetVersion:view.plan.sourceSetVersion})),
      pendingRequests:[...this.invitations.keys()],sourceSetVersion:this.source?.sourceSetVersion??null,persistenceError:this.persistenceError,
      capabilities:{schemaVersion:1,units:["sequence","paragraphs","group","comparison","material"],fullSourceRequired:true,updatesNamedViews:true,sharedSelection:true,
        sourceText:"plugin-read",writesSource:false,authorizesTodo:false,authorizesRecognition:false}};
  }
  setMode(mode:"report"|"structure"):void {this.synchronize();this.mode=mode;this.selected=null;this.selection++;this.save();this.host.changed();}
  async refresh():Promise<LensResult<ReturnType<ReadingPlanController["read"]>>> {try {const scope=this.ready(),generation=this.generation;await this.fresh(scope,generation);const materials=await this.host.materials();this.valid(scope,generation);this.noteMaterials(materials);return {ok:true,value:this.read()};}catch(error){return failed(error);}}
  async request(input:unknown):Promise<LensResult<{requestId:string;purpose:string;source:SourceSnapshot;materialIds:string[]}>> {
    try {const raw=lensRecord(input,["schemaVersion","purpose"]);requireLens(raw.schemaVersion===1,"unsupported-reading-schema");const purpose=lensText(raw.purpose,240),scope=this.ready(),generation=this.generation;
      const source=await this.fresh(scope,generation),materialIds=await this.host.materials();this.valid(scope,generation);this.noteMaterials(materialIds);
      requireLens(this.available,"source-unavailable");requireLens(this.source?.sourceSetVersion===source.sourceSetVersion,"source-changed-during-read");
      const requestId=crypto.randomUUID();this.invitations.set(requestId,{scope,purpose,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,selection:this.selection,revisions:new Map([...this.plans].map(([id,view])=>[id,view.revision]))});
      if(this.invitations.size>32)this.invitations.delete(this.invitations.keys().next().value!);
      return {ok:true,value:{requestId,purpose,source:structuredClone(source),materialIds:[...materialIds]}};
    }catch(error){return failed(error);}
  }
  async submit(input:unknown):Promise<LensResult<{planId:string;status:"selected"|"already-selected"|"saved";revision:number}>> {
    try {
      const plan=decodeReadingPlan(input),scope=this.ready(),generation=this.generation,invitation=this.invitations.get(plan.requestId);requireLens(invitation,"reading-request-not-found");
      requireLens(same(invitation.scope,scope),"scope-mismatch");requireLens(invitation.structureVersion===plan.structureVersion&&invitation.sourceSetVersion===plan.sourceSetVersion,"reading-request-basis-mismatch");
      const source=await this.fresh(scope,generation),materials=await this.host.materials();this.valid(scope,generation);this.noteMaterials(materials);
      requireLens(this.available,"source-unavailable");requireLens(this.source?.sourceSetVersion===source.sourceSetVersion,"source-changed-during-read");requireLens(this.invitations.get(plan.requestId)===invitation,"reading-request-revoked");
      const verified=validateReadingPlan(plan,source,materials),existing=this.plans.get(plan.planId),identical=existing&&JSON.stringify(existing.plan)===JSON.stringify(plan);
      requireLens(identical||(existing?.revision??0)===(invitation.revisions.get(plan.planId)??0),"reading-view-changed");
      const selected=!!identical&&this.selected===plan.planId||invitation.selection===this.selection&&(!existing||this.selected===plan.planId),revision=identical?existing.revision:(existing?.revision??0)+1;
      if(!identical)this.plans.set(plan.planId,{plan,verified,revision,...(existing?{previous:existing.plan}:{})});
      if(selected&&!identical){this.selected=plan.planId;this.mode="report";}
      if(this.plans.size>8)this.plans.delete([...this.plans.keys()].find(id=>id!==this.selected)!);
      this.save();this.host.changed();return {ok:true,value:{planId:plan.planId,status:selected?identical?"already-selected":"selected":"saved",revision}};
    }catch(error){return failed(error);}
  }
  async select(input:unknown):Promise<LensResult> {
    try {const scope=this.ready(),generation=this.generation;if(input===null){this.selected=null;this.mode="report";this.selection++;this.save();this.host.changed();return {ok:true,value:null};}
      const id=lensText(input,128);requireLens(this.plans.has(id),"reading-plan-not-found");await this.fresh(scope,generation);const materials=await this.host.materials();this.valid(scope,generation);this.noteMaterials(materials);
      requireLens(this.available,"source-unavailable");const view=this.plans.get(id)!;validateReadingPlan(view.plan,this.source!,materials);
      this.selected=id;this.mode="report";this.selection++;this.save();this.host.changed();return {ok:true,value:null};
    }catch(error){return failed(error);}
  }
  async restore(input:unknown):Promise<LensResult> {
    try {const id=lensText(input,128),scope=this.ready(),generation=this.generation,view=this.plans.get(id);requireLens(view?.previous,"reading-history-unavailable");
      const source=await this.fresh(scope,generation),materials=await this.host.materials();this.valid(scope,generation);
      const plan=refreshReadingPlan(view.previous,source),verified=validateReadingPlan(plan,source,materials);
      this.plans.set(id,{plan,verified,revision:view.revision+1,previous:view.plan});this.save();this.host.changed();return {ok:true,value:null};
    }catch(error){return failed(error);}
  }
  cancel(requestId?:unknown):LensResult {if(this.disposed)return {ok:false,reason:"reading-disposed"};if(requestId!==undefined){try {const id=lensText(requestId,128);requireLens(this.invitations.has(id),"reading-request-not-found");this.invitations.delete(id);return {ok:true,value:null};}catch(error){return failed(error);}}this.generation++;this.invitations.clear();return {ok:true,value:null};}
  reset():void {this.save();this.generation++;this.bound=null;this.boundVersion="";this.source=null;this.available=false;this.materialScope=null;this.plans.clear();this.invitations.clear();this.selected=null;}
  dispose():void {this.disposed=true;this.reset();}
}
