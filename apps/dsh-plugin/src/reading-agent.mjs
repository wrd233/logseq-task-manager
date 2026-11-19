/* global AbortSignal */
import { randomUUID } from 'node:crypto';
import { WorkspaceError } from '@task-copilot/contracts';

const string={type:'string'},strings={type:'array',items:string},integer={type:'integer',minimum:0};
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const array=items=>({type:'array',items});
const kind={type:'string',enum:['fact','inference','suggestion']};
const detail=object({key:string,markdown:string,sourceIds:strings,heading:string,kind,display:{type:'string',enum:['quote','table','chart']},materialIds:strings,materialQuotes:array(object({materialId:string,quote:string},['materialId','quote']))},['key','markdown','sourceIds']);
const paragraph=object({key:string,markdown:string,cue:string,sourceIds:strings,kind,tone:{type:'string',enum:['progress','attention']},details:array(detail)},['key','markdown','sourceIds','kind']);
const article=object({paragraphs:array(paragraph),followUps:array(paragraph)},['paragraphs']);
const answer=object({answer:string,sourceIds:strings,materialIds:strings},['answer','sourceIds']);
const tools=['logseq_reading_request','logseq_source_read','logseq_file_read','logseq_reading_submit'];
const render=(_args,value)=>[{type:'text',text:JSON.stringify(value)}];
const fail=code=>{throw new WorkspaceError(code);};

