// Real-operation validation of the Agent-facing structured view interface.
// Everything here goes through the same relay channel the plugin listens on;
// no Logseq write API is called, so source text must stay byte-identical.
// Each assertion group resets the arrangement atomically first, so a refusal
// is judged against a known state rather than drifting state.
import {writeFile,mkdir} from 'node:fs/promises';
import {inspect,sendOp,liveState} from './agent-client.mjs';

const out=[];const log=(...a)=>{const line=a.join(' ');out.push(line);console.log(line)};
const flat=(s)=>s.items.map(i=>i.uuid.slice(0,8)+':'+i.depth).join(' ');
const sub=(s,u)=>{const i=s.items.findIndex(x=>x.uuid===u);let e=i+1;while(e<s.items.length&&s.items[e].depth>s.items[i].depth)e++;return {i,e,len:e-i}};
async function relay(){const d=await inspect();return {graph:d.graph,root:d.root,instance:d.instance}}
async function st(){const d=await relay();const r=await liveState(d);if(!r.ok)throw new Error('query failed: '+r.reason);return r.state}
async function op(o){const d=await relay();return sendOp(o,d)}
let BASE=null;
// The baseline is the SOURCE order read from the SDK snapshot, not whatever the view currently holds.
async function reset(label){const d=await relay();const src=(await inspect()).snapshot.rows.map(r=>({uuid:r.uuid,depth:r.depth}));const r=await sendOp({type:'layout',items:src},d);const s=await st();const ok=r.ok&&JSON.stringify(s.items)===JSON.stringify(src);log(`[${ok?'PASS':'FAIL'}] reset view to source order before ${label}`);return s}
const verdict=(c)=>c?'PASS':'FAIL';
async function expect(label,o,want){const r=await op(o);log(`[${verdict(r.ok===want)}] ${label} -> ok=${r.ok}${r.reason?' reason='+r.reason:''}`);return r}

log('=== 0. scope ===');
const d0=await relay();log('graph='+d0.graph,'root='+d0.root,'instance='+d0.instance);
const s0=await st();BASE=s0;
log('items='+s0.items.length,'selected='+s0.selected?.slice(0,8),'collapsed='+JSON.stringify(s0.collapsed),'page='+JSON.stringify(s0.page));
await mkdir('evidence/presentation/agent-ops',{recursive:true});
await writeFile('evidence/presentation/agent-ops/state-before.json',JSON.stringify(s0,null,2));

log('\n=== 1. read view arrangement ===');
log('flat: '+flat(s0));
log('roles: TODO='+s0.blocks.filter(b=>b.task==='TODO').length+' 现状='+s0.blocks.filter(b=>b.role==='现状').length+' 问一下='+s0.blocks.filter(b=>b.role==='问一下').length+' 注='+s0.blocks.filter(b=>b.role==='注').length+' 想法='+s0.blocks.filter(b=>b.role==='想法').length);
log('editing='+JSON.stringify(s0.blocks.filter(b=>b.editing).map(b=>b.uuid.slice(0,8)))+' focus='+(s0.focus?s0.focus.slice(0,8):null));
log('sourceParent present on every block: '+s0.blocks.every(b=>'sourceParent' in b)+'; view depth != source depth: '+s0.items.filter(i=>{const b=s0.blocks.find(x=>x.uuid===i.uuid);return b&&b.sourceDepth!==i.depth}).length);

const q3=s0.blocks.find(b=>b.content.startsWith('【问一下】 第003条'));
const note4=s0.blocks.find(b=>b.content.startsWith('【注】 第004条'));
const idea5=s0.blocks.find(b=>b.content.startsWith('【想法】 第005条'));
const todo6=s0.blocks.find(b=>b.content.startsWith('TODO 第006条'));
const todo11=s0.blocks.find(b=>b.content.startsWith('TODO 第011条'));
const dNoteSrc=s0.items.find(x=>x.uuid===note4.uuid).depth;
log(`anchors q3=${q3.uuid.slice(0,8)}(d3) note4=${note4.uuid.slice(0,8)}(d4) idea5=${idea5.uuid.slice(0,8)}(d5) todo6=${todo6.uuid.slice(0,8)}(d1) todo11=${todo11.uuid.slice(0,8)}(d1)`);

log('\n=== 2. reorder: move a view subtree, then the honest round-trip ===');
await reset('reorder group');
const rMove=await expect('reorder note4 before todo6',{type:'reorder',uuid:note4.uuid,target:todo6.uuid,mode:'before'},true);
if(rMove.ok){
  const s1=await st();
  const m=sub(s1,note4.uuid),t=s1.items.findIndex(x=>x.uuid===todo6.uuid);
  log(`[${verdict(m.e===t)}] moved subtree (${m.len} rows) now ends exactly where todo6 starts (end=${m.e}, todo6=${t}); subtree root view depth=${s1.items[m.i].depth}`);
  log(`[${verdict(s1.blocks.find(b=>b.uuid===note4.uuid).sourceDepth===4)}] source depth of note4 unchanged (4) while view depth became ${s1.items[m.i].depth}`);
  log('flat after move: '+flat(s1));
  await writeFile('evidence/presentation/agent-ops/state-after-reorder.json',JSON.stringify(s1,null,2));
  await expect('reorder note4 after q3 (inverse)',{type:'reorder',uuid:note4.uuid,target:q3.uuid,mode:'after'},true);
  const s1b=await st();
  const iN=s1b.items.findIndex(x=>x.uuid===note4.uuid);
  log(`[${verdict(s1b.items[iN].depth===s0.items.find(x=>x.uuid===q3.uuid).depth&&s1b.items[iN+1]?.uuid===idea5.uuid)}] inverse reorder returns note4 to after q3 at depth ${s1b.items[iN].depth} with its subtree intact — but the full arrangement is NOT layout-identical (move re-parents while keeping the subtree's internal shape)`);
  if(flat(s1b)!==flat(s0))log('  flat after round-trip: '+flat(s1b));
}

