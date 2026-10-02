import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";
import { parsePatch, sha256 } from "../src/features/content-writeback/validation.ts";
import { LogseqContentAdapter } from "../src/features/content-writeback/logseq-adapter.ts";
import { ContentExecutor, insertedContentMatches } from "../src/features/content-writeback/executor.ts";
import { PrivateOperationJournal } from "../src/features/content-writeback/journal.ts";

test("native identity delta permits only one exact property line and preserves original newline bytes",()=>{
  const uuid=crypto.randomUUID();
  for(const body of ["first\nsecond","first\r\nsecond","first\n",""]){
    assert.equal(insertedContentMatches(`${body}\nid:: ${uuid}`,body,uuid),true);
  }
  assert.equal(insertedContentMatches(`first\nid:: ${uuid}\nsecond`,"first\nsecond",uuid),true);
  assert.equal(insertedContentMatches(`first\nid:: ${uuid}\nchanged`,"first\nsecond",uuid),false);
  assert.equal(insertedContentMatches(`first\nid:: ${uuid}\nid:: ${uuid}`,"first",uuid),false);
});
test("fresh Desktop FileStorage null keys mean absence; malformed key results fail closed",async()=>{
  const f=await contentFixture();try{
    const journal=new PrivateOperationJournal({...f.storage,allKeys:async()=>null});assert.equal(await journal.load(f.scope,"fresh"),null);assert.deepEqual(await journal.list(f.scope),[]);
    const bad=new PrivateOperationJournal({...f.storage,allKeys:async()=>({})});await assert.rejects(bad.load(f.scope,"fresh"),/JOURNAL_KEYS_UNREADABLE/);
  }finally{await f.cleanup();}
});
test("scope identity has a durable independent intent and unknown attribution can resume identity without a body replay",async()=>{
  const f=await contentFixture();try{
    const original=f.blocks.get(f.root)!.content;
    f.onIdentity(async()=>{const node=f.blocks.get(f.root)!;node.content=`工作现场\nid:: ${f.root}\n范围说明`;node.properties.id=f.root;throw Error("reply lost after native identity");});
    const unknown=await f.executor.persistScopeIdentity(f.scope,{kind:"local-user-command",command:"content-authorize"});
    assert.equal(unknown.record.intentKind,"scope-identity");assert.equal(unknown.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(unknown.record.items[0]!.identity!.before,original);
    const recovered=await f.createExecutor().recover(f.scope,unknown.record.patch.requestId);assert.equal(recovered.record.items[0]!.expectationObserved,true);assert.equal(recovered.record.items[0]!.status,"OUTCOME_UNKNOWN");
    f.onIdentity(null);const resumed=await f.createExecutor().resumeIdentity(f.scope,unknown.record.patch.requestId,"native-scope-identity");assert.equal(resumed.status,"complete");assert.equal(resumed.record.items[0]!.status,"NO_CHANGE");assert.equal(resumed.record.items[0]!.contentVerified,false);assert.equal(f.counts().writes,0);assert.equal(f.counts().inserts,0);
    await assert.rejects(f.executor.retry(f.scope,unknown.record.patch.requestId,{...unknown.record.patch,requestId:"new-identity"}),/IDENTITY_REQUIRES_REVALIDATION/);
  }finally{await f.cleanup();}
});

test("full raw UTF-8 versions and true preorder/parent/sibling versions have an independent SHA256 oracle",async()=>{
  const f=await contentFixture();try{
    const read=await f.executor.read(f.scope),rows=read.snapshot.blocks;
    assert.deepEqual(rows.map(row=>row.target.blockUuid),[f.root,f.a,f.b]);assert.deepEqual(rows.map(row=>[row.parentUuid,row.order,row.depth]),[[null,0,0],[f.root,0,1],[f.root,1,1]]);
    const oracle=(text:string)=>createHash("sha256").update(text,"utf8").digest("hex");
    for(const row of rows){assert.equal(row.content,f.blocks.get(row.target.blockUuid)!.content);assert.equal(row.contentVersion,oracle(row.content!));assert.equal(row.sourceId,JSON.stringify(["logseq",f.scope.graphId,row.target.blockUuid]));}
    assert.equal(read.snapshot.structureVersion,oracle(JSON.stringify(rows.map(row=>[row.sourceId,row.parentUuid,row.order,row.depth]))));
    assert.equal(read.snapshot.sourceSetVersion,oracle(JSON.stringify(rows.map(row=>[row.sourceId,row.availability,row.contentVersion]))));
    assert.equal((await f.executor.read(f.scope)).snapshot.sourceSetVersion,read.snapshot.sourceSetVersion);assert.equal(f.counts().identities,0);
  }finally{await f.cleanup();}
});
test("a selected page root publishes real native sibling order and rejects broken left links",async()=>{
  const f=await contentFixture();try{
    const preceding=f.add("preceding page sibling","");preceding.left.id=1;f.blocks.get(f.root)!.left.id=preceding.id;
    const read=await f.executor.read(f.scope);assert.equal(read.snapshot.blocks[0]!.order,1);assert.equal(read.snapshot.blocks.length,3);
    const hash=createHash("sha256").update(JSON.stringify(read.snapshot.blocks.map(b=>[b.sourceId,b.parentUuid,b.order,b.depth]))).digest("hex");assert.equal(read.snapshot.structureVersion,hash);
    preceding.left.id=preceding.id;await assert.rejects(f.executor.read(f.scope),/SOURCE_ORDER_UNAVAILABLE/);
  }finally{await f.cleanup();}
});
test("partial replace and contextual insertion preserve CRLF, emoji and untouched repeated text",async()=>{
  const f=await contentFixture();try{
    const before=f.blocks.get(f.a)!.content,op=await f.text(f.a,"Beta","Gamma");
    const write=await f.executor.apply(f.patch([op]));assert.equal(write.status,"complete");assert.equal(write.record.items[0]!.actualContent,before.replace("Beta","Gamma"));assert.equal(f.counts().writes,1);
    const insertion=await f.text(f.a,""," 新增",f.blocks.get(f.a)!.content.indexOf("\r\n"));
    assert.equal((await f.executor.apply(f.patch([insertion]))).status,"complete");assert.ok(f.blocks.get(f.a)!.content.includes("😀 新增\r\n"));
    const source=f.blocks.get(f.a)!.content,last=source.lastIndexOf("重复");const repeated=await f.text(f.a,"重复","末项",last);
    await f.executor.apply(f.patch([repeated]));assert.ok(f.blocks.get(f.a)!.content.endsWith("重复 末项"));
  }finally{await f.cleanup();}
});
test("nonintersecting same-block operations combine into one real write; no change creates no false fact",async()=>{
  const f=await contentFixture();try{
    const [first,second]=await Promise.all([f.text(f.a,"Alpha","One"),f.text(f.a,"Beta","Two")]);
    const write=await f.executor.apply(f.patch([second,first]));assert.equal(write.status,"complete");assert.equal(f.counts().writes,1);assert.equal(write.record.items.length,2);assert.ok(write.record.items.every(item=>item.actualContent===f.blocks.get(f.a)!.content));
    const equal=await f.executor.apply(f.patch([await f.text(f.a,"Two","Two")]));assert.equal(equal.record.items[0]!.status,"NO_CHANGE");assert.equal(f.counts().writes,1);
  }finally{await f.cleanup();}
});
test("ordinary append uses stable UUID, exact parent/body readback and separately verified native identity",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.child(f.root,"新工作记录\n明确条件")]),write=await f.executor.apply(payload),fact=write.record.items[0]!;
    assert.equal(write.status,"complete");assert.equal(fact.status,"APPLIED_VERIFIED");assert.equal(fact.identity!.status,"VERIFIED");assert.equal(fact.identity!.before,"新工作记录\n明确条件");assert.ok(fact.actualContent!.endsWith(`\nid:: ${fact.childUuid}`));
    assert.equal(f.blocks.get(f.root)!.children.at(-1),fact.childUuid);assert.equal(f.counts().inserts,1);assert.equal(f.counts().identities,1);
    const replay=await f.createExecutor().apply(payload);assert.deepEqual(replay.record,write.record);assert.equal(f.counts().inserts,1);
  }finally{await f.cleanup();}
});
test("DB Graph child identity never adds a file-graph id line",async()=>{
  const f=await contentFixture();try{f.db(true);const write=await f.executor.apply(f.patch([await f.child(f.root,"DB 普通记录")]));assert.equal(write.status,"complete");assert.equal(f.counts().identities,0);assert.equal(write.record.items[0]!.actualContent,"DB 普通记录");}finally{await f.cleanup();}
});
test("UTF16 split positions and illegal ranges are refused with the source unchanged",async()=>{
  const f=await contentFixture();try{
    const original=f.blocks.get(f.a)!.content,op=await f.text(f.a,"","x",original.indexOf("😀")+1);op.context={before:"",after:""};
    const write=await f.executor.apply(f.patch([op]));assert.equal(write.record.items[0]!.reason,"INVALID_UTF16_BOUNDARY");assert.equal(f.counts().writes,0);
    await assert.rejects(f.executor.apply(f.patch([{...op,range:{start:-1,end:0}}])),/INVALID_RANGE/);
    await assert.rejects(f.executor.apply(f.patch([{...op,text:"\ud800"}])),/INVALID_STRING/);assert.equal(f.blocks.get(f.a)!.content,original);
  }finally{await f.cleanup();}
});
test("overlapping edits and inconsistent same-block bases fail that block without blocking another safe block",async()=>{
  const f=await contentFixture();try{
    const first=await f.text(f.a,"Alpha","one"),overlap=await f.text(f.a,"Al","two"),safe=await f.text(f.b,"正文","记录");
    const write=await f.executor.apply(f.patch([first,overlap,safe]));assert.equal(write.status,"partial");assert.deepEqual(write.record.items.map(item=>item.status),["BLOCKED","BLOCKED","APPLIED_VERIFIED"]);assert.equal(write.record.items[0]!.reason,"OVERLAPPING_RANGES");assert.equal(f.counts().writes,1);
    const op=await f.text(f.a,"Alpha","next");const inconsistent=await f.executor.apply(f.patch([op,{...overlap,expectedContentVersion:"a".repeat(64)}]));assert.equal(inconsistent.record.items[0]!.reason,"INCONSISTENT_BLOCK_BASE");
  }finally{await f.cleanup();}
});
test("current full version mismatch rejects old offsets even when old text remains elsewhere",async()=>{
  const f=await contentFixture();try{
    const op=await f.text(f.a,"Beta","proposal"),payload=f.patch([op]);f.blocks.get(f.a)!.content="human edit\nBeta\nBeta";
    const write=await f.executor.apply(payload);assert.equal(write.record.items[0]!.status,"CONFLICT");assert.equal(write.record.items[0]!.reason,"CONTENT_VERSION_CONFLICT");assert.equal(write.record.items[0]!.currentContent,"human edit\nBeta\nBeta");assert.equal(write.record.patch.operations[0]!.type,"replace-text");assert.equal(f.counts().writes,0);
    const malformed=await f.text(f.a,"human","next");malformed.expectedText="wrong";const mismatch=await f.executor.apply(f.patch([malformed]));assert.equal(mismatch.record.items[0]!.reason,"EXPECTED_TEXT_MISMATCH");
  }finally{await f.cleanup();}
});
test("unrelated source edits do not invalidate a target; actual target parent or membership changes do",async()=>{
  const f=await contentFixture();try{
    const op=await f.text(f.a,"Beta","safe");f.blocks.get(f.b)!.content="unrelated";assert.equal((await f.executor.apply(f.patch([op]))).status,"complete");
    const moved=await f.text(f.a,"safe","moved");f.move(f.a,f.b);const conflict=await f.executor.apply(f.patch([moved]));assert.equal(conflict.record.items[0]!.reason,"PARENT_CONFLICT");
    const outside=f.add("outside","");const outsider={...await f.text(f.a,"safe","wrong"),target:{kind:"logseq-block" as const,graphId:f.scope.graphId,blockUuid:outside.uuid}};const refused=await f.executor.apply(f.patch([outsider]));assert.equal(refused.record.items[0]!.reason,"TARGET_OUTSIDE_SCOPE");assert.equal(refused.record.items[0]!.currentContent,null);
    const collision=await f.executor.apply(f.patch([await f.child(f.root,"not foreign content",outside.uuid)]));assert.equal(collision.record.items[0]!.reason,"CHILD_UUID_ALREADY_EXISTS");assert.equal(collision.record.items[0]!.currentContent,null);
  }finally{await f.cleanup();}
});
test("authorized root movement changes its captured ancestry and blocks queued proposals",async()=>{
  const f=await contentFixture();try{const op=await f.text(f.a,"Beta","wrong"),outside=f.add("other root","");f.move(f.root,outside.uuid);const write=await f.executor.apply(f.patch([op]));assert.equal(write.record.items[0]!.reason,"SCOPE_ROOT_CHANGED");assert.equal(f.counts().writes,0);}finally{await f.cleanup();}
});
for(const [label,line,expected] of [
  ["native identity","id:: 11111111-1111-4111-8111-111111111111","PROTECTED_PROPERTY"],
  ["association property","association:: original","PROTECTED_PROPERTY"],
  ["managed attribute","task-copilot-managed:: true","PROTECTED_MANAGED"],
  ["managed field","**[当前推进]** known value","PROTECTED_MANAGED"],
  ["legacy field","状态：OPEN · ACTIONABLE","PROTECTED_MANAGED"],
] as const)test(`${label} cannot be rewritten through natural content`,async()=>{
  const f=await contentFixture();try{f.blocks.get(f.a)!.content=line;const write=await f.executor.apply(f.patch([await f.text(f.a,line,"rewritten")]));assert.equal(write.record.items[0]!.reason,expected);assert.equal(f.counts().writes,0);}finally{await f.cleanup();}
});
test("formal first line is protected offline while exact natural descriptions and ordinary multiline work records are editable",async()=>{
  const f=await contentFixture();try{
    f.blocks.get(f.root)!.content="TODO **[任务]** 正式标题\n自然描述\nid:: "+f.root;
    const title=await f.executor.apply(f.patch([await f.text(f.root,"正式标题","wrong")]));assert.equal(title.record.items[0]!.reason,"PROTECTED_FORMAL_TITLE");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.root,"自然描述","更新说明")]))).status,"complete");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"Beta","工作记录")]))).status,"complete");
    const ambiguous=await f.executor.apply(f.patch([await f.text(f.b,"正文","wrong")]));assert.equal(ambiguous.record.items[0]!.reason,"PROTECTED_AMBIGUOUS_FORMAL_FIELD");
  }finally{await f.cleanup();}
});
test("fresh ownership protects renamed managed UUIDs and permits certified ordinary formal children",async()=>{
  const f=await contentFixture();const adapter=new LogseqContentAdapter(async()=>({roots:new Set([f.root]),managed:new Set([f.b])}));try{
    f.blocks.get(f.b)!.content="renamed field without its label";
    const executor=new ContentExecutor({reader:adapter,writer:adapter,editing:adapter,authority:f.authority,journal:f.journal});
    const write=await executor.apply(f.patch([await f.text(f.b,"renamed","wrong")]));assert.equal(write.record.items[0]!.reason,"PROTECTED_MANAGED");
    f.blocks.get(f.a)!.content="certified ordinary record";const op=await f.text(f.a,"ordinary","natural");assert.equal((await executor.apply(f.patch([op]))).status,"complete");
  }finally{adapter.dispose();await f.cleanup();}
});
test("whole-block replacement, appended property and newly introduced formal syntax cannot bypass protection",async()=>{
  const f=await contentFixture();try{
    f.blocks.get(f.a)!.content=`ordinary\nid:: ${f.a}`;assert.equal((await f.executor.apply(f.patch([await f.text(f.a,f.blocks.get(f.a)!.content,"new")]))).record.items[0]!.reason,"PROTECTED_PROPERTY");
    const op=await f.text(f.b,"正文","正文\nnew-property:: value");assert.equal((await f.executor.apply(f.patch([op]))).record.items[0]!.reason,"PROTECTED_PROPERTY");
    const formal=await f.text(f.b,f.blocks.get(f.b)!.content,"TODO **[任务]** injected");assert.equal((await f.executor.apply(f.patch([formal]))).record.items[0]!.reason,"FORMAL_PATH_REQUIRED");assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("TODO defaults read-only, including continuations and descendants; a trusted exact grant permits only that operation",async()=>{
  const f=await contentFixture();try{
    f.blocks.get(f.a)!.content="TODO 调查\n保留条件\n\n普通段落";const op=await f.text(f.a,"调查","明确调整");
    assert.equal((await f.executor.apply(f.patch([op]))).record.items[0]!.reason,"PROTECTED_TODO");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"条件","wrong")]))).record.items[0]!.reason,"PROTECTED_TODO");
    const child=f.add("TODO 的子记录",f.a);assert.equal((await f.executor.apply(f.patch([await f.text(child.uuid,"子记录","wrong")]))).record.items[0]!.reason,"PROTECTED_TODO");
    f.authority.grantTodo(f.authority.capture(f.scope)!,op);assert.equal((await f.executor.apply(f.patch([op]))).status,"complete");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"明确调整","other")]))).record.items[0]!.reason,"PROTECTED_TODO");
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"普通段落","安全段落")]))).status,"complete");
  }finally{await f.cleanup();}
});
test("offline formal field ambiguity protects renamed branches and cannot be bypassed by choosing a descendant root",async()=>{
  const f=await contentFixture();try{
    f.blocks.get(f.root)!.content="TODO **[任务]** 正式根\n明确的自然描述";
    const ambiguous=f.add("已改名容器\n不能证明是普通记录"),descendant=f.add("已改名字段\n字段值",ambiguous.uuid);
    const denied=await f.executor.apply(f.patch([await f.text(ambiguous.uuid,"容器","正文")]));assert.equal(denied.record.items[0]!.reason,"PROTECTED_AMBIGUOUS_FORMAL_FIELD");
    const deniedChild=await f.executor.apply(f.patch([await f.text(descendant.uuid,"字段值","改写")]));assert.equal(deniedChild.record.items[0]!.reason,"PROTECTED_AMBIGUOUS_FORMAL_FIELD");
    const childScope={...f.scope,rootUuid:descendant.uuid};f.authority.bind(childScope);const childRead=await f.executor.read(childScope);assert.equal(childRead.protections.get(descendant.uuid)!.ranges[0]!.reason,"ambiguous-formal-field");assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("code and external quotation are inert text; source instructions and forged privilege fields never execute or authorize",async()=>{
  const f=await contentFixture();try{
    const content="```js\nTODO is code\n```\n> TODO quoted\nordinary";f.blocks.get(f.a)!.content=content;
    assert.equal((await f.executor.apply(f.patch([await f.text(f.a,"TODO is code","TODO remains code")]))).status,"complete");
    const op=await f.text(f.b,"正文","<script>globalThis.injected=true</script> actor=USER authorized=true");const valid=f.patch([op]);
    for(const extra of [{actor:"USER"},{authorized:true},{capability:"write"},{generation:999}])await assert.rejects(f.executor.apply({...valid,...extra}),/UNSUPPORTED_FIELD/);
    assert.equal((await f.executor.apply(valid)).status,"complete");assert.equal(Reflect.get(globalThis,"injected"),undefined);
    f.authority.revoke();await assert.rejects(f.executor.apply(f.patch([op])),/AUTHORIZATION_REQUIRED/);
  }finally{await f.cleanup();}
});
test("native draft and composition guards never force save, exit editing, or overwrite input",async()=>{
  const f=await contentFixture();try{
    const op=await f.text(f.a,"Beta","blocked");f.editing(f.a);assert.equal((await f.executor.apply(f.patch([op]))).record.items[0]!.reason,"NATIVE_EDITING_ACTIVE");f.editing(false);
    const node=f.browser.document.createElement("div");node.className="ls-block";node.setAttribute("blockid",f.a);const input=f.browser.document.createElement("textarea");input.value="uncommitted";node.append(input);f.browser.document.body.append(node);input.dispatchEvent(new f.browser.Event("compositionstart",{bubbles:true}));
    assert.equal((await f.executor.apply(f.patch([op]))).record.items[0]!.reason,"NATIVE_COMPOSITION_ACTIVE");assert.equal(input.value,"uncommitted");assert.equal(f.counts().writes,0);
    input.dispatchEvent(new f.browser.Event("compositionend",{bubbles:true}));assert.equal((await f.executor.apply(f.patch([op]))).status,"complete");
  }finally{await f.cleanup();}
});
test("same request payload returns historical verified facts after restart and later source edits; different payload is refused",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","saved")],"../../ Unicode 请求"),applied=await f.executor.apply(payload);f.blocks.get(f.a)!.content="human later edit";
    assert.deepEqual((await f.createExecutor().apply(payload)).record,applied.record);assert.equal(f.blocks.get(f.a)!.content,"human later edit");assert.equal(f.counts().writes,1);
    const changed={...payload,operations:[{...payload.operations[0]!,text:"different"}]};await assert.rejects(f.executor.apply(changed),/IDEMPOTENCY_KEY_REUSED/);
    assert.ok((await readdir(f.directory)).every(name=>/^content-writeback-v1-[0-9a-f]{64}-[0-9]{6}$/u.test(name)));
  }finally{await f.cleanup();}
});
test("same-key concurrent requests execute once and independent stale same-block requests serialize rather than lose an edit",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","one")]);const writes=await Promise.all([f.executor.apply(payload),f.executor.apply(payload),f.createExecutor().apply(payload)]);assert.ok(writes.every(write=>write.status==="complete"));assert.equal(f.counts().writes,1);
    const one=f.patch([await f.text(f.a,"Alpha","first")]),two=f.patch([await f.text(f.a,"one","second")]);const results=await Promise.all([f.executor.apply(one),f.executor.apply(two)]);
    assert.deepEqual(results.map(result=>result.status).sort(),["complete","not-applied"]);assert.equal(results.find(result=>result.status==="not-applied")!.record.items[0]!.reason,"CONTENT_VERSION_CONFLICT");assert.equal(f.counts().writes,2);
  }finally{await f.cleanup();}
});
test("partial batch records real success/conflict and explicit retry uses the new version without replaying success",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","applied"),await f.text(f.b,"正文","proposed")]);f.blocks.get(f.b)!.content="human current";
    const write=await f.executor.apply(payload);assert.equal(write.status,"partial");assert.deepEqual(write.record.items.map(item=>item.status),["APPLIED_VERIFIED","CONFLICT"]);
    const next=await f.text(f.b,"human current","merged");next.operationId=payload.operations[1]!.operationId;
    const retry=await f.executor.retry(f.scope,payload.requestId,f.patch([next]));assert.equal(retry.status,"complete");assert.equal(retry.record.retryOf,payload.requestId);assert.equal(f.counts().writes,2);
    const successful=await f.text(f.a,"applied","bad retry");successful.operationId=payload.operations[0]!.operationId;await assert.rejects(f.executor.retry(f.scope,payload.requestId,f.patch([successful])),/RETRY_NOT_PROVEN_UNAPPLIED/);
  }finally{await f.cleanup();}
});
test("intent journal failure stops before any source call; pending pre-dispatch record recovers as unapplied",async()=>{
  const f=await contentFixture();try{
    f.onStorage(async()=>{throw Error("disk unavailable");});const write=await f.executor.apply(f.patch([await f.text(f.a,"Beta","no")]));assert.equal(write.durable,false);assert.equal(write.status,"not-applied");assert.equal(f.counts().writes,0);
    const payload=f.patch([await f.text(f.a,"Beta","never")]);f.onStorage(async(_key,value)=>{if(JSON.parse(value).items[0].phase==="EXECUTING")throw Error("intent failure");});const failed=await f.executor.apply(payload);assert.equal(failed.durable,false);assert.equal(f.counts().writes,0);
    f.onStorage(null);const recovered=await f.createExecutor().recover(f.scope,payload.requestId);assert.equal(recovered.record.items[0]!.status,"NOT_APPLIED");assert.equal(recovered.record.items[0]!.reason,"INTERRUPTED_BEFORE_DISPATCH");
  }finally{await f.cleanup();}
});
test("verified source write with lost final journal save stays fenced from replay; recovery observes content without false attribution",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","written")]);f.onStorage(async(_key,value)=>{if(JSON.parse(value).items[0].status==="APPLIED_VERIFIED")throw Error("final journal lost");});
    const write=await f.executor.apply(payload);assert.equal(write.durable,false);assert.equal(f.blocks.get(f.a)!.content.includes("written"),true);assert.equal(f.counts().writes,1);
    f.onStorage(null);const replay=await f.createExecutor().apply(payload);assert.equal(replay.status,"outcome-unknown");assert.equal(f.counts().writes,1);
    const recovered=await f.createExecutor().recover(f.scope,payload.requestId);assert.equal(recovered.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(recovered.record.items[0]!.expectationObserved,true);assert.deepEqual(recovered.record.origin,{kind:"local-capability"});assert.equal(recovered.record.items[0]!.actualContent,null);
  }finally{await f.cleanup();}
});
test("readback mismatch is outcome unknown and retains the newer real body",async()=>{
  const f=await contentFixture();try{f.onWrite(async(uuid)=>{f.blocks.get(uuid)!.content="other writer changed immediately";});const write=await f.executor.apply(f.patch([await f.text(f.a,"Beta","expected")]));assert.equal(write.record.items[0]!.reason,"READBACK_MISMATCH");assert.equal(write.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(write.record.items[0]!.actualContent,null);assert.equal(write.record.items[0]!.currentContent,"other writer changed immediately");}finally{await f.cleanup();}
});
test("host timeout records unknown and holds a source fence until its uncancellable SDK request settles",async()=>{
  const f=await contentFixture(20);try{
    const gate=deferred<void>();f.onWrite(async(uuid,text)=>{await gate.promise;f.blocks.get(uuid)!.content=text;});const payload=f.patch([await f.text(f.a,"Beta","eventual")]);
    const write=await f.executor.apply(payload);assert.equal(write.record.items[0]!.reason,"HOST_TIMEOUT");assert.equal(write.status,"outcome-unknown");
    const another=await f.executor.apply(f.patch([await f.text(f.a,"Beta","blocked")]));assert.equal(another.record.items[0]!.reason,"HOST_CALL_IN_FLIGHT");assert.equal(f.counts().writes,1);
    gate.resolve();await new Promise(resolve=>setTimeout(resolve,5));f.onWrite(null);const recovered=await f.executor.recover(f.scope,payload.requestId);assert.equal(recovered.record.items[0]!.expectationObserved,true);assert.equal(recovered.record.items[0]!.status,"OUTCOME_UNKNOWN");
  }finally{await f.cleanup();}
});
test("insert-child reply loss and an unrelated existing UUID cannot create duplicates or be claimed as verified creation",async()=>{
  const f=await contentFixture();try{
    f.onInsert(async()=>{throw Error("reply lost");});const payload=f.patch([await f.child(f.root,"once")]),write=await f.executor.apply(payload);assert.equal(write.status,"outcome-unknown");assert.equal(f.counts().inserts,1);
    f.onInsert(null);await f.createExecutor().apply(payload);const recovered=await f.createExecutor().recover(f.scope,payload.requestId);assert.equal(recovered.record.items[0]!.expectationObserved,true);assert.equal(recovered.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(f.counts().inserts,1);
    const unrelated=await f.executor.apply(f.patch([await f.child(f.root,"same content",f.a)]));assert.equal(unrelated.record.items[0]!.reason,"CHILD_UUID_ALREADY_EXISTS");assert.equal(f.counts().inserts,1);
  }finally{await f.cleanup();}
});
test("new child body and failed durable identity remain separate facts, explicit identity recovery never appends again",async()=>{
  const f=await contentFixture();try{
    f.onIdentity(async()=>{throw Error("id persistence failed");});const payload=f.patch([await f.child(f.root,"body before identity")]),write=await f.executor.apply(payload),fact=write.record.items[0]!;
    assert.equal(write.status,"partial");assert.equal(fact.contentVerified,true);assert.equal(fact.identity!.status,"OUTCOME_UNKNOWN");assert.equal(f.counts().inserts,1);
    f.onIdentity(null);const recovered=await f.createExecutor().resumeIdentity(f.scope,payload.requestId,fact.operationId);assert.equal(recovered.status,"complete");assert.equal(f.counts().inserts,1);assert.equal(f.blocks.get(fact.childUuid!)!.properties.id,fact.childUuid);
  }finally{await f.cleanup();}
});
test("identity recovery refuses a later human child edit and never rewrites it",async()=>{
  const f=await contentFixture();try{
    f.onIdentity(async()=>{throw Error("id failed");});const payload=f.patch([await f.child(f.root,"body")]),write=await f.executor.apply(payload),fact=write.record.items[0]!;f.onIdentity(null);f.blocks.get(fact.childUuid!)!.content="human later";
    await assert.rejects(f.executor.resumeIdentity(f.scope,payload.requestId,fact.operationId),/IDENTITY_RECOVERY_CONFLICT/);assert.equal(f.blocks.get(fact.childUuid!)!.content,"human later");assert.equal(f.counts().inserts,1);
  }finally{await f.cleanup();}
});
test("revoking a scope invalidates a queued write and an in-flight result honestly stays unknown",async()=>{
  const f=await contentFixture();try{
    const started=deferred<void>(),gate=deferred<void>();f.onWrite(async(uuid,text)=>{started.resolve();await gate.promise;f.blocks.get(uuid)!.content=text;});
    const one=f.patch([await f.text(f.a,"Beta","one")]),two=f.patch([await f.text(f.a,"Alpha","two")]);const queuedReady=deferred<void>();f.onStorage(async(_key,value)=>{const record=JSON.parse(value);if(record.patch.requestId===two.requestId&&record.sequence===0)queuedReady.resolve();});
    const running=f.executor.apply(one);await started.promise;const queued=f.executor.apply(two);await queuedReady.promise;f.authority.revoke();
    const first=await running,second=await queued;assert.equal(first.record.items[0]!.status,"OUTCOME_UNKNOWN");assert.equal(second.record.items[0]!.status,"BLOCKED");assert.equal(f.counts().writes,1);gate.resolve();await new Promise(resolve=>setTimeout(resolve,5));
  }finally{await f.cleanup();}
});
test("Graph switch during a source read stops before SDK write and preserves the proposal",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","wrong graph")]),started=deferred<void>(),gate=deferred<void>();f.onRead(async()=>{started.resolve();await gate.promise;});const applying=f.executor.apply(payload);await started.promise;f.graph("B");gate.resolve();const write=await applying;assert.equal(write.record.items[0]!.status,"BLOCKED");assert.equal(f.counts().writes,0);assert.equal(write.record.patch.operations[0]!.operationId,payload.operations[0]!.operationId);
  }finally{await f.cleanup();}
});
test("special object-key operation IDs remain discoverable conflicts and resolve durably without prototype changes",async()=>{
  const f=await contentFixture();try{
    for(const operationId of ["constructor","__proto__","toString"]){
      f.blocks.get(f.a)!.content="old version";
      const payload=f.patch([{...await f.text(f.a,"old","proposed"),operationId}]);
      f.blocks.get(f.a)!.content="human current version";
      assert.equal((await f.executor.apply(payload)).record.items[0]!.status,"CONFLICT");
      assert.ok((await f.executor.pending(f.scope)).some(record=>record.patch.requestId===payload.requestId));
      await f.executor.resolve(f.scope,payload.requestId,operationId,"keep-current");
      const history=(await f.createExecutor().query(f.scope,payload.requestId))!.record;
      assert.ok(Object.hasOwn(history.resolutions,operationId));assert.equal(history.resolutions[operationId],"keep-current");
      assert.equal(Object.getPrototypeOf(history.resolutions),Object.prototype);
      assert.ok(!(await f.executor.pending(f.scope)).some(record=>record.patch.requestId===payload.requestId));
    }
    assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
test("corrupt newest journal never falls back to an earlier intent and never replays a success",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","saved")]);await f.executor.apply(payload);const files=(await readdir(f.directory)).sort(),last=files.at(-1)!;const record=JSON.parse(await readFile(join(f.directory,last),"utf8"));record.schemaVersion=99;await writeFile(join(f.directory,last),JSON.stringify(record));
    await assert.rejects(f.createExecutor().apply(payload),/JOURNAL_CORRUPT/);assert.equal(f.counts().writes,1);
  }finally{await f.cleanup();}
});
test("closed schema bounds source targets, payload size, insert context and operation vocabulary",async()=>{
  const f=await contentFixture();try{
    const payload=f.patch([await f.text(f.a,"Beta","ok")]);assert.throws(()=>parsePatch({...payload,schemaVersion:2}),/UNSUPPORTED_SCHEMA/);
    assert.throws(()=>parsePatch({...payload,operations:[{...payload.operations[0],type:"delete-block"}]}),/UNSUPPORTED_OPERATION/);
    assert.throws(()=>parsePatch({...payload,operations:[{...payload.operations[0],target:{kind:"markdown",graphId:f.scope.graphId,blockUuid:f.a}}]}),/UNSUPPORTED_SOURCE/);
    assert.throws(()=>parsePatch({...payload,operations:[{...payload.operations[0],text:"x".repeat(262145)}]}),/INVALID_STRING/);
    const insertion=await f.text(f.a,"","x",0);assert.throws(()=>parsePatch(f.patch([{...insertion,context:null}])) ,/INSERT_CONTEXT_REQUIRED/);
    assert.equal((await sha256("UTF-8 😀\r\n")).length,64);assert.equal(f.counts().writes,0);
  }finally{await f.cleanup();}
});
