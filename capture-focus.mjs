import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {port,token}=JSON.parse(await readFile('runtime.json','utf8'));const d=await (await fetch(`http://127.0.0.1:${port}/inspect`,{headers:{Authorization:'Bearer '+token}})).json();
const fixture=JSON.parse(await readFile('evidence/object-focus/fixture.json','utf8'));const [name,key,held]=process.argv.slice(2);const s=d.snapshot;
if(key)assert.equal(s.root,fixture.ids[key]);if(held)assert.equal(s.held,held==='auto'?null:held);
await writeFile('evidence/object-focus/'+name+'.json',JSON.stringify(d,null,2));
console.log(JSON.stringify({case:name,root:Object.entries(fixture.ids).find(([,v])=>v===s.root)?.[0],held:s.held,chain:s.objectChain?.map(x=>x.title),rows:s.rows.length,focus:Object.entries(fixture.ids).find(([,v])=>v===s.focus)?.[0]},null,2));
