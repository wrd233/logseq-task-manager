import type { AgentWorkBinding } from "@task-copilot/contracts";
import { button, element, FeaturePanel } from "../../host/panel-host.ts";
import { panels } from "../../workspace/context.ts";
import type { BlockSnapshot, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { GuidanceReading, GuidanceService } from "./guidance.ts";

interface Context {binding:AgentWorkBinding;source:SourceSnapshot;backgroundSources:readonly BlockSnapshot[];guidance:GuidanceReading;check():Promise<void>}
interface Boundary {
  guidance:GuidanceService;context(root?:string|AgentWorkBinding["scope"]):Promise<Context>;
  prepare(root:string|AgentWorkBinding["scope"],request:string,backgroundSourceIds:string[]):Promise<unknown>;
  stateDirectory():string|null;
  report(error:unknown):void;
}
const shellQuote=(text:string)=>`'${text.replaceAll("'","'\\''")}'`;
export function collaborationStartup(directory:string,stateDirectory:string|null=null,locationHref=window.location.href):string {
  const entry=new URL("./workspace.mjs",locationHref),command=entry.protocol==="file:"?`node ${shellQuote(decodeURIComponent(entry.pathname))} workspace`:"task-copilot workspace";
  const flags=`--directory ${shellQuote(directory)}${stateDirectory?` --state-dir ${shellQuote(stateDirectory)}`:""} --json`;
  return `请在这份工作的目录继续。先读取已保存现场与共同指导，核对当前版本和本次许可，再按现场中的请求协作。\n\n${command} collaboration read ${flags}\n${command} guidance read ${flags}\n\n若现场或指导版本改变，重读后再提交。使用 Node 20 运行随包入口。`;
}
/** Local human form. No public setter or export of native draft text. */
export class CollaborationUI {
  private revision=0;
  private disposed=false;
  private readonly panel:FeaturePanel;
  constructor(private readonly boundary:Boundary){
    this.panel=new FeaturePanel("collaboration","带当前工作去协作",()=>{this.revision++;});
    this.panel.root.dataset.collaboration="true";
    this.panel.root.style.cssText="width:100%;max-width:860px;margin:0 auto";
  }
  close():void{this.revision++;panels.reserve();void this.panel.close(false,"close",false);}
  dispose():void{this.disposed=true;this.revision++;this.panel.dispose();}
  async open(root?:string|AgentWorkBinding["scope"],guideOnly=false):Promise<void>{
    const revision=++this.revision,panelRevision=panels.reserve(),context=await this.boundary.context(root);
    if(this.disposed||revision!==this.revision)return;
    const {binding,guidance}=context,body=element("div","","wb-scroll"),header=element("div","","wb-heading");
    header.append(element("strong",guideOnly?"共同指导与项目差异":"带当前工作去协作"),button("关闭",()=>this.close()));
    const status=element("p"),current=()=>!this.disposed&&revision===this.revision;
    const check=async()=>{if(!current())throw new Error("COLLABORATION_VIEW_CLOSED");await context.check();if(!current())throw new Error("COLLABORATION_VIEW_CLOSED");};
    const input=(label:string,value:string,rows:number)=>{const wrap=element("label",label),box=element("textarea");box.value=value;box.rows=rows;box.style.cssText="display:block;width:100%;box-sizing:border-box;margin:6px 0 14px";wrap.append(box);body.append(wrap);return box;};
    let busy=false,composing=false;
    const pending=new Set<HTMLButtonElement>();
    const lock=()=>{for(const b of pending)b.disabled=busy||composing;};
    const action=(label:string,run:()=>Promise<void>)=>{const b=button(label,()=>{if(busy||composing||!current())return;busy=true;lock();void check().then(run).catch(error=>{if(current())status.textContent=error instanceof Error?error.message:String(error);}).finally(()=>{busy=false;lock();});});pending.add(b);return b;};
    body.append(element("p","现场仅含已保存的原文和选择的背景。原生草稿不包含在内；准备现场不会提交原生输入。"));
    if(!guideOnly){
      const draftKey=`collaboration-form:${JSON.stringify([binding.scope,binding.workspaceId,binding.directory])}`;
      let draft:{request:string;background:string[]}={request:"",background:[]};
      const saved=localStorage.getItem(draftKey);if(saved)try{const raw=JSON.parse(saved);if(typeof raw.request==="string"&&Array.isArray(raw.background)&&raw.background.every((id:unknown)=>typeof id==="string"))draft=raw;}catch{/* Keep malformed UI data out of the saved scene. */}
      const request=input("这次希望一起做什么",draft.request,4);request.maxLength=4000;
      const background=element("details"),summary=element("summary","选择必要背景（完整当前原文会一并提供）"),selected=new Set(draft.background);
      background.append(summary);const choices=element("div");choices.style.cssText="max-height:28vh;overflow:auto";
      for(const block of context.backgroundSources){
        if(block.availability!=="available")continue;
        const label=element("label"),box=element("input");box.type="checkbox";box.checked=selected.has(block.sourceId);
        label.style.cssText="display:block;margin:8px 0";label.append(box,document.createTextNode(` ${block.content!.split("\n")[0]!.slice(0,100)}`));choices.append(label);
        box.onchange=()=>{if(box.checked)selected.add(block.sourceId);else selected.delete(block.sourceId);save();};
      }
      background.append(choices);body.append(background);
      const save=()=>{try{localStorage.setItem(draftKey,JSON.stringify({request:request.value,background:[...selected]}));}catch(error){status.textContent=String(error);}};
      request.addEventListener("input",save);
      const output=element("div");body.append(action("连接并准备协作现场",async()=>{
        save();const result=await this.boundary.prepare(binding.scope.kind==="page"?binding.scope:binding.scope.rootUuid,request.value,[...selected]);await check();
        const packet=result as {scene?:{savedSource:{blocks:unknown[]};guidance:GuidanceReading;permissions:{bodyWrite:boolean;fileWrite:boolean;ordinaryTodo:boolean}};savedSource?:{blocks:unknown[]};guidance?:GuidanceReading;permissions?:{bodyWrite:boolean;fileWrite:boolean;ordinaryTodo:boolean};sessions?:{references:Array<{url:string|null;description:string|null;platform:string}>}};
        const scene=packet.scene??packet;
        output.replaceChildren(element("p",`现场已核验并保存：${scene.savedSource?.blocks.length??0} 个来源。正文维护${scene.permissions?.bodyWrite?"已授权":"未授权"}；文件写作${scene.permissions?.fileWrite?"已授权":"未授权"}；普通 TODO${scene.permissions?.ordinaryTodo?"已授权":"未授权"}。`));
        const startup=element("textarea");startup.value=collaborationStartup(binding.directory,this.boundary.stateDirectory());startup.readOnly=true;startup.rows=7;startup.style.cssText="width:100%;box-sizing:border-box";output.append(element("p","把以下启动语交给你选择的 Agent。共同指导需显式读取；当前聊天不会自动更新。"),startup,button("复制启动语",()=>{void navigator.clipboard.writeText(startup.value).catch(this.boundary.report);}));
        const links=(packet.sessions?.references??[]).filter(ref=>ref.url&&/^https?:\/\//u.test(ref.url));
        if(!links.length)output.append(element("p","此工作还没有可靠会话链接。可使用现有 Agent 入口和以上启动语继续。"));
        for(const ref of links){const a=element("a",ref.description||ref.platform);a.href=ref.url!;a.target="_blank";a.rel="noopener noreferrer";output.append(a,element("br"));}
        status.textContent="当前请求已保存。后续改动先重读现场与指导版本。";
      }),output);
    }
    const guideDetails=element("details"),guideSummary=element("summary","共同指导：一处维护，各工作只写差异");guideDetails.open=guideOnly;guideDetails.append(guideSummary);body.append(guideDetails);
    const commonWrap=element("label","共同指导（保存后影响本插件的各工作）"),common=element("textarea");common.value=guidance.common.text;common.rows=14;common.maxLength=65536;common.style.cssText="width:100%;box-sizing:border-box";commonWrap.append(common);
    const projectWrap=element("label","这份工作的差异（不会改共同指导）"),project=element("textarea");project.value=guidance.project.text;project.rows=5;project.maxLength=65536;project.style.cssText="width:100%;box-sizing:border-box";projectWrap.append(project);
    let commonVersion=guidance.common.version,projectVersion=guidance.project.version;
    const version=element("p",`本次读取：共同 ${commonVersion.slice(0,12)}；项目 ${projectVersion.slice(0,12)}。旧现场保留当时的加载版本。`);
    guideDetails.append(version,commonWrap,action("明确保存共同指导",async()=>{const saved=await this.boundary.guidance.saveCommon(commonVersion,common.value,check);commonVersion=saved.version;version.textContent=`共同来源已读回核验：${commonVersion.slice(0,12)}。其他入口需重读。`;status.textContent="共同指导已保存；局部请求不会自动成为共同规则。";}),projectWrap,action("仅保存这份工作的差异",async()=>{const saved=await this.boundary.guidance.saveProject(binding,projectVersion,project.value,check);projectVersion=saved.version;status.textContent=`项目差异已读回核验：${projectVersion.slice(0,12)}；共同指导保持。`;}));
    for(const box of Array.from(body.querySelectorAll("textarea"))){box.addEventListener("compositionstart",()=>{composing=true;lock();});box.addEventListener("compositionend",()=>{composing=false;lock();});}
    body.append(status);this.panel.root.replaceChildren(header,body);await check();
    if(await this.panel.open(panelRevision)&&!current())await this.panel.close(false,"switch",false);
  }
}