export async function readingAgent(ctx,task,instructions,signal){
  const model=ctx.agentDefaultModel?.currentSelection();
  if(!ctx.agents||!model?.provider||!model?.model)fail('READING_MODEL_NOT_CONFIGURED');
  const jobId=randomUUID(),packet=task.packet;
  const cancellation=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(170000)]);
  const readBlocks=new Set(),readMaterials=new Set();
  const blocks=new Map(packet.blocks.map(block=>[block.id,block]));
  const materials=new Map(packet.materials.map(material=>[material.id,material]));
  let captured,staged;
  const handle=await ctx.agents.create({sessionId:jobId,meta:{origin:'subagent'},agentOptions:{provider:model.provider,model:model.model,reasoningEffort:model.reasoningEffort,maxTokens:8192},
    signal:cancellation,setup:agentCtx=>{
      agentCtx.tools.restrict({allow:[]});
      agentCtx.tools.presentAs('native');
      agentCtx.tools.guard(exec=>!tools.includes(exec.name)?'Only scoped reading tools are available for this job.':captured?'Reading result already submitted.':undefined);
      agentCtx.systemPrompt.section({name:'logseq-workbench:reading-job',order:9000,interpolate:false,text:`${instructions}
这是独立后台阅读任务，仅有以下受限工具：先调用 logseq_reading_request 查看实际工作及索引；用 logseq_source_read 读取所引的保存原文（可批量），用 logseq_file_read 按需查阅关联文件和笔记。依据任务需要查证，不凭索引摘要想象内容。更新时核对 changes 和 previous，保留无关段落。最终调用 logseq_reading_submit 一次提交阅读成果，工具成功即结束任务，不再聊天。所引用的每个 s/m 编号须经过对应读取工具。没有写作或其他工具权限。`});
      const register=(name,description,parameters,execute)=>agentCtx.tools.register({name,description,parameters,output:{schema:{},render},execute:async(args,exec)=>JSON.parse(JSON.stringify(await execute(args,exec)))});
      register('logseq_reading_request','Inspect the current saved work, versions, source and associated material index, and previous article if any. Paginate the source index.',object({offset:integer}),args=>{
        const offset=args.offset??0,rows=packet.blocks.slice(offset,offset+100);
        return {work:task.scopeName??'当前工作',structureVersion:task.structureVersion,sourceSetVersion:task.sourceVersion,total:packet.blocks.length,
          ...(offset+rows.length<packet.blocks.length?{nextOffset:offset+rows.length}:{}),
          sources:rows.map(({id,parent,depth,text})=>({id,parent,depth,preview:text?.slice(0,160)})),
          ...(offset===0?{materials:packet.materials.map(({id,filename,version,kind,text,excerpt})=>({id,filename,version,kind,length:(text??excerpt??'').length})),previous:packet.previous,changes:packet.changes}: {})};
      });
      register('logseq_source_read','Read exact stored Logseq blocks by the s identifiers from the work index. Up to 30 per call. For a long single block use offset.',object({sourceIds:strings,offset:integer},['sourceIds']),args=>{
        if(!args.sourceIds.length||args.sourceIds.length>30||args.offset&&args.sourceIds.length!==1)throw Error('Choose 1–30 source IDs, offset only for a single source.');
        const offset=args.offset??0;
        return args.sourceIds.map(id=>{
          const block=blocks.get(id);if(!block)throw Error('Source not in this reading invitation.');
          const text=block.text??'',limit=args.sourceIds.length===1?16000:Math.max(1500,Math.floor(36000/args.sourceIds.length));
          return {id,parent:block.parent,depth:block.depth,text:text.slice(offset,offset+limit),...(offset+limit<text.length?{nextOffset:offset+limit}:{})};
        });
      });
      register('logseq_file_read','Read a linked material or explicitly associated Logseq note by the m identifier, not by arbitrary path. Return actual stored text; paginate via nextOffset.',object({materialId:string,offset:integer},['materialId']),args=>{
        const material=materials.get(args.materialId);if(!material)throw Error('Material is not in the reading invitation.');
        const offset=args.offset??0,text=material.text??material.excerpt;
        return {id:material.id,filename:material.filename,kind:material.kind,version:material.version,truncated:material.truncated,...(typeof text==='string'?{text:text.slice(offset,offset+16000),...(offset+16000<text.length?{nextOffset:offset+16000}:{})}:{unavailable:'No text is available; do not infer the contents.'})};
      });
      register('logseq_reading_submit','Return the completed article or answer with actual references. Does not modify the work or select the article.',packet.mode==='organize'?article:answer,(args,exec)=>{
        const references=packet.mode==='organize'?[...args.paragraphs,...args.followUps??[]].flatMap(unit=>[unit,...unit.details??[]]):[args];
        if(!readBlocks.size||references.some(unit=>(unit.sourceIds??[]).some(id=>!readBlocks.has(id))||(unit.materialIds??[]).some(id=>!readMaterials.has(id))))throw Error('Read the exact cited sources and materials with the reading tools before submitting.');
        staged={callId:exec.callId,value:task.output(args)};
        exec.concludeTurn();
        return {submitted:true};
      });
      agentCtx.on('tools/result',(exec,result)=>{
        if(result.isError)return;
        if(exec.name==='logseq_source_read')for(const id of exec.arguments.sourceIds??[])readBlocks.add(id);
        if(exec.name==='logseq_file_read')readMaterials.add(exec.arguments.materialId);
        if(exec.name==='logseq_reading_submit'&&staged?.callId===exec.callId)captured=staged.value;
      });
    }});
  const agent=handle.agent,cancel=()=>agent.cancel({kind:'user'});
  cancellation.addEventListener('abort',cancel,{once:true});
  try{
    cancellation.throwIfAborted();
    agent.followup({id:randomUUID(),role:'user',source:{kind:'user'},content:[{type:'text',text:JSON.stringify({mode:packet.mode,question:packet.question,selection:packet.selection})}]});
    await agent.whenIdle();
    if(cancellation.aborted)fail('READING_MODEL_INTERRUPTED');
    if(!captured)fail('READING_AGENT_INCOMPLETE');
    const events=agent.session.snapshotEvents();
    return {...captured,agentRun:{sessionId:agent.session.id,steps:events.filter(event=>event.type==='step/start').length,toolResults:events.filter(event=>event.type==='tool/result'&&!event.data.message.isError).length,sourceIds:[...readBlocks].map(id=>task.sourceIds.get(id)),materialIds:[...readMaterials].map(id=>task.materialIds.get(id))}};
  }finally{
    cancellation.removeEventListener('abort',cancel);
    await handle.dispose();
  }
}
