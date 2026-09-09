// Source-locate and staleness re-judgement, driven from the Agent side.
import {writeFile,mkdir} from 'node:fs/promises';
import {inspect,sendOp,liveState} from './agent-client.mjs';
import {checkAgentPatch} from './model.mjs';

const out=[];const log=(...a)=>{const line=a.join(' ');out.push(line);console.log(line)};
const short=(u)=>u.split('-').slice(-1)[0];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const relay=async()=>{const d=await inspect();return {graph:d.snapshot?.graph,root:d.snapshot?.root,instance:d.snapshot?.instance}};
const view=async()=>{const d=await relay();const r=await liveState(d);if(!r.ok)throw new Error('query failed: '+r.reason);return r.state};
await mkdir('evidence/presentation/agent-semantic',{recursive:true});

log('=== G. Agent-initiated source locate ===');
const d0=await relay();const st0=await view();
const question=st0.blocks.find(b=>b.role==='问一下');
const note=st0.blocks.find(b=>b.role==='注');
for(const target of [question,note]){
  const r=await sendOp({type:'locate',uuid:target.uuid},d0);
  log(`[${r.ok?'PASS':'FAIL'}] locate ${short(target.uuid)} role=${target.role} -> ok=${r.ok}${r.reason?' reason='+r.reason:''}`);
}
const bad=await sendOp({type:'locate',uuid:'00000000-0000-0000-0000-000000000000'},d0);
log(`[${bad.ok===false?'PASS':'FAIL'}] locate unknown uuid refused -> ${bad.reason}`);
const otherRoot=await sendOp({type:'locate',uuid:question.uuid},{graph:d0.graph,root:'00000000-0000-0000-0000-000000000000'});
log(`[${otherRoot.reason==='root-mismatch'?'PASS':'FAIL'}] locate with wrong root refused -> ${otherRoot.reason}`);
await writeFile('evidence/presentation/agent-semantic/locate.json',JSON.stringify({results:{question:short(question.uuid),note:short(note.uuid),bad,otherRoot}},null,2));

log('\n=== H. the proposal, recorded with its exact source revision ===');
const baseline=await view();
const q0=baseline.blocks.find(b=>b.role==='问一下');
const snapshot=await inspect();
const snap={graph:snapshot.snapshot.graph,root:snapshot.snapshot.root,instance:snapshot.snapshot.instance,seq:snapshot.snapshot.seq,rows:snapshot.snapshot.rows,draft:snapshot.snapshot.draft};
const patch={graph:snap.graph,uuid:q0.uuid,expectedContent:q0.content,expectedSourceParent:q0.sourceParent};
log('proposal cites question revision: '+JSON.stringify(q0.content.split('\n')[0]));
log('pre-check: '+checkAgentPatch(snap,patch));

log('\n=== I. source changes underneath (external edit to the same block) ===');
log('editing the real page file so Logseq sees an external change, then waiting for the view to catch up...');
const {execFile}=await import('node:child_process');
await new Promise((res,rej)=>execFile('python3',['-c',`
import io,re
p='../logseq/pages/工作视图试验 2026-09-08.md'
s=io.open(p,encoding='utf-8').read()
assert '是否需要附项目背景？' in s
s=s.replace('是否需要附项目背景？','是否需要附项目背景？还是先只发附件清单？')
io.open(p,'w',encoding='utf-8').write(s)
print('edited')
`],(e,so,se)=>{if(e)return rej(new Error(se));log('  '+so.trim());res()}));
let changed=null;
for(let i=0;i<30;i++){
  await sleep(1000);
  const st=await view();
  const q=st.blocks.find(b=>b.uuid===q0.uuid);
  if(q&&q.content!==q0.content){changed={after:q.content,waitedMs:(i+1)*1000};break}
}
if(!changed){log('[FAIL] view never observed the source change within 30s');}
else{
  log(`[PASS] view observed the change after ~${changed.waitedMs}ms`);
  log('  new revision: '+JSON.stringify(changed.after.split('\n')[0]));
  const snap2=await inspect();
  const snap2v={graph:snap2.snapshot.graph,root:snap2.snapshot.root,instance:snap2.snapshot.instance,seq:snap2.snapshot.seq,rows:snap2.snapshot.rows,draft:snap2.snapshot.draft};
  const outcome=checkAgentPatch(snap2v,patch);
  log(`[${outcome==='stale-source'?'PASS':'FAIL'}] re-check of the old proposal -> ${outcome}`);
  const qNow=(await view()).blocks.find(b=>b.uuid===q0.uuid);
  const refreshed={...patch,expectedContent:qNow.content};
  const outcome2=checkAgentPatch(snap2v,refreshed);
  log(`[${outcome2==='eligible-for-review'?'PASS':'FAIL'}] re-read + new revision -> ${outcome2}`);
  const parsed=await import('./model.mjs').then(m=>m.parse(qNow.content));
  log('  re-parsed role of changed block: '+parsed.role+' task='+parsed.task+' (label survived the edit: '+(parsed.role==='问一下')+')');
  await writeFile('evidence/presentation/agent-semantic/staleness.json',JSON.stringify({before:q0.content,after:qNow.content,observedAfterMs:changed.waitedMs,oldProposalOutcome:outcome,refreshedOutcome:outcome2,reparsed:{role:parsed.role,task:parsed.task,kind:parsed.kind}},null,2));
  log('\n=== J. restore the source text ===');
  await new Promise((res,rej)=>execFile('python3',['-c',`
import io
p='../logseq/pages/工作视图试验 2026-09-08.md'
s=io.open(p,encoding='utf-8').read()
s=s.replace('是否需要附项目背景？还是先只发附件清单？','是否需要附项目背景？')
io.open(p,'w',encoding='utf-8').write(s)
print('restored')
`],(e,so,se)=>{if(e)return rej(new Error(se));log('  '+so.trim());res()}));
  let back=false;
  for(let i=0;i<20;i++){await sleep(1000);const q=(await view()).blocks.find(b=>b.uuid===q0.uuid);if(q&&q.content===q0.content){back=true;log('  [PASS] view returned to the original text');break}}
  if(!back)log('  [FAIL] view did not return to the original text within 20s');
}
await writeFile('evidence/presentation/agent-semantic/locate-staleness.txt',out.join('\n')+'\n');
