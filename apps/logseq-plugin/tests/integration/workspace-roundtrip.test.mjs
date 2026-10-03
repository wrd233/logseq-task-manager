import test from 'node:test';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,readdir,lstat,cp} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {contentFixture} from '../fixtures/content-writeback.ts';

const entry=new URL('../../src/index.ts',import.meta.url).href;
const bench=()=>globalThis.window.taskCopilotWorkbench;
async function until(check) { for(let i=0;i<150;i++){if(await check())return;await delay(10);} assert.fail('condition did not settle'); }
const button=text=>[...globalThis.document.querySelectorAll('button')].find(b=>b.textContent===text);
async function fill(label,value){await until(()=>globalThis.document.querySelector(`input[aria-label="${label}"]`));const input=globalThis.document.querySelector(`input[aria-label="${label}"]`);input.value=value;input.closest('form').dispatchEvent(new globalThis.window.Event('submit',{bubbles:true,cancelable:true}));}

test('installed four-module loop: committed write, observation, copied identity rejection, moved materials, restart and revoked APIs',async()=>{
  const f=await contentFixture(),directory=`${f.directory}/work`,moved=`${f.directory}/moved`,copied=`${f.directory}/copy`;
  const fetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('Kernel offline');};
  globalThis.logseq.settings.workViewEnabled=true;globalThis.logseq.settings.materialsEnabled=true;
  globalThis.window.apis={doAction:async([op,...args])=>{
    if(op==='readFile')return readFile(args[0],'utf8');
    if(op==='writeFile')return writeFile(args[1],args[2]);
    if(op==='rename')return rename(...args);
    if(op==='mkdir-recur')return mkdir(args[0],{recursive:true});
    if(op==='listdir')return readdir(args[0]);
    if(op==='stat'){const s=await lstat(args[0]);return {mode:s.mode,size:s.size};}
    throw Error(`unexpected IO ${op}`);
  },openPath:async()=>{}};
  try{
    await mkdir(directory);await import(`${entry}?roundtrip=1`);await f.boot();const api=bench();
    await api.open(f.root);assert.equal(f.counts().identities,0);
    const bound=await api.workspace.bind({scope:f.scope,directory});assert.equal(bound.freshness,'checked');
    assert.equal((await api.lenses.select(f.a)).ok,true);
    await f.commands.get('content-authorize')();
    const before=await api.content.read();
    assert.deepEqual((await api.lenses.source()).value.blocks,before.blocks);
    assert.deepEqual((await api.workspace.refresh(f.scope)).observed.primary.blocks,before.blocks);
    const result=await api.content.apply(f.patch([await f.text(f.a,'Beta','正文已更新')]));
    assert.equal(result.status,'complete');assert.equal(result.record.items[0].status,'APPLIED_VERIFIED');
    f.changed();
    await until(async()=> (await api.workspace.read(f.scope)).mirror.markdown.includes('正文已更新'));
    const lens=await api.lenses.source(),content=await api.content.read(),workspace=await api.workspace.refresh(f.scope);
    assert.equal(lens.ok,true);assert.deepEqual(lens.value.blocks,content.blocks);assert.deepEqual(workspace.observed.primary.blocks,content.blocks);
    assert.equal(lens.value.structureVersion,workspace.observed.primary.structureVersion);
    assert.equal(api.lenses.read().phase,'changed');assert.ok(api.lenses.read().plan.visibleRanges.some(range=>range.sourceId.includes(f.a)));
    const material=await api.materials.capture({requestKey:'roundtrip',text:'# 材料原文',sourceUuid:f.root});
    assert.equal(material.status,'success');const id=material.material.id,oldPath=material.material.path;
    await api.workspace.associate({scope:f.scope,source:{kind:'material',id}});
    await cp(directory,copied,{recursive:true});
    await assert.rejects(api.workspace.bind({scope:f.scope,directory:copied,rebind:true}),/副本/);
    await rename(`${copied}/WORKSPACE.md`,`${copied}/WORKSPACE.saved.md`);
    await assert.rejects(api.workspace.bind({scope:f.scope,directory:copied,rebind:true}),/副本/);
    assert.equal((await api.workspace.resolve(f.scope)).directory,directory);
    await rename(directory,moved);
    assert.equal((await api.workspace.read(f.scope)).freshness,'last-known');
    await assert.rejects(api.workspace.refresh(f.scope));
    // Invoke the actual recovery command while the old path cannot resolve.
    await f.menus.get('工作台：重新关联工作目录')({uuid:f.root});
    const panel=globalThis.document.querySelector('[data-workbench-feature="workspace"]');
    panel.querySelector('input').value=moved;
    [...panel.querySelectorAll('button')].find(b=>b.textContent==='重新关联').click();
    await until(async()=> (await api.workspace.resolve(f.scope))?.directory===moved);
    assert.equal((await api.workspace.resolve(f.scope)).manifest.workspaceId,bound.workspaceId);
    await api.openMaterial(id);button('登记原材料目录').click();await fill('已有材料目录（包含 .longdoc 记录）',moved);
    await until(()=>button('重新定位'));button('重新定位').click();
    await fill('重新定位到文件绝对路径',oldPath.replace(directory,moved));
    await until(async()=> (await api.materials.read(id)).availability==='available');
    assert.equal((await api.materials.read(id)).content,'# 材料原文');
    await f.unload();await assert.rejects(api.workspace.read(f.scope),/SCOPE_EXPIRED/);
    await assert.rejects(api.workspace.bind({scope:f.scope,directory:moved}),/SCOPE_EXPIRED/);
    await import(`${entry}?roundtrip=2`);await f.boot();const restarted=bench();
    const restored=await restarted.workspace.refresh(f.scope);
    assert.equal(restored.workspaceId,bound.workspaceId);assert.equal(restored.binding.directory,moved);assert.equal(restored.freshness,'checked',JSON.stringify(restored));
    assert.equal(restored.observed.sources[0].material.content,'# 材料原文');
    assert.equal((await restarted.materials.read(id)).path,oldPath.replace(directory,moved));
    assert.equal(requests,0);
  }finally{await f.unload();globalThis.fetch=fetch;await f.cleanup();}
});
