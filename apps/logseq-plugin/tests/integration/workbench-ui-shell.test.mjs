import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture, deferred } from '../fixtures/work-view.mjs';

const row = (f, uuid) => f.browser.document.querySelector(`.wb-row[data-uuid="${uuid}"]`);
const shellFixture = () => fixture(undefined, 3, {initialReadingMode:'report'});

test('default body is a complete report even when the older personal structure was collapsed', async () => {
  const f = await shellFixture();
  try {
    f.root.content = '**[MiniProject]** 研究材料与引用 #MiniProject';
    f.browser.localStorage.setItem('workbench:scope:["one:/one","root"]', JSON.stringify({items:[{uuid:'root',depth:0},{uuid:'b0',depth:1},{uuid:'b1',depth:1}],collapsed:['root']}));
    const original = JSON.stringify([...f.blocks]); await f.work.open('root');
    assert.equal(f.work.reportAPI.read().mode, 'report');
    assert.equal(f.work.reportAPI.read().status, 'current');
    assert.equal(f.work.panel.root.querySelector('.wb-work-title').textContent, '研究材料与引用');
    assert.equal(f.work.panel.root.querySelector('.wb-work-kind').textContent, 'MiniProject');
    assert.ok([...f.work.panel.root.querySelectorAll('.wb-row')].every(node => !node.hidden));
    assert.equal(f.work.reportAPI.read().fragments.length,3);
    assert.equal(JSON.stringify([...f.blocks]),original);
    assert.equal(f.work.panel.root.querySelector('.wb-status').textContent,'');
    assert.equal(f.work.panel.root.querySelector('[data-work-content=body]').getAttribute('aria-current'),'true');
  } finally { await f.close(); }
});

test('materials mount uses the entire scope and body return retains mode, lens, selection and bookmark', async () => {
  const f = await shellFixture();
  const { FeaturePanel } = await import('../../src/host/panel-host.ts');
  const material = new FeaturePanel('materials','材料');
  try {
    await f.work.open('root'); await f.work.lensesAPI.select('b0');
    const node = row(f,'b0'), container = node.parentElement; node.focus(); container.scrollTop = 123;
    const selected = f.work.lensesAPI.read().plan;
    await material.open();
    assert.equal(f.work.mountMaterialChrome(material.root,{graphId:'other',rootUuid:'root'}),false);
    assert.equal(f.work.mountMaterialChrome(material.root,{graphId:'one:/one',rootUuid:'root'}),true);
    assert.equal(material.root.querySelectorAll('.wb-work-shell').length,1);
    assert.equal(material.root.querySelector('[data-work-content=materials]').getAttribute('aria-current'),'true');
    await f.work.returnToBody();
    assert.equal(material.visible,false); assert.equal(f.work.panel.visible,true);
    assert.equal(row(f,'b0'),node); assert.equal(container.scrollTop,123); assert.equal(f.browser.document.activeElement,node);
    assert.deepEqual(f.work.lensesAPI.read().plan,selected); assert.equal(row(f,'b1').hidden,true);
    assert.equal(f.work.reportAPI.read().mode,'report'); assert.equal(f.work.snapshot().root,'root');
  } finally { await material.close(); await f.close(); }
});

test('work menu retains focus on source updates and Escape closes locally without intercepting composition', async () => {
  const f = await shellFixture();
  try {
    await f.work.open('root'); const menu = f.work.panel.root.querySelector('.wb-menu'), trigger = menu.querySelector('summary');
    menu.open=true; const refresh = [...menu.querySelectorAll('button')].find(item=>item.dataset.actionLabel==='重新读取正文'); refresh.focus();
    f.content('root','TODO **[事务]** 更新工作名'); await delay(70);
    assert.equal(menu.open,true); assert.equal(f.browser.document.activeElement,refresh);
    refresh.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true}));
    assert.equal(menu.open,true);
    refresh.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(menu.open,false); assert.equal(f.browser.document.activeElement,trigger);
    menu.open=true; row(f,'b1').querySelector('.wb-body').click(); assert.equal(menu.open,false);
  } finally { await f.close(); }
});

test('first use has an actionable empty state and an explicit current-block action opens its nearest work', async () => {
  const f = await shellFixture();
  try {
    f.setCurrent('missing'); await f.work.open();
    assert.equal(f.work.panel.visible,true); assert.equal(f.work.snapshot().root,null);
    assert.ok(f.work.panel.root.querySelector('.wb-empty')); assert.equal(f.work.panel.root.querySelector('[data-work-content=materials]').disabled,true);
    f.setCurrent('b0'); await f.work.openCurrentWork();
    assert.equal(f.work.snapshot().root,'root'); assert.equal(f.work.panel.root.querySelector('.wb-empty'),null);
    const native = f.browser.document.createElement('div'); native.className='ls-block'; native.setAttribute('blockid','b0'); f.browser.document.body.append(native);
    native.click(); await delay(20); assert.equal(f.work.snapshot().root,'root');
  } finally { await f.close(); }
});

test('a late source read cannot restore the previous work identity or its material scope', async () => {
  const f = await shellFixture(), gate=deferred(), started=deferred();
  try {
    const other={uuid:'other',content:'**[MiniProject]** 短工作 #MiniProject',parent:{id:'page'},page:{id:'page'},children:[]}; f.blocks.set('other',other);
    f.setTreeRead(async uuid=>{if(uuid==='root'){started.resolve();return gate.promise;}return other;});
    const reading=f.work.open('root'); await started.promise; await f.work.open('other');
    gate.resolve(f.root); await reading;
    assert.equal(f.work.snapshot().root,'other'); assert.equal(f.work.panel.root.querySelector('.wb-work-title').textContent,'短工作');
    assert.equal(f.work.reportAPI.read().scope.rootUuid,'other'); assert.equal(row(f,'root'),null);
    const surface=f.browser.document.createElement('section');
    assert.equal(f.work.mountMaterialChrome(surface,{graphId:'one:/one',rootUuid:'root'}),false);
  } finally { await f.close(); }
});


test('the keyboard entrance resolves a selected child to its real work, just like the work menu', async () => {
  const f = await shellFixture();
  try {
    f.root.content = '**[MiniProject]** 原生工作 #MiniProject'; f.setCurrent('b0');
    f.commands.get('workbench-open-work')();
    for (let i=0;i<100 && f.work.snapshot().root!=='root';i++) await delay(5);
    assert.equal(f.work.snapshot().root,'root');
    assert.equal(f.work.panel.root.querySelector('.wb-work-title').textContent,'原生工作');
  } finally { await f.close(); }
});
