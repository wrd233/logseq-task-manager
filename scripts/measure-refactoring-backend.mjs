import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync,mkdirSync} from 'node:fs';
import console from 'node:console';
import Database from 'better-sqlite3';
import {Kernel} from '@task-copilot/kernel';
import {parseSemanticOperation} from '@task-copilot/contracts';
import {ClosureReadiness} from '../apps/kernel-service/src/closure-readiness.ts';
const commit='9293ad6';
mkdirSync('tmp/round0203',{recursive:true});
const beforeProjection=execFileSync('git',['show',`${commit}:apps/kernel-service/src/projection-coordinator.ts`],{encoding:'utf8'});
const beforeStore=execFileSync('git',['show',`${commit}:packages/sqlite/src/index.ts`],{encoding:'utf8'});
for(const [name,contents,dir]of [['projection-before',beforeProjection,'apps/kernel-service/src'],['store-before',beforeStore,'packages/sqlite/src']])await build({stdin:{contents,resolveDir:resolve(dir),sourcefile:`${name}.ts`,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:`tmp/round0203/${name}.mjs`});
const {SqliteStore:BeforeStore}=await import('../tmp/round0203/store-before.mjs');
const {SqliteStore:AfterStore}=await import('../packages/sqlite/src/index.ts');
const {ProjectionCoordinator:BeforeProjection}=await import('../tmp/round0203/projection-before.mjs');
const {ProjectionCoordinator:AfterProjection}=await import('../apps/kernel-service/src/projection-coordinator.ts');
const at='2026-10-01T00:00:00Z';
const seedStore=new AfterStore(':memory:');
const seedKernel=new Kernel(seedStore,{now:()=>at});
const seedCommit=seedKernel.commitFormal(parseSemanticOperation({operationId:'bench',type:'CREATE_WORK_OBJECT',actor:{type:'USER',id:'local-user'},input:{kind:'TASK',title:'bench',anchor:{graphId:'graph',blockUuid:'bench',sourceContentHash:'a1b2c3d4'}}}),{graphId:'graph',sourceBlockUuid:'bench',sourceContentHash:'a1b2c3d4',projection:null}).commit;
seedStore.close();
const output={method:'300 TASK objects; actual SQLite prepare calls during each request, Node20/macOS arm64; no hard elapsed-time assertions',before:{},after:{}};
for(const [name,Store,Projection]of [['before',BeforeStore,BeforeProjection],['after',AfterStore,AfterProjection]]){
 const store=new Store(':memory:');
 for(let i=0;i<300;i++)store.putWorkObject({id:`object-${i}`,kind:'TASK',title:`object-${i}`,lifecycle:'OPEN',engagement:'ACTIONABLE',waitingCondition:null,currentFocus:null,desiredOutcome:null,completionChecks:[],version:1,createdAt:at,updatedAt:at});
 for(let i=0;i<300;i++)store.insertCommit({...seedCommit,id:`commit-${i}`,targetId:`object-${i}`,after:store.getWorkObject(`object-${i}`)});
 const kernel=new Kernel(store,{now:()=>at});
 const maintenance={coverage:()=>null,jobs:()=>[],isPaused:()=>false};
 const closure={jobs:()=>[],requestAssessment:()=>{}};
 const readiness=name==='before'?closure:new ClosureReadiness(store,closure,()=>at);
 const query=new Projection(store,kernel,{listRuns:()=>[]},maintenance,{status:()=>({available:false})},readiness,{now:()=>at});
 let statements=0,commits=0,ownerships=0,getObjects=0,scannedCommits=0;
 const prepare=Database.prototype.prepare;
 Database.prototype.prepare=function(...args){statements++;return prepare.apply(this,args);};
 const wrap=(method,inc)=>{const fn=store[method].bind(store);store[method]=(...args)=>{inc();return fn(...args);};};
 const listCommits=store.listCommits.bind(store);store.listCommits=(...args)=>{commits++;const rows=listCommits(...args);scannedCommits+=rows.length;return rows;};wrap('listOwnerships',()=>ownerships++);wrap('getWorkObject',()=>getObjects++);
 async function measure(key,fn){statements=commits=ownerships=getObjects=scannedCommits=0;await fn();output[name][key]={sqlStatements:statements,commitCollections:commits,ownershipCollections:ownerships,getWorkObjectCalls:getObjects,scannedCommits};}
 try{
  await measure('listWorkObjects',()=>store.listWorkObjects());
  await measure('now',()=>query.now());
  await measure('objectContext',()=>query.objectContext('object-0'));
  await measure('markViewed',()=>kernel.reading.markViewed('object-0'));
 }finally{Database.prototype.prepare=prepare;store.close();}
}
writeFileSync('tmp/round0203/backend-workload.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
