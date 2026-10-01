#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {current,sendOp} from './agent-client.mjs';
const [command,arg]=process.argv.slice(2);
const output=x=>console.log(JSON.stringify(x,null,2));
try {
 if(command==='read') output(await current());
 else if(command==='op') {
   const request=JSON.parse(arg==='-' ? await (async()=>{let text='';for await(const chunk of process.stdin)text+=chunk;return text})() : await readFile(arg,'utf8'));
   if(['sync-source','sync-preview'].includes(request.op?.type))throw Error('Use sync-preview / sync-apply');
   const result=await sendOp(request.op,request);output(result);if(!result.ok)process.exitCode=1;
 } else if(command==='sync-preview') {
   if(!arg)throw Error('Provide output plan file');
   const now=await current();if(!now.ok||!now.state)throw Error(now.reason??'no-view');
   const result=await sendOp({type:'sync-preview'},now.state);
   if(!result.ok)throw Error(result.reason);
   await writeFile(arg,JSON.stringify(result,null,2),{mode:0o600});
   output({ok:true,file:arg,root:result.plan.root,blocks:result.blocks.length,changed:JSON.stringify(result.before)!==JSON.stringify(result.plan.items),message:'Review before and plan.items; sync-apply explicitly moves original Logseq blocks.'});
 } else if(command==='sync-apply') {
   const {plan}=JSON.parse(await readFile(arg,'utf8'));
   const result=await sendOp({type:'sync-source',plan},{...plan,timeoutMs:120000});
   output(result);if(!result.ok)process.exitCode=1;
 } else throw Error('Usage: node work-view.mjs read | op request.json | sync-preview plan.json | sync-apply plan.json');
} catch(e){console.error(e.message);process.exitCode=1;}
