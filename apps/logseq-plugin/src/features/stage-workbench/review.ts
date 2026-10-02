import { button, element } from "../../host/panel-host.ts";
import type { WorkView } from "../work-view/controller.ts";
import type { ReadingBookmark } from "../work-view/renderer.ts";
import type { ReviewContext, ReviewFrame, ReviewPort } from "../work-view/review-port.ts";
import { copyPresentation } from "../work-view/operations.ts";
import { sameScope, sha256 } from "../content-writeback/validation.ts";
import type { Operation, SourceSnapshot } from "../content-writeback/protocol.ts";
import { composeDiff } from "./diff.ts";
import { latest, revisionId } from "./recorder.ts";
import type { StageRecorder } from "./recorder.ts";
import type { Stage, StageHistory, StageRevision } from "./protocol.ts";

export interface ReviewActions {
  authorize(scope:ReviewContext["scope"]):Promise<void>;
  submit(stageId:string,expectedRevision:string,operations:Operation[],local:boolean,requestId:string,correctionOf:StageRevision["correctionOf"]):Promise<unknown>;
  read():Promise<SourceSnapshot>;
  listFiles(scope:ReviewContext["scope"]):Promise<Array<{id:string;title:string}>>;
}
export class StageReview implements ReviewPort {
  readonly bar=element("div","","wb-stage-bar");
  private scope:ReviewContext["scope"]|null=null;
  private ticket=0;
  private history:StageHistory={stages:[],current:null,currentEventId:null,problems:[]};
  private selected:string|null=null;
  private seen:StageRevision|null=null;
  private historyMode=false;
  private comparison:"start"|"previous"="start";
  private all=false;
  private bookmark:ReadingBookmark|null=null;
  private bridge:ReturnType<WorkView["attachReview"]>|null=null;
  private editing=false;
  private draft=false;
  private disposed=false;
  private readonly label=element("span");
  private readonly issue=element("small","","wb-error");
  private readonly goal=element("input");
  private readonly beginButton=button("开始阶段",()=>this.run(()=>this.begin()));
  private readonly checkpointButton=button("提交结果",()=>this.run(()=>this.checkpoint()));
  private readonly acceptButton=button("认可",()=>this.run(()=>this.acceptSeen()));
  private readonly allButton=button("看本阶段全部变化",()=>this.showAll());
  private readonly backButton=button("返回原位置",()=>this.returnCurrent());
  private readonly historyBox=element("details");
  private readonly historyList=element("div");
  private readonly filesBox=element("details");
  private readonly filesList=element("div");
  private readonly fileIds=new Set<string>();
  constructor(readonly recorder:StageRecorder,private readonly actions:ReviewActions){
    this.goal.placeholder="本阶段的一句话目标";this.goal.maxLength=240;this.goal.setAttribute("aria-label","阶段目标");
    this.historyBox.append(element("summary","阶段历史"),this.historyList);
    this.filesBox.append(element("summary","成果文件"),this.filesList);
    this.filesBox.addEventListener("toggle",()=>{if(this.filesBox.open)this.run(()=>this.files());});
    this.bar.append(this.label,this.goal,this.beginButton,this.checkpointButton,this.acceptButton,this.allButton,this.backButton,this.historyBox,this.filesBox,this.issue);
    const style=element("style");style.textContent=`
      .wb-stage-bar{padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--ls-border-color,#ddd)}
      .wb-stage-bar>span{flex:1;min-width:180px}.wb-stage-bar input{max-width:260px}.wb-stage-bar details[open]{width:100%}
      .wb-stage-bar details pre,.wb-review-info pre{white-space:pre-wrap;max-height:280px;overflow:auto}
      .wb-stage-bar .wb-stage-entry{display:block;text-align:left;width:100%;border:0;margin:3px 0}
      .wb-review-change{border-left:2px solid #79978b}.wb-review-change .wb-body{background:rgba(121,151,139,.07)}
      .wb-review-info,.wb-review-editor{grid-column:3;font-size:12px}.wb-review-info{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .wb-review-info>span{border-bottom:1px dotted currentColor;opacity:.75}.wb-review-info details[open],.wb-review-info small{width:100%}
      .wb-review-insert{color:inherit;background:rgba(121,151,139,.16);border-bottom:1px solid currentColor}
      .wb-review-editor textarea{width:100%;min-height:130px;resize:vertical;white-space:pre-wrap}
      .wb-review-history .wb-grip,.wb-review-history .wb-controls{display:none}
      @media(prefers-reduced-motion:reduce){.wb-review-change,.wb-review-insert{transition:none!important;animation:none!important}}
    `;this.bar.append(style);this.chrome();
  }
  attach(bridge:ReturnType<WorkView["attachReview"]>):void{this.bridge=bridge;}
  private run(action:()=>Promise<unknown>):void{
    const ticket=this.ticket;void action().catch(error=>{if(ticket===this.ticket&&!this.disposed)this.issue.textContent=error instanceof Error?error.message:String(error);});
  }
  scopeChanged(scope:ReviewContext["scope"]|null):void{
    this.ticket++;this.recorder.invalidate();this.scope=scope;this.history={stages:[],current:null,currentEventId:null,problems:[]};
    this.selected=null;this.seen=null;this.historyMode=false;this.all=false;this.bookmark=null;this.editing=false;this.fileIds.clear();this.issue.textContent="";
    this.chrome();if(scope)this.run(()=>this.reload());
  }
  private stage():Stage|null{return this.history.stages.find(s=>s.start.id===this.selected)??null;}
  private writable():Stage|null{return this.history.stages.find(s=>s.start.id===this.history.current)??null;}
  async reload():Promise<void>{
    const scope=this.scope,ticket=this.ticket;if(!scope)return;
    const history=await this.recorder.store.history(scope);if(ticket!==this.ticket||this.disposed)return;
    this.history=history;if(!this.selected)this.selected=history.current;
    this.seen=this.stage()?latest(this.stage()!):null;
    this.issue.textContent=history.problems.join(" · ");this.historyList.replaceChildren();
    for(const stage of [...history.stages].reverse()){
      const entry=button(`${stage.start.at.slice(0,16).replace("T"," ")} · ${stage.start.goal} · ${stage.acceptances.length?"已认可":"待认可"}`,()=>this.showHistory(stage.start.id));entry.className="wb-stage-entry";
      this.historyList.append(entry);
      if(this.selected===stage.start.id){
        const select=element("select");select.setAttribute("aria-label","历史修订版本");
        for(const r of stage.revisions){const option=element("option",`修订 ${stage.revisions.indexOf(r)+1}${stage.acceptances.some(a=>a.revisionId===r.id)?" · 已认可":""}`);option.value=r.id;select.append(option);}
        select.value=this.seen?.id??"";select.onchange=()=>{if(this.busy())return;this.remember();this.seen=stage.revisions.find(r=>r.id===select.value)??null;this.historyMode=true;this.bridge?.repaint();};
        this.historyList.append(select,button("相对阶段起点",()=>this.compare("start")),button("相对前阶段",()=>this.compare("previous")),
          button("继续此阶段",()=>this.run(async()=>{
            if(this.busy()||!this.scope)return;await this.actions.authorize(this.scope);
            await this.recorder.activate({stageId:stage.start.id,expectedStageId:this.history.current,requestKey:crypto.randomUUID()});
            this.historyMode=false;this.all=false;await this.reload();
          })));
      }
    }
    this.chrome();this.bridge?.repaint();
  }
  private chrome():void{
    const stage=this.stage();
    this.label.textContent=stage?`${this.historyMode?"历史 · ":""}${stage.start.goal}${this.seen&&stage.acceptances.some(a=>a.revisionId===this.seen!.id)?" · 已认可":""}`:"阶段记录";
    this.acceptButton.hidden=!this.seen;this.acceptButton.disabled=!!this.seen&&!!stage?.acceptances.some(a=>a.revisionId===this.seen!.id);
    this.checkpointButton.hidden=!this.writable();this.backButton.hidden=!this.historyMode&&!this.all;
    this.allButton.hidden=!stage;this.goal.hidden=!!stage;
    this.beginButton.textContent=stage?"新目标":"开始阶段";
  }
  private busy():boolean{
    if(this.editing||this.draft){this.issue.textContent="编辑草稿保留，请先结束当前输入再切换阅读。";return true;}return false;
  }
  private remember():void{if(!this.bookmark)this.bookmark=this.bridge?.bookmark()??null;}
  private showHistory(id:string):void{
    if(this.busy())return;this.remember();this.selected=id;this.seen=latest(this.stage()!);this.historyMode=true;this.all=true;
    this.chrome();this.bridge?.repaint();this.run(()=>this.reload());
  }
  private compare(value:"start"|"previous"):void{if(this.busy())return;this.comparison=value;this.bridge?.repaint();}
  private showAll():void{if(this.busy())return;this.remember();this.all=true;this.bridge?.repaint();this.chrome();}
  private returnCurrent():void{
    if(this.busy())return;this.selected=this.history.current;this.seen=this.writable()?latest(this.writable()!):null;this.historyMode=false;this.all=false;
    this.chrome();this.bridge?.repaint();if(this.bookmark)this.bridge?.restore(this.bookmark);this.bookmark=null;
  }
  async begin():Promise<void>{
    if(this.busy()||!this.scope)return;
    if(this.stage()&&this.goal.hidden){this.goal.hidden=false;this.goal.value="";this.goal.focus();return;}
    const scope=this.scope,ticket=this.ticket;
    await this.actions.authorize(scope);if(ticket!==this.ticket)return;
    const history=await this.recorder.store.history(scope);
    const stage=await this.recorder.begin({goal:this.goal.value,requestKey:crypto.randomUUID(),expectedStageId:history.current,fileIds:[...this.fileIds]});
    if(ticket!==this.ticket)return;this.selected=stage.start.id;this.historyMode=false;await this.reload();
  }
  async checkpoint():Promise<void>{
    if(this.busy()||!this.scope)return;const stage=this.writable();if(!stage)return;
    await this.actions.authorize(this.scope);
    const result=await this.recorder.reconcile({stageId:stage.start.id,expectedRevision:revisionId(stage),requestKey:crypto.randomUUID()});
    this.selected=stage.start.id;this.seen=result;this.historyMode=false;
    // Explicit selected files are added by a second checkpoint only when they changed.
    if(this.fileIds.size)await this.recorder.checkpoint({stageId:stage.start.id,expectedRevision:result.id,requestKey:crypto.randomUUID(),requestIds:[],fileIds:[...this.fileIds]});
    await this.reload();await this.bridge?.refresh();
  }
  async acceptSeen():Promise<void>{
    if(this.busy()||!this.scope||!this.seen||!this.stage())return;
    // Capture before any await: new revisions cannot ride along with this user action.
    const scope={...this.scope},stageId=this.stage()!.start.id,revision=this.seen,ticket=this.ticket;
    await this.actions.authorize(scope);if(ticket!==this.ticket)return;
    await this.recorder.acceptLocal(scope,stageId,revision.id,await sha256(JSON.stringify(revision)));
    if(ticket===this.ticket)await this.reload();
  }
  compose(context:ReviewContext):ReviewFrame{
    this.draft=context.editing;
    const unchanged={rows:context.rows,state:context.state,view:context.view,changes:new Map(),historical:false};
    if(!this.scope||!sameScope(this.scope,context.scope)||!this.stage())return unchanged;
    const stage=this.stage()!,source=this.seen?.source??stage.start.source;
    let base=stage.start.source;
    if(this.comparison==="previous"&&stage.start.previousStageId){
      const previous=this.history.stages.find(s=>s.start.id===stage.start.previousStageId);
      base=previous?.revisions.find(r=>r.id===stage.start.previousRevisionId)?.source??previous?.start.source??base;
    }
    const changes=composeDiff(base,source,this.seen);
    const outside=[...changes.keys()].filter(id=>!context.view.items.some(i=>i.uuid===id&&!i.hidden)).length;
    this.allButton.textContent=outside?`还有 ${outside} 处范围外变化 · 看全部`:"看本阶段全部变化";
    if(context.editing||this.editing){return {...unchanged,changes,historical:false};}
    let rows=context.rows,view=context.view;
    const state=copyPresentation(context.state);
    if(this.historyMode){
      const blocks=[...source.blocks,...base.blocks.filter(b=>changes.get(b.target.blockUuid)?.kind==="removed")];
      rows=blocks.map(b=>({uuid:b.target.blockUuid,content:changes.get(b.target.blockUuid)?.kind==="removed"?"":b.content??"当时来源不可用",depth:b.depth,sourceParent:b.parentUuid}));
      const members=new Set(rows.map(r=>r.uuid)),items=state.items.filter(i=>members.has(i.uuid));
      for(const row of rows)if(!items.some(i=>i.uuid===row.uuid))items.push({uuid:row.uuid,depth:row.depth});
      state.items=items;state.collapsed=[];state.expanded=items.map(i=>i.uuid);
      view={focused:false,visibleCount:items.length,items:items.map(i=>({...i,hidden:false,folded:false,child:false,full:true,emphasis:false}))};
    }else{
      // Missing old blocks retain historical identity/context, never attach to a same-title replacement.
      const removed=base.blocks.filter(b=>changes.get(b.target.blockUuid)?.kind==="removed"&&!rows.some(r=>r.uuid===b.target.blockUuid));
      rows=[...rows,...removed.map(b=>({uuid:b.target.blockUuid,content:"",depth:b.depth,sourceParent:b.parentUuid,missing:true}))];
      state.items=[...state.items,...removed.map(b=>({uuid:b.target.blockUuid,depth:b.depth}))];
      const items=[...view.items,...removed.map(b=>({uuid:b.target.blockUuid,depth:b.depth,hidden:!this.all,folded:false,child:false,full:true,emphasis:false}))];
      if(this.all){
        const visible=new Set(changes.keys());
        for(const item of items){if(visible.has(item.uuid))for(const ancestor of source.blocks.filter(b=>b.target.blockUuid===item.uuid).map(b=>b.parentUuid))if(ancestor)visible.add(ancestor);}
        view={...view,items:items.map(i=>visible.has(i.uuid)?{...i,hidden:false,folded:false,full:true}:i),visibleCount:items.filter(i=>!i.hidden||visible.has(i.uuid)).length};
      }else view={...view,items};
    }
    return {rows,state,view,changes,historical:this.historyMode};
  }
  edit(uuid:string,container:HTMLElement,suggest:boolean):void{
    if(this.editing){container.querySelector("textarea")?.focus();return;}
    this.run(()=>this.openEditor(uuid,container,suggest));
  }
  private async openEditor(uuid:string,container:HTMLElement,suggest:boolean):Promise<void>{
    if(this.busy()||!this.scope)return;
    const scope=this.scope,ticket=this.ticket;await this.actions.authorize(scope);if(ticket!==this.ticket)return;
    const source=await this.actions.read();if(ticket!==this.ticket)return;
    const block=source.blocks.find(b=>b.target.blockUuid===uuid);
    if(!block||block.content===null||!block.contentVersion)throw Error("该历史块在当前权威范围中已缺失，保留历史；请选择现存目标。");
    const stage=this.writable();if(!stage)throw Error("请先为当前工作开始阶段。");
    const previousText=block.content,previousVersion=block.contentVersion;
    const correctionOf=this.historyMode&&this.seen&&this.stage()?{stageId:this.stage()!.start.id,revisionId:this.seen.id,sourceId:block.sourceId}:null;
    const area=element("textarea");area.value=suggest?"":previousText;area.setAttribute("aria-label",suggest?"原文建议":"当前权威原文");
    const type=element("select");for(const value of ["[注]","[想法]"]){const option=element("option",value);option.value=value;type.append(option);}
    const message=element("small",this.historyMode?"已读取当前权威原文；提交只修正当前内容，历史保留。":"完整当前原文 · 正式字段和 TODO 受保护");
    const requestId=crypto.randomUUID();
    let composing=false,pending=false,requestOperations:Operation[]|null=null;
    const save=button(suggest?"写入原文建议":"提交修改",()=>this.run(async()=>{
      if(composing||pending||ticket!==this.ticket)return;pending=true;save.disabled=true;
      try{
        if(!requestOperations){
          if(suggest){
            if(!area.value.trim())return;
            requestOperations=[{operationId:crypto.randomUUID(),type:"insert-child",target:block.target,expectedContentVersion:previousVersion,expectedParentUuid:block.parentUuid,content:`**${type.value}** ${area.value}`,childUuid:null}];
          }else{
            if(area.value===previousText){this.editing=false;container.replaceChildren();return;}
            const a=Array.from(previousText),b=Array.from(area.value);let left=0,right=0;
            while(left<a.length&&left<b.length&&a[left]===b[left])left++;
            while(right<a.length-left&&right<b.length-left&&a[a.length-1-right]===b[b.length-1-right])right++;
            const start=a.slice(0,left).join("").length,end=previousText.length-a.slice(a.length-right).join("").length,text=b.slice(left,b.length-right).join("");
            requestOperations=[{operationId:crypto.randomUUID(),type:"replace-text",target:block.target,expectedContentVersion:previousVersion,expectedParentUuid:block.parentUuid,range:{start,end},expectedText:previousText.slice(start,end),text,context:{before:previousText.slice(Math.max(0,start-16),start),after:previousText.slice(end,end+16)}}];
          }
        }
        const result=await this.actions.submit(stage.start.id,revisionId(stage),requestOperations,true,requestId,correctionOf) as {status?:string;stageProblem?:string|null};
        if(ticket!==this.ticket)return;
        if(result.status!=="complete"||result.stageProblem){message.textContent=`修改未完整确认，当前输入已保留。查看就近事实后重新读取，不重放未知写入。${result.stageProblem??""}`;return;}
        this.editing=false;container.replaceChildren();await this.reload();await this.bridge?.refresh();
      }finally{pending=false;save.disabled=composing;}
    }));
    const cancel=button("保留原文 / 关闭",()=>{if(composing||pending)return;this.editing=false;container.replaceChildren();this.bridge?.repaint();});
    area.addEventListener("compositionstart",()=>{composing=true;save.disabled=true;});
    area.addEventListener("compositionend",()=>{composing=false;save.disabled=pending;});
    this.editing=true;container.replaceChildren(message,area,...(suggest?[type]:[]),save,cancel);area.focus();
  }
  private async files():Promise<void>{
    if(!this.scope)return;const scope=this.scope,ticket=this.ticket,choices=await this.actions.listFiles(scope);if(ticket!==this.ticket)return;
    this.filesList.replaceChildren();
    for(const file of choices){
      const label=element("label"),check=element("input");check.type="checkbox";check.checked=this.fileIds.has(file.id);
      check.onchange=()=>{if(check.checked)this.fileIds.add(file.id);else this.fileIds.delete(file.id);};label.append(check,document.createTextNode(file.title));this.filesList.append(label);
    }
    const stage=this.stage(),before=stage?.start.files??[],files=this.seen?.files??before;
    for(const file of files){
      const details=element("details");details.append(element("summary",`${file.title} · ${file.availability==="available"?"当时可读":"当时不可用"}`));
      details.append(element("p",file.retention==="text-snapshot"?"旧新正文已保留；实际文件保存和恢复使用材料入口。":"当时记录可读，原文件版本未保留；没有内容 diff 或字节恢复保证。"));
      const old=before.find(f=>f.id===file.id);
      if(file.content!==null){details.append(element("pre",file.content));if(old?.content!==null&&old?.content!==undefined&&old.version!==file.version)details.append(element("pre",old.content));}
      if(file.problem)details.append(element("small",file.problem,"wb-error"));
      this.filesList.append(details);
    }
  }
  dispose():void{this.disposed=true;this.scopeChanged(null);this.bar.remove();}
}
