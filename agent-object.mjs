// 对象聚焦交互验证（对象模型：任务状态块 + [MiniProject]/[事务]/[任务]）
// 夹具用 insert-tree 建、结束即删；非对象块必须"不抢视图"。
import {writeFile,mkdir} from 'node:fs/promises';
import {call,current} from './agent-client.mjs';

const out=[];const log=(...a)=>{const line=a.join(' ');out.push(line);console.log(line)};
const short=(u)=>String(u||'').slice(-8);
const verdict=(c)=>c?'PASS':'FAIL';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const ROOT='6a9f85c4-c149-4ac5-880a-f00d3326beb4';
await mkdir('evidence/presentation/agent-object',{recursive:true});

async function state(){const r=await current();if(!r.ok)throw new Error('current failed: '+r.reason);return r.state}
async function settle(ms=2400){await sleep(ms);return state()}
async function focus(uuid,reason='test'){await call({type:'object-focus',uuid,reason});return settle()}
async function click(uuid){const r=await call({type:'simulate-click',uuid});await sleep(800);return r}
const find=(s,pred)=>s.blocks.find(pred);

log('=== 0. 回到采购页根范围 ===');
let s=await focus(ROOT);
log('root='+short(s.root)+' 行数='+s.items.length+' autoFollow='+s.autoFollow);
log('对象判定抽查：');
for(const b of s.blocks)log('   '+(b.task||b.role||'text').padEnd(12)+' kind='+b.kind.padEnd(12)+JSON.stringify(b.content.split('\n')[0].slice(0,26)));

const q=find(s,b=>b.role==='问一下');
const note=find(s,b=>b.role==='注');
const status=find(s,b=>b.role==='现状');
const task=find(s,b=>b.task==='TODO');

log('\n=== 1. 非对象块：点击不抢视图 ===');
for(const [name,b] of [['[现状]',status],['[注]',note],['[问一下]',q]]){
  const r=await click(b.uuid);
  log(`[${verdict(!r.ok&&r.reason==='not-an-object')}] 点击 ${name} -> ${r.ok?'自动渲染（不应发生）':'reason='+r.reason}`);
}
const s1=await state();
log(`[${verdict(s1.root===ROOT)}] 工作视图仍在原范围 ${short(s1.root)}`);

log('\n=== 2. 任务对象：点击自动渲染 ===');
const r2=await click(task.uuid);
const s2=await settle();
log(`[${verdict(r2.ok&&s2.root===task.uuid)}] 点击 TODO -> 视图根 = ${short(s2.root)}`);
log(`[${verdict((s2.objectChain||[]).length===1)}] 面包屑只有当前对象：${JSON.stringify((s2.objectChain||[]).map(c=>c.title))}`);

log('\n=== 3. 建立 MiniProject 夹具（含阶段性目标/事项/任务）===');
await focus(ROOT);
const md=[
 '- **[MiniProject]** 夹具：整理采购附件模板 #MiniProject',
 '\t- **[项目卡片]**',
 '\t\t- **[核心输出]** 一份可复用的采购附件模板。',
 '\t- **[阶段性目标]** 确定模板结构',
 '\t\t- **[事项]** 模板骨架',
 '\t\t\t- TODO 列出模板章节。',
 '\t\t\t- **[注]** 章节名先用占位。',
].join('\n');
const ins=await call({type:'insert-tree',confirm:true,parent:ROOT,markdown:md});
log('插入结果: '+(ins.ok?'ok，'+ins.uuids.length+' 块':'FAIL '+ins.reason));
let s3=await settle();
const mp=find(s3,b=>b.role==='MiniProject');
const leaf=find(s3,b=>b.task==='TODO'&&b.content.includes('列出模板章节'));
log(`[${verdict(!!mp&&!!leaf)}] 夹具解析：MiniProject=${short(mp&&mp.uuid)} 叶子任务=${short(leaf&&leaf.uuid)}`);

log('\n=== 4. MiniProject 含更深对象：点击不抢视图 ===');
const r4=await click(mp.uuid);
log(`[${verdict(!r4.ok&&r4.reason==='has-deeper-object')}] 点击 MiniProject -> ${r4.ok?'自动渲染（不应发生）':'reason='+r4.reason}`);

log('\n=== 5. 点击 MiniProject 内的叶子任务 ===');
const r5=await click(leaf.uuid);
const s5=await settle();
log(`[${verdict(r5.ok&&s5.root===leaf.uuid)}] 视图根 = 叶子任务 ${short(s5.root)}`);
const chain=(s5.objectChain||[]).map(c=>c.title);
log(`[${verdict(chain.length===4)}] 面包屑穿过 [阶段性目标]/[事项] 到 MiniProject，共 ${chain.length} 层：`);
for(const t of chain)log('    · '+JSON.stringify(t));

log('\n=== 6. 面包屑点击：逐层回到上级（不自动展开更深处）===');
const levels=s5.objectChain||[];
for(const lv of [levels[0],levels[1]]){
  const r=await call({type:'object-focus',uuid:lv.uuid,reason:'breadcrumb'});
  const st=await settle();
  log(`[${verdict(r.ok&&st.root===lv.uuid)}] 点击面包屑「${lv.title.slice(0,20)}…」-> 视图根 = ${short(st.root)}（${st.items.length} 行，面包屑 ${(st.objectChain||[]).length} 层）`);
}

log('\n=== 7. 同级对象点击即切换 ===');
await focus(ROOT);
const r7=await click(note.uuid);
const s7=await state();
log(`[${verdict(!r7.ok)}] 同级 [注] 不是对象 -> ${r7.reason}`);
const r8=await click(task.uuid);
const s8=await settle();
log(`[${verdict(r8.ok&&s8.root===task.uuid)}] 点击另一个任务对象 -> 切换视图到 ${short(s8.root)}`);

log('\n=== 8. 清理夹具 ===');
await focus(ROOT);
const s9=await state();
const fixtures=s9.blocks.filter(b=>!b.missing&&(b.content.includes('夹具')||b.content.includes('模板骨架')||b.content.includes('列出模板章节')||b.content.includes('章节名先用占位')||b.content.includes('可复用的采购附件模板')||b.content.includes('确定模板结构')));
log('待删夹具块: '+fixtures.length);
for(const b of fixtures){const d=await call({type:'delete-object',confirm:true,uuid:b.uuid});log('  删除 '+(b.task||b.role||'text').padEnd(12)+short(b.uuid)+' -> '+(d.ok?'ok':d.reason));await sleep(250)}
const s10=await settle(3000);
log(`[${verdict(!s10.blocks.some(b=>!b.missing&&b.content.includes('夹具')))}] 夹具已清理（视图 ${s10.items.length} 行，含历史占位）`);

await writeFile('evidence/presentation/agent-object/object-focus.txt',out.join('\n')+'\n');
await writeFile('evidence/presentation/agent-object/final-state.json',JSON.stringify(s10,null,2));
