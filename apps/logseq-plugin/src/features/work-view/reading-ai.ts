import { button, element, hostDocument } from "../../host/panel-host.ts";
import { copyMaterialLink } from "../../host/clipboard.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { taskMarkerFromContent } from "../../canonical-writing.ts";
import { sha256, type SourceSnapshot, type SourceScope, type BlockSnapshot } from "../../workspace/source-protocol.ts";
import { sameLensScope } from "./lens-source.ts";
import { workObject } from "./focus.mjs";
import { briefingParagraphs,retainUnchangedParagraphs,progressivePlanId, progressivePurpose, type ReadingChanges,type WorkBriefing } from "./briefing-model.ts";
import { renderMarkdown } from "./markdown.ts";
import type { ReadingMaterial } from "./reading-layout.ts";
import type { WorkViewReport } from "./report-controller.ts";

type Mode = "organize" | "ask" | "rewrite";
export interface ReadingModelInput {mode:Mode;question:string;source:SourceSnapshot;materials:ReadingMaterial[];selection?:{text:string;sourceIds:string[]};previous?:WorkBriefing;changes?:ReadingChanges}
export interface ReadingHandoff {request:string;sourceIds:string[];selection?:string;basisVersion?:string;result?:string}
export interface ReadingAiPort {complete(input:ReadingModelInput,signal?:AbortSignal):Promise<unknown>;handoff(scope:SourceScope,intent:ReadingHandoff):Promise<void>}
interface Selection {text:string;uuid?:string}
interface Answer {text:string;sourceIds:string[];materialIds:string[];source:SourceSnapshot;rewrite?:BlockSnapshot}
interface State {open:boolean;question:string;selection:Selection|null;answer:Answer|null;busy:boolean;notice:string;confirm:boolean;automatic:boolean;attempted:string|null;job:AbortController|null;background:boolean;review:boolean}
const initial=(automatic=false):State=>({open:false,question:"",selection:null,answer:null,busy:false,notice:"",confirm:false,automatic,attempted:null,job:null,background:false,review:false});
const text = (error:unknown) => {
  const code=typeof error==="object"&&error&&"code" in error?String(error.code):error instanceof Error?error.message:String(error);
  return ({READING_MODEL_NOT_CONFIGURED:"DSH 尚未配置可用模型。原文阅读仍可使用。",READING_MODEL_PROVIDER_FAILED:"模型请求失败，请检查 DSH 的模型与凭据。",READING_MODEL_CONTEXT_LIMIT:"当前工作超过单次整理范围，可先选定较小的工作再试，或在 DSH 继续。",READING_MODEL_INCOMPLETE:"模型未完成生成，请重试或在 DSH 继续。",READING_AGENT_INCOMPLETE:"阅读 Agent 未提交完整成果，已保留原文章。",READING_MODEL_INTERRUPTED:"整理已停止，保留原文章。",DSH_NOT_RUNNING:"请先启动 DSH 与工作台协作服务。",PLUGIN_DESCRIPTOR_REQUIRED:"请先启动工作台协作服务。", "stale-source-set":"原文在生成期间更新，已保留原读法，请重试。", "reading-materials-changed":"关联依据已更新，请重新整理。","reading-request-revoked":"工作记录已变化，保留现有文章。","scope-mismatch":"工作已切换，请返回后重试。"} as Record<string,string>)[code]??`暂未完成：${code}`;
};

function selectedText(): Selection|null {
  for(const doc of [document,hostDocument()]){
    const selection=doc?.getSelection(),raw=selection?.toString().trim();if(!raw)continue;
    const node=selection?.anchorNode,element=node?.nodeType===1?node as Element:node?.parentElement;
    const owner=element?.closest<HTMLElement>("[data-progressive-source],.wb-row[data-uuid],.ls-block[blockid]");
    const uuid=owner?.dataset.progressiveUuid??owner?.dataset.uuid??owner?.getAttribute("blockid")??undefined;
    return {text:raw.slice(0,8000),...(uuid?{uuid}:{})};
  }
  return null;
}
function ordinary(block:BlockSnapshot,scope:SourceScope):boolean {
  const content=block.content??"";
  return !workObject(content)&&!taskMarkerFromContent(content)&&lookupBlockIdentity(block.target.blockUuid,scope.graphId).kind!=="FORMAL"&&!/^\s*[^:\n]+::/mu.test(content);
}

