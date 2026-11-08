import React, {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import {insertInboxReference} from './reference.mjs';
import {blockUrl} from '../reader-model.mjs';
import {captureSource, errorMessage, isDirty, itemDraft, localDate, safeLink, sourceNames, statusNames, visibleContent, workIdentity} from './client-model.mjs';
/* global crypto, window, document, Blob, URL, setTimeout, clearTimeout, setInterval, clearInterval */

const when = value => new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const titleOf = item => item.content.split('\n').find(line=>line.trim())?.slice(0,300) ?? '';

export function createPersonalInbox({rpc,insertReference,onOpenSession,onOpenPlanner}) {
  // One personal UI, including drafts, across the host's Session-mounted tab instances.
  const memory = {capture:'',source:'',captureAttempt:null,selection:null,query:'',status:'',sourceFilter:'',linked:'',workFilter:null,drafts:new Map(),edits:new Map(),conversions:new Map(),importAttempts:new Map()};
  const listeners=new Set();
  const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
  function usePersonal(key) {
    const value=useSyncExternalStore(subscribe,()=>memory[key],()=>memory[key]);
    return [value,next=>{memory[key]=typeof next==='function'?next(memory[key]):next;for(const listener of listeners)listener();}];
  }
  function WorkPicker({value,onChange,disabled=false,allowEmpty=true,naturalOnly=false}) {
    const [works,setWorks]=useState([]),[problem,setProblem]=useState(''),[loaded,setLoaded]=useState(false);
    const load=async()=>{try{const catalog=await rpc('catalog',{});const unique=new Map();for(const graph of catalog.graphs)for(const work of graph.works)unique.set(workIdentity(work.workRef),work);setWorks([...unique.values()]);setLoaded(true);setProblem('');}catch{setProblem('工作目录暂不可读，已有的关联仍会保留。');}};
    useEffect(()=>{void load();},[]);
    const rows=works.filter(work=>!naturalOnly||work.workRef.kind==='logseq');
    const current=workIdentity(value);
    return <div className="pi-field"><label>关联工作<select aria-label={naturalOnly?'选择 Logseq 来源工作':'关联工作'} disabled={disabled} value={current} onChange={event=>onChange(event.target.value?JSON.parse(event.target.value):null)}>
      <option value="">{allowEmpty?'不关联工作':'选择一件工作'}</option>
      {current&&!rows.some(work=>workIdentity(work.workRef)===current)?<option value={current}>已保存的工作关联</option>:null}
      {rows.map(work=><option key={workIdentity(work.workRef)} value={workIdentity(work.workRef)}>{work.title} · {work.location}</option>)}
    </select></label>{problem?<p className="pi-hint">{problem} <button type="button" onClick={()=>void load()}>重试</button></p>:loaded&&!rows.length?<p className="pi-hint">工作目录还没有可选项目，可稍后再关联。</p>:null}</div>;
  }
  function SourcePicker({sessionId,onPick,onClose}) {
    const [reader,setReader]=useState(null),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
    const attempts=memory.importAttempts;
    useEffect(()=>{let active=true;setReader(null);setProblem('');if(sessionId)rpc('reader',{sessionId}).then(value=>{if(active)setReader(value);}).catch(()=>{if(active)setProblem('当前 Logseq 来源尚未连接。可继续直接记录，或先在 Logseq 连接一件工作。');});return()=>{active=false;};},[sessionId]);
    return <section className="pi-picker" aria-label="导入 Logseq 块"><div className="pi-row"><h2>选择当前工作中的原文</h2><button type="button" onClick={onClose}>关闭</button></div>
      {!sessionId?<p className="pi-hint">先打开一个已连接 Logseq 的工作对话，再选择来源。</p>:!reader?<p className="pi-hint">{problem||'正在读取当前来源…'}</p>:<div className="pi-source-list">{reader.nodes.filter(node=>node.availability==='available').map(node=><button key={node.sourceId} type="button" disabled={busy} onClick={async()=>{
        const key=`${sessionId}:${node.sourceId}`;if(!attempts.has(key))attempts.set(key,crypto.randomUUID());
        setBusy(true);setProblem('');try{const item=await rpc('inbox-import-logseq',{id:attempts.get(key),sessionId,sourceId:node.sourceId});await onPick(item);}catch(error){setProblem(errorMessage(error));}finally{setBusy(false);}
      }}><span>{node.body.markdown.slice(0,180)||'空白来源'}</span><small>{reader.scope.pageName??'当前工作'} · Logseq</small></button>)}{!reader.nodes.length?<p>当前来源没有可导入的块。</p>:null}</div>}
      {reader&&problem?<p role="alert" className="pi-error">{problem}</p>:null}
    </section>;
  }
  function Conversion({item,kind,onDone,onClose}) {
    const saved=memory.conversions.get(item.id);
    const [form,setForm]=useState(()=>saved?.kind===kind?saved.form:{title:titleOf(item),date:localDate(),slotId:'',workRef:item.workRef??item.outcomes.findLast(result=>result.kind==='formal-task')?.reference.workRef??null,resolve:true});
    const [options,setOptions]=useState(null),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
    const attempt=useRef(saved?.kind===kind?saved.attempt:null);
    const set=patch=>{const next={...form,...patch};setForm(next);if(!attempt.current)memory.conversions.set(item.id,{kind,form:next,attempt:null});};
    useEffect(()=>{if(kind==='planner')rpc('inbox-options',{}).then(value=>{setOptions(value);setForm(current=>({...current,slotId:current.slotId||value.slots[0]?.id||''}));}).catch(error=>setProblem(errorMessage(error)));},[]);
    const sourceAnchor=item.source?.type==='logseq'?{graphId:item.source.graphId,blockUuid:item.source.blockUuid}:null;
    const anchor=sourceAnchor??(form.workRef?.kind==='logseq'?{graphId:form.workRef.graphId,blockUuid:form.workRef.rootUuid}:null);
    const workRef=form.workRef??(sourceAnchor?{kind:'logseq',graphId:sourceAnchor.graphId,rootUuid:sourceAnchor.blockUuid,sourceKind:'block'}:null);
    const label=kind==='planner'?'安排到规划':kind==='work'?'发展为工作':'创建正式任务';
    return <form className="pi-conversion" aria-label={label} onSubmit={async event=>{
      event.preventDefault();setBusy(true);setProblem('');
      if(!attempt.current){attempt.current={id:item.id,revision:item.revision,operationId:crypto.randomUUID(),kind,confirmed:true,resolve:form.resolve,
        parameters:kind==='planner'?{entry:{title:form.title,date:form.date,slotId:form.slotId}}:kind==='work'?{title:form.title,workRef}:{title:form.title,anchor}};memory.conversions.set(item.id,{kind,form,attempt:attempt.current});}
      try{const result=await rpc('inbox-convert',{...attempt.current,revision:item.revision});memory.conversions.delete(item.id);await onDone(result);onClose();}catch(error){setProblem(errorMessage(error));await onDone(null);}finally{setBusy(false);}
    }}><div className="pi-row"><h3>{label}</h3><button type="button" disabled={busy} onClick={onClose}>关闭</button></div>
      <label>处理后的名称<input required maxLength={300} value={form.title} disabled={busy||Boolean(attempt.current)} onChange={event=>set({title:event.target.value})}/></label>
      {kind==='planner'?<div className="pi-row pi-fields"><label>日期<input type="date" required value={form.date} disabled={busy||Boolean(attempt.current)} onChange={event=>set({date:event.target.value})}/></label><label>时间段<select required value={form.slotId} disabled={busy||Boolean(attempt.current)} onChange={event=>set({slotId:event.target.value})}><option value="">选择时间段</option>{options?.slots.map(slot=><option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label></div>:kind==='work'||!sourceAnchor?<WorkPicker value={form.workRef} onChange={ref=>set({workRef:ref})} naturalOnly={kind==='formal-task'} disabled={busy||Boolean(attempt.current)}/>:<p className="pi-hint">使用已导入的 Logseq 原文作为来源。</p>}
      {kind==='formal-task'?<p className="pi-hint">确认后通过现有正式任务服务创建任务，原始记录继续保留。需要来源所在的 Logseq 图保持连接。</p>:kind==='work'?<p className="pi-hint">进入所选工作继续发展，原始记录继续保留。</p>:<p className="pi-hint">创建一条个人安排，原始记录继续保留。</p>}
      <label className="pi-check"><input type="checkbox" checked={form.resolve} disabled={busy||Boolean(attempt.current)} onChange={event=>set({resolve:event.target.checked})}/>处理成功后标为已处理</label>
      {problem?<p role="alert" className="pi-error">{problem}</p>:null}
      <div className="pi-actions">{attempt.current?<button type="button" disabled={busy||Boolean(item.pendingConversion)} onClick={()=>{attempt.current=null;memory.conversions.delete(item.id);setProblem('');}}>重新填写</button>:null}<button className="pi-primary" disabled={busy||!form.title.trim()||(kind==='planner'&&!form.slotId)||(kind==='work'&&!workRef)||(kind==='formal-task'&&!anchor)}>{busy?'正在处理…':attempt.current?'重试同一操作':`确认${label}`}</button></div>
    </form>;
  }
  function Detail({item,sessionId,inputActions,onSaved,onBack}) {
    const [draft,setDraft]=useState(()=>memory.drafts.get(item.id)??itemDraft(item));
    const [editing,setEditing]=useState(()=>memory.edits.has(item.id)),[editText,setEditText]=useState(()=>memory.edits.get(item.id)?.content??item.content);
    const [busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[notice,setNotice]=useState(''),[conversion,setConversion]=useState(null);
    const operation=useRef(null),editRevision=useRef(memory.edits.get(item.id)?.revision??item.revision);
    const dirty=isDirty(draft,item),locked=Boolean(item.pendingConversion),actionDisabled=busy||locked||dirty||editing;
    const updateDraft=patch=>{const next={...draft,...patch};setDraft(next);memory.drafts.set(item.id,next);};
    useEffect(()=>{if(!memory.drafts.has(item.id)){setDraft(itemDraft(item));}if(!editing&&!memory.edits.has(item.id))setEditText(item.content);},[item.revision]);
    const accept=result=>{memory.drafts.delete(item.id);setDraft(itemDraft(result));return onSaved(result);};
    const run=async(method,payload,message)=>{setBusy(true);setProblem('');setNotice('');try{const result=await rpc(method,payload);await accept(result);setNotice(message);}catch(error){setProblem(errorMessage(error));await onSaved(null);}finally{setBusy(false);}};
    return <article className="pi-detail" aria-label="记录详情"><div className="pi-row"><button type="button" className="pi-back" onClick={onBack}>‹ 返回记录</button><span className="pi-meta">{sourceNames[item.source?.type]??'直接记录'} · {when(item.createdAt)}</span></div>
      <div className="pi-row"><span className="pi-badge">{statusNames[item.status]}</span><span className="pi-meta">{['open','waiting'].includes(item.status)?(item.stage==='developing'?'正在发展':'新记录'):'原始记录已保留'}</span></div>
      <div className="pi-content">{visibleContent(item)}</div>
      {item.editedContent!==null||visibleContent(item)!==item.originalContent?<details><summary>查看最初原文</summary><pre className="pi-original">{item.originalContent}</pre></details>:null}
      {item.source?.type==='logseq'?<a className="pi-link" href={blockUrl(item.source.graphId,item.source.blockUuid)}>在 Logseq 打开来源 ↗</a>:item.source?.locator?<p className="pi-hint">来源：{safeLink(item.source.locator)?<a href={safeLink(item.source.locator)} target="_blank" rel="noreferrer">{item.source.locator}</a>:item.source.locator}</p>:null}
      <div className="pi-actions pi-start"><button type="button" disabled={actionDisabled} onClick={()=>{setEditing(true);editRevision.current=item.revision;memory.edits.set(item.id,{content:editText,revision:item.revision});}}>编辑显示文字</button><button type="button" disabled={busy||!sessionId||!inputActions} onClick={async()=>{setProblem('');try{if(!await insertInboxReference(inputActions,item,(ref,span)=>insertReference(sessionId,ref,span)))throw Error('busy');setNotice('已放入当前输入框，尚未发送。');}catch{setProblem('当前输入框暂不可用，请稍后重试。');}}}>带入当前讨论</button></div>
      {editing?<form className="pi-subform" onSubmit={async event=>{event.preventDefault();setBusy(true);setProblem('');try{const result=await rpc('inbox-edit',{id:item.id,revision:editRevision.current,content:editText,confirmed:true});memory.edits.delete(item.id);setEditing(false);await accept(result);}catch(error){setProblem(errorMessage(error));await onSaved(null);}finally{setBusy(false);}}}><label>显示文字<textarea value={editText} required disabled={busy} onChange={event=>{setEditText(event.target.value);memory.edits.set(item.id,{content:event.target.value,revision:editRevision.current});}}/></label><p className="pi-hint">最初原文始终保留。</p><div className="pi-actions"><button type="button" disabled={busy} onClick={()=>{memory.edits.delete(item.id);setEditing(false);setEditText(item.content);}}>取消编辑</button><button className="pi-primary" disabled={busy||!editText.trim()}>保存显示文字</button></div></form>:null}
      {editing&&editRevision.current!==item.revision?<div className="pi-warning"><p>显示文字已有新版本，你的编辑已保留。</p><details><summary>查看最新显示文字</summary><pre>{item.content}</pre></details><button type="button" onClick={()=>{editRevision.current=item.revision;memory.edits.set(item.id,{content:editText,revision:item.revision});setProblem('');setNotice('已采用当前版本继续编辑。');}}>已比较，继续保存我的编辑</button></div>:null}
      <form className="pi-development" onSubmit={event=>{event.preventDefault();void run('inbox-update',{id:item.id,revision:draft.revision,patch:{context:draft.context,materials:draft.materials,workRef:draft.workRef,...(item.status==='archived'?{}:{status:draft.status})}},'补充内容已保存。');}}>
        <h2>继续补充</h2><label>背景与想法<textarea placeholder="补充一点背景、下一步想法，或讨论结论…" value={draft.context} disabled={busy||locked||editing} onChange={event=>updateDraft({context:event.target.value})}/></label>
        <details className="pi-materials" open={draft.materials.length>0||undefined}><summary>相关材料 {draft.materials.length?`· ${draft.materials.length}`:''}</summary>
          {draft.materials.map((material,index)=><div className="pi-material" key={index}><label>名称<input aria-label={`材料 ${index+1} 名称`} required value={material.label} disabled={busy||locked||editing} onChange={event=>updateDraft({materials:draft.materials.map((row,i)=>i===index?{...row,label:event.target.value}:row)})}/></label><label>网页或文件位置<input aria-label={`材料 ${index+1} 位置`} required value={material.locator} disabled={busy||locked||editing} onChange={event=>updateDraft({materials:draft.materials.map((row,i)=>i===index?{...row,locator:event.target.value}:row)})}/></label><button type="button" aria-label={`移除材料 ${index+1}`} disabled={busy||locked||editing} onClick={()=>updateDraft({materials:draft.materials.filter((_,i)=>i!==index)})}>移除</button>{safeLink(material.locator)?<a href={safeLink(material.locator)} target="_blank" rel="noreferrer">打开 ↗</a>:null}</div>)}
          <button type="button" disabled={busy||locked||editing} onClick={()=>updateDraft({materials:[...draft.materials,{label:'',locator:''}]})}>＋ 添加材料</button>
        </details>
        <details><summary>{draft.workRef?'已关联一件工作':'关联工作 · 可稍后再选'}</summary><WorkPicker value={draft.workRef} onChange={ref=>updateDraft({workRef:ref})} disabled={busy||locked||editing}/>{item.workRef?<button type="button" disabled={actionDisabled} onClick={async()=>{try{const key=workIdentity(item.workRef);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};const result=await rpc('inbox-open-work',{id:item.id,operationId:operation.current.id});await onOpenSession(result.sessionId);}catch(error){setProblem(errorMessage(error));}}}>进入关联工作 ↗</button>:null}</details>
        <div className="pi-row pi-fields"><label>处理状态<select aria-label="处理状态" value={item.status==='archived'?'archived':draft.status} disabled={busy||locked||editing||item.status==='archived'} onChange={event=>updateDraft({status:event.target.value})}>{Object.entries(statusNames).filter(([status])=>status!=='archived'||item.status==='archived').map(([status,label])=><option key={status} value={status}>{label}</option>)}</select></label><button className="pi-primary" disabled={busy||locked||editing||!dirty}>{busy?'正在保存…':'保存补充'}</button></div>
        {dirty?<p className="pi-hint">有未保存的补充内容，切换记录后仍会保留。</p>:null}
      </form>
      {draft.revision!==item.revision&&dirty?<div className="pi-warning"><p>已读到更新版本。你的输入仍保留，请先比较再决定是否保存。</p><details><summary>查看最新保存的背景</summary><pre>{item.context||'没有补充背景'}</pre></details><button type="button" onClick={()=>updateDraft({revision:item.revision})}>已比较，使用当前输入继续保存</button><button type="button" onClick={()=>{memory.drafts.delete(item.id);setDraft(itemDraft(item));}}>改用最新保存内容</button></div>:null}
      {problem?<p role="alert" className="pi-error">{problem}</p>:null}{notice?<p role="status" className="pi-notice">{notice}</p>:null}
      {locked?<section className="pi-warning"><h3>上次处理结果尚未确认</h3><p>原始记录已保存，可找回同一次操作的结果。</p><button type="button" disabled={busy} onClick={()=>void run('inbox-convert',{id:item.id,revision:item.revision,...item.pendingConversion,confirmed:true},'处理结果已找回。')}>找回处理结果</button></section>:null}
      {item.status!=='archived'?<div className="pi-exits"><h2>决定下一步</h2><div className="pi-actions pi-start">{[['work','发展为工作'],['planner','安排到规划'],['formal-task','创建正式任务']].map(([kind,label])=><button key={kind} type="button" disabled={actionDisabled} onClick={()=>setConversion(kind)}>{label}</button>)}</div></div>:null}
      {conversion?<Conversion key={conversion} item={item} kind={conversion} onDone={result=>result?accept(result):onSaved(null)} onClose={()=>setConversion(null)}/>:null}
      {item.outcomes.length?<section className="pi-outcomes"><h2>处理去向</h2>{item.outcomes.map(outcome=><div className="pi-row" key={outcome.operationId}><span>{outcome.kind==='planner'?'已加入规划':outcome.kind==='work'?'已发展为工作':'已创建正式任务'} · {when(outcome.createdAt)}</span>{outcome.kind==='planner'?<button type="button" onClick={()=>onOpenPlanner?.()}>查看规划 ↗</button>:outcome.reference.logseqUrl?<a href={outcome.reference.logseqUrl}>查看来源 ↗</a>:outcome.reference.sessionId?<button type="button" onClick={()=>void onOpenSession(outcome.reference.sessionId)}>继续工作 ↗</button>:null}</div>)}</section>:null}
      <footer className="pi-detail-foot"><span>更新于 {when(item.updatedAt)}</span><div className="pi-actions">{item.canUndo?<button type="button" disabled={actionDisabled} onClick={()=>void run('inbox-undo',{id:item.id,revision:item.revision},'已撤销最近一次修改。')}>撤销上次修改</button>:null}<button type="button" disabled={actionDisabled} onClick={()=>void run(item.status==='archived'?'inbox-restore':'inbox-archive',{id:item.id,revision:item.revision},item.status==='archived'?'已恢复。':'已归档，可随时恢复。')}>{item.status==='archived'?'恢复记录':'归档记录'}</button></div></footer>
    </article>;
  }
  return function Inbox({sessionId,inputActions}) {
    const captureId=useId();
    const [capture,setCapture]=usePersonal('capture'),[source,setSource]=usePersonal('source'),[selection,setSelection]=usePersonal('selection');
    const [query,setQuery]=usePersonal('query'),[status,setStatus]=usePersonal('status'),[sourceFilter,setSourceFilter]=usePersonal('sourceFilter'),[linked,setLinked]=usePersonal('linked'),[workFilter,setWorkFilter]=usePersonal('workFilter');
    const [items,setItems]=useState([]),[detail,setDetail]=useState(null),[problem,setProblem]=useState(''),[captureError,setCaptureError]=useState(''),[notice,setNotice]=useState('');
    const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[importing,setImporting]=useState(false),[backup,setBackup]=useState(null),[problems,setProblems]=useState([]);
    const request=useRef(0),alive=useRef(true),file=useRef(null),captureInput=useRef(null),latestSelection=useRef(selection);
    latestSelection.current=selection;
    const refresh=async()=>{
      const ticket=++request.current;
      try{const result=await rpc('inbox-list',{...(query?{query}:{}),...(status?{status}:{}),...(sourceFilter?{sourceType:sourceFilter}:{}),...(linked?{linked:linked==='yes'}:{}),...(workFilter?{workRef:workFilter}:{})});if(alive.current&&ticket===request.current){setItems(result.items);setProblems(result.problems);setProblem('');}}
      catch(error){if(alive.current&&ticket===request.current)setProblem(errorMessage(error));}finally{if(alive.current&&ticket===request.current)setLoading(false);}
    };
    const readDetail=async(id=latestSelection.current)=>{if(!id)return;try{const value=await rpc('inbox-get',{id});if(alive.current&&latestSelection.current===id)setDetail(current=>current?.id===id&&current.revision>value.revision?current:value);}catch(error){if(alive.current&&latestSelection.current===id)setProblem(errorMessage(error));}};
    const saved=async result=>{if(result&&latestSelection.current===result.id)setDetail(result);else if(!result)await readDetail();await refresh();};
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
    useEffect(()=>{const timer=setTimeout(()=>void refresh(),150);return()=>clearTimeout(timer);},[query,status,sourceFilter,linked,workFilter]);
    useEffect(()=>{setDetail(null);void readDetail(selection);},[selection]);
    useEffect(()=>{const update=()=>{if(document.visibilityState!=='hidden'){void refresh();void readDetail();}};const timer=setInterval(update,10000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[query,status,sourceFilter,linked,workFilter]);
    const choose=item=>{setSelection(item.id);setDetail(item);setNotice('');};
    return <section className={`pi${selection?' pi-has-detail':''}`} aria-label="个人收集箱"><header className="pi-head"><div><span className="pi-eyebrow">Personal Inbox</span><h1>收集箱</h1><p>先留下，再慢慢发展。</p></div><details className="pi-backup-menu"><summary>备份与恢复</summary><button type="button" onClick={async()=>{try{const value=await rpc('inbox-export',{});const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`personal-inbox-${localDate()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(`已导出 ${value.items.length} 条记录，包含归档。`);}catch(error){setProblem(errorMessage(error));}}}>导出全部记录</button><button type="button" onClick={()=>file.current.click()}>从备份恢复</button></details><input ref={file} hidden type="file" accept=".json,application/json" onChange={async event=>{const input=event.target;try{const data=JSON.parse(await input.files[0].text());if(data.schemaVersion!==1||!Array.isArray(data.items))throw Error('invalid');setBackup(data);}catch{setProblem('无法读取这份 Inbox 备份，请检查文件。');}finally{input.value='';}}}/></header>
      <form className="pi-capture" onSubmit={async event=>{
        event.preventDefault();if(saving||!capture.trim())return;setSaving(true);setCaptureError('');
        memory.captureAttempt??={id:crypto.randomUUID(),originalContent:capture,source:captureSource(capture,source,sessionId)};
        try{const item=await rpc('inbox-create',memory.captureAttempt);memory.captureAttempt=null;if(memory.capture===item.originalContent){setCapture('');setSource('');}setSelection(item.id);setDetail(item);setNotice('已保存。');await refresh();captureInput.current?.focus();}catch(error){setCaptureError(errorMessage(error));}finally{setSaving(false);}
      }}><label htmlFor={captureId} className="pi-visually-hidden">记录值得保留的信息</label><textarea id={captureId} ref={captureInput} placeholder="一句话、一个链接，或一段值得保留的原文…" value={capture} disabled={saving||Boolean(memory.captureAttempt)} onChange={event=>setCapture(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form.requestSubmit();}}}/>
        <div className="pi-row"><details><summary>补充来源</summary><select aria-label="捕获来源" value={source} disabled={saving||Boolean(memory.captureAttempt)} onChange={event=>setSource(event.target.value)}><option value="">自动保留来源</option>{Object.entries(sourceNames).filter(([key])=>key!=='logseq').map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></details><button type="button" className="pi-link" onClick={()=>setImporting(!importing)}>从 Logseq 导入</button><button className="pi-primary" disabled={saving||!capture.trim()}>{saving?'正在保存…':memory.captureAttempt?'重试保存':'保存'}</button></div>
        {captureError?<p role="alert" className="pi-error">{captureError}</p>:null}{memory.captureAttempt&&!saving?<p className="pi-hint">保留了上次保存请求，重试会找回同一条记录。</p>:null}
      </form>
      {importing?<SourcePicker key={sessionId??'general'} sessionId={sessionId} onClose={()=>setImporting(false)} onPick={async item=>{choose(item);setImporting(false);await refresh();}}/>:null}
      {backup?<section className="pi-warning"><h2>恢复备份</h2><p>包含 {backup.items.length} 条记录。已有记录不会被覆盖。</p><div className="pi-actions"><button type="button" disabled={saving} onClick={()=>setBackup(null)}>取消</button><button className="pi-primary" disabled={saving} onClick={async()=>{setSaving(true);try{const result=await rpc('inbox-import',{backup});setNotice(`已恢复 ${result.imported.length} 条，跳过 ${result.skipped.length} 条，冲突 ${result.conflicts.length} 条。${result.conflicts.length?'冲突记录保持原样。':''}`);setBackup(null);await refresh();}catch(error){setProblem(errorMessage(error));}finally{setSaving(false);}}}>确认恢复</button></div></section>:null}
      {notice?<p role="status" className="pi-notice">{notice}</p>:null}{problem?<p role="alert" className="pi-error">{problem} <button type="button" onClick={()=>void refresh()}>刷新</button></p>:null}{problems.length?<p className="pi-error">有 {problems.length} 条记录暂不可读，其他记录仍可查看。</p>:null}
      <div className="pi-layout"><aside className="pi-browser" aria-label="浏览记录"><nav className="pi-views" aria-label="记录范围">{[['','最近'],['resolved','已处理'],['archived','归档']].map(([value,label])=><button key={value} type="button" aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}</button>)}</nav>
        <input type="search" aria-label="搜索记录" placeholder="搜索原文、背景和材料…" value={query} onChange={event=>setQuery(event.target.value)}/>
        <div className="pi-filters"><select aria-label="按来源筛选" value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)}><option value="">所有来源</option>{Object.entries(sourceNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><select aria-label="按状态筛选" value={status} onChange={event=>setStatus(event.target.value)}><option value="">默认列表</option><option value="all">全部记录</option>{Object.entries(statusNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><select aria-label="按工作关联筛选" value={linked} onChange={event=>{setLinked(event.target.value);if(event.target.value!=='yes')setWorkFilter(null);}}><option value="">所有工作关联</option><option value="yes">已关联工作</option><option value="no">未关联工作</option></select></div>
        <details className="pi-work-filter"><summary>{workFilter?'已按指定工作筛选':'按指定工作筛选'}</summary><WorkPicker value={workFilter} onChange={ref=>{setWorkFilter(ref);if(ref)setLinked('yes');}}/></details><div className="pi-list" aria-busy={loading}>{items.map(item=><button className={`pi-card${selection===item.id?' is-selected':''}`} type="button" key={item.id} aria-pressed={selection===item.id} onClick={()=>choose(item)}><span>{visibleContent(item).replace(/\s+/gu,' ').slice(0,160)}</span><small><span>{sourceNames[item.source?.type]??'直接记录'} · {when(item.updatedAt)}</span><span>{statusNames[item.status]}{memory.drafts.has(item.id)||memory.edits.has(item.id)?' · 有草稿':''}</span></small></button>)}{!items.length?<p className="pi-empty">{loading?'正在读取…':query||sourceFilter||linked?'没有找到匹配的记录。':status==='archived'?'还没有归档记录。':status==='resolved'?'还没有已处理记录。':'还没有记录。在上方留下一句话即可。'}</p>:null}</div><p className="pi-count">{items.length} 条记录</p>
      </aside><div className="pi-reading">{detail&&detail.id===selection?<Detail key={detail.id} item={detail} sessionId={sessionId} inputActions={inputActions} onSaved={saved} onBack={()=>setSelection(null)}/>:selection?<p className="pi-empty">正在读取这条记录…</p>:<div className="pi-welcome"><span aria-hidden="true">↳</span><h2>让信息有一个落脚处</h2><p>选一条记录，逐渐补充背景、关联工作，或决定下一步。</p></div>}</div></div>
    </section>;
  };
}
