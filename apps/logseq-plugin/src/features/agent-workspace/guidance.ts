import { WorkspaceError, workRecord, type AgentWorkBinding } from "@task-copilot/contracts";
import { readOptionalPrivateItem } from "../../private-storage.ts";
import { sourceHash } from "../work-view/lens-source.ts";

/** One installation-wide source. Workspaces store only their differences. */
export const commonGuidanceKey="agent-collaboration-common-guidance-v1";
export const defaultCommonGuidance=`# 共同写作指导

保留我的语气、思考过程和不确定判断。可能、目前偏向、尚未询问等限定与理由要留在原句中；不要把讨论改成确定结论。

先读已保存的现场、来源版本、本次请求和许可。阅读方案只改变读法；补充、整理或改写正文要有明确指示和独立正文许可。文件写作与普通 TODO 许可分别核验。正式任务、事务、受管字段、程序和认可只能走正式端口。

围绕原问题或原任务续接有意义的阶段变化，不每轮新增总结树。初期讨论只沉淀值得再次使用的想法、条件和权衡；细节产物放实际材料。详见链接使用材料服务返回的完整文件名和 reference，不猜路径或身份。

新语义行首使用 **[目标]**、**[想法]**、**[注]**、**[记录]** 等。普通待办写 TODO 核对取消条款；TODO/DONE 不加粗，不新建正式 [任务]/[事务]。旧裸标记可读。明确要求格式整理时，只改获准的行首格式，保留措辞、UUID、层级、属性、任务状态及代码、引文、句中字面标记。

可以：**[想法]** 目前偏向方案二，不过尚未询问维护人员；取消条款仍需核对。
避免：方案二已经确定，维护风险已解决。
可以：**[记录]** 已核对两份报价的取消条款，差异见材料；项目整体尚未决定。
避免：子步骤完成，因此项目 DONE。

写入前重读版本；冲突保留用户新条件和原提议。未知结果先用原 requestId 查 Journal，不盲目重放。只有实际执行并核验的事实才能支持普通 TODO 状态变化；未可靠完成不提前 DONE，也不替用户认可。

局部请求只作用于本次工作。只有用户明确编辑共同指导时，才更新这一共同来源。普通文件不会自动被所有 Agent 加载；实际入口需执行 guidance read，并记录此次返回的版本。`;

interface Storage {getItem(key:string):Promise<unknown>;setItem(key:string,value:string):Promise<void>}
export type GuidanceCheck=()=>Promise<void>;
export interface GuidanceSource {
  source:{kind:"plugin-private-storage";key:string;origin:"saved"|"builtin-default"};
  text:string;version:string;
}
export interface GuidanceReading {
  schemaVersion:1;loadedAt:string;common:GuidanceSource;project:GuidanceSource;
  loading:"explicit-read";automaticAgentReload:false;
}
const queues=new Map<string,Promise<unknown>>();
async function serial<T>(key:string,action:()=>Promise<T>):Promise<T>{
  const run=async()=>{const next=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(action);queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}};
  return typeof navigator!=="undefined"&&navigator.locks?navigator.locks.request(`task-copilot-guidance:${key}`,run):run();
}
function text(value:unknown):string {
  if(typeof value!=="string"||value.includes("\0")||new TextEncoder().encode(value).length>65536)throw new WorkspaceError("GUIDANCE_TEXT_INVALID");
  return value;
}
/** All writes are retained by the local UI, never exposed to external payloads. */
export class GuidanceService {
  private stopped=false;
  constructor(private readonly storage:Storage){}
  dispose():void{this.stopped=true;}
  private async check(check:GuidanceCheck):Promise<void>{if(this.stopped)throw new WorkspaceError("GUIDANCE_DISPOSED");await check();if(this.stopped)throw new WorkspaceError("GUIDANCE_DISPOSED");}
  private async projectKey(binding:AgentWorkBinding):Promise<string>{
    return `agent-collaboration-project-guidance-v1-${await sourceHash(JSON.stringify([binding.scope.graphId,binding.workspaceId??binding.scope.rootUuid]))}`;
  }
  private async source(key:string,fallback:string,check:GuidanceCheck):Promise<GuidanceSource>{
    await this.check(check);const raw=await readOptionalPrivateItem(this.storage,key);await this.check(check);
    let content=fallback;
    if(raw!==null&&raw!==undefined){
      if(typeof raw!=="string"||raw.length>400000)throw new WorkspaceError("GUIDANCE_SOURCE_UNREADABLE");
      const record=workRecord(JSON.parse(raw),["schemaVersion","text"]);
      if(record.schemaVersion!==1)throw new WorkspaceError("GUIDANCE_SCHEMA_INVALID");content=text(record.text);
    }
    const version=await sourceHash(content);await this.check(check);
    return {source:{kind:"plugin-private-storage",key,origin:raw===null||raw===undefined?"builtin-default":"saved"},text:content,version};
  }
  async read(binding:AgentWorkBinding,check:GuidanceCheck):Promise<GuidanceReading>{
    const key=await this.projectKey(binding);await this.check(check);
    const common=await this.source(commonGuidanceKey,defaultCommonGuidance,check),project=await this.source(key,"",check);
    return {schemaVersion:1,loadedAt:new Date().toISOString(),common,project,loading:"explicit-read",automaticAgentReload:false};
  }
  private async save(key:string,fallback:string,expectedVersion:string,next:string,check:GuidanceCheck):Promise<GuidanceSource>{
    text(next);
    return serial(key,async()=>{
      const before=await this.source(key,fallback,check);
      if(before.version!==expectedVersion)throw new WorkspaceError("GUIDANCE_VERSION_CONFLICT","指导已有新版本，请保留输入并重读后再保存。");
      await this.check(check);await this.storage.setItem(key,JSON.stringify({schemaVersion:1,text:next}));await this.check(check);
      const after=await this.source(key,fallback,check);
      if(after.text!==next)throw new WorkspaceError("GUIDANCE_SAVE_UNCONFIRMED","指导保存尚未确认；保留输入并重新读取。");
      return after;
    });
  }
  saveCommon(expectedVersion:string,next:string,check:GuidanceCheck):Promise<GuidanceSource>{return this.save(commonGuidanceKey,defaultCommonGuidance,expectedVersion,next,check);}
  async saveProject(binding:AgentWorkBinding,expectedVersion:string,next:string,check:GuidanceCheck):Promise<GuidanceSource>{return this.save(await this.projectKey(binding),"",expectedVersion,next,check);}
}
