import { button, element, FeaturePanel } from "../../host/panel-host.ts";
import { panels } from "../../workspace/context.ts";
import type { ContentExecutor } from "./executor.ts";
import type { ApplyResult, BlockSnapshot, CallOrigin, Operation, Patch, RequestRecord, SourceScope, TextOperation } from "./protocol.ts";
import { fail, limits, parsePatch, sameScope, sha256 } from "./validation.ts";

interface UIBoundary {
  executor:ContentExecutor;scope():SourceScope;origin(command:string):CallOrigin;
  grantTodo(operation:Operation):void;valid():boolean;report(error:unknown):void;
}
function explanation(reason:string):string{
  const known:Record<string,string>={
    CONTENT_VERSION_CONFLICT:"当前正文已改变，请保留当前文或按新版本重新提交。",
    PARENT_CONFLICT:"此块已移动，请重新选择工作范围。",
    TARGET_OUTSIDE_SCOPE:"此块不在已允许维护的范围内。",
    AMBIGUOUS_TEXT_SELECT_UNIQUE_RANGE:"片段出现了多次，请选取更明确的原文。",
    EXPECTED_TEXT_MISMATCH:"当前正文中找不到此片段，请重新选取。",
    EXPECTED_TEXT_REQUIRED:"请填写要替换的原文片段。",
    NATIVE_EDITING_ACTIVE:"此处仍有原生编辑草稿，请结束编辑后再提交。",
    NATIVE_COMPOSITION_ACTIVE:"此处仍在输入文字，请结束输入后再提交。",
    TODO_AUTHORIZATION_REQUIRED:"TODO 受保护；明确修改时请使用“修改当前 TODO 文本”。",
    PROTECTED_TODO:"TODO 受保护；明确修改时请使用“修改当前 TODO 文本”。",
    PROTECTED_PROPERTY:"身份与关联属性受保护。",
    FORMAL_PATH_REQUIRED:"请通过任务入口修改正式字段。",
    PROTECTED_FORMAL_TITLE:"请通过任务入口修改正式任务标题或状态。",
    PROTECTED_MANAGED:"此处是受管理字段，请通过任务入口修改。",
    PROTECTED_AMBIGUOUS_FORMAL_FIELD:"无法确认此处是普通正文，提议已保留。",
    RECOVERY_ATTRIBUTION_UNKNOWN:"当前内容可以核对，尚无法证明先前写入的实际结果。",
    HOST_TIMEOUT:"宿主尚未确认写入结果，请查询恢复记录。",
    SCOPE_REVOKED:"工作范围已失效，提议已保留。",
    STRUCTURE_VERSION_CONFLICT:"原块位置已改变，请核对当前位置后重新提交。",
    STRUCTURE_AUTHORIZATION_REQUIRED:"此工作只允许润色；整理原块位置需在本地明确授权。",
    MOVE_OBJECT_OWNERSHIP_CONFLICT:"不能将普通记录转挂到另一个正式对象。",
    PROTECTED_MOVE_SUBTREE:"子树包含受保护内容，提议已保留。",
    MOVE_CYCLE:"不能把块移到自己的子树中。",
    MOVE_READBACK_STRUCTURE_MISMATCH:"宿主移动后的结构尚无法确认，请查询保留的记录。",
    CHILD_UUID_ALREADY_EXISTS:"新块身份已被占用，未覆盖已有内容。",
  };
  return known[reason]??(/^[A-Z_]+$/u.test(reason)?"此次提议尚未确认应用，请保留输入并查询恢复结果。":reason);
}
/** A small controlled command form and on-demand conflict panel, never a work-view overlay. */
export class ContentUI {
  private readonly panel=new FeaturePanel("content","正文恢复");
  private revision=0;
  private disposed=false;
  constructor(private readonly boundary:UIBoundary){this.panel.root.dataset.contentWriteback="true";this.panel.root.style.cssText="max-width:760px;width:100%;margin:0 auto";}
  close():void{this.revision++;panels.reserve();void this.panel.close(false);}
  dispose():void{this.disposed=true;this.close();this.panel.root.remove();}
  private current(revision:number,scope:SourceScope):boolean{
    return !this.disposed&&this.boundary.valid()&&revision===this.revision&&sameScope(scope,this.boundary.scope());
  }
  private async show(title:string,render:(body:HTMLElement,revision:number,scope:SourceScope)=>Promise<void>):Promise<void>{
    const revision=++this.revision,scope=this.boundary.scope(),panelRevision=panels.reserve();
    const body=element("div","","wb-scroll"),heading=element("div","","wb-heading");
    heading.append(element("strong",title),button("关闭",()=>this.close()));
    await render(body,revision,scope);if(!this.current(revision,scope))return;
    this.panel.root.replaceChildren(heading,body);
    const opened=await this.panel.open(panelRevision);
    if(opened&&!this.current(revision,scope))await this.panel.close(false);
  }
  private text(body:HTMLElement,label:string,content:string):void{
    body.append(element("p",label));const pre=element("pre",content);pre.style.cssText="white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 14px;max-height:30vh;overflow:auto";body.append(pre);
  }
  private input(body:HTMLElement,label:string,value:string):HTMLTextAreaElement{
    const wrapper=element("label",label),input=element("textarea");input.value=value;input.rows=2;input.maxLength=limits.text;input.style.cssText="display:block;width:100%;margin:6px 0 12px";wrapper.append(input);body.append(wrapper);return input;
  }
  private patch(scope:SourceScope,operation:Operation):Patch{return {schemaVersion:1,requestId:crypto.randomUUID(),scope:{...scope},operations:[operation],metadata:null};}
  private operation(target:BlockSnapshot,old:string,next:string,operationId:string=crypto.randomUUID()):TextOperation{
    const text=target.content;if(text===null||!target.contentVersion)fail("SOURCE_UNAVAILABLE");
    if(!old)fail("EXPECTED_TEXT_REQUIRED");
    const start=text.indexOf(old);if(start<0)fail("EXPECTED_TEXT_MISMATCH");
    if(text.indexOf(old,start+1)>=0)fail("AMBIGUOUS_TEXT_SELECT_UNIQUE_RANGE");
    return {operationId,type:"replace-text",target:{...target.target},expectedContentVersion:target.contentVersion,expectedParentUuid:target.parentUuid,range:{start,end:start+old.length},expectedText:old,text:next,context:null};
  }
  private async draftKey(scope:SourceScope,target:string):Promise<string>{return `content-writeback-draft-${await sha256(JSON.stringify([scope,target]))}`;}
  private feedback(write:ApplyResult):void{
    const text=write.durable&&write.status==="complete"?(write.record.items.every(item=>item.status==="NO_CHANGE")?"正文与提议一致，无需修改。":"正文已写入并读回核验。"):write.journalProblem?"正文操作记录未确认；请保留输入并查询恢复结果。":"正文未全部应用，提议已保留。可用“查看正文写回冲突与恢复”处理。";
    void logseq.UI.showMsg(text,write.status==="complete"&&write.durable?"success":"warning");
  }
  async edit(uuid:string,explicitTodo:boolean):Promise<void>{
    await this.show(explicitTodo?"修改此 TODO 文本":"局部修改正文",async(body,revision,scope)=>{
      const read=await this.boundary.executor.read(scope),target=read.snapshot.blocks.find(block=>block.target.blockUuid===uuid);if(!target)fail("TARGET_OUTSIDE_SCOPE");
      const key=await this.draftKey(scope,uuid),saved=localStorage.getItem(key);
      let draft:{old:string;next:string}={old:"",next:""},pendingPatch:Patch|null=null;
      if(saved)try{const value=JSON.parse(saved);if(typeof value.old==="string"&&typeof value.next==="string")draft=value;if(value.patch)pendingPatch=parsePatch(value.patch);}catch{/* An unreadable draft never becomes a source patch. */}
      if(pendingPatch){const prior=await this.boundary.executor.query(scope,pendingPatch.requestId);if(prior&&(prior.status==="complete"||Object.hasOwn(prior.record.resolutions,pendingPatch.operations[0]!.operationId))){pendingPatch=null;draft={old:"",next:""};localStorage.removeItem(key);}}
      this.text(body,"当前原文",target.content??"来源不可用");
      const old=this.input(body,"要替换的原文片段（需唯一）",draft.old),next=this.input(body,"替换为",draft.next),status=element("p");body.append(status);
      const saveDraft=()=>{try{localStorage.setItem(key,JSON.stringify({old:old.value,next:next.value,patch:pendingPatch}));}catch(error){status.textContent=String(error);}};
      old.addEventListener("input",saveDraft);next.addEventListener("input",saveDraft);
      let composing=false,busy=false;
      const submit=button(explicitTodo?"明确修改此 TODO":"写入正文",()=>{if(composing||busy||!this.current(revision,scope))return;busy=true;submit.disabled=true;void(async()=>{
        const prior=pendingPatch?.operations[0];
        if(prior && ((prior.type!=="replace-text"&&prior.type!=="insert-text")||prior.expectedText!==old.value||prior.text!==next.value))fail("请先处理原提议的恢复结果，再修改此次输入。");
        const op=prior??this.operation(target,old.value,next.value);pendingPatch??=this.patch(scope,op);
        localStorage.setItem(key,JSON.stringify({old:old.value,next:next.value,patch:pendingPatch}));
        if(explicitTodo)this.boundary.grantTodo(op);
        const write=await this.boundary.executor.apply(pendingPatch,this.boundary.origin(explicitTodo?"content-edit-todo":"content-replace"));
        if(!this.current(revision,scope))return;this.feedback(write);
        if(write.status==="complete"&&write.durable){localStorage.removeItem(key);this.close();}else status.textContent="输入已保留；请查看冲突与恢复。";
      })().catch(error=>{if(this.current(revision,scope))status.textContent=explanation(error instanceof Error?error.message:String(error));}).finally(()=>{busy=false;submit.disabled=composing;});});
      for(const input of [old,next]){input.addEventListener("compositionstart",()=>{composing=true;submit.disabled=true;});input.addEventListener("compositionend",()=>{composing=false;submit.disabled=busy;saveDraft();});}
      body.append(submit);
    });
  }
  async append(uuid:string):Promise<void>{
    await this.show("补充一条普通正文记录",async(body,revision,scope)=>{
      const read=await this.boundary.executor.read(scope),target=read.snapshot.blocks.find(block=>block.target.blockUuid===uuid);if(!target?.contentVersion)fail("TARGET_OUTSIDE_SCOPE");
      const key=await this.draftKey(scope,`child:${uuid}`);let savedText="",pendingPatch:Patch|null=null;
      const saved=localStorage.getItem(key);if(saved)try{const draft=JSON.parse(saved);if(typeof draft.text==="string")savedText=draft.text;if(draft.patch)pendingPatch=parsePatch(draft.patch);}catch{savedText=saved;}
      if(pendingPatch){const prior=await this.boundary.executor.query(scope,pendingPatch.requestId);if(prior&&(prior.status==="complete"||Object.hasOwn(prior.record.resolutions,pendingPatch.operations[0]!.operationId))){pendingPatch=null;savedText="";localStorage.removeItem(key);}}
      const input=this.input(body,"追加到此块子内容末尾",savedText),status=element("p");body.append(status);
      let composing=false,busy=false;
      const save=()=>{try{localStorage.setItem(key,JSON.stringify({text:input.value,patch:pendingPatch}));}catch(error){status.textContent=String(error);}};input.addEventListener("input",save);
      const submit=button("追加记录",()=>{if(composing||busy||!this.current(revision,scope))return;busy=true;submit.disabled=true;void(async()=>{
        const prior=pendingPatch?.operations[0];if(prior&&(prior.type!=="insert-child"||prior.content!==input.value))fail("请先处理原记录的恢复结果，再修改此次输入。");
        const op:Operation=prior??{operationId:crypto.randomUUID(),type:"insert-child",target:{...target.target},expectedContentVersion:target.contentVersion!,expectedParentUuid:target.parentUuid,content:input.value,childUuid:null};
        pendingPatch??=this.patch(scope,op);localStorage.setItem(key,JSON.stringify({text:input.value,patch:pendingPatch}));
        const write=await this.boundary.executor.apply(pendingPatch,this.boundary.origin("content-insert-child"));if(!this.current(revision,scope))return;this.feedback(write);
        if(write.status==="complete"&&write.durable){localStorage.removeItem(key);this.close();}else status.textContent="记录内容已保留；请查询实际结果，不要重复追加。";
      })().catch(error=>{if(this.current(revision,scope))status.textContent=String(error);}).finally(()=>{busy=false;submit.disabled=composing;});});
      input.addEventListener("compositionstart",()=>{composing=true;submit.disabled=true;});input.addEventListener("compositionend",()=>{composing=false;submit.disabled=busy;save();});body.append(submit);
    });
  }
  async recovery():Promise<void>{
    await this.show("正文冲突与恢复",async(body,_revision,scope)=>{
      const pending=await this.boundary.executor.pending(scope);if(!pending.length){body.append(element("p","此范围没有需要恢复的正文提议。"));return;}
      for(const record of pending)for(const fact of record.items){
        if(Object.hasOwn(record.resolutions,fact.operationId)||["APPLIED_VERIFIED","NO_CHANGE"].includes(fact.status))continue;
        const row=element("p"),link=button(`${explanation(fact.reason??fact.status)} · ${record.createdAt.slice(0,16)}`,()=>void this.conflict(record,fact.operationId).catch(this.boundary.report));link.dataset.contentReason=fact.reason??fact.status;row.append(link);body.append(row);
      }
    });
  }
  private async conflict(record:RequestRecord,operationId:string):Promise<void>{
    await this.show("保留当前正文与提议",async(body,revision,scope)=>{
      const recovered=await this.boundary.executor.recover(scope,record.patch.requestId),fact=recovered.record.items.find(item=>item.operationId===operationId)!;
      const read=await this.boundary.executor.read(scope),op=record.patch.operations.find(op=>op.operationId===operationId)!;
      const current=read.snapshot.blocks.find(block=>block.target.blockUuid===(fact.childUuid??fact.target.blockUuid));
      this.text(body,"当前原文",current?.content??"来源不可用");
      const destination=op.type==="move-block"?read.snapshot.blocks.find(b=>b.target.blockUuid===op.destination.blockUuid):null;
      const position={before:"前面",after:"后面","first-child":"第一条子块"};
      const proposed=op.type==="move-block"?`移到“${destination?.content?.split("\n")[0]??op.destination.blockUuid}”的${position[op.position]}；保留原块及子树。`:fact.proposedContent??(op.type==="insert-child"?op.content:op.text);
      this.text(body,op.type==="move-block"?"位置提议":fact.proposedContent===null?"提议片段":"提议正文",proposed);
      if(op.type==="move-block"&&fact.move){const details=element("details");details.append(element("summary","查看已记录的位置"));this.text(details,"移动前 / 读回位置",JSON.stringify({before:fact.move.before.blocks.filter(b=>b.target.blockUuid===op.target.blockUuid).map(b=>[b.parentUuid,b.order,b.depth]),after:fact.move.after?.blocks.filter(b=>b.target.blockUuid===op.target.blockUuid).map(b=>[b.parentUuid,b.order,b.depth])},null,2));body.append(details);}
      const old=element("details");old.append(element("summary","按需查看旧文"));this.text(old,"读取基础 / 预期片段",fact.baseContent??(op.type==="insert-child"||op.type==="move-block"?"无基础正文":op.expectedText));body.append(old);
      const status=element("p",explanation(fact.reason??fact.status));body.append(status);
      const action=(run:()=>Promise<unknown>)=>{void run().then(()=>{if(this.current(revision,scope))void this.recovery().catch(this.boundary.report);}).catch(error=>{if(this.current(revision,scope))status.textContent=String(error);});};
      if(fact.status!=="OUTCOME_UNKNOWN")body.append(button("保留当前文",()=>action(()=>this.boundary.executor.resolve(scope,record.patch.requestId,operationId,"keep-current"))));
      else body.append(element("p","宿主结果尚未确认。查询不会重放修改；已发出的宿主调用无法取消。"));
      body.append(button("复制提议",()=>action(async()=>{await navigator.clipboard.writeText(proposed);return this.boundary.executor.resolve(scope,record.patch.requestId,operationId,"copied");})));
      if((fact.contentVerified||record.intentKind==="scope-identity")&&fact.identity&&fact.identity.status!=="VERIFIED")body.append(button("重新核验并保存身份",()=>action(()=>this.boundary.executor.resumeIdentity(scope,record.patch.requestId,operationId))));
      if(record.intentKind==="scope-identity")return;
      if(!current?.contentVersion||fact.contentVerified||!["NOT_APPLIED","CONFLICT","BLOCKED"].includes(fact.status))return;
      if(op.type==="move-block"){
        if(["NOT_APPLIED","CONFLICT","BLOCKED"].includes(fact.status))body.append(button("按当前结构重新提交此移动",()=>action(()=>{const destination=read.snapshot.blocks.find(b=>b.target.blockUuid===op.destination.blockUuid);if(!destination?.contentVersion)fail("MOVE_MEMBER_UNAVAILABLE");return this.boundary.executor.retry(scope,record.patch.requestId,{schemaVersion:2,requestId:crypto.randomUUID(),scope,operations:[{...op,expectedContentVersion:current.contentVersion!,expectedParentUuid:current.parentUuid,expectedDestinationVersion:destination.contentVersion,expectedDestinationParentUuid:destination.parentUuid,expectedStructureVersion:read.snapshot.structureVersion}],metadata:record.patch.metadata},this.boundary.origin("content-retry-move"));})));return;
      }
      if(op.type==="insert-child"){
        body.append(button("按当前版本重新追加此提议",()=>action(()=>this.boundary.executor.retry(scope,record.patch.requestId,this.patch(scope,{...op,expectedContentVersion:current.contentVersion!,expectedParentUuid:current.parentUuid}),this.boundary.origin("content-retry")))));return;
      }
      const expected=this.input(body,"从当前原文选取唯一片段",op.expectedText),next=this.input(body,"重新提交的提议",op.text);
      const explicitTodo=record.origin.kind==="local-user-command"&&["content-edit-todo","content-retry-todo"].includes(record.origin.command);
      let composing=false;
      const retry=button(explicitTodo?"明确修改此 TODO 并重新提交":"按当前版本重新提交",()=>{if(composing||!this.current(revision,scope))return;action(async()=>{
        const replacement=this.operation(current,expected.value,next.value,op.operationId);
        if(explicitTodo)this.boundary.grantTodo(replacement);
        const write=await this.boundary.executor.retry(scope,record.patch.requestId,this.patch(scope,replacement),this.boundary.origin(explicitTodo?"content-retry-todo":"content-retry"));this.feedback(write);return write;
      });});
      for(const input of [expected,next]){input.addEventListener("compositionstart",()=>{composing=true;retry.disabled=true;});input.addEventListener("compositionend",()=>{composing=false;retry.disabled=false;});}
      body.append(retry);
    });
  }
}
