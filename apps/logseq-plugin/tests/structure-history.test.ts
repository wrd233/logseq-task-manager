import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPoints, structureFrame } from '../src/features/stage-workbench/structure-history.ts';
import { StructureHistoryView } from '../src/features/stage-workbench/structure-history-view.ts';
import { contentFixture } from './fixtures/content-writeback.ts';
import { installContentWriteback } from '../src/features/content-writeback/installer.ts';
import { installStageWorkbench } from '../src/features/stage-workbench/installer.ts';

test('production recorder/store snapshots replay identity, text and hierarchy; candidates excluded; UI is read only',async()=>{
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter}),stages=installStageWorkbench({content,storage:f.storage});
  try{
    await content.local.authorize(f.root);
    const stage=await stages.api.begin({goal:'结构历史',requestKey:crypto.randomUUID(),expectedStageId:null});
    f.blocks.get(f.a)!.content='TODO 第一标题\n说明';
    const first=await stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
    f.blocks.get(f.a)!.content=`DONE 第二标题\n说明\ndepends-on:: ((${f.b}))`;
    f.nativeMove(f.a,f.b,{children:true});
    await stages.api.checkpoint({stageId:stage.start.id,expectedRevision:first.id,requestKey:crypto.randomUUID(),requestIds:[]});
    const history=await stages.api.history(),points=historyPoints(history),frame=structureFrame(points,2),n=frame.nodes.find(n=>n.block.target.blockUuid===f.a)!;
    assert.equal(n.block.parentUuid,f.b);assert.deepEqual(n.dependencies,[f.b]);assert.equal(n.status,'DONE');
    assert.ok(n.changes.includes('重命名'));assert.ok(n.changes.includes('状态变化'));assert.ok(n.changes.includes('依赖变化'));assert.ok(n.changes.includes('移动归属'));
    assert.equal(n.slot,structureFrame(points,0).nodes.find(n=>n.block.target.blockUuid===f.a)!.slot);
    history.stages[0]!.candidates.push({...first,id:crypto.randomUUID()});assert.equal(historyPoints(history).length,3);
    assert.ok(structureFrame(points,0).nodes.every(n=>!n.changes.includes('新增')));
    const view=new StructureHistoryView();view.update(history);document.body.append(view.element);
    const before=JSON.stringify(await stages.api.history());
    view.element.querySelector<HTMLButtonElement>(`[data-history-node="${f.a}"]`)!.click();assert.match(view.element.textContent!,/DONE 第二标题/);
    const slider=view.element.querySelector<HTMLInputElement>('input')!;slider.value='1';slider.dispatchEvent(new f.browser.Event('input') as unknown as Event);
    assert.match(view.element.textContent!,/1\/3|2\/3/);
    Array.from(view.element.querySelectorAll('button')).find(b=>b.textContent==='切换目录 / 差异')!.click();assert.ok(view.element.querySelector('.wb-history-directory'));
    assert.equal(JSON.stringify(await stages.api.history()),before);
    const partial=structuredClone(points);partial[2]!.source.blocks[0]!.availability='unavailable';
    const result=structureFrame(partial,2);assert.ok(result.notices.some(n=>n.includes('不能判定')));assert.ok(result.nodes[0]!.changes.includes('未知'));
  }finally{stages.dispose();content.dispose();await f.cleanup();}
});

test('deletions require complete adjacent snapshots; missing parents and cross-stage baselines stay unknown',async()=>{
  const f=await contentFixture(),content=installContentWriteback({journal:f.journal,adapter:f.adapter}),stages=installStageWorkbench({content,storage:f.storage});
  try{
    await content.local.authorize(f.root);const stage=await stages.api.begin({goal:'删除边界',requestKey:crypto.randomUUID(),expectedStageId:null});
    f.blocks.delete(f.a);f.blocks.get(f.root)!.children=f.blocks.get(f.root)!.children.filter(id=>id!==f.a);
    const revision=await stages.api.checkpoint({stageId:stage.start.id,expectedRevision:stage.start.id,requestKey:crypto.randomUUID(),requestIds:[]});
    const points=historyPoints(await stages.api.history());
    assert.deepEqual(structureFrame(points,1).nodes.find(n=>n.block.target.blockUuid===f.a)?.changes,['删除']);
    const missing=structuredClone(points);missing[1]!.source.blocks[0]!.availability='missing';
    assert.ok(!structureFrame(missing,1).nodes.some(n=>n.deleted));
    const orphan=structuredClone(points);orphan[1]!.parent=crypto.randomUUID();assert.ok(!structureFrame(orphan,1).nodes.some(n=>n.deleted||n.changes.includes('新增')));
    await stages.api.begin({goal:'另一个阶段',requestKey:crypto.randomUUID(),expectedStageId:stage.start.id});
    const all=historyPoints(await stages.api.history());assert.equal(all.length,3);assert.equal(all[1]!.id,revision.id);assert.ok(structureFrame(all,2).notices.some(n=>n.includes('不跨阶段')));
    const view=new StructureHistoryView();view.update({stages:[],current:null,currentEventId:null,problems:['存储不可读']});assert.equal(view.element.querySelector('input')!.disabled,true);assert.match(view.element.textContent!,/尚无历史/);
  }finally{stages.dispose();content.dispose();await f.cleanup();}
});

test('archived real Logseq host events pass production hash/chain verification and replay actual moves/deletions',async()=>{
  const {readFile}=await import('node:fs/promises');const {StageStore}=await import('../src/features/stage-workbench/store.ts');
  const evidence=JSON.parse(await readFile(new URL('../../../docs/implementation/assets/structure-history/host-result.json',import.meta.url),'utf8'));
  const storage={allKeys:async()=>Object.keys(evidence.raw),getItem:async(key:string)=>evidence.raw[key]??null,setItem:async()=>{throw Error('Read only');}};
  const history=await new StageStore(storage).history(evidence.history.stages[0].start.scope);
  assert.deepEqual(history.problems,[]);assert.equal(history.stages[0]!.revisions.length,evidence.history.stages[0].revisions.length);
  const points=historyPoints(history);assert.equal(points.length,evidence.frames.length);
  assert.ok(structureFrame(points,1).nodes.some(n=>n.changes.includes('移动归属')&&n.changes.includes('状态变化')&&n.changes.includes('依赖变化')));
  assert.ok(structureFrame(points,2).nodes.some(n=>n.deleted));
});
