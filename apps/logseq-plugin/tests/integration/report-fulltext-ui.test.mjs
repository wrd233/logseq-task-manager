import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from '../fixtures/work-view.mjs';
import {longformRows} from '../fixtures/report-longform.ts';
import {workbenchShellStyle} from '../../src/host/visual-style.ts';

const rows=longformRows('77777777-7777-4777-8777-777777777777');
const row=(f,id)=>f.browser.document.querySelector(`.wb-row[data-uuid="${id}"]`);
async function longFixture(){
  const f=await fixture(null,rows.length);
  const nodes=rows.map((r,i)=>({...r,id:i+1,parent:{id:r.parentUuid??'page'},page:{id:'page'},content:r.content+'\nid:: '+r.uuid,children:[]}));
  for(const node of nodes)node.children=nodes.filter(n=>n.parentUuid===node.uuid);
  Object.assign(f.root,nodes[0]);f.blocks.clear();f.blocks.set(f.root.uuid,f.root);
  for(const node of nodes.slice(1))f.blocks.set(node.uuid,node);
  f.setCurrent(f.root.uuid);await f.work.open(f.root.uuid);
  return f;
}
test('source body uses the flexible text track across structure/report round trips',async()=>{
  const f=await longFixture();try{
    const style=f.browser.document.createElement('style');style.textContent=workbenchShellStyle;f.browser.document.head.prepend(style);
    const target=row(f,rows[14].uuid),body=target.querySelector('.wb-body'),original=body.textContent;
    for(const [mode,column] of [['report','2'],['structure','3'],['report','2'],['structure','3']]){
      assert.equal((await f.work.reportAPI.setMode(mode)).ok,true);
      assert.equal(row(f,rows[14].uuid),target);assert.equal(target.querySelector('.wb-body'),body);
      assert.equal(f.browser.getComputedStyle(body).gridColumn,column,'body must not auto-place into an 18px control track');
      if(mode==='structure')assert.equal(body.textContent,original);
    }
  }finally{await f.close();}
});
test('entering real long report ignores inherited folds and compact overrides; explicit folds and lens exit restore all current sources',async()=>{
  const f=await longFixture();try{
    let s=f.work.snapshot();f.work.apply({graph:s.graph,root:s.root,expectedSeq:s.seq,type:'collapse',uuid:f.root.uuid,collapsed:true});
    s=f.work.snapshot();f.work.apply({graph:s.graph,root:s.root,expectedSeq:s.seq,type:'display',uuid:rows[15].uuid,level:'compact'});
    const original=JSON.stringify([...f.blocks].map(([id,b])=>[id,b.content,b.parent,b.children.map(c=>c.uuid)])),personal=JSON.stringify(f.work.snapshot().view);
    assert.equal((await f.work.reportAPI.setMode('report')).ok,true);
    const nodes=rows.map(r=>row(f,r.uuid));assert.ok(nodes.every(n=>!n.hidden&&n.querySelector('.wb-body').classList.contains('expanded')));
    assert.equal(nodes[0].parentElement.dataset.reportRange,'full');assert.equal(nodes[0].parentElement.dataset.reportShown,String(rows.length));
    nodes[0].querySelector('button[aria-label="折叠子项"]').click();assert.equal(nodes.filter(n=>!n.hidden).length,1);
    assert.equal(nodes[0].parentElement.dataset.reportRange,'limited');assert.match(f.work.panel.root.querySelector('.wb-status').textContent,/显示 1 \/ 93/);
    nodes[0].querySelector('button[aria-label="展开子项"]').click();assert.ok(nodes.every(n=>!n.hidden));
    assert.equal((await f.work.lensesAPI.select(rows[6].uuid)).ok,true);assert.ok(nodes.some(n=>n.hidden));
    f.work.lensesAPI.exit();assert.ok(nodes.every(n=>!n.hidden));
    await f.work.reportAPI.setMode('structure');assert.equal(JSON.stringify(f.work.snapshot().view),personal);
    await f.work.reportAPI.setMode('report');assert.ok(nodes.every(n=>!n.hidden));assert.ok(rows.every((r,i)=>row(f,r.uuid)===nodes[i]));
    assert.equal(JSON.stringify([...f.blocks].map(([id,b])=>[id,b.content,b.parent,b.children.map(c=>c.uuid)])),original);
  }finally{await f.close();}
});
test('middle source update retains unrelated nodes, selection, focus and material hooks; plain double-click never enters native editing',async()=>{
  const f=await longFixture();try{
    await f.work.reportAPI.setMode('report');
    const preserved=row(f,rows[14].uuid),target=row(f,rows[46].uuid),body=preserved.querySelector('.wb-body'),text=body.querySelector('p').firstChild;
    const selection=f.browser.document.getSelection(),range=f.browser.document.createRange();range.setStart(text,0);range.setEnd(text,8);selection.addRange(range);
    const selected=selection.toString(),menu=preserved.querySelector('summary');menu.focus();
    let edits=0;globalThis.logseq.Editor.editBlock=async()=>{edits++;};
    body.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true}));assert.equal(edits,0);assert.equal(selection.toString(),selected);
    const changed=f.blocks.get(rows[46].uuid).content+'\n中间原块已提交的新句，其他来源不动。';
    f.content(rows[46].uuid,changed);await f.work.refresh();
    for(let i=0;i<100&&!target.querySelector('.wb-body').textContent.includes('中间原块已提交的新句');i++)await delay(5);
    assert.equal(row(f,rows[14].uuid),preserved);assert.equal(row(f,rows[46].uuid),target);
    assert.equal(f.browser.document.activeElement,menu);assert.equal(selection.toString(),selected);
    assert.match(target.querySelector('.wb-body').textContent,/中间原块已提交的新句/);
    assert.equal(target.dataset.reportContentVersion,createHash('sha256').update(changed).digest('hex'));
    const mapped=await f.work.resolveBodyDrop(body,'child');assert.equal(mapped.ok,true);assert.equal(mapped.value.target.blockUuid,rows[14].uuid);
    const heading=f.work.panel.root.querySelector('.wb-report-section');assert.ok(heading);assert.equal((await f.work.resolveBodyDrop(heading,'child')).ok,false);
  }finally{await f.close();}
});