export class WorkReadingAI {
  readonly root=element("section","","wb-reading-ai");
  private readonly organize:HTMLButtonElement;
  private readonly toggle:HTMLButtonElement;
  private readonly form=element("div","","wb-ai-form");
  private readonly selectionLabel=element("div","","wb-ai-selection");
  private readonly input=element("textarea");
  private readonly tools=element("div","","wb-ai-tools");
  private readonly status=element("div","","wb-ai-status");
  private readonly result=element("div","","wb-ai-result");
  private readonly ask:HTMLButtonElement;
  private readonly arrange:HTMLButtonElement;
  private readonly rewrite:HTMLButtonElement;
  private readonly handoff:HTMLButtonElement;
  private readonly cancel:HTMLButtonElement;
  private readonly auto:HTMLInputElement;
  private readonly candidateButton:HTMLButtonElement;
  private readonly candidateBox=element("section","","wb-ai-candidate");
  private candidateFocus:HTMLElement|null=null;
  private candidateSignature="";
  private autoTimer:number|null=null;private autoKey:string|null=null;private watchTimer:number|null=null;
  private visible=false;private blocked=false;private disposed=false;
  private readonly states=new Map<string,State>();
  private key="";private scope:SourceScope|null=null;private pointerSelection:Selection|null=null;
  private state:State=initial();

