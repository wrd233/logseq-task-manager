// Research adapter: exercises native DSH services; not a production installer.
export const name = 'logseq-workbench-research';
export const inject = ['tools', 'systemPrompt'];
export function apply(ctx, { transport }) {
  const snapshots = new WeakMap();
  const session = agent => String(agent?.session?.id ?? agent?.id ?? 'research-session');
  ctx.systemPrompt.section({name:'logseq-workbench:instructions',order:4500,interpolate:false,
    text:'Use logseq_work_read to read saved Logseq work and its materials. Reading plans preserve source text. Body, structure, files and TODO grants are independent. Never edit Graph Markdown files to bypass the workbench writeback protocol.'});
  ctx.systemPrompt.context({name:'logseq-workbench:current',order:300,required:true,interpolate:false,
    text:context=>snapshots.get(context.scope)??''});
  ctx.on('system-prompt/assemble',async(assembly,context,next)=>{
    const agent=context.scope;
    if(!agent?.session)return next();
    let packet=await transport('collaboration.read',{},session(agent));
    let scene=packet.scene;
    if(!packet.current.sourceMatches||!packet.current.materialsMatch||!packet.current.guidanceMatches)
      scene=await transport('collaboration.refresh',{},session(agent));
    const guidance=await transport('guidance.read',{},session(agent));
    snapshots.set(agent,JSON.stringify({binding:scene.binding,request:scene.request,
      sourceBundleVersion:scene.sourceBundleVersion,materialsVersion:scene.materialsVersion,
      guidance,permissions:packet.current.permissions,savedSource:scene.savedSource,
      materials:scene.materials,nativeDraft:scene.nativeDraft}));
    const formed=await next();
    return {...formed,contexts:[...formed.contexts.filter(c=>c.name!=='logseq-workbench:current'),{name:'logseq-workbench:current',text:snapshots.get(agent),interpolate:false}]};
  });
  for(const [toolName,command,properties,required] of [
    ['logseq_work_read','collaboration.read',{},[]],
    ['logseq_work_refresh','collaboration.refresh',{},[]],
    ['logseq_files_list','files.list',{},[]],
    ['logseq_file_read','files.read',{path:{type:'string'}},['path']],
    ['logseq_reading_request','reading.request',{purpose:{type:'string'}},['purpose']],
    ['logseq_reading_submit','reading.submit',{plan:{type:'object',additionalProperties:true}},['plan']],
    ['logseq_body_apply','content.apply',{patch:{type:'object',additionalProperties:true}},['patch']],
    ['logseq_session_add','sessions.add',{platform:{type:'string'},externalId:{type:'string'},url:{type:['string','null']},description:{type:'string'}},['platform','externalId','url','description']],
  ])ctx.tools.register({name:toolName,description:`Logseq workbench ${command}; honors current work scope and grants.`,
    parameters:{type:'object',properties,required,additionalProperties:false},
    output:{schema:{},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    execute:(args,exec)=>transport(command,args,session(exec.agent),exec.signal)});
}
