import { logseqSourceReader } from "../../workspace/logseq-source.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { LocalScopeAuthority } from "./authority.ts";
import { ContentExecutor } from "./executor.ts";
import { PrivateOperationJournal } from "./journal.ts";
import { LogseqContentAdapter } from "./logseq-adapter.ts";
import { ContentUI } from "./ui.ts";
import type { CallOrigin, OperationJournal, SourceScope } from "./protocol.ts";
import { fail, object, parseScope, uuid } from "./validation.ts";

function identifier(input:unknown):string {
  if(typeof input!=="string"||!input.length||input.length>128)fail("INVALID_IDENTIFIER");return input;
}
function fields(input:unknown,allowed:readonly string[]):Record<string,unknown>{
  const value=object(input);if(Object.keys(value).some(key=>!allowed.includes(key)))fail("UNSUPPORTED_FIELD");return value;
}
export function installContentWriteback(options:{journal?:OperationJournal;adapter?:LogseqContentAdapter;hostTimeoutMs?:number}={}) {
  const authority=new LocalScopeAuthority(),adapter=options.adapter??new LogseqContentAdapter(null,logseqSourceReader());
  const executor=new ContentExecutor({reader:adapter,authority,editing:adapter,writer:adapter,journal:options.journal??new PrivateOperationJournal(logseq.FileStorage),...(options.hostTimeoutMs!==undefined?{hostTimeoutMs:options.hostTimeoutMs}:{})});
  let disposed=false,setup=0;
  const disposers:Array<()=>void>=[];
  const report=(error:unknown)=>{if(!disposed)void logseq.UI.showMsg(error instanceof Error?error.message:String(error),"warning");};
  const scope=():SourceScope=>{if(disposed)fail("CONTENT_DISPOSED");const current=authority.current();if(!current)fail("AUTHORIZATION_REQUIRED");return current;};
  const origin=(command:string):CallOrigin=>({kind:"local-user-command",command});
  const establish=async(target?:string):Promise<SourceScope>=>{
    if(disposed)fail("CONTENT_DISPOSED");
    const nonce=++setup;authority.revoke();ui.close();
    const graph=await logseq.App.getCurrentGraph();if(disposed||nonce!==setup)fail("SCOPE_REVOKED");
    const current=target===undefined?await logseq.Editor.getCurrentBlock():await logseq.Editor.getBlock(uuid(target));
    if(disposed||nonce!==setup)fail("SCOPE_REVOKED");
    if(!current)fail("SOURCE_UNAVAILABLE");
    const selected={graphId:graphIdentity(graph),rootUuid:uuid(current.uuid)};
    await adapter.assertGraph(selected,()=>!disposed&&nonce===setup);
    const lease=authority.bind(selected);
    try{
      const read=await executor.read(selected);if(!read.snapshot.blocks.some(block=>block.availability==="available"))fail("SOURCE_UNAVAILABLE");authority.confirmRoot(lease,read.paths.get(selected.rootUuid)??[]);
      if(await adapter.needsRootIdentity(selected,()=>authority.valid(lease))){const identified=await executor.persistScopeIdentity(selected,origin("content-authorize"));if(!identified.durable||identified.status!=="complete")fail(identified.journalProblem??identified.record.items[0]!.reason??"SCOPE_IDENTITY_UNCONFIRMED");}
      if(!authority.valid(lease))fail("SCOPE_REVOKED");
    }
    catch(error){if(authority.valid(lease))authority.revoke();throw error;}
    return {...selected};
  };
  const ui=new ContentUI({
    executor,scope,origin,
    grantTodo:operation=>{const lease=authority.capture(scope());if(lease)authority.grantTodo(lease,operation);},
    valid:()=>!disposed&&authority.current()!==null,
    report,
  });
  const graphChanged=()=>{setup++;authority.revoke();ui.close();};
  disposers.push(logseq.App.onCurrentGraphChanged(graphChanged));
  const command=(key:string,label:string,action:()=>Promise<unknown>)=>{
    const remove=logseq.App.registerCommandPalette({key,label},()=>{if(!disposed) return action().catch(report);});
    if(typeof remove==="function")disposers.push(remove);
  };
  const selectedTarget=async()=>{
    const nonce=setup,selected=await logseq.Editor.getCurrentBlock();if(disposed)fail("CONTENT_DISPOSED");if(nonce!==setup)fail("SCOPE_REVOKED");if(!selected){const active=authority.current();if(active)return active.rootUuid;fail("SOURCE_UNAVAILABLE");}
    const id=uuid(selected.uuid);if(!authority.current())await establish(id);return id;
  };
  command("content-authorize","工作台：允许维护当前块的正文子树",async()=>{await establish();await logseq.UI.showMsg("已允许维护此处自然正文。正式字段和 TODO 继续受保护。","success");});
  command("content-revoke","工作台：停止正文维护",async()=>{setup++;authority.revoke();ui.close();});
  command("content-replace","工作台：局部修改当前块正文",async()=>ui.edit(await selectedTarget(),false));
  command("content-edit-todo","工作台：明确修改当前 TODO 文本",async()=>ui.edit(await selectedTarget(),true));
  command("content-insert-child","工作台：在当前块补充正文记录",async()=>ui.append(await selectedTarget()));
  command("content-recovery","工作台：查看正文写回冲突与恢复",async()=>{if(!authority.current())await establish();await ui.recovery();});
  // Keep the hook key ASCII. Desktop 0.10.x does not consistently route a
  // generated Unicode context-menu hook, although the menu label is visible.
  const remove=logseq.App.registerCommand("block-context-menu-item",{key:"content-authorize-block",label:"工作台：允许维护此处正文"},async({uuid:target}: {uuid:string})=>{if(!disposed)try{await establish(target);await logseq.UI.showMsg("已允许维护此处自然正文。","success");}catch(error){report(error);}});
  if(typeof remove==="function")disposers.push(remove);
  const api={
    scope:()=>disposed?null:authority.current(),
    read:async(input?:unknown)=>{
      const selected=input===undefined?scope():parseScope(input),read=await executor.read(selected);
      return {...read.snapshot,targets:read.snapshot.blocks.map(block=>({target:{...block.target},protection:read.protections.get(block.target.blockUuid)??null}))};
    },
    apply:(input:unknown)=>executor.apply(input),
    result:async(requestId:unknown)=>executor.query(scope(),identifier(requestId)),
    history:async()=>executor.history(scope()),
    pending:async()=>executor.pending(scope()),
    recover:async(requestId:unknown)=>executor.recover(scope(),identifier(requestId)),
    conflict:async(requestId:unknown,operationId:unknown)=>{
      const selected=scope(),previous=await executor.query(selected,identifier(requestId));if(!previous)fail("REQUEST_NOT_FOUND");
      const id=identifier(operationId),fact=previous.record.items.find(item=>item.operationId===id);if(!fact)fail("OPERATION_NOT_FOUND");
      const read=await executor.read(selected),current=read.snapshot.blocks.find(block=>block.target.blockUuid===(fact.childUuid??fact.target.blockUuid))??null;
      return {fact,operation:previous.record.patch.operations.find(op=>op.operationId===id),current};
    },
    retry:async(input:unknown)=>{const value=fields(input,["previousRequestId","patch"]);return executor.retry(scope(),identifier(value.previousRequestId),value.patch);},
    resolve:async(input:unknown)=>{
      const value=fields(input,["requestId","operationId","resolution"]);
      if(value.resolution!=="keep-current"&&value.resolution!=="copied")fail("INVALID_RESOLUTION");
      return executor.resolve(scope(),identifier(value.requestId),identifier(value.operationId),value.resolution);
    },
    resumeIdentity:async(input:unknown)=>{const value=fields(input,["requestId","operationId"]);return executor.resumeIdentity(scope(),identifier(value.requestId),identifier(value.operationId));},
    revoke:()=>{setup++;authority.revoke();ui.close();},
  };
  // Only the composition root passes these trusted local callbacks to user UI.
  // They are deliberately absent from the public capability namespace.
  const local={authorize:establish,lifetime:()=>{const selected=authority.current();return selected?authority.capture(selected):null;},apply:(input:unknown,command:string)=>executor.apply(input,origin(command))};
  return {api,local,dispose:()=>{if(disposed)return;disposed=true;setup++;authority.revoke();ui.dispose();adapter.dispose();for(const off of disposers.splice(0))off();}};
}
export type ContentInstallation=ReturnType<typeof installContentWriteback>;
