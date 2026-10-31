import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectCatalog} from '../src/features/agent-workspace/work-catalog.ts';
import {parseCatalogSnapshot} from '@task-copilot/contracts';

test('catalog recognizes navigation objects, genuine Kernel anchors and explicitly selected pages only', async () => {
  const formal = {object:{id:'real-kernel-id',title:'正式身份',kind:'TASK',updatedAt:'2026-10-31T00:00:00Z'},anchor:{graphId:'graph',externalId:'formal-block'}};
  const snapshot = await collectCatalog({graphId:'graph',graphName:'测试图谱',
    blocks:['[事务] 同名','[事项] 同名','[任务] 任务','[MiniProject] 小项目','[Project] 自然项目','TODO 普通待办','普通正文','提到 [事务] 不能收录','> [Project] 引用','kernel source'].map((content,index) => ({uuid:index===9?'formal-block':`block-${index}`,content,page:{id:1,name:index===1?'位置乙':'位置甲'},parent:{id:1}})),
    pages:[{uuid:'page-identity',title:'明确加入页面'}],formal:[formal],getBlock:async()=>null,check:()=>{}});
  assert.equal(snapshot.works.length,7);
  assert.equal(snapshot.works.filter(work=>work.title==='同名').length,2);
  assert.notDeepEqual(snapshot.works[0]!.workRef,snapshot.works[1]!.workRef);
  assert.deepEqual(snapshot.works.find(work=>work.title==='正式身份')!.workRef,{kind:'kernel',objectId:'real-kernel-id'});
  assert.equal(snapshot.works.find(work=>work.title==='自然项目')!.objectType,'Project');
  assert.ok(!JSON.stringify(snapshot).includes('普通正文'));
  assert.deepEqual(parseCatalogSnapshot(snapshot),snapshot);
  assert.throws(()=>parseCatalogSnapshot({...snapshot,grant:'old-write'}));
});

test('Graph generation cancellation stops a delayed parent lookup before publishing', async () => {
  let live = true;
  await assert.rejects(collectCatalog({graphId:'g',graphName:'g',blocks:[{uuid:'root',content:'[事务] work',parent:{id:2},page:{id:1}}],pages:[],formal:[],
    getBlock:async()=>{live=false;return {content:'parent'};},check:()=>{if(!live)throw Error('GRAPH_SCOPE_CHANGED');}}), /GRAPH_SCOPE_CHANGED/);
});

test('selected pages follow native anchors across rename/reindex, never a same-title replacement', async () => {
  const {readSelectedPages,saveSelectedPages,resolveSelectedPage,pageWorkRef} = await import('../src/features/agent-workspace/catalog-pages.ts');
  const previous = globalThis.logseq, storage = new Map<string,string>();
  let page = {uuid:'page-after-reindex',id:10,name:'renamed-page',originalName:'改名页面'}, missing = false;
  globalThis.logseq = {FileStorage:{getItem:async(key:string)=>storage.get(key) ?? null,setItem:async(key:string,value:string)=>{storage.set(key,value);}},
    Editor:{getBlock:async(uuid:string)=>!missing && uuid==='durable-native-anchor' ? {uuid,page:{id:10}} : null,
      getPage:async(id:number|string)=>id===10 ? page : null}} as unknown as typeof logseq;
  try {
    const selection = {uuid:'durable-native-anchor',anchorUuid:'durable-native-anchor',title:'原页面名'};
    await saveSelectedPages('g',[selection],()=>{});
    assert.equal((await resolveSelectedPage(selection,()=>{}))?.sourceUuid,'page-after-reindex');
    assert.deepEqual(await pageWorkRef('g',page.uuid,()=>{}),{kind:'logseq',graphId:'g',rootUuid:'durable-native-anchor',sourceKind:'page'});
    page={...page,uuid:'second-reindex',name:'another-name'};
    assert.equal((await resolveSelectedPage(selection,()=>{}))?.uuid,'durable-native-anchor');
    missing=true;assert.equal(await resolveSelectedPage(selection,()=>{}),null);
    assert.deepEqual(await readSelectedPages('g',()=>{}),[selection]);
  } finally {globalThis.logseq=previous;}
});
