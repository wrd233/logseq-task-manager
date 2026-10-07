import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import { lensRecord, lensText, LensInputError, requireLens } from "./lens-input.ts";
import { sameLensScope } from "./lens-source.ts";
import type { LensResult } from "./lens-controller.ts";
import { decodeReadingPlan, readingBasisChanged, validateReadingPlan, type VerifiedReadingPlan } from "./reading-plan.ts";

interface ReadingHost {
  scope():SourceScope|null;
  version?():string;
  /** null means current live reading; a history or composition input is blocked. */
  unavailable():string|null;
  source():Promise<LensResult<SourceSnapshot>>;
  materials():Promise<ReadonlySet<string>>;
  changed():void;
}
interface Invitation {scope:SourceScope; purpose:string; structureVersion:string; sourceSetVersion:string}
const same=(a:SourceScope,b:SourceScope)=>sameLensScope(a,b)&&a.kind===b.kind&&a.pageName===b.pageName;
const failed=(error:unknown):LensResult<never>=>({ok:false,reason:error instanceof LensInputError?error.reason:"reading-unavailable"});

/** Presentation state only. Scope is supplied by the owner, not by an Agent.
 * Transport additionally binds invitations to a connection and client correlation label. */
export class ReadingPlanController {
  private generation=0;
  private reads=0;
  private disposed=false;
  private bound:SourceScope|null=null;
  private boundVersion="";
  private source:SourceSnapshot|null=null;
  private available=false;
  private materialScope:ReadonlySet<string>|null=null;
  private readonly invitations=new Map<string,Invitation>();
  private readonly plans=new Map<string,VerifiedReadingPlan>();
  private selected:string|null=null;
  readonly api={
    read:()=>this.read(),request:(input:unknown)=>this.request(input),
    submit:(input:unknown)=>this.submit(input),select:(planId:unknown)=>this.select(planId),
    cancel:(requestId?:unknown)=>this.cancel(requestId),original:()=>this.select(null),
  };
  constructor(private readonly host:ReadingHost) {}
  private synchronize():void {
    const scope=this.disposed?null:this.host.scope();
    const version=scope?this.host.version?.()??"":"";
    if(!scope&&!this.bound||scope&&this.bound&&same(scope,this.bound)&&version===this.boundVersion)return;
    this.generation++;this.bound=scope?{...scope}:null;this.source=null;this.available=false;this.materialScope=null;
    this.boundVersion=version;
    this.invitations.clear();this.plans.clear();this.selected=null;
  }
  private ready():SourceScope {
    requireLens(!this.disposed,"reading-disposed");this.synchronize();
    const reason=this.host.unavailable();requireLens(!reason,reason??"reading-unavailable");
    requireLens(this.bound,"scope-mismatch");return {...this.bound};
  }
  private valid(scope:SourceScope,generation:number):void {
    requireLens(!this.disposed,"reading-disposed");
    const current=this.host.scope();
    requireLens(this.generation===generation&&current&&same(scope,current)&&(this.host.version?.()??"")===this.boundVersion,"reading-request-revoked");
    const reason=this.host.unavailable();requireLens(!reason,reason??"reading-unavailable");
  }
  private async fresh(scope:SourceScope,generation:number):Promise<SourceSnapshot> {
    const ticket=++this.reads,result=await this.host.source();this.valid(scope,generation);
    requireLens(ticket===this.reads,"superseded-reading-source");
    if(!result.ok) {const selected=this.selected;this.available=false;this.selected=null;if(selected)this.host.changed();}
    requireLens(result.ok,result.ok?"reading-unavailable":result.reason);
    requireLens(same(scope,result.value.scope),"scope-mismatch");
    this.noteSource(result.value);return result.value;
  }
  noteSource(source:SourceSnapshot):void {
    this.synchronize();if(!this.bound||!same(this.bound,source.scope))return;
    this.source=structuredClone(source);
    this.available=(source.page?source.page.availability==="available":source.blocks.length>0)&&source.blocks.every(b=>b.availability==="available");
    // Cached old plans stay inspectable, but cannot be used over new source text.
    const active=this.selected?this.plans.get(this.selected):null;
    if(!this.available||active&&readingBasisChanged(active,source)) {
      const selected=this.selected;this.selected=null;if(selected)this.host.changed();
    }
  }
  private noteMaterials(ids:ReadonlySet<string>):void {
    this.materialScope=new Set(ids);
    const active=this.selected?this.plans.get(this.selected):null;
    if(active&&active.materialIds.some(id=>!ids.has(id))) {this.selected=null;this.host.changed();}
  }
  active(source:SourceSnapshot):VerifiedReadingPlan|null {
    this.synchronize();const plan=this.selected?this.plans.get(this.selected):null;
    return this.available&&plan&&!readingBasisChanged(plan,source)?plan:null;
  }
  read() {
    this.synchronize();
    return {schemaVersion:1,scope:this.bound?{...this.bound}:null,activePlanId:this.selected,
      activePlan:this.selected?structuredClone(this.plans.get(this.selected)!.plan):null,
      sourceAvailability:this.available?"available":this.source?"unavailable":"unverified",
      plans:[...this.plans.values()].map(value=>({planId:value.plan.planId,name:value.plan.name,
        status:!this.available?"unverified":this.source?readingBasisChanged(value,this.source)?"stale":value.materialIds.some(id=>!this.materialScope?.has(id))?"material-unavailable":"current":"unverified",
        structureVersion:value.plan.structureVersion,sourceSetVersion:value.plan.sourceSetVersion})),
      pendingRequests:[...this.invitations.keys()],sourceSetVersion:this.source?.sourceSetVersion??null,
      capabilities:{schemaVersion:1,units:["sequence","paragraphs","group","comparison","material"],fullSourceRequired:true,
        sourceText:"plugin-read",writesSource:false,authorizesTodo:false,authorizesRecognition:false}};
  }
  async request(input:unknown):Promise<LensResult<{requestId:string;purpose:string;source:SourceSnapshot;materialIds:string[]}>> {
    try {
      const raw=lensRecord(input,["schemaVersion","purpose"]);requireLens(raw.schemaVersion===1,"unsupported-reading-schema");
      const purpose=lensText(raw.purpose,240),scope=this.ready(),generation=this.generation;
      const source=await this.fresh(scope,generation),materialIds=await this.host.materials();this.valid(scope,generation);
      this.noteMaterials(materialIds);
      requireLens(this.available,"source-unavailable");
      requireLens(this.source?.sourceSetVersion===source.sourceSetVersion,"source-changed-during-read");
      const requestId=crypto.randomUUID();
      this.invitations.set(requestId,{scope,purpose,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion});
      if(this.invitations.size>32)this.invitations.delete(this.invitations.keys().next().value!);
      return {ok:true,value:{requestId,purpose,source:structuredClone(source),materialIds:[...materialIds]}};
    } catch(error) {return failed(error);}
  }
  async submit(input:unknown):Promise<LensResult<{planId:string;status:"selected" | "already-selected"}>> {
    try {
      const plan=decodeReadingPlan(input),scope=this.ready(),generation=this.generation;
      const invitation=this.invitations.get(plan.requestId);requireLens(invitation,"reading-request-not-found");
      requireLens(same(invitation.scope,scope),"scope-mismatch");
      requireLens(invitation.structureVersion===plan.structureVersion&&invitation.sourceSetVersion===plan.sourceSetVersion,"reading-request-basis-mismatch");
      const source=await this.fresh(scope,generation),materials=await this.host.materials();this.valid(scope,generation);
      this.noteMaterials(materials);
      requireLens(this.available,"source-unavailable");
      requireLens(this.source?.sourceSetVersion===source.sourceSetVersion,"source-changed-during-read");
      requireLens(this.invitations.get(plan.requestId)===invitation,"reading-request-revoked");
      const verified=validateReadingPlan(plan,source,materials),existing=this.plans.get(plan.planId);
      requireLens(!existing||JSON.stringify(existing.plan)===JSON.stringify(verified.plan),"reading-plan-id-conflict");
      if(!existing)this.plans.set(plan.planId,verified);
      this.selected=plan.planId;
      if(this.plans.size>8)this.plans.delete(this.plans.keys().next().value!);
      this.host.changed();return {ok:true,value:{planId:plan.planId,status:existing?"already-selected":"selected"}};
    } catch(error) {return failed(error);}
  }
  async select(input:unknown):Promise<LensResult> {
    try {
      const scope=this.ready(),generation=this.generation;
      if(input===null) {this.selected=null;this.host.changed();return {ok:true,value:null};}
      const id=lensText(input,128),plan=this.plans.get(id);requireLens(plan,"reading-plan-not-found");
      const source=await this.fresh(scope,generation),materials=await this.host.materials();this.valid(scope,generation);
      this.noteMaterials(materials);
      requireLens(this.available,"source-unavailable");
      requireLens(!readingBasisChanged(plan,source),"stale-reading-plan");
      requireLens(this.source?.sourceSetVersion===source.sourceSetVersion,"source-changed-during-read");
      validateReadingPlan(plan.plan,source,materials);
      this.selected=id;this.host.changed();return {ok:true,value:null};
    } catch(error) {return failed(error);}
  }
  cancel(requestId?:unknown):LensResult {
    if(this.disposed)return {ok:false,reason:"reading-disposed"};
    if(requestId!==undefined) {
      try {
        const id=lensText(requestId,128);requireLens(this.invitations.has(id),"reading-request-not-found");
        this.invitations.delete(id);return {ok:true,value:null};
      } catch(error) {return failed(error);}
    }
    this.generation++;this.invitations.clear();return {ok:true,value:null};
  }
  reset():void {this.generation++;this.bound=null;this.boundVersion="";this.source=null;this.available=false;this.materialScope=null;this.plans.clear();this.invitations.clear();this.selected=null;}
  dispose():void {this.disposed=true;this.reset();}
}
