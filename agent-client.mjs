// Agent-side structured client for the work view. Talks only to the local relay;
// Only explicit sync-source operations change source organization.
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
const {port,token}=JSON.parse(await readFile(new URL('./runtime.json',import.meta.url),'utf8'));
const base=`http://127.0.0.1:${port}`;
const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});return r.status}
export async function inspect(){const r=await fetch(base+'/inspect',{headers});const d=await r.json();
  // Scope is exposed flat so callers can pass the whole inspect result as the scope
  // ({...d}) without silently losing graph/root.
  return {...d,graph:d.snapshot?.graph??null,root:d.snapshot?.root??null,instance:d.snapshot?.instance??null};}
export async function sendOp(op,{graph,root,timeoutMs=4000}={}){
  if(!graph||!root)throw new Error('sendOp requires an explicit scope: {graph, root} (got graph='+JSON.stringify(graph)+' root='+JSON.stringify(root)+')');
  const id='op-'+Math.random().toString(36).slice(2,10);
  const status=await post('/view-ops',{id,graph,root,op,at:Date.now()});
  if(status!==204)return {id,ok:false,reason:'relay-http-'+status};
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const d=await inspect();
    const hit=(d.viewResults??[]).find(x=>x.id===id);
    if(hit)return hit;
    await sleep(120);
  }
  return {id,ok:false,reason:'timeout-no-plugin-response'};
}
export async function state(){const d=await inspect();const t=(d.telemetry??[]).at(-1)??null;return {snapshot:d.snapshot,telemetryLast:t,viewOpsPeers:d.viewOps??0,commandsPeers:d.commands??0,viewResults:(d.viewResults??[]).slice(-3)}}
// Scope can change while the agent works (clicks, breadcrumbs, scope op) and the relay's
// snapshot lags behind. Read the live scope from the freshest telemetry heartbeat instead.
export async function scope(){const d=await inspect();const t=(d.telemetry??[]).at(-1)??null;
  return {graph:t?.graph??d.graph,root:t?.root??d.root,instance:t?.instance??d.instance};}
// One-shot op against the live scope, so callers cannot use a stale root by accident.
// A scope change (click/breadcrumb/scope op) races with the relay heartbeat, so a
// root-mismatch is retried once against a freshly read scope.
export async function call(op,opts={}){
  const s=await scope();const first=await sendOp(op,{...s,...opts});
  if(first.reason!=='root-mismatch'||!['query','current'].includes(op.type))return first;
  const s2=await scope();return sendOp(op,{...s2,...opts});
}
// Read the plugin's CURRENT view without asserting a root (scope-change race safe).
export async function current(){const s=await scope();return sendOp({type:'current'},{graph:s.graph,root:s.root});}
export async function liveState(scopeArg){return scopeArg?sendOp({type:'query'},scopeArg):current()}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
const [, , cmd, ...rest] = process.argv;
if(cmd==='inspect'){console.log(JSON.stringify(await inspect(),null,2))}
else if(cmd==='state'){
  const d=await state();
  const s=d.snapshot;
  console.log(JSON.stringify({instance:s?.instance,graph:s?.graph,root:s?.root,page:s?.page,rows:s?.rows?.length,kind:s?.kind,seq:s?.seq,viewOpsPeers:d.viewOpsPeers,commandsPeers:d.commandsPeers,telemetryLast:d.telemetryLast&&{at:d.telemetryLast.at,visible:d.telemetryLast.visible,items:d.telemetryLast.layout?.items?.length,selected:d.telemetryLast.layout?.selected}},null,2));
}
else if(cmd==='query'){
  const s=d=>console.log(JSON.stringify(d,null,2));
  const d=await inspect();s(await liveState({graph:d.snapshot?.graph,root:d.snapshot?.root}));
}
else if(cmd==='op'){
  const d=await inspect();const op=JSON.parse(rest.join(' '));
  console.log(JSON.stringify(await sendOp(op,{graph:d.snapshot?.graph,root:d.snapshot?.root}),null,2));
}
else console.log('usage: node agent-client.mjs inspect|state|query|op \'{"type":...}\'');

}
