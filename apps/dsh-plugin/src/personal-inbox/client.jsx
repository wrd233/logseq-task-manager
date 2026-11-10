import React, {useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import {workKey} from '@task-copilot/contracts';
import {MaterialPicker} from './material-picker.jsx';
import {hasInboxReference, insertInboxReference} from './reference.mjs';
import {blockUrl} from '../reader-model.mjs';
import {captureSource, errorMessage, localDate, materialTitle, safeLink, sourceNames, statusNames, visibleContent, workIdentity} from './client-model.mjs';
/* global crypto, window, document, Blob, URL, setTimeout, clearTimeout, setInterval, clearInterval */

const noInput = () => undefined;
const selectOccurrences = state => state?.occurrences;
const when = value => new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const titleOf = item => visibleContent(item).split('\n').find(line=>line.trim())?.trim().slice(0,300) ?? '';

export function createPersonalInbox({rpc,insertReference,onOpenSession,onOpenPlanner,registerEffect}) {
  // One personal UI, including drafts, across the host's Session-mounted tab instances.
  const memory = {capture:'',captureAttempt:null,selection:null,query:'',status:'open',sourceFilter:'',linked:'',workFilter:null,drafts:new Map(),edits:new Map(),conversions:new Map(),importAttempts:new Map(),change:null};
  const listeners=new Set();
  const timers=new Map(), inserting=new Set();
  let disposed=false;
  const beforeUnload=event=>{event.preventDefault();event.returnValue='';};
  function saveDraft(id,draft) {
    if(draft)memory.drafts.set(id,draft);
    else memory.drafts.delete(id);
    if(memory.drafts.size)window.addEventListener('beforeunload',beforeUnload);
    else window.removeEventListener('beforeunload',beforeUnload);
    for(const listener of listeners)listener();
  }
  registerEffect(()=>()=>{
    disposed=true;
    window.removeEventListener('beforeunload',beforeUnload);
    for(const timer of timers.values())clearTimeout(timer);
  });
  function queueNote(id) {
    clearTimeout(timers.get(id));
    timers.set(id,setTimeout(()=>{timers.delete(id);void saveNote(id);},650));
  }
  async function saveNote(id) {
    const sent=memory.drafts.get(id);
    if(!sent||sent.state==='saving')return;
    saveDraft(id,{...sent,state:'saving',error:null});
    try{
      const result=await rpc('inbox-update',{id,revision:sent.revision,patch:{context:sent.context}});
      if(disposed)return;
      const latest=memory.drafts.get(id);
      const more=latest.context!==sent.context;
      memory.change={result};
      saveDraft(id,more?{...latest,revision:result.revision,state:'queued'}:null);
      if(more)queueNote(id);
    }catch(error){
      if(disposed)return;
      memory.change={result:null};
      saveDraft(id,{...memory.drafts.get(id),state:'error',error});
    }
  }
  const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
  function usePersonal(key) {
    const value=useSyncExternalStore(subscribe,()=>memory[key],()=>memory[key]);
    return [value,next=>{memory[key]=typeof next==='function'?next(memory[key]):next;for(const listener of listeners)listener();}];
  }
  function useWorkCatalog() {
    const [works,setWorks]=useState(null),[problem,setProblem]=useState('');
    const load=async()=>{
      try{
        const catalog=await rpc('catalog',{});
        const unique=new Map();
        const recent=new Map((catalog.recent??[]).map(row=>[row.key,row.lastOpenedAt]));
        for(const graph of catalog.graphs)for(const work of graph.works){
          const key=workKey(work.workRef);
          unique.set(key,{...work,context:graph.graphName.includes('/')||graph.graphName.includes('\\')?'Logseq':graph.graphName,lastOpenedAt:recent.get(key)??0});
        }
        setWorks([...unique.values()].sort((a,b)=>b.lastOpenedAt-a.lastOpenedAt||a.title.localeCompare(b.title,'zh-CN')));
        setProblem('');
      }catch{setProblem('工作目录暂不可读，已有的关联仍会保留。');}
    };
    useEffect(()=>{void load();},[]);
    return {works,problem,load};
  }
  function WorkLink({workRef,onClick}) {
    const {works}=useWorkCatalog();
    const work=works?.find(row=>workKey(row.workRef)===workKey(workRef));
    return <button type="button" className="pi-work-chip" onClick={onClick}>{work?.title??'关联工作'} ↗</button>;
  }
  function WorkPicker({value,onChange,disabled=false,emptyLabel='不关联工作',label='关联工作',naturalOnly=false}) {
    const {works,problem,load}=useWorkCatalog();
    const [query,setQuery]=useState('');
    const current=value?workKey(value):null;
    const terms=query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    const rows=(works??[]).filter(work=>(!naturalOnly||work.workRef.kind==='logseq')&&
      terms.every(term=>`${work.title} ${work.context}`.toLocaleLowerCase().includes(term)));
    return <section className="pi-field" aria-label={label}>
      <label>{label}<input type="search" autoFocus placeholder="按工作名称搜索" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="pi-choice-list">{rows.map(work=>{
        const selected=workKey(work.workRef)===current;
        return <button key={workKey(work.workRef)} type="button" aria-pressed={selected} disabled={disabled||selected} onClick={()=>onChange(work.workRef)}>
          <span>{work.title}</span><small>{selected?'当前选择 · ':work.lastOpenedAt?'最近使用 · ':''}{work.context}</small>
        </button>;
      })}</div>
      {value?<button type="button" className="pi-link" disabled={disabled} onClick={()=>onChange(null)}>{emptyLabel==='不关联工作'?'解除关联':emptyLabel}</button>:null}
      {problem?<p className="pi-hint">{problem} <button type="button" onClick={()=>void load()}>重试</button></p>:works&&!rows.length?<p className="pi-hint">没有找到可选的工作。</p>:!works?<p className="pi-hint">正在读取工作…</p>:null}
    </section>;
  }
  function SourcePicker({sessionId,onPick,onClose,material=false}) {
    const [reader,setReader]=useState(null),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
    const attempts=memory.importAttempts;
    useEffect(()=>{let active=true;setReader(null);setProblem('');if(sessionId)rpc('reader',{sessionId}).then(value=>{if(active)setReader(value);}).catch(()=>{if(active)setProblem('当前 Logseq 来源尚未连接。可继续直接记录，或先在 Logseq 连接一件工作。');});return()=>{active=false;};},[sessionId]);
    return <section className="pi-picker" aria-label="选择 Logseq 内容"><div className="pi-row"><h2>选择当前工作中的原文</h2>{onClose?<button type="button" onClick={onClose}>关闭</button>:null}</div>
      {!sessionId?<p className="pi-hint">先打开一个已连接 Logseq 的工作对话，再选择来源。</p>:!reader?<p className="pi-hint">{problem||'正在读取当前来源…'}</p>:<div className="pi-source-list">{reader.nodes.filter(node=>node.availability==='available').map(node=><button key={node.sourceId} type="button" disabled={busy} onClick={async()=>{
        const key=`${sessionId}:${node.sourceId}`;
        if(!material&&!attempts.has(key))attempts.set(key,crypto.randomUUID());
        setBusy(true);setProblem('');try{
          const input={sessionId,sourceId:node.sourceId};
          const result=material?await rpc('inbox-logseq-material',input):await rpc('inbox-import-logseq',{...input,id:attempts.get(key)});
          await onPick(result);
        }catch(error){setProblem(errorMessage(error));}finally{setBusy(false);}
      }}><span>{node.body.markdown.slice(0,180)||'空白来源'}</span><small>{reader.scope.pageName??'当前工作'} · Logseq</small></button>)}{!reader.nodes.length?<p>当前来源没有可导入的块。</p>:null}</div>}
      {reader&&problem?<p role="alert" className="pi-error">{problem}</p>:null}
    </section>;
  }
  function Conversion({item,kind,busy,setBusy,onDone,onClose}) {
    const saved=memory.conversions.get(item.id);
    const [form,setForm]=useState(()=>saved?.kind===kind?saved.form:{title:titleOf(item),date:localDate(),slotId:'',workRef:item.workRef??(kind==='work'?item.outcomes.findLast(result=>result.kind==='formal-task')?.reference.workRef:null)??null});
    const [options,setOptions]=useState(null),[problem,setProblem]=useState('');
    const attempt=useRef(saved?.kind===kind?saved.attempt:null);
    const set=patch=>{const next={...form,...patch};setForm(next);if(!attempt.current)memory.conversions.set(item.id,{kind,form:next,attempt:null});};
    useEffect(()=>{if(kind==='planner')rpc('inbox-options',{}).then(value=>{setOptions(value);setForm(current=>({...current,slotId:current.slotId||value.slots.find(slot=>!slot.start)?.id||value.slots[0]?.id||''}));}).catch(error=>setProblem(errorMessage(error)));},[]);
    const sourceAnchor=item.source?.type==='logseq'?{graphId:item.source.graphId,blockUuid:item.source.blockUuid}:null;
    const anchor=sourceAnchor??(form.workRef?.kind==='logseq'?{graphId:form.workRef.graphId,blockUuid:form.workRef.rootUuid}:null);
    const workRef=form.workRef??(sourceAnchor?{kind:'logseq',graphId:sourceAnchor.graphId,rootUuid:sourceAnchor.blockUuid,sourceKind:'block'}:null);
    const needsTitle=kind!=='work'||(!form.workRef&&Boolean(sourceAnchor));
    const label=kind==='planner'?'安排时间':kind==='work'?'发展为工作':'创建正式任务';
    return <form className="pi-conversion" aria-label={label} onSubmit={async event=>{
      event.preventDefault();if(busy)return;setBusy(true);setProblem('');
      if(!attempt.current){attempt.current={id:item.id,revision:item.revision,operationId:crypto.randomUUID(),kind,confirmed:true,resolve:true,
        parameters:kind==='planner'?{entry:{title:form.title,date:form.date,slotId:form.slotId}}:kind==='work'?{...(needsTitle?{title:form.title}:{}),workRef}:{title:form.title,anchor}};memory.conversions.set(item.id,{kind,form,attempt:attempt.current});}
      try{const result=await rpc('inbox-convert',{...attempt.current,revision:item.revision});memory.conversions.delete(item.id);await onDone(result);onClose();}catch(error){setProblem(errorMessage(error));await onDone(null);}finally{setBusy(false);}
    }}><div className="pi-row"><h3>{label}</h3><button type="button" disabled={busy} onClick={onClose}>关闭</button></div>
      {needsTitle?(kind==='planner'?<details><summary>{form.title||'设置安排名称'}</summary><label>安排名称<input required maxLength={300} value={form.title} disabled={busy||Boolean(attempt.current)} onChange={event=>set({title:event.target.value})}/></label></details>:<label>名称<input required maxLength={300} value={form.title} disabled={busy||Boolean(attempt.current)} onChange={event=>set({title:event.target.value})}/></label>):null}
      {kind==='planner'?<details className="pi-schedule"><summary>{form.date===localDate()?'今天':form.date} · {options?.slots.find(slot=>slot.id===form.slotId)?.name??'读取时间段…'}</summary><div className="pi-row pi-fields"><label>日期<input type="date" required value={form.date} disabled={busy||Boolean(attempt.current)} onChange={event=>set({date:event.target.value})}/></label><label>时间段<select required value={form.slotId} disabled={busy||Boolean(attempt.current)} onChange={event=>set({slotId:event.target.value})}><option value="">选择时间段</option>{options?.slots.map(slot=><option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label></div></details>:(kind==='work'&&!item.workRef)||(kind==='formal-task'&&!sourceAnchor&&item.workRef?.kind!=='logseq')?<WorkPicker label={kind==='work'?'在哪件工作中继续':'选择任务来源'} emptyLabel={kind==='work'&&sourceAnchor?'使用已导入的原文':'选择一件现有工作'} value={form.workRef} onChange={ref=>set({workRef:ref})} naturalOnly={kind==='formal-task'} disabled={busy||Boolean(attempt.current)}/>:<p className="pi-hint">{kind==='work'?'在关联工作中继续。':'使用已关联的 Logseq 原文。创建任务需要图谱在线。'}</p>}
      {problem?<p role="alert" className="pi-error">{problem}</p>:null}
      <div className="pi-actions">{attempt.current?<button type="button" disabled={busy||Boolean(item.pendingConversion)} onClick={()=>{attempt.current=null;memory.conversions.delete(item.id);setProblem('');}}>重新填写</button>:null}<button className="pi-primary" disabled={busy||(needsTitle&&!form.title.trim())||(kind==='planner'&&!form.slotId)||(kind==='work'&&!workRef)||(kind==='formal-task'&&!anchor)}>{busy?'正在处理…':attempt.current?'重试同一操作':kind==='planner'?'创建安排':`确认${label}`}</button></div>
    </form>;
  }
  function Detail({item,sessionId,inputActions,occurrences,onSaved,onBack}) {
    const draft=useSyncExternalStore(subscribe,()=>memory.drafts.get(item.id),()=>undefined);
    const [panel,setPanel]=useState(()=>draft?'note':null);
    const [materialIndex,setMaterialIndex]=useState(null);
    const [materialStatus,setMaterialStatus]=useState(null);
    const [editing,setEditing]=useState(()=>memory.edits.has(item.id));
    const [editText,setEditText]=useState(()=>memory.edits.get(item.id)?.content??item.content);
    const [busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[notice,setNotice]=useState('');
    const operation=useRef(null),editRevision=useRef(memory.edits.get(item.id)?.revision??item.revision);
    const locked=Boolean(item.pendingConversion),disabled=busy||locked||Boolean(draft)||editing;
    const active=item.status==='open'||item.status==='waiting';
    const conflict=draft?.error?.code==='INBOX_CONFLICT';
    const note=draft?.context??item.context;
    const toggle=key=>setPanel(current=>current===key?null:key);
    useEffect(()=>{
      if(!item.materials.some(row=>!safeLink(row.locator)))return;
      let active=true;
      setMaterialStatus(null);
      rpc('inbox-material-status',{id:item.id,revision:item.revision}).then(status=>{if(active)setMaterialStatus(status);}).catch(()=>{});
      return ()=>{active=false;};
    },[item.id,item.revision]);
    const run=async(method,payload,message)=>{
      setBusy(true);setProblem('');setNotice('');
      try{const result=await rpc(method,payload);await onSaved(result);setNotice(message);return true;}
      catch(error){setProblem(errorMessage(error));await onSaved(null);return false;}
      finally{setBusy(false);}
    };
    const update=(patch,message)=>run('inbox-update',{id:item.id,revision:item.revision,patch},message);
    const move=async(status,message)=>{if(await update({status},message))setPanel(null);};
    const archive=async()=>{
      const restoring=item.status==='archived';
      if(await run(restoring?'inbox-restore':'inbox-archive',{id:item.id,revision:item.revision},restoring?'记录已恢复。':'已归档，可随时恢复。'))setPanel(null);
    };
    const openWork=async()=>{
      try{
        const key=workIdentity(item.workRef);
        if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
        const result=await rpc('inbox-open-work',{id:item.id,operationId:operation.current.id});
        await onOpenSession(result.sessionId);
      }catch(error){setProblem(errorMessage(error));}
    };
    const discuss=async()=>{
      const key=`${sessionId}:${item.id}`;
      if(inserting.has(key))return;
      setProblem('');
      if(hasInboxReference(occurrences,item.id)){setNotice('这条记录已在当前草稿中。');return;}
      inserting.add(key);
      try{
        if(!await insertInboxReference(inputActions,item,(ref,span)=>insertReference(sessionId,ref,span)))throw Error('busy');
        setNotice('已放入当前输入框，尚未发送。');
      }catch{setProblem('当前输入框暂不可用，请稍后重试。');}
      finally{inserting.delete(key);}
    };
    const saveMaterials=async materials=>{
      if(await update({materials},'材料已更新。')){setPanel(null);setMaterialIndex(null);}
    };
    const chooseMaterial=async row=>{
      if(item.materials.some((material,index)=>material.locator===row.locator&&index!==materialIndex)){
        setProblem('这份材料已关联。');return;
      }
      await saveMaterials(materialIndex===null?[...item.materials,row]:item.materials.map((material,index)=>index===materialIndex?row:material));
    };
    const editMaterial=index=>{setMaterialIndex(index);setProblem('');setPanel('materials');};
    const openMaterial=async index=>{
      try{await rpc('inbox-open-material',{id:item.id,revision:item.revision,index});}
      catch(error){if(error.code==='INBOX_LOCATION_UNAVAILABLE')editMaterial(index);setProblem(errorMessage(error));}
    };
    return <article className="pi-detail" aria-label="记录详情">
      <div className="pi-row"><button type="button" className="pi-back" onClick={onBack}>‹ 返回记录</button><span className="pi-meta">{sourceNames[item.source?.type]??'直接记录'} · {when(item.createdAt)}{item.status!=='open'?<> · {statusNames[item.status]}</>:null}</span></div>
      <div className="pi-content">{visibleContent(item)}</div>
      {item.editedContent!==null||visibleContent(item)!==item.originalContent?<details><summary>查看最初原文</summary><pre className="pi-original">{item.originalContent}</pre></details>:null}
      {item.source?.type==='logseq'?<a className="pi-link" href={blockUrl(item.source.graphId,item.source.blockUuid)}>在 Logseq 打开来源 ↗</a>:item.source?.locator?<p className="pi-hint">{safeLink(item.source.locator)?<a href={safeLink(item.source.locator)} target="_blank" rel="noreferrer">打开来源 ↗</a>:'来源已记录'}</p>:null}
      {item.outcomes.length?<section className="pi-outcomes"><h2>处理结果</h2>{item.outcomes.map(outcome=><div className="pi-row" key={outcome.operationId}><span>{outcome.kind==='planner'?'已加入规划':outcome.kind==='work'?'已发展为工作':'已创建正式任务'} · {when(outcome.createdAt)}</span>{outcome.kind==='planner'?<button type="button" onClick={()=>onOpenPlanner?.(outcome.reference.entryId,sessionId)}>查看安排 ↗</button>:outcome.reference.logseqUrl?<a href={outcome.reference.logseqUrl}>在 Logseq 查看任务 ↗</a>:outcome.reference.sessionId?<button type="button" onClick={()=>void onOpenSession(outcome.reference.sessionId)}>继续工作 ↗</button>:null}</div>)}</section>:null}
      {panel==='note'?<section className="pi-note">
        <label>补充背景<textarea autoFocus maxLength={100000} value={note} disabled={busy||locked||editing} placeholder="写下一点背景、想法或讨论结论…" onChange={event=>{
          const pending=memory.drafts.get(item.id);
          saveDraft(item.id,{context:event.target.value,revision:pending?.revision??item.revision,state:pending?.state??'queued',error:pending?.error});
          if(!pending||pending.state==='queued')queueNote(item.id);
        }}/></label>
        <div className="pi-row"><span role="status" className="pi-hint">{draft?.state==='error'?'输入已保留':draft?'正在保存…':note?'已保存':'输入后自动保存'}</span><button type="button" className="pi-link" onClick={()=>setPanel(null)}>收起</button></div>
      </section>:note?<section className="pi-note"><h2>补充背景</h2><p>{note}</p></section>:null}
      {draft?.state==='error'?<div className="pi-warning" role="alert"><p>{errorMessage(draft.error)}</p>
        {conflict?<details><summary>查看最新保存的背景</summary><pre>{item.context||'没有补充背景'}</pre></details>:null}
        <button type="button" disabled={locked||(conflict&&item.revision===draft.revision)} onClick={()=>{if(conflict)saveDraft(item.id,{...draft,revision:item.revision});void saveNote(item.id);}}>{conflict?'已比较，保存我的背景':'重试保存'}</button>
        <button type="button" onClick={()=>saveDraft(item.id,null)}>放弃本次修改</button>
      </div>:null}
      {item.workRef?<WorkLink workRef={item.workRef} onClick={()=>void openWork()}/>:null}
      {item.materials.length?<section className="pi-materials"><h2>相关材料</h2><ul>{item.materials.map((row,index)=>{
        const link=safeLink(row.locator), title=materialTitle(row);
        return <li key={index}>
          {link?<a href={link} target="_blank" rel="noreferrer">{title} ↗</a>:materialStatus&&materialStatus[index]===null?<span>{title} <small className="pi-hint">位置不可用</small></span>:<button type="button" className="pi-link" onClick={()=>void openMaterial(index)}>{title} ↗</button>}
          {!link?<small className="pi-hint"> · 此主机</small>:null}
          {panel==='materials'||!link&&materialStatus?.[index]===null?<button type="button" className="pi-link" disabled={disabled} aria-label={`更换材料：${title}`} onClick={()=>editMaterial(index)}>重新选择</button>:null}
        </li>;
      })}</ul></section>:null}
      <div className="pi-actions pi-start pi-detail-actions">
        {active?<button type="button" disabled={busy||locked||editing} aria-expanded={panel!==null} onClick={()=>toggle('develop')}>继续发展</button>:<button type="button" disabled={disabled} onClick={()=>void (item.status==='archived'?archive():move('open','记录已重新打开。'))}>{item.status==='archived'?'恢复记录':'重新打开'}</button>}
        <details className="pi-menu"><summary>更多操作</summary><div className="pi-menu-items" onClick={event=>{if(event.target.closest('button'))event.currentTarget.parentElement.open=false;}}>
          {!active&&sessionId&&inputActions?<button type="button" disabled={busy} onClick={()=>void discuss()}>带入当前讨论</button>:null}
          {!active?<button type="button" disabled={busy||locked||editing} onClick={()=>toggle('note')}>补充背景</button>:null}
          {!active?<button type="button" disabled={disabled} onClick={()=>editMaterial(null)}>管理材料</button>:null}
          {!active?<button type="button" disabled={disabled} onClick={()=>toggle('work')}>{item.workRef?'更改关联工作':'关联工作'}</button>:null}
          <button type="button" disabled={disabled} onClick={()=>{setPanel(null);setEditText(item.content);setEditing(true);editRevision.current=item.revision;memory.edits.set(item.id,{content:item.content,revision:item.revision});}}>修改记录文字</button>
          {item.status==='resolved'?<button type="button" disabled={disabled} onClick={()=>toggle('next')}>再次安排下一步</button>:null}
          {item.canUndo?<button type="button" disabled={disabled} onClick={()=>void run('inbox-undo',{id:item.id,revision:item.revision},'已撤销最近一次修改。')}>撤销上次修改</button>:null}
          {item.status!=='archived'?<button type="button" disabled={disabled} onClick={()=>void archive()}>归档记录</button>:null}
        </div></details>
      </div>
      {panel==='develop'?<div className="pi-actions pi-start pi-next" aria-label="继续发展">
        <button type="button" disabled={busy||locked||editing} onClick={()=>setPanel('note')}>{note?'编辑背景':'补充背景'}</button>
        <button type="button" disabled={disabled} onClick={()=>setPanel('work')}>{item.workRef?'更改关联工作':'关联工作'}</button>
        <button type="button" disabled={disabled} onClick={()=>editMaterial(null)}>{item.materials.length?'管理材料':'添加材料'}</button>
        {sessionId&&inputActions?<button type="button" disabled={busy} onClick={()=>void discuss()}>带入当前讨论</button>:null}
        <button type="button" disabled={disabled} onClick={()=>setPanel('next')}>安排下一步</button>
      </div>:null}
      {panel==='work'?<div className="pi-subform"><WorkPicker value={item.workRef} disabled={disabled} onChange={async workRef=>{if(await update({workRef},workRef?'已关联工作。':'已移除工作关联。'))setPanel(null);}}/></div>:null}
      {panel==='materials'?<MaterialPicker key={materialIndex??'new'} rpc={rpc} SourcePicker={SourcePicker} sessionId={sessionId} onPick={chooseMaterial} onClose={()=>setPanel(null)} disabled={disabled}
        onRemove={materialIndex===null?null:()=>void saveMaterials(item.materials.filter((_,index)=>index!==materialIndex))}/>:null}
      {editing?<form className="pi-subform" onSubmit={async event=>{event.preventDefault();setBusy(true);setProblem('');try{const result=await rpc('inbox-edit',{id:item.id,revision:editRevision.current,content:editText,confirmed:true});memory.edits.delete(item.id);setEditing(false);await onSaved(result);}catch(error){setProblem(errorMessage(error));await onSaved(null);}finally{setBusy(false);}}}><label>记录文字<textarea value={editText} required disabled={busy} onChange={event=>{setEditText(event.target.value);memory.edits.set(item.id,{content:event.target.value,revision:editRevision.current});}}/></label><p className="pi-hint">最初原文始终保留。</p><div className="pi-actions"><button type="button" disabled={busy} onClick={()=>{memory.edits.delete(item.id);setEditing(false);setEditText(item.content);}}>取消编辑</button><button className="pi-primary" disabled={busy||!editText.trim()}>保存记录文字</button></div></form>:null}
      {editing&&editRevision.current!==item.revision?<div className="pi-warning"><p>记录文字已有新版本，你的编辑已保留。</p><details><summary>查看最新记录文字</summary><pre>{item.content}</pre></details><button type="button" onClick={()=>{editRevision.current=item.revision;memory.edits.set(item.id,{content:editText,revision:item.revision});setProblem('');setNotice('已采用当前版本继续编辑。');}}>已比较，继续保存我的编辑</button></div>:null}
      {panel==='next'?<div className="pi-actions pi-start pi-next" aria-label="决定下一步">
        {[['work-conversion','发展为工作'],['planner','安排时间'],['formal-task','创建正式任务']].map(([kind,label])=><button key={kind} type="button" disabled={disabled} onClick={()=>setPanel(kind)}>{label}</button>)}
        {active?<button type="button" disabled={disabled} onClick={()=>void (item.status==='waiting'?move('open','已恢复处理。'):move('waiting','已标记为等待中。'))}>{item.status==='waiting'?'继续处理':'标记等待中'}</button>:null}
        {active?<button type="button" disabled={disabled} onClick={()=>void move('resolved','已标为处理完成。')}>标记完成</button>:null}
      </div>:null}
      {['work-conversion','planner','formal-task'].includes(panel)?<Conversion key={panel} item={item} kind={panel==='work-conversion'?'work':panel} busy={busy} setBusy={setBusy} onDone={async result=>{await onSaved(result);if(result)setPanel(null);}} onClose={()=>setPanel(null)}/>:null}
      {problem?<p role="alert" className="pi-error">{problem}</p>:null}{notice?<p role="status" className="pi-notice">{notice}</p>:null}
      {locked?<section className="pi-warning"><h3>上次处理结果尚未确认</h3><button type="button" disabled={busy||Boolean(draft)} onClick={()=>void run('inbox-convert',{id:item.id,revision:item.revision,...item.pendingConversion,confirmed:true},'处理结果已找回。')}>找回处理结果</button></section>:null}
    </article>;
  }
  return function Inbox({sessionId,inputActions,useInput=noInput}) {
    const occurrences=useInput(selectOccurrences);
    const [change]=usePersonal('change');
    useSyncExternalStore(subscribe,()=>memory.drafts.size,()=>0);
    const captureId=useId();
    const [capture,setCapture]=usePersonal('capture'),[selection,setSelection]=usePersonal('selection');
    const [query,setQuery]=usePersonal('query'),[status,setStatus]=usePersonal('status'),[sourceFilter,setSourceFilter]=usePersonal('sourceFilter'),[linked,setLinked]=usePersonal('linked'),[workFilter,setWorkFilter]=usePersonal('workFilter');
    const [items,setItems]=useState([]),[detail,setDetail]=useState(null),[problem,setProblem]=useState(''),[captureError,setCaptureError]=useState(''),[notice,setNotice]=useState('');
    const [captureFocused,setCaptureFocused]=useState(false),[workFilterOpen,setWorkFilterOpen]=useState(false);
    const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[importing,setImporting]=useState(false),[backup,setBackup]=useState(null),[problems,setProblems]=useState([]);
    const request=useRef(0),alive=useRef(true),file=useRef(null),captureInput=useRef(null),scroll=useRef(null),browser=useRef(null),listScroll=useRef(0),latestSelection=useRef(selection);
    latestSelection.current=selection;
    const refresh=async()=>{
      const ticket=++request.current;
      const {query,status,sourceFilter,linked,workFilter}=memory;
      try{const result=await rpc('inbox-list',{...(query?{query}:{}),...(status?{status}:{}),...(sourceFilter?{sourceType:sourceFilter}:{}),...(linked?{linked:linked==='yes'}:{}),...(workFilter?{workRef:workFilter}:{})});if(alive.current&&ticket===request.current){setItems(result.items);setProblems(result.problems);setProblem('');}}
      catch(error){if(alive.current&&ticket===request.current)setProblem(errorMessage(error));}finally{if(alive.current&&ticket===request.current)setLoading(false);}
    };
    const readDetail=async(id=latestSelection.current)=>{if(!id)return;try{const value=await rpc('inbox-get',{id});if(alive.current&&latestSelection.current===id)setDetail(current=>current?.id===id&&current.revision>value.revision?current:value);}catch(error){if(alive.current&&latestSelection.current===id)setProblem(errorMessage(error));}};
    const saved=async result=>{if(!alive.current)return;if(result&&latestSelection.current===result.id)setDetail(current=>current?.id===result.id&&current.revision>result.revision?current:result);else if(!result)await readDetail();await refresh();};
    useEffect(()=>{if(change)void saved(change.result);},[change]);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
    useEffect(()=>{const timer=setTimeout(()=>void refresh(),150);return()=>clearTimeout(timer);},[query,status,sourceFilter,linked,workFilter]);
    useEffect(()=>{void readDetail(selection);},[selection]);
    useEffect(()=>{const update=()=>{if(document.visibilityState!=='hidden'){void refresh();void readDetail();}};const timer=setInterval(update,10000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[query,status,sourceFilter,linked,workFilter]);
    useLayoutEffect(()=>{
      const input=captureInput.current;
      if(!input)return;
      input.style.height='';
      if(capture||captureFocused)input.style.height=Math.min(156,input.scrollHeight)+'px';
    },[capture,captureFocused]);
    useLayoutEffect(()=>{
      if(!scroll.current||!browser.current)return;
      if(selection&&window.getComputedStyle(browser.current).display==='none')scroll.current.scrollTop=0;
      if(!selection)scroll.current.scrollTop=listScroll.current;
    },[selection]);
    const choose=item=>{
      if(!selection)listScroll.current=scroll.current?.scrollTop??0;
      setSelection(item.id);setDetail(item);setNotice('');
    };
    return <div className="pi-scroll" ref={scroll}><section className={`pi${selection?' pi-has-detail':''}`} aria-label="个人收集箱"><div className="pi-overview"><header className="pi-head"><h1>收集箱</h1><details className="pi-menu pi-backup-menu"><summary>更多</summary><div className="pi-menu-items" onClick={event=>{if(event.target.closest('button'))event.currentTarget.parentElement.open=false;}}><button type="button" onClick={()=>setImporting(!importing)}>从 Logseq 导入</button><button type="button" onClick={async()=>{try{const value=await rpc('inbox-export',{});const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`personal-inbox-${localDate()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(`已导出 ${value.items.length} 条记录，包含归档。`);}catch(error){setProblem(errorMessage(error));}}}>导出全部记录</button><button type="button" onClick={()=>file.current.click()}>从备份恢复</button></div></details><input ref={file} hidden type="file" accept=".json,application/json" onChange={async event=>{const input=event.target;try{const data=JSON.parse(await input.files[0].text());if(data.schemaVersion!==1||!Array.isArray(data.items))throw Error('invalid');setBackup(data);}catch{setProblem('无法读取这份 Inbox 备份，请检查文件。');}finally{input.value='';}}}/></header>
      <form className="pi-capture" onSubmit={async event=>{
        event.preventDefault();if(saving||!capture.trim())return;setSaving(true);setCaptureError('');
        memory.captureAttempt??={id:crypto.randomUUID(),originalContent:capture,source:captureSource(capture,sessionId)};
        try{const item=await rpc('inbox-create',memory.captureAttempt);memory.captureAttempt=null;if(memory.capture===item.originalContent){setCapture('');}listScroll.current=0;setSelection(null);setDetail(null);setStatus('open');setQuery('');setSourceFilter('');setLinked('');setWorkFilter(null);setNotice('已存入收集箱。');await refresh();captureInput.current?.focus();}catch(error){setCaptureError(errorMessage(error));}finally{setSaving(false);}
      }}><div className="pi-capture-entry"><label htmlFor={captureId} className="pi-visually-hidden">记录值得保留的信息</label><textarea id={captureId} ref={captureInput} rows={1} maxLength={100000} placeholder="记一句话，或粘贴一个链接…" onFocus={()=>setCaptureFocused(true)} onBlur={()=>setCaptureFocused(false)} value={capture} disabled={saving||Boolean(memory.captureAttempt)} onChange={event=>setCapture(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form.requestSubmit();}}}/>
        <button className="pi-primary" disabled={saving||!capture.trim()}>{saving?'保存中…':memory.captureAttempt?'重试':'记下'}</button></div>
        {captureError?<p role="alert" className="pi-error">{captureError}</p>:null}{memory.captureAttempt&&!saving?<p className="pi-hint">保留了上次保存请求，重试会找回同一条记录。</p>:null}
      </form>
      {importing?<SourcePicker key={sessionId??'general'} sessionId={sessionId} onClose={()=>setImporting(false)} onPick={async item=>{choose(item);setImporting(false);await refresh();}}/>:null}
      {backup?<section className="pi-warning"><h2>恢复备份</h2><p>包含 {backup.items.length} 条记录。已有记录不会被覆盖。</p><div className="pi-actions"><button type="button" disabled={saving} onClick={()=>setBackup(null)}>取消</button><button className="pi-primary" disabled={saving} onClick={async()=>{setSaving(true);try{const result=await rpc('inbox-import',{backup});setNotice(`已恢复 ${result.imported.length} 条，跳过 ${result.skipped.length} 条，冲突 ${result.conflicts.length} 条。${result.conflicts.length?'冲突记录保持原样。':''}`);setBackup(null);await refresh();}catch(error){setProblem(errorMessage(error));}finally{setSaving(false);}}}>确认恢复</button></div></section>:null}
      {notice?<p role="status" className="pi-notice">{notice}</p>:null}</div>{problem?<p role="alert" className="pi-error">{problem} <button type="button" onClick={()=>{void refresh();void readDetail();}}>刷新</button></p>:null}{problems.length?<p className="pi-error">有 {problems.length} 条记录暂不可读，其他记录仍可查看。</p>:null}
      <div className="pi-layout"><aside ref={browser} className="pi-browser" aria-label="浏览记录">
        <div className="pi-search"><input type="search" maxLength={1000} aria-label="搜索记录" placeholder="搜索记录" value={query} onChange={event=>setQuery(event.target.value)}/>
          <details className="pi-menu"><summary>{sourceFilter||linked?'已筛选':'筛选'}</summary><div className="pi-filter-items">
            <label>来源<select value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)}><option value="">不限</option>{Object.entries(sourceNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
            <label>工作关联<select value={linked} onChange={event=>{setLinked(event.target.value);if(event.target.value!=='yes')setWorkFilter(null);}}><option value="">不限</option><option value="yes">已关联工作</option><option value="no">未关联工作</option></select></label>
            <details onToggle={event=>setWorkFilterOpen(event.currentTarget.open)}><summary>{workFilter?'已按指定工作筛选':'按指定工作筛选'}</summary>{workFilterOpen?<WorkPicker value={workFilter} onChange={ref=>{setWorkFilter(ref);if(ref)setLinked('yes');}}/>:null}</details>
          </div></details>
        </div>
        <nav className="pi-views" aria-label="记录范围">
          {[['open','待处理'],['waiting','等待中'],['resolved','已处理']].map(([value,label])=><button key={value} type="button" aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}</button>)}
          <details className="pi-menu"><summary>{status==='archived'?'归档':status==='all'?'全部':'更多'}</summary><div className="pi-menu-items">
            <button type="button" onClick={event=>{setStatus('archived');event.currentTarget.closest('details').open=false;}}>归档</button>
            <button type="button" onClick={event=>{setStatus('all');event.currentTarget.closest('details').open=false;}}>全部记录</button>
          </div></details>
        </nav>
        <div className="pi-list" aria-busy={loading}>{items.map(item=><button className={`pi-card${selection===item.id?' is-selected':''}`} type="button" key={item.id} aria-pressed={selection===item.id} onClick={()=>choose(item)}>
          <span>{visibleContent(item).replace(/\s+/gu,' ').slice(0,160)}</span>
          {item.context?<span className="pi-preview">{item.context.replace(/\s+/gu,' ').slice(0,120)}</span>:null}
          <small>{item.source?.type&&item.source.type!=='dsh'&&item.source.type!=='manual'?`${sourceNames[item.source.type]} · `:''}{when(item.createdAt)}{item.workRef?' · 关联工作':''}{item.materials.length?` · ${item.materials.length} 份材料`:''}{memory.drafts.has(item.id)||memory.edits.has(item.id)?' · 有草稿':''}</small>
        </button>)}</div>
        {!items.length?<div className="pi-empty">{loading?'正在读取…':query||sourceFilter||linked?'没有找到匹配的记录。':status==='archived'?'还没有归档记录。':status==='resolved'?'还没有已处理记录。':status==='waiting'?'还没有等待中的记录。':<><h2>先记下来，之后再整理</h2><p>想法、提醒和链接都可以放在这里，随时记下，无需分类。</p><button type="button" className="pi-link" onClick={()=>captureInput.current?.focus()}>试着记下「整理一下研究报告」</button></>}</div>:null}
      </aside><div className="pi-reading">{detail&&detail.id===selection?<Detail key={detail.id} item={detail} sessionId={sessionId} inputActions={inputActions} occurrences={occurrences} onSaved={saved} onBack={()=>setSelection(null)}/>:selection?<div className="pi-empty"><button type="button" className="pi-link" onClick={()=>setSelection(null)}>‹ 返回记录</button><p>正在读取这条记录…</p></div>:null}</div></div>
    </section></div>;
  };
}
