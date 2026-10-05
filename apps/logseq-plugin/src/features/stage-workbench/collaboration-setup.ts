import { button, element } from "../../host/panel-host.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";

/** Trusted composition port; never part of the external stages namespace. */
export interface CollaborationPort {
  status():{connected:boolean; binding:{scope:SourceScope; directory:string}|null};
  connect(rootUuid:string, organize:boolean):Promise<void>;
  stop():void;
}
export const agentMaintenanceInstructions=`先从正式工作连接识别当前目录，refresh 并 read 当前 scope、来源正文、能力及 contentVersion／structureVersion。镜像、报告小标题和展示顺序不是写入依据。
只有用户要求维护原文时才润色或移动。完整保留无标记正文、疑问、未知标记、重复记录、普通 TODO、条件和反例，保留 [注]／[想法]／[目标] 的行首风格与语气，不把未确定记录写成确定结论，不批量加报告标题，不修改正式／受管理字段或执行 TODO。
文本授权不包含结构授权。真实移动只用现有 schemaVersion 2 move-block／SDK adapter，核对真实 BlockTarget、父级、正文和结构版本，保留 UUID、子树、引用和对象归属；禁止复制／删除再建模拟移动。过期、越界、原生输入或正式保护应按现有规则拒绝。
查看逐项结果；部分成功保持部分，未知结果先用原 requestId 查询／恢复，不盲目重放。下一步先重新读取当前来源。在本地已开始的同一阶段用 stage.submit 记录真实文本与结构事实；外部 agent 不能开始阶段或代用户认可。参考／输入材料权限不扩大。`;

export function collaborationSetup(scope:()=>SourceScope|null, port:()=>CollaborationPort|null, run:(action:()=>Promise<unknown>)=>void, busy:()=>boolean) {
  const details=element("details"), state=element("p"), instructions=element("details");
  details.append(element("summary","连接与原文维护说明"),state);
  const connect=(organize:boolean)=>run(async()=>{
    if (busy()) return; const selected=scope(), bridge=port();
    if (!selected || !bridge) throw Error("工作连接暂不可用；本地阅读、审阅和历史仍可使用。");
    await bridge.connect(selected.rootUuid,organize); refresh();
  });
  const text=button("连接正文维护",()=>connect(false)), organize=button("允许润色与原块整理",()=>connect(true));
  const stop=button("断开工作连接",()=>{if(!busy()){port()?.stop();refresh();}});
  const preparation=element("p","先关联这份工作的目录，在终端启动 workspace serve，并在插件设置填写它的私有 descriptor 路径。连接只准备受限通道，不会启动模型或发送消息。");
  const command=element("code","task-copilot workspace serve --state-dir <私有状态目录>");
  instructions.append(element("summary","给 agent 的开始工作提示"),element("pre",agentMaintenanceInstructions));
  details.append(preparation,command,text,organize,stop,instructions);
  function refresh():void {
    const value=port()?.status(), selected=scope();
    const connected=!!value?.connected && !!selected && value.binding?.scope.graphId===selected.graphId && value.binding.scope.rootUuid===selected.rootUuid;
    state.textContent=connected?`当前工作通道就绪 · ${value!.binding!.directory}。这不表示 agent 在线、处理中或已完成。`:value?.connected?"通道连接的是另一份工作；当前正文没有该连接权限。":"当前工作尚未连接；本地正文、材料和历史可独立使用。";
    stop.hidden=!value?.connected; text.disabled=!selected;organize.disabled=!selected;
  }
  details.addEventListener("toggle",refresh);refresh();
  const timer=setInterval(()=>{if(details.open&&details.isConnected)refresh();},1000);
  return {element:details,refresh,dispose:()=>{clearInterval(timer);details.removeEventListener("toggle",refresh);}};
}
