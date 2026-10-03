import { Window } from "happy-dom";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalScopeAuthority } from "../../src/features/content-writeback/authority.ts";
import { ContentExecutor } from "../../src/features/content-writeback/executor.ts";
import { PrivateOperationJournal } from "../../src/features/content-writeback/journal.ts";
import { LogseqContentAdapter } from "../../src/features/content-writeback/logseq-adapter.ts";
import type { Operation, Patch, SourceScope, TextOperation } from "../../src/features/content-writeback/protocol.ts";
import type { JournalStorage } from "../../src/features/content-writeback/journal.ts";

export function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
interface Node {id:number;uuid:string;content:string;properties:Record<string,unknown>;parent:{id:number};page:{id:number};left:{id:number};children:string[]}
export async function contentFixture(timeout=1000){
  const directory=await mkdtemp(join(tmpdir(),"content-writeback-")),browser=new Window({url:"http://localhost/plugin/"});
  const previous={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,logseq:globalThis.logseq};
  globalThis.window=browser as unknown as typeof globalThis.window;
  globalThis.document=browser.document as unknown as Document;globalThis.localStorage=browser.localStorage;
  const blocks=new Map<string,Node>(),root:string=crypto.randomUUID(),a:string=crypto.randomUUID(),b:string=crypto.randomUUID();let nextId=2;
  const add=(uuid:string,content:string,parent:string=root)=>{
    const parentId=blocks.get(parent)?.id??1,sibling=[...blocks.values()].filter(node=>node.parent.id===parentId).at(-1);
    const node:Node={id:nextId++,uuid,content,properties:{},parent:{id:parentId},page:{id:1},left:{id:sibling?.id??parentId},children:[]};blocks.set(uuid,node);blocks.get(parent)?.children.push(uuid);return node;
  };
  add(root,"工作现场\n范围说明","");add(a,"Alpha 😀\r\nBeta\r\n重复 重复");add(b,"另一个块的正文");
  let graph="A",editing:string|boolean=false,current=root,db=false,writes=0,inserts=0,identities=0;
  let writeHook:((uuid:string,text:string)=>Promise<void>)|null=null,insertHook:((uuid:string)=>Promise<void>)|null=null,identityHook:(()=>Promise<void>)|null=null;
  let readHook:((uuid:string,includeChildren:boolean)=>Promise<void>)|null=null,storageHook:((key:string,value:string)=>Promise<void>)|null=null;
  const dbListeners=new Set<(event:unknown)=>void>();
  const commands=new Map<string,()=>unknown>(),menus=new Map<string,(input:{uuid:string})=>unknown>(),graphListeners=new Set<()=>void>(),messages:string[]=[];
  let unload:(()=>Promise<void>)|null=null,ready:Promise<void>=Promise.resolve(),showCount=0;
  const snapshot=(node:Node,children:boolean):unknown=>({...node,children:children?node.children.map(uuid=>snapshot(blocks.get(uuid)!,true)):[]});
  const storage:JournalStorage={
    getItem:async key=>{try{return await readFile(join(directory,key),"utf8");}catch(error){if((error as {code?:string}).code==="ENOENT")throw Error("file not existed",{cause:error});throw error;}},
    setItem:async(key,value)=>{if(storageHook)await storageHook(key,value);await writeFile(join(directory,key),value,{mode:0o600});},allKeys:()=>readdir(directory),
  };
  globalThis.logseq={
    settings:{tasksEnabled:false,materialsEnabled:false,workViewEnabled:false},FileStorage:storage,
    App:{getCurrentGraph:async()=>({name:graph,url:`/${graph}`,path:`/${graph}`}),checkCurrentIsDbGraph:async()=>db,onCurrentGraphChanged:(fn:()=>void)=>{graphListeners.add(fn);return()=>{graphListeners.delete(fn);};},registerCommandPalette:(op:{key:string},fn:()=>unknown)=>{commands.set(op.key,fn);return()=>{if(commands.get(op.key)===fn)commands.delete(op.key);};},registerCommand:(_type:string,op:{key:string;label:string},fn:(input:{uuid:string})=>unknown)=>{menus.set(op.label,fn);return()=>{menus.delete(op.label);};},registerUIItem:()=>{}},
    Editor:{
      getCurrentBlock:async()=>snapshot(blocks.get(current)!,false),
      getBlock:async(id:string|number,options?:{includeChildren?:boolean})=>{const node=typeof id==="number"?[...blocks.values()].find(node=>node.id===id):blocks.get(id);if(readHook&&node)await readHook(node.uuid,!!options?.includeChildren);return node?snapshot(node,!!options?.includeChildren):null;},
      checkEditing:async()=>editing,getEditingBlockContent:async()=>"uncommitted draft",
      updateBlock:async(uuid:string,text:string)=>{writes++;if(writeHook)await writeHook(uuid,text);else blocks.get(uuid)!.content=text;},
      insertBlock:async(target:string,text:string,options:{sibling:boolean;customUUID:string})=>{inserts++;if(blocks.has(options.customUUID))throw Error("UUID collision");const targetNode=blocks.get(target)!,parent=options.sibling?[...blocks.values()].find(node=>node.id===targetNode.parent.id)!:targetNode;const node=add(options.customUUID ?? crypto.randomUUID(),text,parent.uuid);if(insertHook)await insertHook(node.uuid);return snapshot(node,false);},
      upsertBlockProperty:async(uuid:string,key:string,value:string)=>{identities++;if(identityHook)await identityHook();const node=blocks.get(uuid)!;node.properties[key]=value;if(key==="id"&&!node.content.includes(`id:: ${value}`))node.content+=`\nid:: ${value}`;},
      registerBlockContextMenuItem:(label:string,fn:(input:{uuid:string})=>unknown)=>{menus.set(label,fn);return()=>{menus.delete(label);};},
    },
    DB:{onChanged:(fn:(event:unknown)=>void)=>{dbListeners.add(fn);return()=>{dbListeners.delete(fn);};}},UI:{showMsg:async(message:string)=>{messages.push(message);}},
    ready:(fn:()=>Promise<void>)=>{ready=fn();return ready;},beforeunload:(fn:()=>Promise<void>)=>{unload=fn;},
    useSettingsSchema:()=>{},provideStyle:()=>{},provideModel:()=>{},showMainUI:()=>{showCount++;},hideMainUI:()=>{},setMainUIAttrs:()=>{},setMainUIInlineStyle:()=>{},
  } as unknown as typeof logseq;
  const authority=new LocalScopeAuthority(),scope:SourceScope={graphId:"A:/A",rootUuid:root};authority.bind(scope);
  const adapter=new LogseqContentAdapter(),journal=new PrivateOperationJournal(storage);
  const createExecutor=()=>new ContentExecutor({authority,reader:adapter,editing:adapter,writer:adapter,journal,hostTimeoutMs:timeout});
  const executor=createExecutor();
  authority.confirmRoot(authority.capture(scope)!, (await executor.read(scope)).paths.get(root)!);
  const text=async(uuid:string,expected:string,next:string,start?:number):Promise<TextOperation>=>{
    const read=await executor.read(scope),target=read.snapshot.blocks.find(block=>block.target.blockUuid===uuid)!;const offset=start??target.content!.indexOf(expected);
    return {type:expected?"replace-text":"insert-text",operationId:crypto.randomUUID(),target:target.target,expectedContentVersion:target.contentVersion!,expectedParentUuid:target.parentUuid,range:{start:offset,end:offset+expected.length},expectedText:expected,text:next,context:expected?null:{before:target.content!.slice(Math.max(0,offset-16),offset),after:target.content!.slice(offset,offset+16)}};
  };
  const child=async(uuid:string,content:string,childUuid:string|null=null):Promise<Operation>=>{const read=await executor.read(scope),target=read.snapshot.blocks.find(block=>block.target.blockUuid===uuid)!;return {type:"insert-child",operationId:crypto.randomUUID(),target:target.target,expectedContentVersion:target.contentVersion!,expectedParentUuid:target.parentUuid,content,childUuid};};
  const patch=(operations:Operation[],requestId:string=crypto.randomUUID()):Patch=>({schemaVersion:1,requestId,scope:{...scope},operations,metadata:null});
  return {directory,browser,root,a,b,scope,authority,adapter,journal,storage,executor,createExecutor,blocks,commands,menus,messages,patch,text,child,
    add:(content:string,parent=root)=>add(crypto.randomUUID(),content,parent),
    graph:(name:string)=>{graph=name;authority.revoke();for(const fn of graphListeners)fn();},
    move:(id:string,parent:string)=>{const node=blocks.get(id)!,previous=[...blocks.values()].find(item=>item.id===node.parent.id);if(previous)previous.children=previous.children.filter(uuid=>uuid!==id);node.parent={id:blocks.get(parent)!.id};blocks.get(parent)!.children.push(id);},
    editing:(value:string|boolean)=>{editing=value;},current:(uuid:string)=>{current=uuid;},db:(value:boolean)=>{db=value;},
    onWrite:(hook:typeof writeHook)=>{writeHook=hook;},onInsert:(hook:typeof insertHook)=>{insertHook=hook;},onIdentity:(hook:typeof identityHook)=>{identityHook=hook;},onRead:(hook:typeof readHook)=>{readHook=hook;},onStorage:(hook:typeof storageHook)=>{storageHook=hook;},
    counts:()=>({writes,inserts,identities,showCount,graphSubscriptions:graphListeners.size}),
    changed:()=>{for(const fn of dbListeners)fn({});},
    boot:()=>ready,unload:async()=>{await unload?.();},
    cleanup:async()=>{authority.revoke();adapter.dispose();await browser.happyDOM.abort();globalThis.window=previous.window;globalThis.document=previous.document;globalThis.localStorage=previous.localStorage;globalThis.logseq=previous.logseq;await rm(directory,{recursive:true,force:true});},
  };
}