  constructor(private readonly reading:WorkViewReport["readingAPI"],private readonly port:ReadingAiPort,private readonly actions:{locate(uuid:string):void;material(id:string):void;refresh():Promise<void>}){
    const bar=element("div","","wb-ai-bar");
    this.organize=button("AI 整理",()=>void this.run("organize",false));
    this.toggle=button("提问…",()=>{this.state.open=!this.state.open;if(this.state.open){this.state.selection=this.pointerSelection??selectedText()??this.state.selection;this.input.value=this.state.question;}this.pointerSelection=null;this.paint();if(this.state.open)this.input.focus();});
    this.toggle.onpointerdown=()=>{this.pointerSelection=selectedText();};
    this.toggle.setAttribute("aria-expanded","false");
    this.cancel=button("取消",()=>{this.state.job?.abort();});this.cancel.setAttribute("aria-label","取消 AI 阅读任务");
    this.candidateButton=button("待采用修订",()=>this.reviewCandidate(this.candidateButton));
    bar.append(this.organize,this.toggle,this.cancel,this.candidateButton);this.root.append(bar,this.form,this.status,this.candidateBox);this.status.setAttribute("role","status");
    this.input.rows=2;this.input.placeholder="问当前工作，或说明希望怎样整理";this.input.setAttribute("aria-label","给 AI 的请求");this.input.maxLength=4000;
    this.input.oninput=()=>{this.state.question=this.input.value;};
    this.input.onkeydown=event=>{if(!event.isComposing&&event.key==="Enter"&&(event.metaKey||event.ctrlKey)){event.preventDefault();void this.run("ask",true);}};
    this.ask=button("提问",()=>void this.run("ask",true));this.arrange=button("按此整理",()=>void this.run("organize",true));
    this.rewrite=button("改写选中原块",()=>void this.run("rewrite",true));
    this.handoff=button("在 DSH 继续",()=>void this.continueInDsh());
    this.tools.append(this.ask,this.arrange,this.rewrite,this.handoff);
    const autoLabel=element("label","","wb-ai-auto");this.auto=element("input");this.auto.type="checkbox";autoLabel.append(this.auto,document.createTextNode("后台准备修订"));
    autoLabel.title="允许在本工作已保存来源变化后调用配置模型，准备候选；不会自动替换文章。";
    this.auto.onchange=()=>{this.state.automatic=this.auto.checked;this.state.attempted=null;localStorage.setItem(`workbench:reading-auto:${this.key}`,String(this.auto.checked));if(!this.auto.checked){this.clearTimers();if(this.state.background)this.state.job?.abort();}this.schedule();};
    this.form.append(this.selectionLabel,this.input,this.tools,autoLabel,this.result);
    this.candidateBox.hidden=true;this.candidateBox.setAttribute("role","dialog");this.candidateBox.setAttribute("aria-label","候选修订");this.candidateBox.onkeydown=event=>{if(event.key==="Escape"){event.preventDefault();this.closeCandidate();}};
    this.root.setAttribute("aria-label","轻量 AI 阅读助手");this.paint();
  }
  render(scope:SourceScope|null,visible:boolean,hasBriefing:boolean,blocked=false):void {
    const key=scope?JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block"]):"";
    this.scope=scope;
    if(key!==this.key){
      this.state.job?.abort();this.clearTimers();this.state.review=false;this.candidateSignature="";
      this.key=key;const previous=this.states.get(key);this.state=previous??initial(key?localStorage.getItem(`workbench:reading-auto:${key}`)==="true":false);if(key)this.states.set(key,this.state);
      this.input.value=this.state.question;this.result.replaceChildren();this.paint();
    }
    this.visible=visible;this.blocked=blocked;
    this.root.hidden=!scope||!visible;this.organize.textContent=hasBriefing?"AI 更新整理":"AI 整理";
    this.organize.disabled=blocked||this.state.busy;this.toggle.disabled=blocked&& !this.state.open;
    this.form.dataset.blocked=String(blocked);
    this.paintControls();
    this.updateAnswerBasis();
    this.updateCandidate();
    this.schedule();
  }
  private paintControls(){
    const blocked=this.form.dataset.blocked==="true";
    this.ask.disabled=this.arrange.disabled=this.rewrite.disabled=this.handoff.disabled=this.state.busy||blocked;
    this.rewrite.hidden=!this.state.selection?.uuid;
    this.organize.disabled=this.state.busy||blocked;this.toggle.setAttribute("aria-expanded",String(this.state.open));
    this.cancel.hidden=!this.state.job;this.auto.checked=this.state.automatic;
  }
  private paint(){
    this.form.hidden=!this.state.open;this.status.textContent=this.state.notice;this.paintControls();
    this.selectionLabel.replaceChildren();
    if(this.state.selection){this.selectionLabel.append(element("span",`选中文字：${this.state.selection.text.slice(0,110)}`),button("清除",()=>{this.state.selection=null;this.paint();}));}
    this.selectionLabel.hidden=!this.state.selection;
    this.showAnswer();this.updateCandidate();
  }
  private same(scope:SourceScope,state:State):boolean {return this.state===state&&!!this.scope&&sameLensScope(this.scope,scope);}
  private async run(mode:Mode,custom:boolean,background=false){
    const scope=this.scope,state=this.state;if(!scope||state.busy)return;
    const question=custom?state.question.trim():background?"根据已保存的新旧记录，核查变化并仅修订受影响的段落；保留原文稿中不受影响的表达和语义键。":progressivePurpose;
    if(!question){state.notice="先填写你的问题或整理要求。";this.paint();return;}
    const before=this.reading.read(),planId=before.activePlan?.briefing?before.activePlan.planId:before.briefing?.planId??progressivePlanId,job=new AbortController();
    state.busy=true;state.job=job;state.background=background;state.notice=background?"正在准备修订…":mode==="organize"?"正在组织阅读内容…":"正在读取并回答…";state.confirm=false;this.paint();
    let requestId:string|undefined;
    try {
      const requested=await this.reading.request({schemaVersion:1,purpose:mode==="organize"?progressivePurpose:"用户对当前工作提问",...(mode==="organize"?{planId}:{})});
      if(!requested.ok)throw new Error(requested.reason);
      const {source,materials,previous,changes}=requested.value;requestId=requested.value.requestId;
      if(!this.same(scope,state))throw new Error("scope-mismatch");
      job.signal.throwIfAborted();
      if(mode==="organize"&&state.automatic)state.attempted=this.reading.read().refreshKey;
      if(background){
        if(!previous||!changes?.sourceIds.length&&!changes?.materialIds.length){state.notice="";return;}
      }
      const chosen=state.selection?.uuid?source.blocks.find(block=>block.target.blockUuid===state.selection!.uuid):undefined;
      if(mode==="rewrite"&&(!chosen||!ordinary(chosen,scope)||!chosen.content?.includes(state.selection?.text??"")))throw new Error("请选择当前普通原块中的原句；历史内容、正式对象和 TODO 请在原生编辑器核对修改。");
      const selection=custom&&state.selection?{text:state.selection.text,sourceIds:chosen?[chosen.sourceId]:[]}:undefined;
      const inputMaterials=materials.map(material=>{const value={...material};delete value.image;return value;});
      const result=await this.port.complete({mode,question,source,materials:inputMaterials,...(selection?{selection}:{}),...(previous?{previous}:{}),...(changes?{changes}:{})},job.signal) as {paragraphs?:WorkBriefing["paragraphs"];followUps?:WorkBriefing["followUps"];answer?:string;sourceIds?:string[];materialIds?:string[]};
      if(!this.same(scope,state))throw new Error("scope-mismatch");
      job.signal.throwIfAborted();
      if(mode==="organize"){
        if(!result.paragraphs?.length)throw Error("READING_MODEL_OUTPUT");
        const paragraphs=previous&&changes&&!custom&&(changes.sourceIds.length||changes.materialIds.length)?retainUnchangedParagraphs(previous,[...result.paragraphs??[],...result.followUps??[]],changes):result.paragraphs;
        const plan={schemaVersion:1,requestId,planId,name:before.plans.find(plan=>plan.planId===planId)?.name??"文章式阅读",scope:source.scope,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,
          sourceVersions:source.blocks.map(block=>({sourceId:block.sourceId,contentVersion:block.contentVersion})),layout:source.blocks.length?[{kind:"sequence",key:"original-source",sourceIds:source.blocks.map(block=>block.sourceId)}]:[],
          briefing:{basisVersion:source.sourceSetVersion,createdAt:new Date().toISOString(),paragraphs,...(paragraphs===result.paragraphs&&result.followUps?{followUps:result.followUps}:{})}};
        const saved=await (previous?this.reading.prepare(plan):this.reading.submit(plan));if(!saved.ok)throw new Error(saved.reason);
        const current=this.reading.read();
        if(!previous&&before.selectedPlanId===current.selectedPlanId&&before.mode===current.mode){const selected=await this.reading.select(planId);if(!selected.ok)throw new Error(selected.reason);}
        state.notice="";if(!custom&&!background)state.open=false;
      }else{
        if(typeof result.answer!=="string"||!result.answer.trim())throw new Error("READING_MODEL_OUTPUT");
        state.answer={text:result.answer,sourceIds:result.sourceIds??[],materialIds:result.materialIds??[],source,...(mode==="rewrite"&&chosen?{rewrite:chosen}:{})};
        state.open=true;state.notice="已生成 · 依据为本次保存的原文，尚未写入。";
      }
    }catch(error){state.notice=job.signal.aborted?"已取消；保留现有阅读。":text(error);}
    finally{if(requestId)this.reading.cancel(requestId);state.busy=false;state.job=null;state.background=false;if(this.same(scope,state)){this.paint();this.schedule();}}
  }
  private clearTimers():void{
    if(this.autoTimer!==null)window.clearTimeout(this.autoTimer);this.autoTimer=null;this.autoKey=null;
    if(this.watchTimer!==null)window.clearTimeout(this.watchTimer);this.watchTimer=null;
  }
  private schedule():void{
    const state=this.state,scope=this.scope,reading=this.reading.read(),token=reading.refreshKey;
    if(this.disposed||!scope||!this.visible||this.root.closest("[hidden]")||this.blocked||!state.automatic||state.busy||!reading.briefing){this.clearTimers();return;}
    if(this.watchTimer===null)this.watchTimer=window.setTimeout(async()=>{
      this.watchTimer=null;
      if(this.same(scope,state)&&this.visible&&!this.root.closest("[hidden]")&&state.automatic&&!state.busy&&!this.blocked&&!await logseq.Editor.checkEditing()&&!this.reading.read().pendingRequests.length)await this.reading.refresh();
      if(this.same(scope,state)&&!this.disposed)this.schedule();
    },15000);
    const eligible=reading.briefing.status==="stale"&&reading.candidate?.status!=="ready"&&!!token&&token!==state.attempted;
    if(!eligible){if(this.autoTimer!==null)window.clearTimeout(this.autoTimer);this.autoTimer=null;this.autoKey=null;return;}
    if(this.autoTimer!==null&&this.autoKey===token)return;
    if(this.autoTimer!==null)window.clearTimeout(this.autoTimer);
    this.autoKey=token;this.autoTimer=window.setTimeout(async()=>{
      this.autoTimer=null;this.autoKey=null;
      if(!this.same(scope,state)||!state.automatic||state.busy||!this.visible||this.root.closest("[hidden]")||this.blocked)return;
      const latest=this.reading.read();
      if(latest.refreshKey!==token||latest.briefing?.status!=="stale"||latest.candidate?.status==="ready"||await logseq.Editor.checkEditing()||latest.pendingRequests.length){this.schedule();return;}
      state.attempted=token;void this.run("organize",false,true);
    },4000);
  }
  reviewCandidate(anchor?:HTMLElement):void{
    if(!this.reading.read().candidate)return;
    this.candidateFocus=anchor??this.candidateButton;this.state.review=true;this.updateCandidate();
    this.candidateBox.querySelector<HTMLElement>("button")?.focus({preventScroll:true});
  }
  private closeCandidate():void{this.state.review=false;this.candidateBox.hidden=true;const anchor=this.candidateFocus;((anchor?.isConnected&&!anchor.closest("[hidden]"))?anchor:this.organize).focus({preventScroll:true});}
  private updateCandidate():void{
    const state=this.state,reading=this.reading.read(),candidate=reading.candidate,article=!!reading.activePlan?.briefing;
    this.candidateButton.hidden=!candidate||article;this.candidateBox.hidden=!candidate||!state.review;
    if(!candidate){state.review=false;this.candidateSignature="";return;}
    if(!state.review)return;
    const previous=reading.activePlan?.planId===candidate.planId?reading.activePlan.briefing:reading.briefing?.planId===candidate.planId?reading.briefing:null;
    const signature=JSON.stringify([candidate,previous?.paragraphs,this.blocked,state.busy]);
    if(signature===this.candidateSignature)return;
    this.candidateSignature=signature;
    const header=element("div","","wb-ai-candidate-head"),adopt=button("采用修订",()=>void this.adoptCandidate());adopt.disabled=candidate.status!=="ready"||this.blocked||state.busy;
    header.append(element("strong",candidate.status==="ready"?"候选修订":"候选依据已变化"),adopt,button("暂不采用",()=>this.closeCandidate()));
    const preview=element("article","","wb-ai-candidate-body"),old=new Map((previous?briefingParagraphs(previous):[]).map(unit=>[unit.key,unit]));
    for(const paragraph of briefingParagraphs(candidate)){
      const existing=old.get(paragraph.key);if(existing&&JSON.stringify(existing)===JSON.stringify(paragraph))continue;
      const unit=element("section","","wb-ai-candidate-unit"),body=element("div");body.innerHTML=renderMarkdown(paragraph.markdown);unit.append(body);
      for(const detail of paragraph.details??[]){const part=element("div","","wb-ai-candidate-detail");part.innerHTML=renderMarkdown(detail.markdown);unit.append(part);}
      if(existing){const before=element("details");const content=element("div");content.innerHTML=renderMarkdown(existing.markdown);before.append(element("summary","原文稿"),content);unit.append(before);}
      preview.append(unit);
    }
    const missing=previous?briefingParagraphs(previous).filter(unit=>!briefingParagraphs(candidate).some(proposed=>proposed.key===unit.key)):[];
    if(missing.length){const removed=element("details");removed.append(element("summary","本次不再单独呈现的段落"));for(const item of missing){const block=element("div");block.innerHTML=renderMarkdown(item.markdown);removed.append(block);}preview.append(removed);}
    if(!preview.childElementCount)preview.append(element("p","文章表述未改动；采用会更新依据版本。"));
    for(const link of Array.from(preview.querySelectorAll("a")))link.replaceWith(...Array.from(link.childNodes));
    this.candidateBox.replaceChildren(header,preview);
  }
  private async adoptCandidate():Promise<void>{
    const state=this.state,scope=this.scope;if(!scope||this.blocked||await logseq.Editor.checkEditing())return;
    const result=await this.reading.adopt();
    if(!this.same(scope,state))return;
    if(result.ok){this.closeCandidate();state.notice="";}else state.notice=text(result.reason);
    this.paint();
  }
  dispose():void{this.disposed=true;this.clearTimers();for(const state of this.states.values())state.job?.abort();this.root.remove();}
  private showAnswer(){
    const answer=this.state.answer,scope=this.scope;this.result.replaceChildren();this.result.hidden=!answer;if(!answer||!scope)return;
    const rendered=element("div","","wb-ai-answer");rendered.innerHTML=renderMarkdown(answer.text);for(const link of Array.from(rendered.querySelectorAll("a")))link.replaceWith(...Array.from(link.childNodes));
    const label=element("small","","wb-progressive-version");label.dataset.answerBasis=answer.source.sourceSetVersion;label.dataset.answerTime=answer.source.capturedAt;
    const refs=element("div","","wb-ai-references");
    for(const id of answer.sourceIds){const source=answer.source.blocks.find(block=>block.sourceId===id);if(source){const details=element("details");details.append(element("summary",`依据 · ${source.content?.split("\n")[0]?.slice(0,52)??source.target.blockUuid.slice(0,8)}`),element("pre",source.content??""),button("查看当前原块",()=>this.actions.locate(source.target.blockUuid)));refs.append(details);}}
    for(const id of answer.materialIds)refs.append(button("查看相关材料",()=>this.actions.material(id)));
    const actions=element("div","","wb-ai-tools");actions.append(button("复制",()=>void copyMaterialLink(answer.text).then(()=>{this.state.notice="已复制。";this.status.textContent=this.state.notice;}).catch(error=>{this.state.notice=text(error);this.status.textContent=this.state.notice;})),button("插入为新块",()=>void this.write(answer,scope,false)));
    if(answer.rewrite){actions.append(button(this.state.confirm?"确认替换原块":"用此结果替换原块…",()=>{if(this.state.confirm)void this.write(answer,scope,true);else{this.state.confirm=true;this.paint();}}));if(this.state.confirm){const confirm=element("div","","wb-ai-confirm");confirm.append(element("small","将以下整块原文替换为上面的结果（仅普通块，保存版本必须未变化）："),element("pre",answer.rewrite.content??""),button("取消替换",()=>{this.state.confirm=false;this.paint();}));this.result.append(confirm);}}
    this.result.append(label,rendered,refs,actions);this.updateAnswerBasis();
  }
  private updateAnswerBasis(){const label=this.result.querySelector<HTMLElement>("[data-answer-basis]");if(!label)return;const basis=label.dataset.answerBasis!,current=this.reading.read().sourceSetVersion,stale=!!current&&basis!==current;label.textContent=`${new Date(label.dataset.answerTime!).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} 读取${stale?" · 原文有更新":""}`;label.classList.toggle("wb-progressive-changed",stale);}
  private async write(answer:Answer,scope:SourceScope,replace:boolean){
    const state=this.state;
    const check=async()=>{if(!this.same(scope,state)||graphIdentity(await logseq.App.getCurrentGraph())!==scope.graphId||await logseq.Editor.checkEditing())throw new Error("请先结束原生输入并保持在当前工作，再确认写入。");};
    try{
      await check();
      if(replace&&answer.rewrite){const before=answer.rewrite,current=await logseq.Editor.getBlock(before.target.blockUuid);if(typeof current?.content!=="string"||!ordinary(before,scope)||await sha256(current.content)!==before.contentVersion)throw new Error("原块已变化，请重新改写。原文未修改。");await check();await logseq.Editor.updateBlock(before.target.blockUuid,answer.text);if((await logseq.Editor.getBlock(before.target.blockUuid))?.content!==answer.text)throw new Error("写入结果尚未核验，请查看原块。");}
      else {const last=scope.kind==="page"?(await logseq.Editor.getPageBlocksTree(scope.pageName!))?.at(-1):null;const options={sibling:scope.kind==="page",focus:false};await check();const inserted=scope.kind==="page"?(last?await logseq.Editor.insertBlock(last.uuid,answer.text,options):await logseq.Editor.appendBlockInPage(scope.pageName!,answer.text)):await logseq.Editor.insertBlock(scope.rootUuid,answer.text,options);if(!inserted?.uuid)throw new Error("新块写入尚未核验，请查看 Logseq 原页。");}
      state.notice=replace?"普通原块已按你的确认修改。":"已插入为新块；旧原文保留。";state.confirm=false;await this.actions.refresh();
    }catch(error){state.notice=text(error);}
    if(this.same(scope,state))this.paint();
  }
  private async continueInDsh(){
    const state=this.state,scope=this.scope;if(!scope)return;
    state.busy=true;state.notice="正在准备 DSH 协作…";this.paint();let requestId:string|undefined;
    try{
      const requested=await this.reading.request({schemaVersion:1,purpose:"继续当前工作"});if(!requested.ok)throw new Error(requested.reason);
      requestId=requested.value.requestId;const source=requested.value.source;
      const basis=state.answer?.sourceIds.length?state.answer.source:source;
      const referenced=[...new Set([...(state.answer?.sourceIds??[]),...basis.blocks.filter(block=>block.target.blockUuid===state.selection?.uuid).map(block=>block.sourceId)])];
      const ids=(referenced.length?referenced:basis.blocks.map(block=>block.sourceId)).slice(0,128);
      if(!this.same(scope,state))throw new Error("scope-mismatch");
      const article=this.reading.read().briefing,readingResult=state.answer?.text??article?.paragraphs.map(unit=>unit.markdown).join("\n\n");
      await this.port.handoff(scope,{request:state.question.trim()||"继续处理当前工作",sourceIds:ids,...(state.selection?{selection:state.selection.text}:{}),basisVersion:basis.sourceSetVersion,...(readingResult?{result:readingResult.slice(0,8000)}:{})});
      state.notice="已交接当前工作、请求和来源；在 DSH 确认加入草稿。";
    }catch(error){state.notice=text(error);}
    finally{if(requestId)this.reading.cancel(requestId);state.busy=false;if(this.same(scope,state))this.paint();}
  }
}
