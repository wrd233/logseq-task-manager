import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real controller, not Vditor or a browser imitation. Desktop UI
// acceptance is recorded separately in VALIDATION.md.
const source=(await fs.readFile(new URL('../src/plugin.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').split('logseq.useSettingsSchema([')[0];
function controller(){
  const cache=new Map(),elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',classList:{toggle(){}},querySelector(){return null;}});return elements.get(id);};
  const context=vm.createContext({
    document:{getElementById:element},console,Date,queueMicrotask,setTimeout:()=>1,clearTimeout(){},
    TurndownService:class{use(){}},gfm(){},
    localStorage:{setItem:(k,v)=>cache.set(k,v),getItem:k=>cache.get(k),removeItem:k=>cache.delete(k)},
  });
  vm.runInContext(source+`\n
    globalThis.subject={set(text){
      graph='/graph';current={id:'test'};editorRecordId='test';base='base';canonical='base';dirty=false;suppress=false;visible=true;inputUntil=0;
      editor={getValue:()=>text,setValue:value=>{text=value;}};
      store={read:async()=>'external'};stableExternal='external';
    },inspect:()=>({dirty,base,text:editor.getValue(),conflict:!$('conflict').hidden}),
    markPending:()=>{inputUntil=Date.now()+1500;},preserveDraft,retireDraft,restoreLocalDraft,poll};`,context);
  return {subject:context.subject,cache,elements};
}
test('draft is captured before Vditor delayed input callback',()=>{
  const {subject,cache}=controller();subject.set('new input');subject.preserveDraft();
  assert.equal(subject.inspect().dirty,true);
  assert.equal(JSON.parse([...cache.values()][0]).text,'new input');
});
test('external poll cannot overwrite input before delayed dirty notification',async()=>{
  const {subject}=controller();subject.set('new input');await subject.poll();
  assert.equal(subject.inspect().text,'new input');assert.equal(subject.inspect().conflict,true);assert.equal(subject.inspect().base,'base');
});
test('pending paste blocks a clean-looking editor refresh',async()=>{
  const {subject}=controller();subject.set('base');subject.markPending();await subject.poll();
  assert.equal(subject.inspect().text,'base');assert.equal(subject.inspect().conflict,false);
});
test('a safely copied draft is not recreated by navigation',()=>{
  const {subject,cache}=controller();subject.set('copied draft');subject.preserveDraft();subject.retireDraft();subject.preserveDraft();
  assert.equal(subject.inspect().dirty,false);assert.equal(cache.size,0);
});
test('clean editor receives stable external content',async()=>{
  const {subject}=controller();subject.set('base');await subject.poll();
  assert.equal(subject.inspect().text,'external');assert.equal(subject.inspect().base,'external');assert.equal(subject.inspect().dirty,false);
});
test('recovered conflicting draft keeps its original base across repeated reloads',()=>{
  const {subject,cache}=controller();subject.set('local');subject.preserveDraft();
  subject.set('external');subject.restoreLocalDraft('external');subject.preserveDraft();
  assert.equal(subject.inspect().text,'local');assert.equal(subject.inspect().conflict,true);
  assert.equal(JSON.parse([...cache.values()][0]).base,'base');
  subject.set('external');subject.restoreLocalDraft('external');
  assert.equal(subject.inspect().conflict,true);assert.equal(subject.inspect().base,'base');
});
