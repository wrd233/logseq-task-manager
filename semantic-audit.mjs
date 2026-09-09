import {readdir,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {parse} from './model.mjs';
const root='/Users/wangrundong/logseq/Logseq_File';const counts={},markers={},examples={},variants={},tasks={};let files=0,blocks=0;const hashes={};
for(const dir of ['journals','pages'])for(const name of (await readdir(join(root,dir))).filter(n=>n.endsWith('.md')).sort()){
 files++;const lines=(await readFile(join(root,dir,name),'utf8')).split('\n');let fence=false;const stack=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];const m=/^(\s*)- (.*)$/.exec(line);if(/```|~~~/.test(line.trim().replace(/^- /,''))&&/^(?:- )?(?:```|~~~)/.test(line.trim())){fence=!fence;continue}if(fence||!m)continue;
  blocks++;const content=m[2],s=parse(content),depth=m[1].replace(/\t/g,'  ').length;while(stack.length&&stack.at(-1).depth>=depth)stack.pop();
  if(s.task)tasks[s.task]=(tasks[s.task]??0)+1;
  if(s.role){counts[s.role]=(counts[s.role]??0)+1;const v=content.match(/【[^】]+】|\[[^\]]+\]/)?.[0];variants[v]=(variants[v]??0)+1;(examples[s.role]??=[]);if(examples[s.role].length<8)examples[s.role].push({file:dir+'/'+name,line:i+1,content,parent:stack.at(-1)?.content??null,task:s.task})}
  const marker=/^(?:\*\*)?(?:【([^】]{1,12})】|\[([^\]]{1,12})\])(?:\*\*)?/.exec(content);if(marker){const label=marker[1]||marker[2];markers[label]=(markers[label]??0)+1}
  stack.push({depth,content});
 }
}
const result={at:new Date().toISOString(),root,files,blocks,counts,tasks,variants,markers:Object.fromEntries(Object.entries(markers).sort((a,b)=>b[1]-a[1]).slice(0,40)),examples,limits:'File Markdown list starts only; fenced code excluded heuristically; not a complete Logseq AST. Prefix observations are not semantic accuracy labels.'};await writeFile('evidence/presentation/semantic-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,examples:undefined},null,2));
