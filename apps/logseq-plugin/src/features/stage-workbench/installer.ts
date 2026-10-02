import type { ContentInstallation } from "../content-writeback/installer.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { parsePatch, sameScope, sha256, uuid } from "../content-writeback/validation.ts";
import type { Patch, SourceScope } from "../content-writeback/protocol.ts";
import type { MaterialView } from "../materials/service.ts";
import { desktopFiles } from "../../host/desktop-files.ts";
import type { WorkView } from "../work-view/controller.ts";
import { StageStore } from "./store.ts";
import { fields, revisionId, StageRecorder } from "./recorder.ts";
import { StageReview } from "./review.ts";
import type { StageFile, StageStorage } from "./protocol.ts";

export interface StageMaterials {
  read(id:string):Promise<MaterialView>;
  list(scope:SourceScope):Promise<Array<{id:string;title:string}>>;
}
export function installStageWorkbench(options:{content:ContentInstallation;work?:WorkView|null;materials?:StageMaterials;storage?:StageStorage}){
  const content=options.content,store=new StageStore(options.storage??logseq.FileStorage);
  let disposed=false;const queues=new Map<string,Promise<unknown>>();
  const scope=():SourceScope=>{const selected=content.api.scope();if(disposed||!selected)throw Error("AUTHORIZATION_REQUIRED");return selected;};
  const recorder=new StageRecorder(store,{
    scope:()=>disposed?null:content.api.scope(),lifetime:content.local.lifetime,
    read:()=>content.api.read(),result:id=>content.api.result(id),history:()=>content.api.history(),
    file:async id=>{
      if(!options.materials)throw Error("MATERIALS_UNAVAILABLE");
      const selected=scope(),graph=await logseq.App.getCurrentGraph(),material=await options.materials.read(id);
      if(graphIdentity(graph)!==selected.graphId||!sameScope(scope(),selected)||!material.associations.some(a=>a.graph===graph?.path&&a.sourceUuid===selected.rootUuid))throw Error("STAGE_FILE_OUTSIDE_WORK");
      let size:number|null=null,problem=material.problem??null;
      if(material.availability==="available"){
        try{const stat=await desktopFiles(()=>selected.graphId).stat!(material.path);size=stat.size;}
        catch(error){problem=`${problem??""} 文件大小未核验：${String(error)}`;}
      }
      const file:StageFile={id:material.id,title:material.title,path:material.path,role:material.role,availability:material.availability,version:material.version,content:material.content,size,hash:material.version,editing:{...material.capabilities.edit},problem,retention:material.content!==null?"text-snapshot":"record-only"};
      return file;
    },
  });
  const authorize=async(selected:SourceScope)=>{
    if(!content.api.scope()||!sameScope(content.api.scope()!,selected))await content.local.authorize(selected.rootUuid);
    if(!sameScope(scope(),selected))throw Error("STAGE_SCOPE_REVOKED");
  };
  const submit=async(input:unknown,local=false)=>{
    const value=fields(input,["stageId","expectedRevision","patch","correctionOf"]),id=uuid(value.stageId),expected=uuid(value.expectedRevision),patch=parsePatch(value.patch),selected=scope();
    if(!sameScope(patch.scope,selected)||patch.metadata?.stageId!==id)throw Error("STAGE_PATCH_SCOPE");
    const ticket=content.local.lifetime();
    const valid=()=>{if(disposed||content.local.lifetime()!==ticket)throw Error("STAGE_SCOPE_REVOKED");};
    const key=JSON.stringify(selected);
    const action=async()=>{
      valid();const history=await store.history(selected),stage=history.stages.find(s=>s.start.id===id);valid();
      if(!stage||history.current!==id||history.problems.length||stage.problems.length)throw Error("STAGE_NOT_CURRENT");
      // Query the same request first after a lost response or stage-save failure.
      const previous=await content.api.result(patch.requestId);valid();
      if(previous&&previous.record.digest!==await sha256(JSON.stringify(patch)))throw Error("IDEMPOTENCY_KEY_REUSED");
      const recorded=stage.revisions.find(r=>r.requestKey===`result:${patch.requestId}`);
      if(previous&&recorded)return {...previous,stageRevision:recorded.id,stageProblem:null};
      if(!previous&&revisionId(stage)!==expected)throw Error("STAGE_REVISION_CONFLICT");
      // Freeze observable inter-stage/native edits before dispatch. Failure here prevents writes.
      let base=revisionId(stage);
      if(!previous){
        const observed=await recorder.checkpoint({stageId:id,expectedRevision:base,requestKey:`observe:${patch.requestId}`,requestIds:[]});valid();base=observed.id;
      }
      const actual=previous??await (local?content.local.apply(patch,"stage-review-edit"):content.api.apply(patch));valid();
      try{
        const revision=await recorder.checkpoint({stageId:id,expectedRevision:base,requestKey:`result:${patch.requestId}`,requestIds:[patch.requestId],correctionOf:value.correctionOf??null});valid();
        await review?.reload();valid();await options.work?.refresh();
        return {...actual,stageRevision:revision.id,stageProblem:null};
      }catch(error){
        // Source success and stage storage are independent facts. Never replay source here.
        return {...actual,stageRevision:null,stageProblem:error instanceof Error?error.message:String(error)};
      }
    };
    const pending=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(action);queues.set(key,pending);
    try{return await pending;}finally{if(queues.get(key)===pending)queues.delete(key);}
  };
  const review=options.work?new StageReview(recorder,{
    authorize,read:()=>content.api.read(),listFiles:selected=>options.materials?.list(selected)??Promise.resolve([]),
    submit:(stageId,expectedRevision,operations,local,requestId,correctionOf)=>{
      const patch:Patch={schemaVersion:1,requestId,scope:scope(),operations,metadata:{stageId,runId:null}};
      return submit({stageId,expectedRevision,patch,correctionOf},local);
    },
  }):null;
  if(review&&options.work)review.attach(options.work.attachReview(review));
  const off=logseq.App.onCurrentGraphChanged(()=>recorder.invalidate());
  const disposers:Array<()=>void>=[off];
  const command=(key:string,label:string,action:()=>Promise<unknown>,binding?:string)=>{
    const remove=logseq.App.registerCommandPalette({key,label,...(binding?{keybinding:{binding}}:{})},()=>{if(!disposed)return action().catch(error=>logseq.UI.showMsg(String(error),"warning"));});
    if(typeof remove==="function")disposers.push(remove);
  };
  command("stage-begin","工作台：开始有意义阶段",async()=>{if(!options.work||!review)throw Error("WORK_VIEW_UNAVAILABLE");await options.work.open();await review.begin();});
  command("stage-checkpoint","工作台：提交当前阶段结果",async()=>review?.checkpoint());
  command("stage-history","工作台：查看阶段历史",async()=>{await options.work?.open();await review?.reload();review?.bar.querySelector<HTMLDetailsElement>("details")?.setAttribute("open","");});
  command("stage-accept","工作台：认可当前所见阶段版本",async()=>review?.acceptSeen(),"mod+alt+enter");
  const api={
    begin:async(input:unknown)=>{const result=await recorder.begin(input);await review?.reload();return result;},
    read:async(input:unknown)=>{const value=fields(input,["stageId"]);return recorder.read(scope(),uuid(value.stageId));},
    history:async()=>store.history(scope()),
    checkpoint:async(input:unknown)=>{const result=await recorder.checkpoint(input);await review?.reload();return result;},
    reconcile:async(input:unknown)=>{const result=await recorder.reconcile(input);await review?.reload();return result;},
    activate:async(input:unknown)=>{const result=await recorder.activate(input);await review?.reload();return result;},
    submit:(input:unknown)=>submit(input),
    scope:()=>disposed?null:content.api.scope(),
  };
  // No actor, accept, authorization, or caller-provided source/file facts in this namespace.
  return {api,dispose:()=>{if(disposed)return;disposed=true;recorder.dispose();review?.dispose();for(const remove of disposers)remove();}};
}
export type StageInstallation=ReturnType<typeof installStageWorkbench>;