test('long historical overlay keeps saved source order and every original body while current report mappings and native actions are unavailable',async()=>{
  const f=await longFixture();try{
    await f.work.reportAPI.setMode('report');
    const savedRows=rows.map(r=>({uuid:r.uuid,content:f.blocks.get(r.uuid).content,depth:r.depth,sourceParent:r.parentUuid}));
    const savedItems=rows.map(r=>({uuid:r.uuid,depth:r.depth,hidden:false,folded:false,child:false,full:true,emphasis:false}));
    const saved=JSON.stringify(savedRows),state=f.work.snapshot().view;
    let historical=false,edits=0;globalThis.logseq.Editor.editBlock=async()=>{edits++;};
    const bridge=f.work.attachReview({bar:f.browser.document.createElement('div'),scopeChanged:()=>{},edit:()=>assert.fail('read-only historical text opened a correction editor'),
      compose:context=>historical?{rows:savedRows,state,view:{focused:false,visibleCount:rows.length,items:savedItems},changes:new Map(),historical:true}:{...context,changes:new Map(),historical:false}});
    f.content(rows[46].uuid,f.blocks.get(rows[46].uuid).content+'\n当前原块的新句与历史独立。');await f.work.refresh();
    for(let i=0;i<100&&!row(f,rows[46].uuid).querySelector('.wb-body').textContent.includes('当前原块的新句');i++)await delay(5);
    historical=true;bridge.repaint();
    assert.deepEqual([...f.work.panel.root.querySelectorAll('.wb-row')].map(n=>n.dataset.uuid),rows.map(r=>r.uuid));
    for(const r of rows){const node=row(f,r.uuid);assert.equal(node.hidden,false);assert.equal(node.dataset.reportSourceId,undefined);assert.equal(node.querySelector('.wb-body').textContent.replace(/\s+/gu,''),r.expectedText.replace(/\s+/gu,''));}
    assert.equal(f.work.panel.root.querySelectorAll('.wb-report-section').length,0);
    assert.equal((await f.work.reportAPI.setMode('structure')).reason,'historical-view');
    assert.equal((await f.work.resolveBodyDrop(row(f,rows[46].uuid).querySelector('.wb-body'),'child')).reason,'historical-view');
    row(f,rows[46].uuid).dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true,altKey:true}));assert.equal(edits,0);
    historical=false;bridge.repaint();assert.match(row(f,rows[46].uuid).querySelector('.wb-body').textContent,/当前原块的新句/);
    assert.equal(JSON.stringify(savedRows),saved);
  }finally{await f.close();}
});
