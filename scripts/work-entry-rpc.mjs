/* global fetch */
import process from "node:process";
import console from "node:console";
import {URL} from "node:url";
// Real authenticated production HTTP RPC; no browser state or host method injection.
import {readFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=resolve('tmp/work-entry-desktop');
const descriptor=JSON.parse(await readFile(join(root,'channel/dsh-browser.json'),'utf8'));
const url=new URL(descriptor.url),auth=await fetch(url,{redirect:'manual'});
const cookie=auth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const method=process.argv[2],payload=JSON.parse(process.argv[3]??'{}');
if(method==='credentials/set'||method==='credentials/unset')throw Error('Credential writes must use native settings, never this evidence recorder');
const target=new URL(`/api/${method}`,url);target.search='';
const response=await fetch(target,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload})});
const result=await response.json();
await appendFile(join(root,'evidence/rpc.jsonl'),JSON.stringify({time:new Date().toISOString(),method,payload,status:response.status,result})+'\n',{mode:0o600});
console.log(JSON.stringify(result));
