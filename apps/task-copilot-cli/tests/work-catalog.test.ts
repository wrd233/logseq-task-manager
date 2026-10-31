import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startWorkspaceServer} from '../src/workspace-server.ts';
import {readCatalog} from '../src/work-catalog.ts';

test('private metadata publication requires plugin authentication and never creates a body connection',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'catalog-http-'))),server=await startWorkspaceServer({stateDirectory:join(root,'private')});
  const snapshot={schemaVersion:1,graphId:'g',graphName:'g',refreshedAt:Date.now(),works:[]};
  const post=(headers:Record<string,string>,input:unknown)=>fetch(server.descriptor.baseUrl+'/plugin/catalog',{method:'POST',headers:{'content-type':'application/json','x-workspace-instance':server.descriptor.instanceId,...headers},body:JSON.stringify(input)});
  try {
    assert.equal((await post({authorization:`Bearer ${server.descriptor.token}`},snapshot)).status,401);
    assert.equal((await post({'x-workspace-plugin':server.descriptor.pluginToken},{...snapshot,grant:'old-grant'})).status,400);
    assert.equal((await post({'x-workspace-plugin':server.descriptor.pluginToken},snapshot)).status,200);
    assert.deepEqual(await readCatalog(join(root,'private')),[snapshot]);
    assert.equal(server.broker.binding,null);assert.equal(server.broker.online(),false);
  } finally {await server.close();await rm(root,{recursive:true,force:true});}
});
