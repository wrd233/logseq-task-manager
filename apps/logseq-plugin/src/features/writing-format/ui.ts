import { button, element, FeaturePanel } from "../../host/panel-host.ts";
import { panels } from "../../workspace/context.ts";
import type { ApplyResult, RequestRecord, ScopeLease, SourceRead } from "../content-writeback/protocol.ts";
import { naturalLabels, type FormattingProposal, type WritingFormatService } from "./service.ts";
function explain(reason:string):string {
  const messages:Record<string,string>={FORMAT_SELECTION_REQUIRED:"请选择整理范围和标记。",FORMAT_FORMAL_LABEL_FORBIDDEN:"正式和受管标记需要使用正式入口。",FORMAT_CHANGE_LIMIT:"本次差异超过 64 处，请缩小范围。",FORMAT_PREVIEW_TOO_LARGE:"差异内容较长，请缩小所选范围。",FORMAT_UNRESOLVED_RESULT:"前次整理还有未解决项，请先查询并核对。",FORMAT_SOURCE_CHANGED:"原文已变化，旧差异停止写入。",CONTENT_VERSION_CONFLICT:"此处原文已变化，旧差异停止写入。",FORMAT_PROPOSAL_UNAVAILABLE:"这份提议已不可用，请重读并查看新差异。",SCOPE_REVOKED:"当前范围已失效，请重新打开当前工作。",READBACK_MISMATCH:"宿主读回内容不同，请先查询实际结果。"};
  return messages[reason]??reason;
}

