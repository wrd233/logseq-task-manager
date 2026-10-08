import { button, element, FeaturePanel } from "../../host/panel-host.ts";
import { panels } from "../../workspace/context.ts";
import type { ScopeLease, SourceRead } from "../content-writeback/protocol.ts";
import type { OrdinaryTodoService, TodoAction } from "./service.ts";

export class OrdinaryTodoUI {
  private revision=0;
  private readonly panel=new FeaturePanel("ordinary-todo","允许普通 TODO",()=>{this.revision++;});
  constructor(private readonly port:{service:OrdinaryTodoService;context():Promise<{lease:ScopeLease;read:SourceRead}>;valid(lease:ScopeLease):boolean}){this.panel.root.dataset.ordinaryTodo="true";}
  close():void{this.revision++;panels.reserve();void this.panel.close(false,"close",false);}
  dispose():void{this.revision++;this.panel.dispose();}
  async open():Promise<void>{
    const revision=++this.revision,panelRevision=panels.reserve(),{lease,read}=await this.port.context();
    const current=()=>revision===this.revision&&this.port.valid(lease);if(!current())return;
    const body=element("div"),status=element("p"),selected=new Set<string>(),actions=new Set<TodoAction>();
    body.append(element("h3","允许 Agent 维护普通 TODO"),element("p","选择可维护的正文范围及操作。范围包含后代，许可仅在本次工作连接有效；切换工作、重新连接或停止连接后失效。正文和文件写作许可独立。"),element("p","完成时核验笔记版本、材料版本及指定原样片段，留下材料链接。片段存在不能代替对任务整体完成的判断；项目和正式任务不在此入口变更。"));
    const ranges=element("div");ranges.style.cssText="max-height:35vh;overflow:auto";
    for(const b of read.snapshot.blocks){
      if(b.availability!=="available"||read.structure?.get(b.target.blockUuid)?.blocked||!read.protections.has(b.target.blockUuid))continue;
      const label=element("label"),input=element("input");input.type="checkbox";label.style.cssText=`display:block;margin:8px 0;padding-left:${Math.min(4,b.depth)*16}px`;
      input.onchange=()=>{if(input.checked)selected.add(b.target.blockUuid);else selected.delete(b.target.blockUuid);};
      label.append(input,document.createTextNode(` ${b.content!.split("\n")[0]!.slice(0,120)}`));ranges.append(label);
    }
    body.append(element("strong","允许的范围"),ranges,element("strong","允许的操作"));
    for(const [action,text] of [["create","新建明确要做的普通任务"],["complete","依据材料核验后完成"],["reopen","重新打开普通任务"]] as const){
      const label=element("label"),input=element("input");input.type="checkbox";label.style.cssText="display:block;margin:8px 0";
      input.onchange=()=>{if(input.checked)actions.add(action);else actions.delete(action);};label.append(input,document.createTextNode(` ${text}`));body.append(label);
    }
    let busy=false;const save=button("明确允许所选范围和操作",()=>{
      if(busy||!current())return;busy=true;save.disabled=true;
      void this.port.service.allow(lease,[...selected],[...actions]).then(()=>{if(current())status.textContent="已允许。此范围内的所选操作无需逐次确认；执行前仍核验版本和完成依据。";}).catch(error=>{if(current())status.textContent=error instanceof Error?error.message:String(error);}).finally(()=>{busy=false;save.disabled=false;});
    });
    body.append(save,button("停止普通 TODO 许可",()=>{if(current()){this.port.service.revoke();status.textContent="普通 TODO 许可已撤销。";}}),button("关闭",()=>this.close()),status);
    this.panel.root.replaceChildren(body);if(current())await this.panel.open(panelRevision);
  }
}
