import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectCatalog} from '../src/features/agent-workspace/work-catalog.ts';
import {buildPageMetaMap, classifyCatalogPage, parsePropertyLinks} from '../src/features/agent-workspace/catalog-local.ts';
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

test('PARA Area and Project page classification extracts parentAreas, skips archived pages/blocks, and ignores workflow docs', async () => {
  const allowed = new Set(['项目', 'project']);
  assert.deepEqual(parsePropertyLinks('[[Area/运维能力]] [[Area/AI 自动化能力]]'), ['Area/运维能力', 'Area/AI 自动化能力']);
  assert.deepEqual(parsePropertyLinks('NA'), []);
  assert.deepEqual(parsePropertyLinks('state:: paused'), []);

  const areaPage = { uuid: 'p-area', name: 'area/运维能力', originalName: 'Area/运维能力', properties: { para: ['PARA/Area'], state: 'active', tags: ['领域'] } } as never;
  const lifeAreaPage = { uuid: 'p-life', name: 'area/身体健康', originalName: 'Area/身体健康', properties: { para: '[[PARA/Area]]', state: 'active' } } as never;
  const activeProj = { uuid: 'p-proj', name: '项目-海丝', originalName: '项目-海丝', properties: { para: '[[PARA/Project]]', areas: '[[Area/运维能力]] [[Area/AI 自动化能力]]', state: 'active' } } as never;
  const archivedProj = { uuid: 'p-arch', name: '旅游-日本旅游', originalName: '旅游-日本旅游', properties: { para: '[[PARA/Project]]', state: 'archived' } } as never;
  const paraArchive = { uuid: 'p-arch2', name: '英语-bec体系学习', originalName: '英语-BEC体系学习', properties: { para: '[[PARA/Archive]]', state: 'archived' } } as never;
  const workflowDoc = { uuid: 'p-wf', name: '工作流/领域', originalName: '工作流/领域', properties: { tags: ['领域'] } } as never;
  const paraSystem = { uuid: 'p-sys', name: 'para/area', originalName: 'PARA/Area', properties: { para: '[[PARA/Area]]' } } as never;

  assert.equal(classifyCatalogPage(areaPage, allowed).kind, 'area');
  assert.equal(classifyCatalogPage(lifeAreaPage, allowed).kind, 'area');
  const projInfo = classifyCatalogPage(activeProj, allowed);
  assert.equal(projInfo.kind, 'project');
  assert.deepEqual(projInfo.parentAreas, ['Area/运维能力', 'Area/AI 自动化能力']);
  assert.equal(projInfo.lifecycleState, 'active');
  assert.equal(classifyCatalogPage(archivedProj, allowed).kind, 'archived');
  assert.equal(classifyCatalogPage(paraArchive, allowed).kind, 'archived');
  assert.equal(classifyCatalogPage(workflowDoc, allowed).kind, 'other');
  assert.equal(classifyCatalogPage(paraSystem, allowed).kind, 'other');

  const prevLogseq = globalThis.logseq;
  globalThis.logseq = { settings: {} } as unknown as typeof logseq;
  try {
    const pageMeta = buildPageMetaMap([areaPage, activeProj, archivedProj, paraArchive]);
    const snap = await collectCatalog({
      graphId: 'graph',
      graphName: '主图谱',
      blocks: [
        { uuid: 'b-active', content: '[事务] 海丝方案', page: { id: 1, originalName: '项目-海丝' }, parent: { id: 1 } },
        { uuid: 'b-archived', content: '[事务] <活动细节>', page: { id: 2, originalName: '旅游-日本旅游' }, parent: { id: 2 } },
      ],
      pages: [
        { uuid: 'p-area', title: 'Area/运维能力', objectType: 'Area', lifecycleState: 'active' },
        { uuid: 'p-proj', title: '项目-海丝', objectType: 'Project', parentAreas: ['Area/运维能力'], lifecycleState: 'active' },
      ],
      pageMeta,
      formal: [],
      getBlock: async () => null,
      check: () => {},
    });
    assert.equal(snap.works.some((w) => w.title === '<活动细节>'), false, 'blocks inside archived pages must be skipped');
    const areaWork = snap.works.find((w) => w.title === 'Area/运维能力')!;
    const projWork = snap.works.find((w) => w.title === '项目-海丝')!;
    assert.equal(areaWork.objectType, 'Area');
    assert.equal(projWork.objectType, 'Project');
    assert.deepEqual(projWork.parentAreas, ['Area/运维能力']);
    assert.equal(projWork.lifecycleState, 'active');
    assert.deepEqual(parseCatalogSnapshot(snap), snap);
  } finally {
    globalThis.logseq = prevLogseq;
  }
});
