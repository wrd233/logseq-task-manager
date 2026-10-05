/** Production transport exercise, only for the explicitly prepared synthetic fixture. */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import process from "node:process";
import console from "node:console";
const [cliPath,directory,state,fixturePath]=process.argv.slice(2);
if(!cliPath||!directory||!state||!fixturePath)throw Error("Pass built CLI, synthetic work directory, private state and fixture JSON.");
const fixture=JSON.parse(await readFile(fixturePath,"utf8"));
if(fixture.synthetic!==true)throw Error("Only the explicitly prepared synthetic fixture is supported.");
const execute=promisify(execFile),files=await mkdtemp(join(tmpdir(),"review-cli-"));
const client="synthetic-review-demo";
const call=async args=>JSON.parse((await execute(process.execPath,[cliPath,"workspace",...args,"--directory",directory,"--state-dir",state,"--client",client,"--json"],{maxBuffer:8_000_000})).stdout);
const read=()=>call(["content","read"]);
const input=async(name,value)=>{const path=join(files,name+".json");await writeFile(path,JSON.stringify(value),{mode:0o600});return path;};
await call(["refresh"]);
let source=await read();
if(source.scope.rootUuid!==fixture.root)throw Error("Connected scope differs from the synthetic fixture.");
const current=()=>call(["stage","read","--input-file",stageRead]);
const stageRead=await input("stage-read",{});
const submit=async(name,operations,schemaVersion)=>{
  const stage=await current(),requestId=randomUUID();
  const path=await input(name,{stageId:stage.start.id,expectedRevision:stage.revisions.at(-1)?.id??stage.start.id,
    patch:{schemaVersion,requestId,scope:source.scope,operations,metadata:{stageId:stage.start.id,runId:"synthetic-review-demo"}}});
  console.log(JSON.stringify({phase:"prepared",client,requestId,retainedInput:path}));
  const result=await call(["stage","submit","--input-file",path]);
  const query=await call(["content","result",requestId]),recovery=await call(["content","recover",requestId]);
  const retry=await call(["stage","submit","--input-file",path]);
  console.log(JSON.stringify({name,status:result.status,stageProblem:result.stageProblem,query:query.status,recovery:recovery.status,sameRecord:JSON.stringify(result.record)===JSON.stringify(retry.record),requestId,retainedInput:path}));
  if(result.status!=="complete"||result.stageProblem)throw Error("Preserve partial/unknown facts and query before further writes.");
};
const block=source.blocks.find(b=>b.target.blockUuid===fixture.polish),old="目前说得比较啰嗦",start=block.content.indexOf(old);
if(start<0)throw Error("Fixture was already edited. Query the retained request; do not create another request automatically.");
await submit("polish",[{operationId:randomUUID(),type:"replace-text",target:block.target,expectedContentVersion:block.contentVersion,expectedParentUuid:block.parentUuid,
  range:{start,end:start+old.length},expectedText:old,text:"目前表述稍显冗长",context:null}],1);
source=await read();
const from=source.blocks.find(b=>b.target.blockUuid===fixture.move),to=source.blocks.find(b=>b.target.blockUuid===fixture.destination);
const capabilities=await call(["capabilities"]);
if(!capabilities.contentProtocol?.structureAuthorized)throw Error("Explicit local structure permission is required.");
await submit("move",[{operationId:randomUUID(),type:"move-block",target:from.target,expectedContentVersion:from.contentVersion,expectedParentUuid:from.parentUuid,
  destination:to.target,position:"after",expectedDestinationVersion:to.contentVersion,expectedDestinationParentUuid:to.parentUuid,expectedStructureVersion:source.structureVersion}],2);
