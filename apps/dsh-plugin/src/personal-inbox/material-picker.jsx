/* global URL, AbortController */
import React, {useEffect, useRef, useState} from 'react';
import {errorMessage, safeLink} from './client-model.mjs';

function LocationPicker({rpc,kind,onPick,disabled}) {
  const [locations,setLocations]=useState(null);
  const [folder,setFolder]=useState(null),[files,setFiles]=useState(null);
  const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(null);
  async function run(action) {
    const controller=new AbortController();
    request.current=controller;
    setBusy(true);setError('');
    try {await action(controller.signal);}
    catch (failure) {if(!controller.signal.aborted)setError(errorMessage(failure));}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  const load=()=>run(async signal=>setLocations(await rpc('inbox-locations',{},signal)));
  useEffect(()=>{void load();return ()=>request.current?.abort();},[]);
  const rows=(folder?files?.rows:locations?.rows)??[];
  const matching=rows.filter(row=>`${row.title} ${row.context}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="pi-location-picker">
    {folder?<div className="pi-row"><strong>{folder.title}</strong><button type="button" disabled={busy} onClick={()=>{setFolder(null);setFiles(null);setQuery('');}}>更换位置</button></div>:null}
    {rows.length>0?<input type="search" aria-label={folder?'搜索文件':'搜索位置'} placeholder={folder?'搜索文件':'搜索已有位置'} value={query} onChange={event=>setQuery(event.target.value)}/>:null}
    {matching.length?<div className="pi-choice-list">{matching.map(row=><button key={row.key} type="button" disabled={busy||disabled} onClick={()=>void run(async signal=>{
      if (kind==='file'&&!folder) {
        const next=await rpc('inbox-location-files',{key:row.key},signal);
        setFolder(row);setFiles(next);setQuery('');
      } else {
        const chosen=await rpc('inbox-location-material',folder?{key:folder.key,file:row.key}:{key:row.key},signal);
        if(!signal.aborted)await onPick(chosen);
      }
    })}><span>{row.title}</span>{row.context?<small>{row.context}</small>:null}</button>)}</div>:null}
    {!busy&&!error&&!matching.length?<p className="pi-hint">{query?'没有匹配结果。':folder?'这里没有可选文件。':'没有已登记的位置。可先在 DSH 打开一个工作区。'}</p>:null}
    {files?.limited?<p className="pi-hint">此位置内容较多，当前显示已找到的文件。</p>:null}
    {kind==='folder'&&locations?.native?<button type="button" disabled={busy||disabled} onClick={()=>void run(async signal=>{
      const row=await rpc('inbox-pick-folder',{},signal);
      if(row&&!signal.aborted)await onPick(row);
    })}>浏览本机文件夹…</button>:null}
    {busy?<p className="pi-hint" role="status">正在读取位置…</p>:null}
    {error?<p className="pi-error" role="alert">{error} {!locations?<button type="button" onClick={()=>void load()}>重试</button>:null}</p>:null}
    <p className="pi-hint">本机材料只保存引用，可在这台 DSH 主机上打开。</p>
  </div>;
}

export function MaterialPicker({rpc,SourcePicker,sessionId,onPick,onClose,onRemove,disabled}) {
  const [kind,setKind]=useState(null),[url,setUrl]=useState(''),[label,setLabel]=useState('');
  const link=safeLink(url.trim());
  return <section className="pi-subform pi-material-picker" aria-label="选择材料">
    <div className="pi-row"><h3>{onRemove?'更换材料':'添加材料'}</h3><button type="button" disabled={disabled} onClick={onClose}>关闭</button></div>
    <div className="pi-actions pi-start">
      {[['web','网页链接'],['folder','工作文件夹'],['file','本机文件'],['logseq','Logseq 内容']].map(([key,title])=><button key={key} type="button" aria-pressed={kind===key} disabled={disabled} onClick={()=>setKind(key)}>{title}</button>)}
    </div>
    {kind==='web'?<form onSubmit={event=>{
      event.preventDefault();
      if(link)void onPick({label:label.trim()||(link.startsWith('logseq:')?'Logseq 内容':new URL(link).hostname),locator:link});
    }}><label>链接<input autoFocus type="url" maxLength={4096} placeholder="粘贴网页或 Logseq 链接" required value={url} onChange={event=>setUrl(event.target.value)}/></label>
      <label>名称（可选）<input maxLength={300} value={label} onChange={event=>setLabel(event.target.value)}/></label>
      <button className="pi-primary" disabled={disabled||!link}>关联链接</button>
    </form>:null}
    {kind==='file'||kind==='folder'?<LocationPicker key={kind} kind={kind} rpc={rpc} disabled={disabled} onPick={onPick}/>:null}
    {kind==='logseq'?<SourcePicker sessionId={sessionId} material onPick={onPick}/>:null}
    {onRemove?<button type="button" className="pi-link" disabled={disabled} onClick={onRemove}>移除关联</button>:null}
  </section>;
}
