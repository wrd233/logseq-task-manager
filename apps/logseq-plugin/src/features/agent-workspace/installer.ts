import { WorkspaceError, parseWorkspaceDescriptor, parseWorkspaceCall, parseWorkBinding, type AgentWorkBinding, type WorkspacePluginDescriptor, type WorkspaceDelivery } from "@task-copilot/contracts";
import { desktopFiles } from "../../host/desktop-files.ts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { ScopeLease } from "../content-writeback/protocol.ts";
import type { Materials } from "../materials/controller.ts";
import type { MaterialResult } from "../materials/service.ts";
import type { WorkView } from "../work-view/controller.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { AgentWorkspaceRouter, type WorkspaceBindingPort, type OptionalStagePort } from "./router.ts";

export function materialBindingPort(materials:Materials):WorkspaceBindingPort {
  const selected=async(rootUuid:string):Promise<AgentWorkBinding>=>{
    const graph=await logseq.App.getCurrentGraph(),context=await materials.workspaceContext(rootUuid);
    if(!context.directory||!graph?.path||context.graph!==graph.path)throw new WorkspaceError("WORK_DIRECTORY_REQUIRED","请先为这份工作绑定已有目录。");
    return {scope:{graphId:graphIdentity(graph),rootUuid},directory:context.directory,organization:context.organization,provider:"material-binding",workspaceId:null};
  };
  return {selected,valid:async(binding)=>JSON.stringify(await selected(binding.scope.rootUuid))===JSON.stringify(binding)};
}
export function installAgentWorkspace(options:{content:ContentInstallation;materials:Materials|null;work:WorkView|null;binding?:WorkspaceBindingPort;stage?:OptionalStagePort;intervalMs?:number}) {
  let disposed=false,generation=0,timer:ReturnType<typeof setTimeout>|null=null,busy=false,failures=0;
  let connection:{descriptor:WorkspacePluginDescriptor;id:string;binding:AgentWorkBinding;lease:ScopeLease;epoch:number}|null=null;
  const binding=options.binding??(options.materials?materialBindingPort(options.materials):null);
  const router=options.materials&&binding?new AgentWorkspaceRouter({content:options.content,materials:options.materials,work:options.work,binding,...(options.stage?{stage:options.stage}:{})}):null;
  const report=(error:unknown)=>{if(!disposed)void logseq.UI.showMsg(error instanceof Error?error.message:String(error),"warning");};
  const post=async(descriptor:WorkspacePluginDescriptor,path:string,input:unknown)=>{
    const response=await fetch(`${descriptor.baseUrl}${path}`,{method:"POST",headers:{"content-type":"application/json","x-workspace-plugin":descriptor.pluginToken,"x-workspace-instance":descriptor.instanceId},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
    const result=await response.json() as {error?:{code:string;message:string};delivery?:WorkspaceDelivery;instanceId?:string;value?:unknown};
    if(!response.ok)throw new WorkspaceError(result.error?.code??"CHANNEL_FAILED",result.error?.message);return result;
  };
  const revoke=()=>{
    const previous=connection;connection=null;generation++;router?.clear();if(timer)clearTimeout(timer);timer=null;
    if(previous)void post(previous.descriptor,"/plugin/revoke",{connectionId:previous.id}).catch(()=>undefined);
  };
  const valid=async(value:NonNullable<typeof connection>)=>{
    if(disposed||connection!==value||generation!==value.epoch||!router)throw new WorkspaceError("CONNECTION_REVOKED");
    await router.assert(value.binding,value.lease);
    if(disposed||connection!==value)throw new WorkspaceError("CONNECTION_REVOKED");
  };
  const processDelivery=async(value:NonNullable<typeof connection>,delivery:WorkspaceDelivery)=>{
    busy=true;
    try{
      await valid(value);
      const parsed=parseWorkspaceCall({schemaVersion:delivery.schemaVersion,instanceId:delivery.instanceId,connectionId:delivery.connectionId,clientId:delivery.clientId,requestId:delivery.requestId,command:delivery.command,payload:delivery.payload});
      if(parsed.instanceId!==value.descriptor.instanceId||parsed.connectionId!==value.id||JSON.stringify(parseWorkBinding(delivery.binding))!==JSON.stringify(value.binding))throw new WorkspaceError("CONNECTION_STALE");
      const result=await router!.handle({...parsed,scope:value.binding.scope,binding:value.binding},value.lease);await valid(value);
      await post(value.descriptor,"/plugin/complete",{connectionId:value.id,clientId:parsed.clientId,requestId:parsed.requestId,value:result});
    }catch(error){
      const code=error instanceof WorkspaceError?error.code:error instanceof Error?error.message.split(":")[0]!:"CAPABILITY_FAILED";
      await post(value.descriptor,"/plugin/complete",{connectionId:value.id,clientId:delivery.clientId,requestId:delivery.requestId,error:{code:code.slice(0,128),message:error instanceof Error?error.message.slice(0,500):code}}).catch(()=>undefined);
    }finally{busy=false;}
  };
  const tick=async(value:NonNullable<typeof connection>)=>{
    try{
      await valid(value);
      // Poll keeps the lease online while an SDK operation is in flight. Busy polls
      // intentionally do not pick up another delivery.
      const result=await post(value.descriptor,"/plugin/poll",{connectionId:value.id,busy});failures=0;
      if(result.delivery&&!busy)void processDelivery(value,result.delivery);
    }catch(error){
      if(disposed||connection!==value)return;
      if(error instanceof WorkspaceError&&["CONNECTION_REVOKED","CONNECTION_STALE","DESCRIPTOR_STALE"].includes(error.code)||++failures>=3){revoke();report(new Error("外部连接已停止；本地阅读、材料与历史仍可使用。"));return;}
    }
    if(connection===value&&!disposed)timer=setTimeout(()=>void tick(value),options.intervalMs??250);
  };
  const allow=async()=>{
    if(!router||!binding)throw new WorkspaceError("MATERIALS_UNAVAILABLE");
    revoke();const epoch=generation;
    const target=(await logseq.Editor.getCurrentBlock())?.uuid;if(!target)throw new WorkspaceError("SOURCE_REQUIRED");
    const selected=await binding.selected(target);
    const path=String(logseq.settings?.agentWorkspaceDescriptor??"").trim();if(!path.startsWith("/"))throw new WorkspaceError("PLUGIN_DESCRIPTOR_REQUIRED","请先启动 workspace serve，并在设置中填写其私有插件 descriptor 路径。");
    const files=desktopFiles(()=>selected.scope.graphId),descriptor=parseWorkspaceDescriptor(JSON.parse(await files.read(path)),true) as WorkspacePluginDescriptor;
    if(disposed||epoch!==generation)throw new WorkspaceError("CONNECTION_REVOKED");
    await options.content.establish(target);const lease=options.content.capture(selected.scope);if(!lease)throw new WorkspaceError("SCOPE_MISMATCH");
    const value={descriptor,id:crypto.randomUUID(),binding:selected,lease,epoch};
    await router.assert(selected,lease);await post(descriptor,"/plugin/connect",{connectionId:value.id,binding:selected});
    if(disposed||epoch!==generation||!options.content.valid(lease)){void post(descriptor,"/plugin/revoke",{connectionId:value.id});throw new WorkspaceError("CONNECTION_REVOKED");}
    connection=value;failures=0;void tick(value);await logseq.UI.showMsg("已连接这份工作，允许维护此处正文。材料权限与 TODO 保护继续有效。","success");
  };
  const localCall=async(command:"files.list"|"files.read"|"files.associate",payload:Record<string,unknown>):Promise<unknown>=>{
    const value=connection;if(!value)throw new WorkspaceError("CHANNEL_UNAVAILABLE");await valid(value);
    const response=await post(value.descriptor,"/plugin/call",{schemaVersion:1,instanceId:value.descriptor.instanceId,connectionId:value.id,clientId:"local-files-ui",requestId:crypto.randomUUID(),command,payload});await valid(value);
    const result=response.value;return result&&typeof result==="object"&&"provenance"in result&&"value"in result?result.value:result;
  };
  options.materials?.setDirectoryObserver({
    available:context=>!!connection&&context.directory===connection.binding.directory&&context.sourceUuid===connection.binding.scope.rootUuid,
    list:async()=>{const value=await localCall("files.list",{}) as {observation:{files:Array<{path:string;kind:string;availability:string;materialId:string|null}>;truncated:unknown[]}};return {files:value.observation.files,truncated:value.observation.truncated.length>0};},
    read:async(path)=>await localCall("files.read",{path}) as {content?:string|null;reason?:string;read?:string},
    associate:async(path)=>await localCall("files.associate",{path}) as MaterialResult,
  });
  const offGraph=logseq.App.onCurrentGraphChanged(revoke),disposers:Array<()=>void>=[offGraph];
  for(const [key,label,action] of [["agent-workspace-allow","工作台：允许 agent 连接当前工作",allow],["agent-workspace-stop","工作台：停止 agent 工作连接",async()=>{revoke();}]] as const){const off=logseq.App.registerCommandPalette({key,label},()=>{if(!disposed)return action().catch(report);});if(typeof off==="function")disposers.push(off);}
  return {api:{status:()=>({connected:connection!==null,binding:connection?.binding??null,formalWorkspace:connection?.binding.provider==="workspace"?"connected":"unavailable"})},dispose:()=>{if(disposed)return;disposed=true;revoke();options.materials?.setDirectoryObserver(null);for(const off of disposers)off();}};
}