export class WritingFormatUI {
  private revision=0;
  private readonly panel=new FeaturePanel("writing-format","整理行首格式",()=>{this.revision++;});
  constructor(private readonly port:{service:WritingFormatService;context(root?:string):Promise<{lease:ScopeLease;read:SourceRead}>;valid(lease:ScopeLease):boolean}){this.panel.root.dataset.writingFormat="true";}
  close():void{this.revision++;panels.reserve();void this.panel.close(false,"close",false);}
  dispose():void{this.revision++;this.panel.dispose();}
  async open(root?:string):Promise<void>{
    const revision=++this.revision,panelRevision=panels.reserve(),{lease,read}=await this.port.context(root);
    const current=()=>revision===this.revision&&this.port.valid(lease);if(!current())return;
    const body=element("div"),status=element("p"),diff=element("div"),ranges=element("div"),pendingArea=element("div"),selected=new Set<string>(),labels=new Set<string>(naturalLabels);
    let busy=false,composing=false,proposal:FormattingProposal|null=null;
    body.append(element("h3","整理行首格式"),element("p","先查看真实差异，再明确写入这份差异。只加粗选定的行首标记，措辞、属性、层级、任务状态继续保留。代码、引文、正式对象和普通任务保持原样。"));
    ranges.style.cssText="max-height:22vh;overflow:auto";
    for(const b of read.snapshot.blocks){
      if(b.availability!=="available")continue;
      const label=element("label"),input=element("input");input.type="checkbox";label.style.cssText=`display:block;margin:6px 0;padding-left:${Math.min(4,b.depth)*16}px`;
      input.onchange=()=>{if(input.checked)selected.add(b.sourceId);else selected.delete(b.sourceId);};
      label.append(input,document.createTextNode(` ${b.content!.split("\n")[0]!.slice(0,120)}（含下属）`));ranges.append(label);
    }
    body.append(element("strong","选择整理范围"),ranges,element("strong","要整理的标记"));
    const labelArea=element("div");
    for(const text of naturalLabels){const label=element("label"),input=element("input");input.type="checkbox";input.checked=true;label.style.marginRight="12px";input.onchange=()=>{if(input.checked)labels.add(text);else labels.delete(text);};label.append(input,document.createTextNode(` ${text}`));labelArea.append(label);}
    const custom=element("input");custom.type="text";custom.placeholder="其他已有标记，多个用逗号分隔";custom.setAttribute("aria-label","其他行首标记");
    custom.addEventListener("compositionstart",()=>{composing=true;});custom.addEventListener("compositionend",()=>{composing=false;});
    body.append(labelArea,custom);
    const execute=(task:()=>Promise<void>)=>{if(busy||composing||!current())return;busy=true;apply.disabled=true;void task().catch(error=>{if(current())status.textContent=explain(error instanceof Error?error.message:String(error));}).finally(()=>{busy=false;apply.disabled=!proposal?.changes.length;});};
    const show=(value:FormattingProposal)=>{
      proposal=value;diff.replaceChildren(element("h4",`实际差异：${value.changes.length} 处；保留 ${value.skipped.length} 个受保护或不可用项`));
      if(value.proposedBy.kind==="verified-local-agent")diff.append(element("p",`提议来自此连接：${value.proposedBy.clientLabel}。写入只限下方差异。`));
      for(const change of value.changes){const item=element("div");item.style.cssText="margin:12px 0;border-left:3px solid var(--tc-line);padding-left:12px";item.append(element("span",`第 ${change.line} 行`),element("pre",`− ${change.lineText}\n+ ${change.formattedLine}`));diff.append(item);}
      apply.disabled=!value.changes.length;status.textContent=value.changes.length?"请核对差异，再明确写入。若原文已有变化，这份差异会停止写入。":"所选范围无需变更。";
    };
    const showResult=(result:ApplyResult|null)=>{
      if(!result){status.textContent="无需变更。";return;}
      const verified=result.record.items.filter(item=>item.contentVerified).length;
      status.textContent=`${result.status==="complete"?"已核验":result.status==="partial"?"部分写入":result.status==="outcome-unknown"?"结果未知":"尚未写入"}：${verified}/${result.record.items.length} 处；${result.durable?"日志已确认":"日志未确认"}。`;
      const problems=[...new Set(result.record.items.map(item=>item.reason).filter((reason):reason is string=>!!reason))];if(problems.length)status.append(document.createTextNode(` ${problems.map(explain).join("；")} 原差异保留。`));
    };
    const renderPending=(records:RequestRecord[])=>{
      pendingArea.replaceChildren();
      for(const record of records){
        const box=element("div"),details=element("details");details.append(element("summary","核对前次原文、提议与已观察内容"));
        for(const item of new Map(record.items.map(item=>[item.target.blockUuid,item])).values())details.append(element("p",`${item.status}${item.reason?` · ${item.reason}`:""}`),element("pre",`基础原文\n${item.baseContent??"未保存"}\n\n原提议\n${item.proposedContent??"未编译"}\n\n已观察内容\n${item.currentContent??"尚未观察；先查询"}`));
        box.append(element("p","前次整理还有未解决项。先查询实际结果，再决定保留当前原文。"),details,button("查询并核对前次结果",()=>execute(async()=>{const result=await this.port.service.result(lease,record.patch.requestId,true);if(current())showResult(result);await refreshPending();})),button("明确保留当前原文并结束前次整理",()=>execute(async()=>{await this.port.service.keepCurrent(lease,record.patch.requestId);await refreshPending();if(current())status.textContent="已保留当前原文。可重读并生成新的差异；前次结果与事实仍保留在日志中。";})));pendingArea.append(box);
      }
    };
    const refreshPending=async()=>{const records=await this.port.service.pending(lease);if(current())renderPending(records);};
    const preview=button("重读并查看差异",()=>execute(async()=>{
      const value=await this.port.service.preview(lease,{requestId:crypto.randomUUID(),sourceIds:[...selected],labels:[...new Set([...labels,...custom.value.split(/[,，]/u).map(v=>v.trim()).filter(Boolean)])]},{kind:"local-user-command",command:"formatting-preview"});if(current())show(value);
    }));
    const apply=button("明确写入这份差异",()=>execute(async()=>{if(!proposal)return;const result=await this.port.service.apply(lease,proposal.proposalId);if(current())showResult(result);await refreshPending();}));apply.disabled=true;
    body.append(preview);
    const existing=this.port.service.entries(lease);
    if(existing.length){const select=element("select");select.setAttribute("aria-label","已有格式提议");for(const [index,value] of existing.entries()){const option=element("option",`已有提议 ${index+1} · ${value.changes.length} 处`);option.value=value.proposalId;select.append(option);}body.append(select,button("查看已有提议",()=>{if(!busy&&current()){const value=existing.find(item=>item.proposalId===select.value);if(value)show(value);}}));}
    body.append(diff,apply,pendingArea,status,button("关闭",()=>this.close()));
    this.panel.root.replaceChildren(body);await refreshPending();if(current())await this.panel.open(panelRevision);
  }
}
