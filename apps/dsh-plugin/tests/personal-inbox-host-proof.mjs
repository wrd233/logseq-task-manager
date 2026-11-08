// Opt-in proof using the locally installed DSH Cordis SDK. No real Graph or model calls.
import assert from 'node:assert/strict';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp, realpath, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import * as plugin from '../src/index.mjs';

const [phase, root] = process.argv.slice(2);
if (!phase) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'inbox-dsh-sdk-')));
  try {
    for (const step of ['seed', 'restart']) execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), step, directory], {
      env:{...process.env, DSH_HOME:directory, PERSONAL_INBOX_HOME:join(directory,'personal')}, stdio:'inherit', timeout:30000,
    });
    process.stdout.write('PASS: isolated DSH Cordis SDK process restart; 15 test records retained; no Session/Work/Graph dependency.\n');
  } finally {await rm(directory,{recursive:true,force:true});}
} else {
  assert.ok(['seed','restart'].includes(phase));
  const packageRoot = process.env.DSH_PACKAGE_ROOT ?? join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'@deepseek-ai/dsh');
  const require = createRequire(join(packageRoot,'package.json'));
  const load = name => import(require.resolve(name));
  const {Context} = await load('@deepseek-ai/cordis');
  const {default:SystemPrompt} = await load('@deepseek-ai/dsh-system-prompt');
  const {default:Tools} = await load('@deepseek-ai/dsh-tools');
  const ctx = new Context(), routes = new Map();
  let sessionReads = 0;
  try {
    await ctx.plugin(SystemPrompt,{}); await ctx.plugin(Tools,{});
    await ctx.plugin({name:'inbox-proof-host-adapter',apply(host){
      host.reflect.provide('connection',{fetch:{register(route){
        routes.set(route.path,route);return ()=>{routes.delete(route.path);};
      }}});
      host.reflect.provide('workspaceController',{});
      host.reflect.provide('workspaceRegistry',{archivedSessionIds:[]});
      host.reflect.provide('sessionController',{inspect:async()=>{sessionReads++;throw Error('No active Session in this proof');}});
    }});
    const fiber = await ctx.plugin(plugin,{bindingStateDirectory:join(root,`profile-${phase}`),workspaceStateDirectory:join(root,'companion-offline')});
    await fiber.await();
    const rpc = async (method,payload) => {
      const rpcId = randomUUID(), route = routes.get(`/api/logseq-workbench/${method}`);
      assert.ok(route,`${method} registered in actual Cordis SDK`);
      const response = await route.fetch(new globalThis.Request(`http://localhost${route.path}`,{method:'POST',body:JSON.stringify({
        type:'client-request',rpcId,method:`logseq-workbench/${method}`,payload,
      })}));
      const answer=await response.json();assert.equal(answer.rpcId,rpcId);assert.equal(answer.result.ok,true,JSON.stringify(answer.result));
      return answer.result.value;
    };
    if(phase==='seed') {
      const ids=[];
      for(let index=0;index<15;index++) {
        const item=await rpc('inbox-create',{id:randomUUID(),originalContent:`测试记录 ${index}：保留原文`,source:{type:index%2?'flomo':'dsh'}});
        ids.push(item.id);
      }
      const first=await rpc('inbox-get',{id:ids[0]});
      await rpc('inbox-update',{id:first.id,revision:first.revision,patch:{context:'进程重启前保存的补充背景'}});
      const second=await rpc('inbox-get',{id:ids[1]});
      const resolved=await rpc('inbox-update',{id:second.id,revision:second.revision,patch:{status:'resolved'}});
      await rpc('inbox-archive',{id:resolved.id,revision:resolved.revision});
      await writeFile(join(root,'expected.json'),JSON.stringify(ids));
    } else {
      const ids=JSON.parse(await readFile(join(root,'expected.json'),'utf8'));
      assert.equal((await rpc('inbox-list',{status:'all'})).items.length,15);
      assert.equal((await rpc('inbox-list',{})).items.length,14);
      const first=await rpc('inbox-get',{id:ids[0]});
      assert.equal(first.originalContent,'测试记录 0：保留原文');assert.equal(first.context,'进程重启前保存的补充背景');
      const archived=await rpc('inbox-get',{id:ids[1]});
      assert.equal((await rpc('inbox-restore',{id:archived.id,revision:archived.revision})).status,'resolved');
      assert.equal((await rpc('inbox-export',{})).items.length,15);
      assert.equal((await rpc('inbox-list',{query:'补充背景'})).items.length,1);
    }
    assert.equal(sessionReads,0,'independent CRUD must not inspect a Session or its Work');
    await fiber.dispose();
    assert.equal(routes.has('/api/logseq-workbench/inbox-list'),false,'host unload releases RPC routes');
    const reloaded = await ctx.plugin(plugin,{bindingStateDirectory:join(root,`profile-${phase}`),workspaceStateDirectory:join(root,'companion-offline')});
    await reloaded.await();
    assert.equal((await rpc('inbox-list',{status:'all'})).items.length,15,'plugin reload retains application records');
    await reloaded.dispose();
    assert.equal(routes.has('/api/logseq-workbench/inbox-list'),false);
    process.stdout.write(`PASS: ${phase}, DSH SDK ${JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8')).version}\n`);
  } finally {await ctx.fiber.dispose();}
}
