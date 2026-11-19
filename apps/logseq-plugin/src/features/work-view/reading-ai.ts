import { button, element, hostDocument } from "../../host/panel-host.ts";
import { copyMaterialLink } from "../../host/clipboard.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { lookupBlockIdentity } from "../../block-identity.ts";
import { taskMarkerFromContent } from "../../canonical-writing.ts";
import { sha256, type SourceSnapshot, type SourceScope, type BlockSnapshot } from "../../workspace/source-protocol.ts";
import { sameLensScope } from "./lens-source.ts";
import { workObject } from "./focus.mjs";
import { progressivePlanId, progressivePurpose, type WorkBriefing } from "./briefing-model.ts";
import { renderMarkdown } from "./markdown.ts";
import type { ReadingMaterial } from "./reading-layout.ts";
import type { WorkViewReport } from "./report-controller.ts";

type Mode = "organize" | "ask" | "rewrite";
export interface ReadingModelInput {mode:Mode;question:string;source:SourceSnapshot;materials:ReadingMaterial[];selection?:{text:string;sourceIds:string[]};previous?:WorkBriefing}
export interface ReadingHandoff {request:string;sourceIds:string[];selection?:string;basisVersion?:string}
export interface ReadingAiPort {complete(input:ReadingModelInput):Promise<unknown>;handoff(scope:SourceScope,intent:ReadingHandoff):Promise<void>}
interface Selection {text:string;uuid?:string}
interface Answer {text:string;sourceIds:string[];materialIds:string[];source:SourceSnapshot;rewrite?:BlockSnapshot}
interface State {open:boolean;question:string;selection:Selection|null;answer:Answer|null;busy:boolean;notice:string;confirm:boolean}
const text = (error:unknown) => {
  const code=typeof error==="object"&&error&&"code" in error?String(error.code):error instanceof Error?error.message:String(error);
  return ({READING_MODEL_NOT_CONFIGURED:"DSH 尚未配置可用模型。原文阅读仍可使用。",READING_MODEL_PROVIDER_FAILED:"模型请求失败，请检查 DSH 的模型与凭据。",READING_MODEL_CONTEXT_LIMIT:"当前工作超过单次整理范围，可先选定较小的工作再试，或在 DSH 继续。",READING_MODEL_INCOMPLETE:"模型未完成生成，请重试或在 DSH 继续。",DSH_NOT_RUNNING:"请先启动 DSH 与工作台协作服务。",PLUGIN_DESCRIPTOR_REQUIRED:"请先启动工作台协作服务。", "stale-source-set":"原文在生成期间更新，已保留原读法，请重试。", "scope-mismatch":"工作已切换，请返回后重试。"} as Record<string,string>)[code]??`暂未完成：${code}`;
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
  private readonly states=new Map<string,State>();
  private key="";private scope:SourceScope|null=null;private pointerSelection:Selection|null=null;
  private state:State={open:false,question:"",selection:null,answer:null,busy:false,notice:"",confirm:false};

  constructor(private readonly reading:WorkViewReport["readingAPI"],private readonly port:ReadingAiPort,private readonly actions:{locate(uuid:string):void;material(id:string):void;refresh():Promise<void>}){
    const bar=element("div","","wb-ai-bar");
    this.organize=button("AI 整理",()=>void this.run("organize",false));
    this.toggle=button("提问…",()=>{this.state.open=!this.state.open;if(this.state.open){this.state.selection=this.pointerSelection??selectedText()??this.state.selection;this.input.value=this.state.question;}this.pointerSelection=null;this.paint();if(this.state.open)this.input.focus();});
    this.toggle.onpointerdown=()=>{this.pointerSelection=selectedText();};
    this.toggle.setAttribute("aria-expanded","false");
    bar.append(this.organize,this.toggle);this.root.append(bar,this.form,this.status);this.status.setAttribute("role","status");
    this.input.rows=2;this.input.placeholder="问当前工作，或说明希望怎样整理";this.input.setAttribute("aria-label","给 AI 的请求");this.input.maxLength=4000;
    this.input.oninput=()=>{this.state.question=this.input.value;};
    this.input.onkeydown=event=>{if(!event.isComposing&&event.key==="Enter"&&(event.metaKey||event.ctrlKey)){event.preventDefault();void this.run("ask",true);}};
    this.ask=button("提问",()=>void this.run("ask",true));this.arrange=button("按此整理",()=>void this.run("organize",true));
    this.rewrite=button("改写选中原块",()=>void this.run("rewrite",true));
    this.handoff=button("在 DSH 继续",()=>void this.continueInDsh());
    this.tools.append(this.ask,this.arrange,this.rewrite,this.handoff);this.form.append(this.selectionLabel,this.input,this.tools,this.result);
    this.root.setAttribute("aria-label","轻量 AI 阅读助手");this.paint();
  }
  render(scope:SourceScope|null,visible:boolean,hasBriefing:boolean,blocked=false):void {
    const key=scope?JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block"]):"";
    this.scope=scope;
    if(key!==this.key){
      this.key=key;const previous=this.states.get(key);this.state=previous??{open:false,question:"",selection:null,answer:null,busy:false,notice:"",confirm:false};if(key)this.states.set(key,this.state);
      this.input.value=this.state.question;this.result.replaceChildren();this.paint();
    }
    this.root.hidden=!scope||!visible;this.organize.textContent=hasBriefing?"AI 更新整理":"AI 整理";
    this.organize.disabled=blocked||this.state.busy;this.toggle.disabled=blocked&& !this.state.open;
    this.form.dataset.blocked=String(blocked);
    this.paintControls();
    this.updateAnswerBasis();
  }
  private paintControls(){
    const blocked=this.form.dataset.blocked==="true";
    this.ask.disabled=this.arrange.disabled=this.rewrite.disabled=this.handoff.disabled=this.state.busy||blocked;
    this.rewrite.hidden=!this.state.selection?.uuid;
    this.organize.disabled=this.state.busy||blocked;this.toggle.setAttribute("aria-expanded",String(this.state.open));
  }
  private paint(){
    this.form.hidden=!this.state.open;this.status.textContent=this.state.notice;this.paintControls();
    this.selectionLabel.replaceChildren();
    if(this.state.selection){this.selectionLabel.append(element("span",`选中文字：${this.state.selection.text.slice(0,110)}`),button("清除",()=>{this.state.selection=null;this.paint();}));}
    this.selectionLabel.hidden=!this.state.selection;
    this.showAnswer();
  }
  private same(scope:SourceScope,state:State):boolean {return this.state===state&&!!this.scope&&sameLensScope(this.scope,scope);}
  private async run(mode:Mode,custom:boolean){
    const scope=this.scope,state=this.state;if(!scope||state.busy)return;
    const question=custom?state.question.trim():progressivePurpose;
    if(!question){state.notice="先填写你的问题或整理要求。";this.paint();return;}
    const before=this.reading.read();state.busy=true;state.notice=mode==="organize"?"正在组织阅读内容…":"正在读取并回答…";state.confirm=false;this.paint();
    let requestId:string|undefined;
    try {
      const requested=await this.reading.request({schemaVersion:1,purpose:mode==="organize"?progressivePurpose:"用户对当前工作提问"});
      if(!requested.ok)throw new Error(requested.reason);
      const {source,materials}=requested.value;requestId=requested.value.requestId;
      if(!this.same(scope,state))throw new Error("scope-mismatch");
      const chosen=state.selection?.uuid?source.blocks.find(block=>block.target.blockUuid===state.selection!.uuid):undefined;
      if(mode==="rewrite"&&(!chosen||!ordinary(chosen,scope)||!chosen.content?.includes(state.selection?.text??"")))throw new Error("请选择当前普通原块中的原句；历史内容、正式对象和 TODO 请在原生编辑器核对修改。");
      const selection=custom&&state.selection?{text:state.selection.text,sourceIds:chosen?[chosen.sourceId]:[]}:undefined;
      const {briefing}=before;
      const result=await this.port.complete({mode,question,source,materials,...(selection?{selection}:{}),...(mode==="organize"&&briefing?{previous:briefing}:{})}) as {paragraphs?:WorkBriefing["paragraphs"];followUps?:WorkBriefing["followUps"];answer?:string;sourceIds?:string[];materialIds?:string[]};
      if(!this.same(scope,state))throw new Error("scope-mismatch");
      if(mode==="organize"){
        const plan={schemaVersion:1,requestId,planId:progressivePlanId,name:"渐进式阅读",scope:source.scope,structureVersion:source.structureVersion,sourceSetVersion:source.sourceSetVersion,
          sourceVersions:source.blocks.map(block=>({sourceId:block.sourceId,contentVersion:block.contentVersion})),layout:source.blocks.length?[{kind:"sequence",key:"original-source",sourceIds:source.blocks.map(block=>block.sourceId)}]:[],
          briefing:{basisVersion:source.sourceSetVersion,createdAt:new Date().toISOString(),paragraphs:result.paragraphs,...(result.followUps?{followUps:result.followUps}:{})}};
        const saved=await this.reading.submit(plan);if(!saved.ok)throw new Error(saved.reason);
        const current=this.reading.read();
        if(before.selectedPlanId===current.selectedPlanId&&before.mode===current.mode){const selected=await this.reading.select(progressivePlanId);if(!selected.ok)throw new Error(selected.reason);}
        state.notice="渐进式读法已更新；原文未改动。";if(!custom)state.open=false;
      }else{
        if(typeof result.answer!=="string"||!result.answer.trim())throw new Error("READING_MODEL_OUTPUT");
        state.answer={text:result.answer,sourceIds:result.sourceIds??[],materialIds:result.materialIds??[],source,...(mode==="rewrite"&&chosen?{rewrite:chosen}:{})};
        state.open=true;state.notice="已生成 · 依据为本次保存的原文，尚未写入。";
      }
    }catch(error){state.notice=text(error);}
    finally{if(requestId)this.reading.cancel(requestId);state.busy=false;if(this.same(scope,state))this.paint();}
  }
  private showAnswer(){
    const answer=this.state.answer,scope=this.scope;this.result.replaceChildren();this.result.hidden=!answer;if(!answer||!scope)return;
    const rendered=element("div","","wb-ai-answer");rendered.innerHTML=renderMarkdown(answer.text);for(const link of Array.from(rendered.querySelectorAll("a")))link.replaceWith(...Array.from(link.childNodes));
    const label=element("small",`依据版本 · ${answer.source.sourceSetVersion.slice(0,10)}`,"wb-progressive-version");label.title=answer.source.sourceSetVersion;label.dataset.answerBasis=answer.source.sourceSetVersion;
    const refs=element("div","","wb-ai-references");
    for(const id of answer.sourceIds){const source=answer.source.blocks.find(block=>block.sourceId===id);if(source){const details=element("details");details.append(element("summary",`依据 · ${source.content?.split("\n")[0]?.slice(0,52)??source.target.blockUuid.slice(0,8)}`),element("pre",source.content??""),button("查看当前原块",()=>this.actions.locate(source.target.blockUuid)));refs.append(details);}}
    for(const id of answer.materialIds)refs.append(button("查看相关材料",()=>this.actions.material(id)));
    const actions=element("div","","wb-ai-tools");actions.append(button("复制",()=>void copyMaterialLink(answer.text).then(()=>{this.state.notice="已复制。";this.status.textContent=this.state.notice;}).catch(error=>{this.state.notice=text(error);this.status.textContent=this.state.notice;})),button("插入为新块",()=>void this.write(answer,scope,false)));
    if(answer.rewrite){actions.append(button(this.state.confirm?"确认替换原块":"用此结果替换原块…",()=>{if(this.state.confirm)void this.write(answer,scope,true);else{this.state.confirm=true;this.paint();}}));if(this.state.confirm){const confirm=element("div","","wb-ai-confirm");confirm.append(element("small","将以下整块原文替换为上面的结果（仅普通块，保存版本必须未变化）："),element("pre",answer.rewrite.content??""),button("取消替换",()=>{this.state.confirm=false;this.paint();}));this.result.append(confirm);}}
    this.result.append(label,rendered,refs,actions);this.updateAnswerBasis();
  }
  private updateAnswerBasis(){const label=this.result.querySelector<HTMLElement>("[data-answer-basis]");if(!label)return;const basis=label.dataset.answerBasis!,current=this.reading.read().sourceSetVersion,stale=!!current&&basis!==current;label.textContent=`依据版本 · ${basis.slice(0,10)}${stale?" · 原文有更新":""}`;label.classList.toggle("wb-progressive-changed",stale);}
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
      await this.port.handoff(scope,{request:state.question.trim()||"继续处理当前工作",sourceIds:ids,...(state.selection?{selection:state.selection.text}:{}),basisVersion:basis.sourceSetVersion});
      state.notice="已交接当前工作、请求和来源；在 DSH 确认加入草稿。";
    }catch(error){state.notice=text(error);}
    finally{if(requestId)this.reading.cancel(requestId);state.busy=false;if(this.same(scope,state))this.paint();}
  }
}
