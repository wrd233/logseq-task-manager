// Minimal semantic collaboration over the work view.
// The Agent reads material, proposes a relation/answer WITH source citations,
// then the proposal is invalidated if the source changed. Nothing is written
// back to Logseq; this script only reads and prints.
import {writeFile,mkdir} from 'node:fs/promises';
import {inspect,liveState} from './agent-client.mjs';
import {agentContext,checkAgentPatch,parse} from './model.mjs';

const out=[];const log=(...a)=>{const line=a.join(' ');out.push(line);console.log(line)};
const short=(u)=>u.split("-").slice(-1)[0];
const d=await inspect();const s=d.snapshot;
const q=await liveState({graph:s.graph,root:s.root});
if(!q.ok)throw new Error('view query failed: '+q.reason);
const st=q.state;
await mkdir('evidence/presentation/agent-semantic',{recursive:true});
await writeFile('evidence/presentation/agent-semantic/scope.json',JSON.stringify({snapshot:s,state:st},null,2));

log('=== A. material the Agent can actually read ===');
log('scope: graph='+s.graph+' root='+short(s.root)+' page='+JSON.stringify(st.page)+' items='+st.items.length);
const block=(u)=>st.blocks.find(b=>b.uuid===u);
const items=st.items.map(i=>({...i,block:block(i.uuid)}));
for(const it of items){
  const b=it.block;
  log(`  ${short(it.uuid)} view:v${it.depth} src:s${b.sourceDepth} role=${(b.role||'-').padEnd(4)} task=${(b.task||'-').padEnd(5)} editing=${b.editing?1:0} | ${JSON.stringify(b.content.split('\n')[0])}`);
}
log('note: view depth and source depth already disagree for '+items.filter(i=>i.block.sourceDepth!==i.depth).length+' item(s) — the user organized reading order, not source order.');

log('\n=== B. locate the [问一下] case and its neighbours ===');
const question=st.blocks.find(b=>b.role==='问一下');
const parentTodo=st.blocks.find(b=>b.uuid===question.sourceParent);
const viewParent=st.items[st.items.findIndex(i=>i.uuid===question.uuid)-1];
log('question  '+short(question.uuid)+' v'+st.items.find(i=>i.uuid===question.uuid).depth+' srcParent='+short(question.sourceParent)+' :: '+JSON.stringify(question.content.split('\n')[0]));
log('source parent block  '+short(parentTodo.uuid)+' :: '+JSON.stringify(parentTodo.content.split('\n')[0]));
log('view parent is a DIFFERENT block: '+short(viewParent.uuid)+' :: '+JSON.stringify(block(viewParent.uuid).content.split('\n')[0]));
log('=> view hierarchy (reading order) and source hierarchy (ownership) must be kept apart; the agent must not read the view parent as the task owner.');
const notes=st.blocks.filter(b=>b.role==='注');
log('candidate [注] blocks: '+notes.map(n=>short(n.uuid)).join(', '));
const idea=st.blocks.find(b=>b.role==='想法');
const status=st.blocks.find(b=>b.role==='现状');

log('\n=== C. proposal with citations (no LLM call; deterministic reading of the material) ===');
const cite=(b)=>`(( ${short(b.uuid)} )) ${JSON.stringify(b.content.split('\n')[0])}`;
const proposal={
  id:'prop-'+Date.now().toString(36),
  kind:'answer-suggestion',
  question:{uuid:question.uuid,content:question.content,sourceParent:question.sourceParent},
  suggestion:'“是否需要附项目背景？”更可能是在问：附件里要不要补一段项目背景说明。上下文里已经有一条同类附件处理记录，可作为回答依据；它没有说明背景是否必需，所以只能作为“可参考”，不能当成结论。',
  evidence:[
    {uuid:status.uuid,quote:status.content.split('\n')[0],why:'说明附件正在按差异整理，属于同一批交付物'},
    {uuid:notes[0]?.uuid,quote:notes[0]?.content.split('\n')[0],why:'已经有一条按分类拆分附件的处理记录，涉及附件组织方式'},
    {uuid:idea.uuid,quote:idea.content.split('\n')[0],why:'作者想积累常用表述，说明背景段落属于可复用文本'},
  ].filter(e=>e.uuid),
  nonClaims:['不判定问题已解决','不判定谁负责回答','不改写原文','不建立任务归属'],
};
log('proposal '+proposal.id+' kind='+proposal.kind);
log('  suggestion: '+proposal.suggestion);
for(const e of proposal.evidence)log('  evidence: '+cite(block(e.uuid))+' | why: '+e.why);
log('  explicit non-claims: '+proposal.nonClaims.join(' / '));

log('\n=== D. can the Agent locate each cited block back in Logseq? ===');
for(const e of proposal.evidence){
  const b=block(e.uuid);
  log(`  cite ${short(e.uuid)} -> in current work view: ${!!b}; source parent ${b?short(b.sourceParent):'-'}; role ${b?b.role:'-'}`);
}

log('\n=== E. eligibility check before acting on the proposal ===');
const snapshot={graph:s.graph,root:s.root,instance:s.instance,seq:s.seq,rows:s.rows,draft:s.draft};
const patch={graph:s.graph,uuid:question.uuid,expectedContent:question.content,expectedSourceParent:question.sourceParent};
const outcome=checkAgentPatch(snapshot,patch);
log('checkAgentPatch(question) = '+outcome);
log('proposal is therefore '+(outcome==='eligible-for-review'?'admissible as a suggestion':'NOT admissible — must re-read source first'));

const ctx=agentContext(snapshot,st.items);
log('\n=== F. context envelope handed to the Agent ===');
log('policy: '+ctx.policy);
log('blocks in envelope: '+ctx.blocks.length+' | presentation rows: '+ctx.presentation.length);
const qb=ctx.blocks.find(b=>b.uuid===question.uuid);
log('question envelope: task='+qb.semantics.task+' role='+qb.semantics.role+' kind='+qb.semantics.kind+' editing='+qb.editing+' sourceParent='+short(qb.sourceParent));
log('envelope size: '+JSON.stringify(ctx).length+' bytes for '+ctx.blocks.length+' blocks ('+Math.round(JSON.stringify(ctx).length/ctx.blocks.length)+' bytes/block)');

await writeFile('evidence/presentation/agent-semantic/proposal.json',JSON.stringify({proposal,outcome,envelope:{blocks:ctx.blocks.length,presentation:ctx.presentation.length,bytes:JSON.stringify(ctx).length,policy:ctx.policy}},null,2));
await writeFile('evidence/presentation/agent-semantic/semantic.txt',out.join('\n')+'\n');
log('\nwritten: evidence/presentation/agent-semantic/');
