// Uses the actual governed external Agent program, never a USER token or SDK
// injection, to create one real formal focus field for boundary acceptance.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(repo,'tmp/reading-desktop'),m=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),exec=promisify(execFile),path=join(m.evidence,'formal-focus-exercise.json');
if(m.root!==root||!m.graph.startsWith(root+'/'))throw Error('Owned acceptance identity required');
const cli=async words=>JSON.parse((await exec(process.execPath,['--import','tsx',join(repo,'apps/task-copilot-cli/src/main.ts'),...words,'--json'],{cwd:repo,env:{...process.env,TASK_COPILOT_DESCRIPTOR:join(root,'kernel/kernel.json')},timeout:30000})).stdout);
if(process.argv[2]==='replay'){
  const record=JSON.parse(await readFile(path)),sha=v=>createHash('sha256').update(v).digest('hex'),graphFile=join(m.graph,'pages/合成阅读与协作.md');
  if(record.applied?.commit?.actor?.type!=='AGENT'||!record.finished?.proposal?.id)throw Error('A completed actual governed focus is required');
  const before=await cli(['object','show',record.objectId]),beforeHash=sha(await readFile(graphFile)),result=await cli(['proposal','apply',record.finished.proposal.id,'--wait']),after=await cli(['object','show',record.objectId]),afterHash=sha(await readFile(graphFile));
  if(result.commit?.id!==record.applied.commit.id||result.projectionObligation?.status!=='VERIFIED'||JSON.stringify(before.object)!==JSON.stringify(after.object)||beforeHash!==afterHash)throw Error('Formal proposal replay changed its result, business state or Graph');
  record.replay={at:new Date().toISOString(),result,before,after,beforeHash,afterHash,sameCommit:true,formalStateUnchanged:true,graphUnchanged:true};await writeFile(path,JSON.stringify(record,null,2));console.log(JSON.stringify({sameCommit:true,formalStateUnchanged:true,graphUnchanged:true}));process.exit(0);
}
if(process.argv[2]&&process.argv[2]!=='first')throw Error('Use first or replay');
const registration=JSON.parse(await readFile(join(m.evidence,'formal-storage-exercise.json'))),view=registration.views.find(v=>v.anchor.externalId==='b7261007-0000-4000-8000-000000000002');if(!view)throw Error('Actual registered transaction source required');
const objectId=view.object.id,guide=await cli(['agent','bootstrap']),skill=await cli(['skill','show','current-focus-maintenance']),source=await cli(['graph','block','show','b7261007-0000-4000-8000-000000000008']);
const record={at:new Date().toISOString(),objectId,guide,skill,source,before:await cli(['object','show',objectId])};await writeFile(path,JSON.stringify(record,null,2));
record.evidence=await cli(['evidence','freeze','--object',objectId,'--block','b7261007-0000-4000-8000-000000000008','--id','formal-boundary-focus-evidence']);await writeFile(path,JSON.stringify(record,null,2));
const evidenceId=record.evidence.evidence.id;record.run=await cli(['agent-run','start','--purpose','current-focus','--object',objectId,'--evidence',evidenceId,'--executor-id','codex','--id','formal-boundary-focus-run']);await writeFile(path,JSON.stringify(record,null,2));
const result={outcome:'PROPOSAL',currentFocus:'先验证取消条款和恢复过程，再决定是否长期采用；尚未询问提供方是否有附加限制。',reasonCode:'SYNTHETIC_BOUNDARY_ACCEPTANCE',rationaleSummary:'使用原记录的核验步骤与未询问限制；仅维护正式当前推进，不改变项目完成、普通待办或用户认可。'},resultPath=join(m.evidence,'formal-focus-result.json');await writeFile(resultPath,JSON.stringify(result));
record.finished=await cli(['agent-run','finish',record.run.run.id,'--result-file',resultPath]);await writeFile(path,JSON.stringify(record,null,2));if(!record.finished.proposal?.id)throw Error('Actual narrow current-focus proposal required');
record.applied=await cli(['proposal','apply',record.finished.proposal.id,'--wait']);record.after=await cli(['object','show',objectId]);await writeFile(path,JSON.stringify(record,null,2));
if(record.applied.commit?.actor?.type!=='AGENT'||record.applied.projectionObligation?.status!=='VERIFIED'||record.after.object.currentFocus!==result.currentFocus||record.after.object.lifecycle!=='OPEN')throw Error('Actual AGENT formal commit, verified projection or unchanged lifecycle not observed');
console.log(JSON.stringify({objectId,actor:record.applied.commit.actor.type,commit:record.applied.commit.id,focusUuid:record.after.anchor.projectionFocusUuid,lifecycle:record.after.object.lifecycle}));