log('\n=== 3. indent / outdent, each from the baseline ===');
await reset('indent');
const dNote=dNoteSrc;
const rIndent=await expect('indent note4 (+1)',{type:'indent',uuid:note4.uuid,delta:1},true);
if(rIndent.ok){const s2=await st();const d=s2.items.find(x=>x.uuid===note4.uuid).depth;log(`[${verdict(d===dNote+1)}] view depth ${dNote} -> ${d}`);log('flat: '+flat(s2))}
await reset('outdent');
const rOut=await expect('outdent note4 (-1)',{type:'indent',uuid:note4.uuid,delta:-1},true);
if(rOut.ok){const s3=await st();const d=s3.items.find(x=>x.uuid===note4.uuid).depth;log(`[${verdict(d===dNote-1)}] view depth ${dNote} -> ${d}`)}

log('\n=== 4. refusals, each judged against the source-order baseline ===');
await reset('refusals');
await expect('move root',{type:'reorder',uuid:s0.root,target:todo6.uuid,mode:'before'},false);
await expect('move note4 into its own descendant idea5',{type:'reorder',uuid:note4.uuid,target:idea5.uuid,mode:'after'},false);
await expect('move q3 into its own descendant idea5',{type:'reorder',uuid:q3.uuid,target:idea5.uuid,mode:'child'},false);
await expect('unknown uuid',{type:'reorder',uuid:'00000000-0000-0000-0000-000000000000',target:todo6.uuid,mode:'before'},false);
await expect('layout with wrong nesting',{type:'layout',items:[{uuid:s0.root,depth:0},{uuid:todo6.uuid,depth:5}]},false);
await expect('layout with root depth 1',{type:'layout',items:[{uuid:s0.root,depth:1}]},false);
await expect('layout missing items',{type:'layout',items:[{uuid:s0.root,depth:0}]},false);
await expect('layout duplicate uuid',{type:'layout',items:[{uuid:s0.root,depth:0},{uuid:s0.root,depth:1}]},false);
await expect('indent root',{type:'indent',uuid:s0.root,delta:1},false);
await reset('indent-no-sibling case');
const sReset=await st();
const firstChild=sReset.items[1];
await expect('indent the FIRST child of the root (no same-depth predecessor)',{type:'indent',uuid:firstChild.uuid,delta:1},false);
await expect('indent todo11 (has a same-depth predecessor) is allowed',{type:'indent',uuid:todo11.uuid,delta:1},true);
const sIndent=await st();log(`[${verdict(sIndent.items.find(x=>x.uuid===todo11.uuid).depth===2)}] todo11 view depth 1 -> ${sIndent.items.find(x=>x.uuid===todo11.uuid).depth}`);
await reset('refusals tail');
await expect('unknown op type',{type:'teleport',uuid:note4.uuid},false);

log('\n=== 5. attention: focus + collapse ===');
await reset('attention');
const rFocus=await expect('focus q3',{type:'focus',uuid:q3.uuid},true);
if(rFocus.ok){const s4=await st();log(`[${verdict(s4.selected===q3.uuid)}] attention set to q3 (selected=${s4.selected.slice(0,8)})`)}
await expect('collapse q3',{type:'collapse',uuid:q3.uuid,collapsed:true},true);
const s5=await st();log(`[${verdict(s5.collapsed.includes(q3.uuid))}] collapsed contains q3`);
await expect('expand q3',{type:'collapse',uuid:q3.uuid,collapsed:false},true);

log('\n=== 6. atomic layout restore ===');
const srcPlan=(await inspect()).snapshot.rows.map(r=>({uuid:r.uuid,depth:r.depth}));
const rRestore=await expect('layout = source order',{type:'layout',items:srcPlan},true);
if(rRestore.ok){const s6=await st();log(`[${verdict(JSON.stringify(s6.items)===JSON.stringify(srcPlan))}] arrangement matches the source order exactly`);await writeFile('evidence/presentation/agent-ops/state-restored.json',JSON.stringify(s6,null,2))}
const s7=await st();
await writeFile('evidence/presentation/agent-ops/state-final.json',JSON.stringify(s7,null,2));
await writeFile('evidence/presentation/agent-ops/agent-ops.txt',out.join('\n')+'\n');
log('\nfinal arrangement equals source order: '+verdict(JSON.stringify(s7.items)===JSON.stringify(srcPlan)));
