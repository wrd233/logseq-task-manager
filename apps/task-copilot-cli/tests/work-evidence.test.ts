import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rename, unlink, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { EvidenceStore } from '../src/work-evidence/store.ts';
import { git, observe, textDiff, limits } from '../src/work-evidence/git.ts';
const output = fileURLToPath(new URL('../../../tmp/work-evidence/tests', import.meta.url)); await mkdir(output, {recursive:true});
async function fixture() {
  const root = await mkdtemp(join(output,'git-')), repo = join(root,'repo'), state = join(root,'state'); await mkdir(repo);
  const run = (...args: string[]) => execFileSync('git', args, {cwd:repo,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1'},stdio:['ignore','pipe','pipe']}).toString();
  run('init','-q'); run('config','user.name','Evidence Test'); run('config','user.email','evidence@example.invalid');
  return {root,repo,state,run,store:new EvidenceStore(state)};
}
test('real Git staged, unstaged, untracked, renames, deletion, unusual paths, immutable restart, notes and stale diff',async()=>{
  const f=await fixture();
  for(const name of ['mixed.txt','delete.txt','rename from.txt',':(glob)*.txt','line\n tab\t.txt']) await writeFile(join(f.repo,name),'before\n');
  f.run('add','.'); f.run('commit','-qm','base');
  await writeFile(join(f.repo,'mixed.txt'),'staged\n');f.run('add','mixed.txt');await writeFile(join(f.repo,'mixed.txt'),'unstaged\n');
  await rename(join(f.repo,'rename from.txt'),join(f.repo,'renamed to.txt')); f.run('add','-A');
  await writeFile(join(f.repo,'mixed.txt'),'unstaged again\n'); await unlink(join(f.repo,'delete.txt'));
  await mkdir(join(f.repo,'embedded'));execFileSync('git',['init','-q'],{cwd:join(f.repo,'embedded')});await writeFile(join(f.repo,'embedded/nested.txt'),'nested private body');
  await writeFile(join(f.repo,'untracked.txt'),'NEVER_ARCHIVE_THIS');await writeFile(join(f.repo,':(glob)*.txt'),'literal-only\n');await writeFile(join(f.repo,'line\n tab\t.txt'),'special-path\n');
  const scope=await f.store.select(f.repo), saved=await f.store.observe(scope.id), o=saved.value;
  assert.equal(o.consistent,true); assert.equal(o.files.find(c=>c.path==='mixed.txt')?.staged,'M');assert.equal(o.files.find(c=>c.path==='mixed.txt')?.unstaged,'M');
  assert.equal(o.files.find(c=>c.path==='renamed to.txt')?.originalPath,'rename from.txt');assert.equal(o.files.find(c=>c.path==='delete.txt')?.unstaged,'D');assert.equal(o.files.find(c=>c.path==='untracked.txt')?.untracked,true);assert.equal(o.files.find(c=>c.path==='embedded/')?.untracked,true);
  assert.match((await textDiff(o,'mixed.txt','staged')).text! , /staged/); assert.match((await textDiff(o,'mixed.txt','unstaged')).text!,/unstaged again/);
  const literal=(await textDiff(o,':(glob)*.txt','unstaged')).text!;assert.match(literal,/literal-only/);assert.doesNotMatch(literal,/unstaged again/);
  assert.match((await textDiff(o,'line\n tab\t.txt','unstaged')).text!,/special-path/);
  const second=await f.store.observe(scope.id);assert.equal(second.value.comparison.existing.length,o.files.length);assert.equal(second.value.comparison.new.length,0);
  await f.store.note(scope.id,o.id,'修复草稿恢复');const restarted=new EvidenceStore(f.state);assert.deepEqual(await restarted.observation(scope.id,o.id),saved);assert.equal((await restarted.notes(scope.id,o.id))[0]?.value.source,'user-supplement');
  assert.doesNotMatch(JSON.stringify(await restarted.observation(scope.id,o.id)),/修复草稿恢复|NEVER_ARCHIVE_THIS/);
  const quote=await restarted.quote(scope.id,o.id,['mixed.txt']); assert.match(quote,new RegExp(saved.hash));assert.match(quote,/user-supplement/);assert.doesNotMatch(quote,/unstaged again/);
  await writeFile(join(f.repo,'mixed.txt'),'changed after observation\n'); await assert.rejects(textDiff(o,'mixed.txt','unstaged'),/SOURCE_CHANGED/);
  const third=await f.store.observe(scope.id);assert.ok(third.value.comparison.new.includes('mixed.txt'));assert.deepEqual(await restarted.observation(scope.id,o.id),saved);
  f.run('checkout','-qb','different-branch');const switched=await f.store.observe(scope.id);assert.equal(switched.value.comparison.new.length,0);assert.equal(switched.value.comparison.uncertain.length,switched.value.files.length);
  const files=await readdir(f.state); for(const name of files) assert.doesNotMatch(await readFile(join(f.state,name),'utf8'),/NEVER_ARCHIVE_THIS|changed after observation/);
});
test('real unborn and clean repos, non Git, invalid directory, output and file count limits, actual Git timeout',async()=>{
  const f=await fixture(); const scope=await f.store.select(f.repo);const clean=await f.store.observe(scope.id);assert.equal(clean.value.head,null);assert.equal(clean.value.state,'clean');
  await writeFile(join(f.repo,'first.txt'),'first\n');f.run('add','.');const unborn=await f.store.observe(scope.id);assert.equal(unborn.value.head,null);assert.match((await f.store.diff(scope.id,unborn.value.id,'first.txt','staged')).text!,/first/);
  await mkdir(join(f.root,'not-git'));await writeFile(join(f.root,'not-git','.git'),'invalid git directory boundary');await assert.rejects(f.store.select(join(f.root,'not-git')),/GIT_FAILED/);await assert.rejects(f.store.select(join(f.root,'missing')));
  const invalid=await observe(scope.id,join(f.root,'missing'));assert.equal(invalid.state,'failed');
  const truncated=await observe(scope.id,f.repo,undefined,{bytes:1});assert.equal(truncated.truncated,true);assert.equal(truncated.error,'RESULT_LIMIT');
  for(let n=0;n<=limits.files;n++)await writeFile(join(f.repo,`f${n}`),'x');
  const many=await f.store.observe(scope.id);assert.equal(many.value.files.length,limits.files);assert.equal(many.value.truncated,true);assert.equal(many.value.comparison.new.length,0);
  await assert.rejects(git(f.repo,['status','--porcelain=v2'],{milliseconds:0}),/GIT_TIMEOUT/);
  const timed=await observe(scope.id,f.repo,undefined,{milliseconds:0});assert.equal(timed.state,'failed');assert.equal(timed.error,'GIT_TIMEOUT');
  await rename(f.repo,join(f.root,'moved'));assert.equal((await f.store.observe(scope.id)).value.state,'failed');assert.equal((await f.store.history(scope.id)).length,4);
});
test('scope isolation, sensitive paths/content, binary, symlink, outside root, no untracked body reads',async()=>{
 const f=await fixture();await writeFile(join(f.repo,'regular.txt'),'before\n');await writeFile(join(f.repo,'binary.bin'),Buffer.from([0,1,2]));await writeFile(join(f.repo,'.env'),'SECRET_BEFORE');f.run('add','.');f.run('commit','-qm','base');
 await writeFile(join(f.repo,'.env'),'SECRET_AFTER');await writeFile(join(f.repo,'regular.txt'),'password=super-private\n');await writeFile(join(f.repo,'binary.bin'),Buffer.from([0,4,5]));
 await writeFile(join(f.root,'outside.txt'),'OUTSIDE_SECRET');await symlink(join(f.root,'outside.txt'),join(f.repo,'link'));f.run('add','link');
 const scope=await f.store.select(f.repo),saved=await f.store.observe(scope.id);
 await assert.rejects(f.store.diff(scope.id,saved.value.id,'.env','unstaged'),/TEXT_DIFF_RESTRICTED/);
 assert.equal((await f.store.diff(scope.id,saved.value.id,'regular.txt','unstaged')).state,'restricted');assert.equal((await f.store.diff(scope.id,saved.value.id,'binary.bin','unstaged')).state,'restricted');await assert.rejects(f.store.diff(scope.id,saved.value.id,'link','staged'),/TEXT_DIFF_RESTRICTED/);
 await assert.rejects(f.store.diff(scope.id,saved.value.id,'../outside.txt','unstaged'),/TEXT_DIFF_RESTRICTED/);
 await mkdir(join(f.repo,'nested'));await assert.rejects(f.store.select(join(f.repo,'nested')),/SELECT_REPOSITORY_ROOT/);
 const other=await fixture(),otherScope=await f.store.select(other.repo);await assert.rejects(f.store.observation(otherScope.id,saved.value.id),/SCOPE_MISMATCH/);
 const body=JSON.stringify(await f.store.observation(scope.id,saved.value.id));assert.doesNotMatch(body,/SECRET_|super-private|OUTSIDE_SECRET/);
});
test('real concurrent writer is reported as inconsistent, never atomic',async()=>{
 const f=await fixture();for(let n=0;n<150;n++)await writeFile(join(f.repo,`file-${n}`),'x');f.run('add','.');f.run('commit','-qm','base');
 const writer=spawn(process.execPath,['-e',"const fs=require('node:fs');let i=0;setInterval(()=>fs.writeFileSync(process.argv[1],String(i++)),1)",join(f.repo,'file-0')],{stdio:'ignore'});
 try{await new Promise(r=>setTimeout(r,80));let found=false;for(let i=0;i<5;i++){const o=await observe('test',f.repo);if(!o.consistent&&o.state!=='failed'){found=true;assert.equal(o.comparison.new.length,0);break;}}assert.equal(found,true);}finally{writer.kill('SIGTERM');await new Promise(r=>writer.once('close',r));}
});
test('diff size limits are visible, staged deletion works, directory symlinks and environment overrides cannot widen scope',async()=>{
 const f=await fixture();await mkdir(join(f.repo,'folder'));await writeFile(join(f.repo,'folder/item.txt'),'before\n');await writeFile(join(f.repo,'removed.txt'),'old deleted text\n');await writeFile(join(f.repo,'large.txt'),'before\n');f.run('add','.');f.run('commit','-qm','base');
 await writeFile(join(f.repo,'large.txt'),'a'.repeat(100000)+'\n');await unlink(join(f.repo,'removed.txt'));f.run('add','removed.txt');
 const scope=await f.store.select(f.repo), saved=await f.store.observe(scope.id);
 assert.equal((await f.store.diff(scope.id,saved.value.id,'large.txt','unstaged')).state,'truncated');assert.match((await f.store.diff(scope.id,saved.value.id,'removed.txt','staged')).text!,/old deleted text/);
 await writeFile(join(f.repo,'large.txt'),'x'.repeat(limits.fileBytes+1));const large=await f.store.observe(scope.id);await assert.rejects(f.store.diff(scope.id,large.value.id,'large.txt','unstaged'),/FILE_SIZE_LIMIT/);
 await mkdir(join(f.root,'external'));await writeFile(join(f.root,'external/item.txt'),'outside confidential');await rename(join(f.repo,'folder'),join(f.repo,'saved-folder'));await symlink(join(f.root,'external'),join(f.repo,'folder'));
 const linked=await f.store.observe(scope.id);assert.equal(linked.value.state,'changes');await assert.rejects(f.store.diff(scope.id,linked.value.id,'folder/item.txt','unstaged'),/SYMLINK_RESTRICTED/);
 const before=process.env.GIT_WORK_TREE;process.env.GIT_WORK_TREE=join(f.root,'external');try{assert.equal((await observe(scope.id,f.repo)).directory,f.repo);}finally{if(before===undefined)delete process.env.GIT_WORK_TREE;else process.env.GIT_WORK_TREE=before;}
});
