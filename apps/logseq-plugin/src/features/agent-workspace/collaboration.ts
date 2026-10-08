import { WorkspaceError, parseWorkBinding, workRecord, type AgentWorkBinding } from "@task-copilot/contracts";
import { readOptionalPrivateItem } from "../../private-storage.ts";
import type { ContextReading } from "../../workspace/context-service.ts";
import { validateSnapshot, type BlockSnapshot, type SourceSnapshot } from "../../workspace/source-protocol.ts";
import { sourceHash } from "../work-view/lens-source.ts";
import type { WorkView } from "../work-view/controller.ts";
import type { GuidanceCheck, GuidanceReading, GuidanceService } from "./guidance.ts";

interface Storage {getItem(key:string):Promise<unknown>;setItem(key:string,text:string):Promise<void>}
interface Material {id:string;path:string;reference:string;version:string|null;availability:string}
export interface CollaborationPermissions {read:boolean;bodyWrite:boolean;structureWrite:boolean;fileWrite:boolean;ordinaryTodo:boolean;formalApproval:false}
export interface CollaborationScene {
  schemaVersion:1;sceneId:string;capturedAt:string;binding:AgentWorkBinding;
  request:string;requestedBackgroundSourceIds:string[];selectedBackground:BlockSnapshot[];
  savedSource:SourceSnapshot;sourceFreshness:"checked";workspaceRevision:string|null;entryFile:string;
  sourceBundleVersion:string;materialsVersion:string;
  materials:Array<{id:string;filename:string;path:string;reference:string;version:string|null;availability:string}>;
  reading:ReturnType<WorkView["readingAPI"]["read"]>|null;
  guidance:GuidanceReading;permissions:CollaborationPermissions;
  nativeDraft:{included:false;editing:boolean|"unknown";reason:"saved-source-only"};
}
type Intent={request:string;backgroundSourceIds:string[]};
function intent(input:unknown):Intent {
  const v=workRecord(input,["request","backgroundSourceIds"]);
  if(typeof v.request!=="string"||!v.request.trim()||v.request.includes("\0")||v.request.length>4000||!Array.isArray(v.backgroundSourceIds)||v.backgroundSourceIds.length>128||v.backgroundSourceIds.some(id=>typeof id!=="string"||id.length>4096)||new Set(v.backgroundSourceIds).size!==v.backgroundSourceIds.length)throw new WorkspaceError("COLLABORATION_REQUEST_INVALID");
  return {request:v.request,backgroundSourceIds:v.backgroundSourceIds as string[]};
}
const sameBinding=(a:AgentWorkBinding,b:AgentWorkBinding)=>JSON.stringify(parseWorkBinding(a))===JSON.stringify(parseWorkBinding(b));
const materialVersions=(materials:Material[])=>sourceHash(JSON.stringify(materials.map(m=>[m.id,m.path,m.reference,m.version,m.availability]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))));
const bundleVersion=(reading:ContextReading)=>sourceHash(JSON.stringify([reading.observed?.primary.structureVersion,reading.observed?.primary.sourceSetVersion,reading.observed?.sources.map(s=>[s.association,s.availability,s.snapshot?.structureVersion,s.snapshot?.sourceSetVersion,s.material?.path,s.material?.version])]));
/** Saved source only, using the existing source publisher and workspace identity. */
export class CollaborationService {
  private stopped=false;
  constructor(private readonly ports:{storage:Storage;guidance:GuidanceService;refresh(scope:AgentWorkBinding["scope"]):Promise<ContextReading>;materials(binding:AgentWorkBinding):Promise<Material[]>;reading():CollaborationScene["reading"];permissions():CollaborationPermissions;editing():Promise<boolean>}){}
  dispose():void{this.stopped=true;}
  private async check(check:GuidanceCheck):Promise<void>{if(this.stopped)throw new WorkspaceError("COLLABORATION_DISPOSED");await check();if(this.stopped)throw new WorkspaceError("COLLABORATION_DISPOSED");}
  private async key(binding:AgentWorkBinding,suffix:string):Promise<string>{return `agent-collaboration-${suffix}-v1-${await sourceHash(JSON.stringify([binding.scope,binding.workspaceId,binding.directory]))}`;}
  /** Only a local human form retains this port. External calls cannot set the request or background. */
  async prepare(binding:AgentWorkBinding,input:unknown,check:GuidanceCheck):Promise<void>{
    const value=intent(input),key=await this.key(binding,"intent");await this.check(check);
    const raw=JSON.stringify({schemaVersion:1,binding,value});await this.ports.storage.setItem(key,raw);await this.check(check);
    if(await this.ports.storage.getItem(key)!==raw)throw new WorkspaceError("COLLABORATION_REQUEST_UNCONFIRMED");await this.check(check);
  }
  private async request(binding:AgentWorkBinding,check:GuidanceCheck):Promise<Intent>{
    const raw=await readOptionalPrivateItem(this.ports.storage,await this.key(binding,"intent"));await this.check(check);
    if(typeof raw!=="string"||raw.length>600000)throw new WorkspaceError("COLLABORATION_CONTEXT_REQUIRED","请在工作台使用“带当前工作去协作”，填写本次请求并选择必要背景。");
    const v=workRecord(JSON.parse(raw),["schemaVersion","binding","value"]);
    if(v.schemaVersion!==1||!sameBinding(parseWorkBinding(v.binding),binding))throw new WorkspaceError("COLLABORATION_BINDING_CHANGED");return intent(v.value);
  }
  async refresh(binding:AgentWorkBinding,check:GuidanceCheck):Promise<CollaborationScene>{
    await this.check(check);const request=await this.request(binding,check),workspace=await this.ports.refresh(binding.scope);await this.check(check);
    if(workspace.freshness!=="checked"||!workspace.observed)throw new WorkspaceError("SOURCE_UNAVAILABLE",workspace.problem??"现场未核验，请保留最后已知内容并稍后重读。");
    if(workspace.binding.directory!==binding.directory||workspace.workspaceId!==binding.workspaceId)throw new WorkspaceError("COLLABORATION_BINDING_CHANGED");
    const savedSource=workspace.observed.primary,sourceBundleVersion=await bundleVersion(workspace),available=[...savedSource.blocks,...workspace.observed.sources.flatMap(s=>s.snapshot?.blocks??[])];
    const bySource=new Map(available.map(b=>[b.sourceId,b])),byUuid=new Map(available.map(b=>[b.target.blockUuid,b])),selected=new Map<string,BlockSnapshot>();
    for(const id of request.backgroundSourceIds){
      let b=bySource.get(id);if(!b||b.availability!=="available")throw new WorkspaceError("BACKGROUND_SOURCE_UNAVAILABLE");
      const seen=new Set<string>();
      while(b){
        if(seen.has(b.sourceId)||b.availability!=="available")throw new WorkspaceError("BACKGROUND_SOURCE_UNAVAILABLE");
        seen.add(b.sourceId);selected.set(b.sourceId,b);if(selected.size>2048)throw new WorkspaceError("BACKGROUND_SOURCE_LIMIT");b=b.parentUuid?byUuid.get(b.parentUuid):undefined;
      }
    }
    const selectedBackground=[...selected.values()];
    const guidance=await this.ports.guidance.read(binding,check),materials=await this.ports.materials(binding),materialsVersion=await materialVersions(materials);await this.check(check);
    let editing:boolean|"unknown"="unknown";try{editing=await this.ports.editing();}catch{/* No draft text is requested, even if editing status cannot be read. */}await this.check(check);
    const current=await this.ports.refresh(binding.scope);await this.check(check);
    if(current.freshness!=="checked"||await bundleVersion(current)!==sourceBundleVersion||await materialVersions(await this.ports.materials(binding))!==materialsVersion)throw new WorkspaceError("COLLABORATION_SOURCE_CHANGED","来源在准备现场时改变，请保留请求并重新读取。");
    if(JSON.stringify(await this.request(binding,check))!==JSON.stringify(request))throw new WorkspaceError("COLLABORATION_REQUEST_CHANGED");await this.check(check);
    const state=this.ports.reading(),reading=state?.scope&&state.scope.graphId===binding.scope.graphId&&state.scope.rootUuid===binding.scope.rootUuid?state:null;
    const scene:CollaborationScene={schemaVersion:1,sceneId:crypto.randomUUID(),capturedAt:new Date().toISOString(),binding:parseWorkBinding(binding),request:request.request,requestedBackgroundSourceIds:request.backgroundSourceIds,selectedBackground,savedSource,sourceFreshness:"checked",sourceBundleVersion,materialsVersion,workspaceRevision:workspace.mirror?.pointer.revision??null,entryFile:workspace.binding.manifest.entryFile,
      materials:materials.map(m=>({id:m.id,filename:m.path.split("/").at(-1)??m.path,path:m.path,reference:m.reference,version:m.version,availability:m.availability})),reading,guidance,permissions:this.ports.permissions(),nativeDraft:{included:false,editing,reason:"saved-source-only"}};
    const raw=JSON.stringify(scene);if(new TextEncoder().encode(raw).length>16000000)throw new WorkspaceError("COLLABORATION_SCENE_TOO_LARGE");
    const key=await this.key(binding,"scene"),record=JSON.stringify({schemaVersion:1,digest:await sourceHash(raw),scene});await this.check(check);
    await this.ports.storage.setItem(key,record);await this.check(check);if(await this.ports.storage.getItem(key)!==record)throw new WorkspaceError("COLLABORATION_SCENE_UNCONFIRMED");await this.check(check);return scene;
  }
  async read(binding:AgentWorkBinding,check:GuidanceCheck){
    await this.check(check);const raw=await readOptionalPrivateItem(this.ports.storage,await this.key(binding,"scene"));await this.check(check);
    if(typeof raw!=="string"||raw.length>20000000)throw new WorkspaceError("COLLABORATION_SCENE_UNAVAILABLE");
    const record=workRecord(JSON.parse(raw),["schemaVersion","digest","scene"]),scene=record.scene as CollaborationScene;
    if(record.schemaVersion!==1||record.digest!==await sourceHash(JSON.stringify(scene))||scene.schemaVersion!==1||!sameBinding(scene.binding,binding))throw new WorkspaceError("COLLABORATION_SCENE_INVALID");
    await validateSnapshot(scene.savedSource);await this.check(check);
    if(!Array.isArray(scene.selectedBackground)||scene.selectedBackground.length>2048||!Array.isArray(scene.materials)||scene.materials.length>2000||scene.guidance?.common?.version!==await sourceHash(scene.guidance.common.text)||scene.guidance?.project?.version!==await sourceHash(scene.guidance.project.text))throw new WorkspaceError("COLLABORATION_SCENE_INVALID");
    const latest=await this.ports.guidance.read(binding,check),workspace=await this.ports.refresh(binding.scope),materials=await this.ports.materials(binding);await this.check(check);
    const sources=[...(workspace.observed?.primary.blocks??[]),...(workspace.observed?.sources.flatMap(s=>s.snapshot?.blocks??[])??[])];
    const sourceMatches=workspace.freshness==="checked"&&workspace.observed?.primary.sourceSetVersion===scene.savedSource.sourceSetVersion&&workspace.observed.primary.structureVersion===scene.savedSource.structureVersion&&scene.selectedBackground.every(old=>sources.some(current=>JSON.stringify(current)===JSON.stringify(old)))&&await bundleVersion(workspace)===scene.sourceBundleVersion;
    const materialsMatch=await materialVersions(materials)===scene.materialsVersion&&await materialVersions(scene.materials)===scene.materialsVersion;await this.check(check);
    return {scene,freshness:"saved-scene",current:{checkedAt:new Date().toISOString(),sourceFreshness:workspace.freshness,sourceMatches,materialsMatch,guidanceMatches:latest.common.version===scene.guidance.common.version&&latest.project.version===scene.guidance.project.version,guidanceVersions:{common:latest.common.version,project:latest.project.version},permissions:this.ports.permissions()},nextRead:"collaboration.refresh"};
  }
}
