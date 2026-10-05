import { button, element } from "../../host/panel-host.ts";
import type { WorkView } from "../work-view/controller.ts";
import type { ReadingBookmark } from "../work-view/renderer.ts";
import type { ReviewContext, ReviewFrame, ReviewPort } from "../work-view/review-port.ts";
import { copyPresentation } from "../work-view/operations.ts";
import { sameScope, sha256 } from "../content-writeback/validation.ts";
import type { Operation, SourceSnapshot } from "../content-writeback/protocol.ts";
import { composeDiff, inlineDiff, observePositions } from "./diff.ts";
import { latest, revisionId } from "./recorder.ts";
import type { StageRecorder } from "./recorder.ts";
import type { Stage, StageHistory, StageRevision } from "./protocol.ts";

/** Missing identities sit by their last known predecessor; names never participate. */
function withGhosts<T extends {uuid:string}>(items:readonly T[],ghosts:readonly T[],base:SourceSnapshot):T[]{
  const result=[...items],order=base.blocks.map(b=>b.target.blockUuid);
  for(const ghost of ghosts){const at=order.indexOf(ghost.uuid);let anchor=-1;
    for(let i=at-1;i>=0;i--){anchor=result.findIndex(x=>x.uuid===order[i]);if(anchor>=0)break;}
    result.splice(anchor<0?Math.min(at,result.length):anchor+1,0,ghost);
  }return result;
}
export interface ReviewActions {
  authorize(scope:ReviewContext["scope"]):Promise<void>;
  submit(stageId:string,expectedRevision:string,operations:Operation[],local:boolean,requestId:string,correctionOf:StageRevision["correctionOf"]):Promise<unknown>;
  read():Promise<SourceSnapshot>;
  openFile?(id:string):Promise<unknown>;
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
  private submittedMode=false;
  private currentMatches=true;
  private comparison:"start"|"previous"="start";
  private all=false;
  private bookmark:ReadingBookmark|null=null;
  private bridge:ReturnType<WorkView["attachReview"]>|null=null;
  private editing=false;
  private activeEditor:HTMLElement|null=null;
  private draft=false;
  private disposed=false;
  private frozen:ReviewFrame|null=null;
  private goalOpen=false;
  private draftKey(uuid:string):string{return `workbench:stage-draft:${JSON.stringify(this.scope)}:${uuid}`;}
  private savedDraft(uuid:string):{stageId:string;text:string;suggest:boolean;type:string}|null{
    try{const raw=localStorage.getItem(this.draftKey(uuid));if(!raw)return null;const d=JSON.parse(raw);
      return typeof d.stageId==="string"&&typeof d.text==="string"&&d.text.length<=262144&&typeof d.suggest==="boolean"&&["[注]","[想法]"].includes(d.type)?d:null;
    }catch{return null;}
  }
  focusGoal():void{if(this.busy())return;void this.bridge?.openReview();this.goalOpen=true;this.goal.value="";this.chrome();this.goal.focus();}
  navigation() {
    const stage = this.stage(), accepted = !!this.seen && !!stage?.acceptances.some(a => a.revisionId === this.seen!.id);
    return { attention: !!this.seen && !accepted, busy: this.editing || this.draft, historical: this.historyMode,
      notice: this.editing ? "审阅输入尚未提交 · 先提交或保留草稿，再收起审阅。" : this.issue.textContent ?? "" };
  }
  leave(): boolean { if (this.busy()) return false; this.returnCurrent(); return true; }
  private readonly label=element("span");
  private readonly issue=element("small","","wb-error");
  private readonly goal=element("input");
  private readonly beginButton=button("开始阶段",()=>this.run(()=>this.begin()));
  private readonly checkpointButton=button("提交结果",()=>this.run(()=>this.checkpoint()));
  private readonly cancelGoalButton=button("取消",()=>{this.goalOpen=false;this.chrome();this.beginButton.focus();});
  private readonly acceptButton=button("认可所见版本",()=>this.run(()=>this.acceptSeen()));
  private readonly submittedButton=button("查看待认可版本",()=>{
    if(this.busy()||!this.seen)return;this.remember();this.historyMode=true;this.submittedMode=true;this.all=true;
    this.chrome();this.bridge?.repaint();this.run(()=>this.reload());
  });
  private readonly allButton=button("看本阶段全部变化",()=>this.showAll());
  private readonly backButton=button("返回原位置",()=>this.returnCurrent());
  private readonly historyBox=element("details");
  private readonly historyList=element("div");
  private readonly filesBox=element("details");
  private readonly filesList=element("div");
  private readonly fileIds=new Set<string>();
  constructor(readonly recorder:StageRecorder,private readonly actions:ReviewActions){
    this.goal.placeholder="本阶段的一句话目标";this.goal.maxLength=240;this.goal.setAttribute("aria-label","阶段目标");
    this.goal.onkeydown=event=>{
      if(event.isComposing)return;
      if(event.key==="Enter"){event.preventDefault();this.run(()=>this.begin());}
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();this.cancelGoalButton.click();}
    };
    this.historyBox.append(element("summary","阶段历史"),this.historyList);
    this.filesBox.append(element("summary","成果文件"),this.filesList);
    this.filesBox.addEventListener("toggle",()=>{if(this.filesBox.open)this.run(()=>this.files());});
    this.bar.append(this.label,this.goal,this.beginButton,this.cancelGoalButton,this.checkpointButton,this.acceptButton,this.submittedButton,this.allButton,this.backButton,this.historyBox,this.filesBox,this.issue);
    const style=element("style");style.textContent=`
      .wb-stage-bar{padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--ls-border-color,#ddd)}
      .wb-stage-bar>span{flex:1;min-width:180px}.wb-stage-bar input{max-width:260px}.wb-stage-bar details[open]{width:100%}
      .wb-stage-bar details pre,.wb-review-info pre{white-space:pre-wrap;max-height:280px;overflow:auto}
      .wb-stage-bar .wb-stage-entry{display:block;text-align:left;width:100%;border:0;margin:3px 0}
      .wb-review-change{border-left:2px solid var(--ls-link-text-color,#79978b)}
      .wb-review-info,.wb-review-editor{grid-column:3 / 5;font-size:12px}.wb-review-info{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .wb-review-info>span{border-bottom:1px dotted currentColor;opacity:.75}.wb-review-info details[open],.wb-review-info small{width:100%}
      .wb-review-insert{color:inherit;background:rgba(121,151,139,.2);border-bottom:2px solid currentColor}.wb-review-info del{text-decoration-thickness:2px}
      .wb-review-editor textarea{width:100%;min-height:130px;resize:vertical;white-space:pre-wrap}
      .wb-review-history .wb-grip{visibility:hidden}
      .wb-review-history .wb-body{grid-column:3;min-width:0}
      @media(prefers-reduced-motion:reduce){.wb-review-change,.wb-review-insert{transition:none!important;animation:none!important}}
    `;this.bar.append(style);this.chrome();
  }
  attach(bridge:ReturnType<WorkView["attachReview"]>):void{this.bridge=bridge;}
  private run(action:()=>Promise<unknown>):void{
    const ticket=this.ticket;void action().catch(error=>{if(ticket===this.ticket&&!this.disposed)this.issue.textContent=error instanceof Error?error.message:String(error);});
  }
  scopeChanged(scope:ReviewContext["scope"]|null):void{
    this.activeEditor?.replaceChildren();this.activeEditor=null;
    this.ticket++;this.recorder.invalidate();this.scope=scope;this.history={stages:[],current:null,currentEventId:null,problems:[]};
    this.selected=null;this.seen=null;this.historyMode=false;this.submittedMode=false;this.currentMatches=true;this.all=false;this.bookmark=null;this.editing=false;this.frozen=null;this.goalOpen=false;this.fileIds.clear();this.issue.textContent="";
    this.chrome();if(scope)this.run(()=>this.reload());
  }
  private stage():Stage|null{return this.history.stages.find(s=>s.start.id===this.selected)??null;}
  private writable():Stage|null{return this.history.stages.find(s=>s.start.id===this.history.current)??null;}
  async reload():Promise<void>{
    const scope=this.scope,ticket=this.ticket;if(!scope)return;
    const history=await this.recorder.store.history(scope);if(ticket!==this.ticket||this.disposed)return;
    this.history=history;if(!this.selected)this.selected=history.current;
    this.seen=this.historyMode&&this.seen?this.stage()?.revisions.find(r=>r.id===this.seen!.id)??null:this.stage()?latest(this.stage()!):null;
    this.issue.textContent=[...history.problems,...(history.storageNotes??[])].join(" · ");this.historyList.replaceChildren();
    for(const stage of [...history.stages].reverse()){
      const entry=button(`${stage.start.at.slice(0,16).replace("T"," ")} · ${stage.start.goal} · ${stage.acceptances.length?"有已认可版本":"待认可"}`,()=>this.showHistory(stage.start.id));entry.className="wb-stage-entry";
      this.historyList.append(entry);
      if(stage.problems.length)this.historyList.append(element("small",stage.problems.join(" · "),"wb-error"));
      if(this.selected===stage.start.id)for(const candidate of stage.candidates){
        const details=element("details");details.append(element("summary",`保留候选 · ${candidate.at}`),element("pre",candidate.source.blocks.map(b=>b.content??"不可用").join("\n")),button("选择此记录并重新读取当前",()=>this.run(async()=>{
          if(this.busy()||!this.scope)return;await this.actions.authorize(this.scope);
          const resolved=await this.recorder.resolveCandidate({stageId:stage.start.id,expectedRevision:revisionId(stage),candidateRevision:candidate.id,requestKey:crypto.randomUUID()});
          await this.recorder.checkpoint({stageId:stage.start.id,expectedRevision:revisionId(resolved),requestKey:crypto.randomUUID(),requestIds:[]});await this.reload();
        })));this.historyList.append(details);
      }
      if(this.selected===stage.start.id){
        const select=element("select");select.setAttribute("aria-label","历史修订版本");
        for(const r of stage.revisions){const option=element("option",`修订 ${stage.revisions.indexOf(r)+1}${stage.acceptances.some(a=>a.revisionId===r.id)?" · 已认可":""}`);option.value=r.id;select.append(option);}
        select.value=this.seen?.id??"";select.onchange=()=>{if(this.busy())return;this.remember();this.seen=stage.revisions.find(r=>r.id===select.value)??null;this.historyMode=true;this.chrome();if(this.filesBox.open)this.run(()=>this.files());this.bridge?.repaint();};
        this.historyList.append(select,button("相对阶段起点",()=>this.compare("start")),button("相对前阶段",()=>this.compare("previous")),
          button("继续此阶段",()=>this.run(async()=>{
            if(this.busy()||!this.scope)return;await this.actions.authorize(this.scope);
            await this.recorder.activate({stageId:stage.start.id,expectedStageId:this.history.current,requestKey:crypto.randomUUID()});
            this.historyMode=false;this.all=false;await this.reload();
          })));
      }
    }
    this.chrome();if(this.filesBox.open)this.run(()=>this.files());this.bridge?.repaint();
  }
  private chrome():void{
    const stage=this.stage();
    const accepted=!!this.seen&&!!stage?.acceptances.some(a=>a.revisionId===this.seen!.id);
    const mode=this.historyMode?this.submittedMode?"提交版本":"历史回看":"当前阶段";
    this.label.textContent=stage?`${mode} · ${stage.start.goal}${accepted?" · 已认可":""}`:"阶段记录";
    const pendingDifferent=!!this.seen&&!this.historyMode&&!this.currentMatches&&!accepted;
    this.acceptButton.hidden=!this.seen;this.acceptButton.disabled=accepted||pendingDifferent;this.submittedButton.hidden=!pendingDifferent;
    this.acceptButton.textContent=accepted?"已认可":"认可所见版本";
    this.checkpointButton.hidden=!this.writable()||this.historyMode;this.backButton.hidden=!this.historyMode&&!this.all;
    this.allButton.hidden=!stage?.revisions.length;this.goal.hidden=!this.goalOpen;this.cancelGoalButton.hidden=!this.goalOpen;
    this.beginButton.textContent=this.goalOpen?"开始":stage?"新目标":"开始阶段";
  }
  private busy():boolean{
    if(this.editing||this.draft){this.issue.textContent="编辑草稿保留，请先结束当前输入再切换阅读。";return true;}return false;
  }
  private remember():void{if(!this.bookmark)this.bookmark=this.bridge?.bookmark()??null;}
  private showHistory(id:string):void{
    if(this.busy())return;this.remember();this.selected=id;this.seen=latest(this.stage()!);this.historyMode=true;this.submittedMode=false;this.all=true;
    this.chrome();this.bridge?.repaint();this.run(()=>this.reload());
  }
  private compare(value:"start"|"previous"):void{if(this.busy())return;this.comparison=value;if(this.filesBox.open)this.run(()=>this.files());this.bridge?.repaint();}
  private showAll():void{if(this.busy())return;this.remember();this.all=true;this.bridge?.repaint();this.chrome();}
  private returnCurrent():void{
    if(this.busy())return;this.selected=this.history.current;this.seen=this.writable()?latest(this.writable()!):null;this.historyMode=false;this.all=false;
    this.chrome();this.bridge?.repaint();if(this.bookmark)this.bridge?.restore(this.bookmark);this.bookmark=null;
  }
  async begin():Promise<void>{
    if(this.busy()||!this.scope)return;
    if(!this.goalOpen){this.focusGoal();return;}
    if(!this.goal.value.trim()){this.focusGoal();return;}
    const scope=this.scope,ticket=this.ticket;
    await this.actions.authorize(scope);if(ticket!==this.ticket)return;
    const history=await this.recorder.store.history(scope);
    const stage=await this.recorder.begin({goal:this.goal.value,requestKey:crypto.randomUUID(),expectedStageId:history.current,fileIds:[...this.fileIds]});
    if(ticket!==this.ticket)return;this.selected=stage.start.id;this.historyMode=false;this.goalOpen=false;await this.reload();
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
    if(!this.historyMode&&!this.currentMatches&&!this.stage()!.acceptances.some(a=>a.revisionId===this.seen!.id)){
      this.issue.textContent="当前原文包含后来编辑；请查看待认可版本后认可。";return;
    }
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
    const current=context.rows.filter(row=>!row.outside&&!row.missing);
    const matches=current.length===source.blocks.length&&current.every((row,index)=>{
      const block=source.blocks[index]!;
      return row.uuid===block.target.blockUuid&&row.content===block.content&&row.depth===block.depth&&(index===0||row.sourceParent===block.parentUuid);
    });
    if(matches!==this.currentMatches){this.currentMatches=matches;this.chrome();}
    let base=stage.start.source;
    if(this.comparison==="previous"&&stage.start.previousStageId){
      const previous=this.history.stages.find(s=>s.start.id===stage.start.previousStageId);
      base=previous?.revisions.find(r=>r.id===stage.start.previousRevisionId)?.source??previous?.start.source??base;
    }
    const changes=composeDiff(base,source,this.seen);
    if(!this.historyMode)observePositions(changes,source,context.rows);
    if(!this.historyMode)for(const row of context.rows)if(this.savedDraft(row.uuid)&&!changes.has(row.uuid))changes.set(row.uuid,{kind:"problem",before:null,after:row.content,version:null,label:"保留的审阅草稿 · 点击继续",problem:null,inline:null});
    const outside=[...changes.keys()].filter(id=>!context.view.items.some(i=>i.uuid===id&&!i.hidden)).length;
    this.allButton.textContent=outside?`还有 ${outside} 处范围外变化 · 看全部`:"看本阶段全部变化";
    if(this.editing&&this.frozen)return this.frozen;
    if(context.editing)return {...unchanged,changes,historical:false};
    let rows=context.rows,view=context.view;
    const state=copyPresentation(context.state);
    if(this.historyMode){
      const blocks=withGhosts(source.blocks.map(b=>({...b,uuid:b.target.blockUuid})),base.blocks.filter(b=>changes.get(b.target.blockUuid)?.kind==="removed").map(b=>({...b,uuid:b.target.blockUuid})),base);
      rows=blocks.map(b=>({uuid:b.target.blockUuid,content:changes.get(b.target.blockUuid)?.kind==="removed"?"":b.content??"当时来源不可用",depth:b.depth,sourceParent:b.parentUuid}));
      const members=new Set(rows.map(r=>r.uuid)),items=state.items.filter(i=>members.has(i.uuid));
      for(const row of rows)if(!items.some(i=>i.uuid===row.uuid))items.push({uuid:row.uuid,depth:row.depth});
      state.items=items;state.collapsed=[];state.expanded=items.map(i=>i.uuid);
      view={focused:false,visibleCount:items.length,items:items.map(i=>({...i,hidden:false,folded:false,child:false,full:true,emphasis:false}))};
    }else{
      // Missing old blocks retain historical identity/context, never attach to a same-title replacement.
      const removed=base.blocks.filter(b=>changes.get(b.target.blockUuid)?.kind==="removed"&&!rows.some(r=>r.uuid===b.target.blockUuid));
      rows=withGhosts(rows,removed.map(b=>({uuid:b.target.blockUuid,content:"",depth:b.depth,sourceParent:b.parentUuid,missing:true})),base);
      state.items=withGhosts(state.items,removed.map(b=>({uuid:b.target.blockUuid,depth:b.depth})),base);
      const items=withGhosts(view.items,removed.map(b=>({uuid:b.target.blockUuid,depth:b.depth,hidden:!this.all,folded:false,child:false,full:true,emphasis:false})),base);
      if(this.all){
        const visible=new Set(changes.keys());
        const parents=new Map([...base.blocks,...source.blocks].map(b=>[b.target.blockUuid,b.parentUuid]));
        for(const id of [...visible]){let parent=parents.get(id);const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);visible.add(parent);parent=parents.get(parent);}}
        view={...view,items:items.map(i=>visible.has(i.uuid)?{...i,hidden:false,folded:false,full:true}:i),visibleCount:items.filter(i=>!i.hidden||visible.has(i.uuid)).length};
      }else view={...view,items};
    }
    const frame={rows,state,view,changes,historical:this.historyMode};this.frozen=frame;return frame;
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
    const saved=this.savedDraft(uuid);
    if(saved&&saved.stageId!==stage.start.id)throw Error("草稿属于另一阶段，请在历史中明确继续那个阶段；草稿已保留。");
    if(saved)suggest=saved.suggest;
    const previousText=block.content,previousVersion=block.contentVersion;
    const correctionOf=this.historyMode&&this.seen&&this.stage()?{stageId:this.stage()!.start.id,revisionId:this.seen.id,sourceId:block.sourceId}:null;
    const area=element("textarea");area.value=saved?.text??(suggest?"":previousText);area.maxLength=262144;area.setAttribute("aria-label",suggest?"原文建议":"当前权威原文");
    const type=element("select");for(const value of ["[注]","[想法]"]){const option=element("option",value);option.value=value;type.append(option);}
    if(saved)type.value=saved.type;
    const message=element("small",saved?"已保留输入；现在重新读取了当前原文，提交前请核对双方内容。":this.historyMode?"已读取当前权威原文；提交只修正当前内容，历史保留。":"完整当前原文 · 正式字段和 TODO 受保护");
    const key=this.draftKey(uuid);
    const persist=()=>{try{localStorage.setItem(key,JSON.stringify({stageId:stage.start.id,text:area.value,suggest,type:type.value}));}catch{message.textContent="草稿保存失败，请保留当前输入再切换工作。";}};
    const clear=()=>{localStorage.removeItem(key);this.editing=false;this.frozen=null;container.replaceChildren();};
    area.addEventListener("input",persist);type.addEventListener("change",persist);
    message.textContent+=` · 记录到当前阶段：${stage.start.goal}`;
    const requestId=crypto.randomUUID();
    let composing=false,pending=false,requestOperations:Operation[]|null=null;
    const save=button(suggest?"写入原文建议":"提交修改",()=>this.run(async()=>{
      if(composing||pending||ticket!==this.ticket)return;pending=true;save.disabled=true;persist();
      try{
        if(!requestOperations){
          if(suggest){
            if(!area.value.trim())return;
            requestOperations=[{operationId:crypto.randomUUID(),type:"insert-child",target:block.target,expectedContentVersion:previousVersion,expectedParentUuid:block.parentUuid,content:`**${type.value}** ${area.value}`,childUuid:null}];
          }else{
            if(area.value===previousText){clear();return;}
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
        clear();await this.reload();await this.bridge?.refresh();
      }finally{pending=false;save.disabled=composing;}
    }));
    const reread=button("重新读取当前原文",()=>{if(composing||pending)return;persist();this.editing=false;this.frozen=null;container.replaceChildren();this.run(()=>this.openEditor(uuid,container,suggest));});
    const cancel=button("保留草稿 / 关闭",()=>{if(composing||pending)return;persist();this.editing=false;this.frozen=null;container.replaceChildren();this.bridge?.repaint();});
    const discard=button("丢弃草稿",()=>{if(composing||pending)return;clear();this.bridge?.repaint();});
    area.addEventListener("compositionstart",()=>{composing=true;save.disabled=true;});
    area.addEventListener("compositionend",()=>{composing=false;save.disabled=pending;persist();});
    const current=element("details");current.append(element("summary","本次读取的当前原文"),element("pre",previousText));
    this.editing=true;this.activeEditor=container;container.replaceChildren(message,...(saved?[current]:[]),area,...(suggest?[type]:[]),save,reread,cancel,discard);area.focus();
  }
  private async files():Promise<void>{
    if(!this.scope)return;const scope=this.scope,ticket=this.ticket;let choices:Array<{id:string;title:string}>=[],problem:string|null=null;
    try{choices=await this.actions.listFiles(scope);}catch(error){problem=`当前材料列表暂不可读；历史记录仍保留：${String(error)}`;}
    if(ticket!==this.ticket)return;
    this.filesList.replaceChildren();if(problem)this.filesList.append(element("small",problem,"wb-error"));
    for(const file of choices){
      const label=element("label"),check=element("input");check.type="checkbox";check.checked=this.fileIds.has(file.id);
      check.onchange=()=>{if(check.checked)this.fileIds.add(file.id);else this.fileIds.delete(file.id);};label.append(check,document.createTextNode(file.title));this.filesList.append(label);
    }
    const stage=this.stage(),previous=this.history.stages.find(s=>s.start.id===stage?.start.previousStageId);
    const before=this.comparison==="previous"?(previous?.revisions.find(r=>r.id===stage?.start.previousRevisionId)?.files??previous?.start.files??stage?.start.files??[]):stage?.start.files??[],files=this.seen?.files??before;
    for(const file of files){
      const details=element("details");details.append(element("summary",`${file.title} · ${file.availability==="available"?"当时可读":"当时不可用"}`));
      details.append(element("p",file.retention==="text-snapshot"?"旧新正文已保留；实际文件保存和恢复使用材料入口。":"当时记录可读，原文件版本未保留；没有内容 diff 或字节恢复保证。"));
      const old=before.find(f=>f.id===file.id);
      if(file.content!==null){
        const delta=old?.content!==null&&old?.content!==undefined?inlineDiff(old.content,file.content):null;
        if(delta&&old?.version!==file.version){const shown=element("pre"),mark=element("mark",delta.inserted);mark.className="wb-review-insert";shown.append(document.createTextNode(delta.prefix),mark,document.createTextNode(delta.suffix));details.append(shown);}
        else details.append(element("pre",file.content));
        if(old?.content!==null&&old?.content!==undefined&&old.version!==file.version){const earlier=element("details");earlier.append(element("summary","当时旧文"),element("pre",old.content));details.append(earlier);}
      }
      details.append(element("small","记录差异 · 实际修改来源未知"));
      if(file.editing.user&&this.actions.openFile)details.append(button("在材料中编辑当前文件",()=>this.run(()=>this.actions.openFile!(file.id))));
      if(file.problem)details.append(element("small",file.problem,"wb-error"));
      this.filesList.append(details);
    }
  }
  dispose():void{this.disposed=true;this.scopeChanged(null);this.bar.remove();}
}
