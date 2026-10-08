import type { ContentInstallation } from "../content-writeback/installer.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { parsePatch, sameScope, sha256, uuid } from "../content-writeback/validation.ts";
import type { Patch, CallOrigin } from "../content-writeback/protocol.ts";
import type { MaterialView } from "../materials/service.ts";
import { desktopFiles } from "../../host/desktop-files.ts";
import type { WorkView } from "../work-view/controller.ts";
import { StageStore } from "./store.ts";
import { fields, revisionId, StageRecorder } from "./recorder.ts";
import { StageReview } from "./review.ts";
import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { StageFile, StageStorage } from "./protocol.ts";
import type { CollaborationPort } from "./collaboration-setup.ts";

export interface StageMaterials {
  read(id:string):Promise<MaterialView>;
  list(scope:SourceScope):Promise<Array<{id:string;title:string}>>;
  open?(id:string):Promise<unknown>;
}
export function installStageWorkbench(options:{content:ContentInstallation;work?:WorkView|null;materials?:StageMaterials;storage?:StageStorage;source?:{read(scope:SourceScope,valid:()=>boolean):Promise<SourceSnapshot>;version(scope:SourceScope):string}}){
  const content=options.content,store=new StageStore(options.storage??logseq.FileStorage);
  let disposed=false;const queues=new Map<string,Promise<unknown>>();
  const scope=():SourceScope=>{const selected=content.api.scope();if(disposed||!selected)throw Error("AUTHORIZATION_REQUIRED");return selected;};
  let leaseContent:unknown,leaseWorkspace:string|undefined,leaseToken={};
  const lifetime=()=>{
    const selected=content.api.scope(),current=content.local.lifetime(),workspace=selected?options.source?.version(selected):undefined;
    if(current!==leaseContent||workspace!==leaseWorkspace){leaseContent=current;leaseWorkspace=workspace;leaseToken={};}
    return leaseToken;
  };
  const read=async()=>{
    const selected=scope(),ticket=lifetime(),valid=()=>!disposed&&lifetime()===ticket;
    return options.source?options.source.read(selected,valid):content.api.read();
  };
  const recorder=new StageRecorder(store,{
    scope:()=>disposed?null:content.api.scope(),lifetime,
    read,result:id=>content.api.result(id),history:()=>content.api.history(),
    file:async id=>{
      if(!options.materials)throw Error("MATERIALS_UNAVAILABLE");
      const selected=scope(),graph=await logseq.App.getCurrentGraph();let material=await options.materials.read(id);
      if(graphIdentity(graph)!==selected.graphId||!sameScope(scope(),selected)||!material.associations.some(a=>a.graph===graph?.path&&a.sourceUuid===selected.rootUuid))throw Error("STAGE_FILE_OUTSIDE_WORK");
      let size:number|null=null,problem=material.problem??null;
      if(material.availability==="available"){
        try{
          const files=desktopFiles(()=>graph?.path??"");const stat=await files.stat!(material.path);size=stat.size;
          if(material.content===null&&/\.(txt|csv|json)$/iu.test(material.path)&&size<=1_000_000){
            const content=await files.read(material.path);if(content.length>1_000_000)throw Error("STAGE_FILE_TOO_LARGE");
            material={...material,content,version:await sha256(content)};
          }
        }
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
  const submit=async(input:unknown,local=false,origin?:CallOrigin)=>{
    const value=fields(input,["stageId","expectedRevision","patch","correctionOf"]),id=uuid(value.stageId),expected=uuid(value.expectedRevision),patch=parsePatch(value.patch),selected=scope();
    if(!sameScope(patch.scope,selected)||patch.metadata?.stageId!==id)throw Error("STAGE_PATCH_SCOPE");
    const ticket=lifetime();
    const valid=()=>{if(disposed||lifetime()!==ticket)throw Error("STAGE_SCOPE_REVOKED");};
    const key=JSON.stringify(selected);
    const action=async()=>{
      valid();const history=await store.history(selected),stage=history.stages.find(s=>s.start.id===id);valid();
      if(!stage||history.current!==id||history.problems.length||stage.problems.length)throw Error("STAGE_NOT_CURRENT");
      // Query the same request first after a lost response or stage-save failure.
      const previous=await content.api.result(patch.requestId);valid();
      if(previous&&previous.record.digest!==await sha256(JSON.stringify(patch)))throw Error("IDEMPOTENCY_KEY_REUSED");
      const recorded=stage.revisions.find(r=>r.facts.some(f=>f.record.patch.requestId===patch.requestId&&previous&&JSON.stringify(f)===JSON.stringify(previous)));
      if(previous&&recorded)return {...previous,stageRevision:recorded.id,stageProblem:null};
      if(!previous&&revisionId(stage)!==expected)throw Error("STAGE_REVISION_CONFLICT");
      // Freeze observable inter-stage/native edits before dispatch. Failure here prevents writes.
      let base=revisionId(stage);
      if(!previous){
        const observed=await recorder.checkpoint({stageId:id,expectedRevision:base,requestKey:`observe:${patch.requestId}`,requestIds:[]});valid();base=observed.id;
      }
      const actual=previous??await (local?content.local.apply(patch,"stage-review-edit"):origin?content.trustedAgent.apply(patch,origin):content.api.apply(patch));valid();
      try{
        const revision=await recorder.checkpoint({stageId:id,expectedRevision:base,requestKey:`result:${patch.requestId}:${actual.record.sequence}`,requestIds:[patch.requestId],correctionOf:value.correctionOf??null});valid();
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
    authorize,read:()=>content.api.read(),openFile:id=>options.materials?.open?.(id)??Promise.resolve(),listFiles:selected=>options.materials?.list(selected)??Promise.resolve([]),
    result:id=>content.api.result(id),recover:id=>content.api.recover(id),
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
  command("stage-begin","工作台：开始有意义阶段",async()=>{if(!options.work||!review)throw Error("WORK_VIEW_UNAVAILABLE");await options.work.open();review.focusGoal();});
  command("stage-collaboration","工作台：查看协作与这次改动",async()=>{await options.work?.open();review?.open();});
  command("stage-checkpoint","工作台：记录当前阶段版本",async()=>review?.checkpoint());
  command("stage-history","工作台：查看阶段历史",async()=>{await options.work?.open();await review?.openHistory();});
  command("stage-accept","工作台：认可当前所见阶段版本",async()=>{if(options.work&&!options.work.reviewing){await options.work.setReviewOpen(true);return;}await review?.acceptSeen();},"mod+alt+enter");
  const api={
    begin:async(input:unknown)=>{const result=await recorder.begin(input);await review?.reload();return result;},
    read:async(input:unknown)=>{const value=fields(input,["stageId"]);return recorder.read(scope(),uuid(value.stageId));},
    history:async()=>store.history(scope()),
    checkpoint:async(input:unknown)=>{const result=await recorder.checkpoint(input);await review?.reload();return result;},
    reconcile:async(input:unknown)=>{const result=await recorder.reconcile(input);await review?.reload();return result;},
    activate:async(input:unknown)=>{const result=await recorder.activate(input);await review?.reload();return result;},
    resolveCandidate:async(input:unknown)=>{const result=await recorder.resolveCandidate(input);await review?.reload();return result;},
    submit:(input:unknown)=>submit(input),
    scope:()=>disposed?null:content.api.scope(),
  };
  // No actor, accept, authorization, or caller-provided source/file facts in this namespace.
  return {api,trustedSubmit:(input:unknown,origin:CallOrigin)=>submit(input,false,origin),setCollaboration:(port:CollaborationPort|null)=>{if(!disposed)review?.setCollaboration(port);},dispose:()=>{if(disposed)return;disposed=true;review?.setCollaboration(null);recorder.dispose();review?.dispose();for(const remove of disposers)remove();}};
}
export type StageInstallation=ReturnType<typeof installStageWorkbench>;
