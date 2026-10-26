import type { SourceSelection } from '../../workspace/copilot-ui-port.ts';
import { button, element } from '../../host/panel-host.ts';
import type { StageHistory } from '../stage-workbench/protocol.ts';
import { historyPoints, structureFrame, type StructureNode } from './model.ts';

/** Isolated read-only renderer: no writer, recorder or rollback capability. */
export class StructureHistoryView {
  readonly element=element('details');
  private readonly body=element('div');
  private selected:string|null=null;
  private mode:'graph'|'directory'='graph';
  private nodeId:string|null=null;
  private epoch=0;
  private interaction=0;
  private interacted=false;
  reset():void {this.selected=null;this.nodeId=null;this.interacted=false;this.mode='graph';this.update({stages:[],current:null,currentEventId:null,problems:[]});}
  private readonly status=element('p');
  notice(text:string):void {this.status.textContent=text;}
  constructor(private readonly actions:{openSource?(source:SourceSelection,trigger:HTMLElement):Promise<void>;cancel?():void;returnFocus?():void}={}){this.element.append(element('summary','工作结构历史 · 只读回放'),this.body);}
  update(history:StageHistory):void {
    const points=historyPoints(history);let index=points.findIndex(p=>p.id===this.selected);if(index<0||!this.interacted){const current=points.map((p,i)=>p.stageId===history.current?i:-1).filter(i=>i>=0);index=current.at(-1)??Math.max(0,points.length-1);}
    const render=()=>{
      const epoch=++this.epoch;this.actions.cancel?.();this.status.textContent='';
      const frame=structureFrame(points,index);this.selected=frame.point?.id??null;this.element.dataset.historyPoint=this.selected??'';this.body.replaceChildren();
      const style=element('style');style.textContent=`.wb-history-map{position:relative;overflow:auto;max-height:520px;border:1px solid #8885}.wb-history-map button{position:absolute;width:230px;height:76px;overflow:hidden;text-align:left;white-space:pre-wrap;background:var(--ls-primary-background-color,#fff);border:1px solid #888;border-radius:6px;font-size:12px}.wb-history-map button[data-changed=true]{border:2px solid #b47718}.wb-history-map button[data-deleted=true]{border:2px dashed #b54b4b;opacity:.75}.wb-history-map svg{position:absolute;pointer-events:none}.wb-history-details{white-space:pre-wrap;overflow-wrap:anywhere}.wb-history-directory button{display:block;text-align:left;white-space:pre-wrap;margin:4px 0}`;this.body.append(style);
      const controls=element('div'),slider=element('input'),select=element('select');controls.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center';select.style.maxWidth='100%';slider.type='range';slider.min='0';slider.max=String(Math.max(0,points.length-1));slider.value=String(index);slider.disabled=!points.length;slider.setAttribute('aria-label','工作结构历史时间轴');
      for(const [i,p] of points.entries()){const o=element('option',`${p.source.capturedAt} · ${p.goal} · ${p.parent?'修订':'起点'}${p.accepted?' · 已认可':''}`);o.value=String(i);select.append(o);}select.value=String(index);select.setAttribute('aria-label','工作结构历史时点');select.disabled=!points.length;
      const move=(i:number)=>{this.interacted=true;index=i;render();};slider.oninput=()=>move(Number(slider.value));select.onchange=()=>move(Number(select.value));
      const back=button('上一时点',()=>move(index-1)),next=button('下一时点',()=>move(index+1));back.disabled=index<=0;next.disabled=index>=points.length-1;
      controls.append(back,slider,next,select,button('返回触发位置',()=>this.actions.returnFocus?.()),button(this.mode==='graph'?'切换目录 / 差异':'切换结构图',()=>{this.mode=this.mode==='graph'?'directory':'graph';render();}));this.body.append(controls);
      this.body.append(element('p',frame.point?`阶段：${frame.point.goal} · 原文采集：${frame.point.source.capturedAt} · 记录：${frame.point.at} · ${index+1}/${points.length}`:'尚无历史'));
      const provenance=element('details');provenance.append(element('summary','来源与缺失范围 · Logseq 快照，非 Kernel 历史'));for(const notice of [...new Set([...frame.notices,...history.problems,...(history.storageNotes??[])])])provenance.append(element('p',notice));this.body.append(provenance);
      if(frame.point?.problems.length||history.problems.length)this.body.append(element('p','历史记录存在缺失或冲突，请展开来源与缺失范围核对。'));
      const details=element('div','','wb-history-details'),show=(n:StructureNode,user=true)=>{
        if(user)this.interacted=true;
        this.interaction++;this.actions.cancel?.();this.nodeId=n.id;this.status.textContent='';
        for(const b of Array.from(this.body.querySelectorAll<HTMLElement>('[data-history-node]')))b.setAttribute('aria-pressed',String(b.dataset.historyNode===n.block.target.blockUuid));
        details.replaceChildren(element('h4',`${n.deleted?'已删除 · ':''}${n.block.content?.split('\n')[0]??'原文未知'}`),element('p',`变化：${n.changes.join('、')||'此快照无可确认变化'}\n块 UUID：${n.block.target.blockUuid}\n来源：${frame.point?.id}\n父块：${n.block.parentUuid??'无'} · 顺序 ${n.block.order} · 深度 ${n.block.depth}\n状态（${n.absentUnknown||n.deleted?'上一修订的':'该帧的'}原文标记）：${n.status??'未知'}\n依赖（${n.absentUnknown||n.deleted?'上一修订的':'该帧的'}原文声明）：${n.dependencies.join(', ')||'未记录 / 未知'}`),element('p',n.diff?`${n.diff.label}${n.diff.problem?' · '+n.diff.problem:''}`:''),element('p',n.diff?.location?`位置差异：${JSON.stringify(n.diff.location)}`:''),element('p',`来源可用性：${n.absentUnknown?'此帧未记录，是否删除未知':n.block.availability}`),element('h5',n.absentUnknown?'此帧原文：未记录 / 未知':n.deleted?'删除前保存的原文（上一修订）':'历史保存原文（不可变）'),element('pre',n.absentUnknown?'此帧没有原文，不使用上一修订补填。':n.block.content??'原文不可用'),element('h5','上一修订原文'),element('pre',n.before?.content??'无可比较原文'));
        const link=button('定位今天的来源块（与历史正文分开）',()=>{
          if(!this.actions.openSource){this.notice('来源定位适配尚不可用。');return;}
          const interaction=++this.interaction;void this.actions.openSource(n.absentUnknown?{...n.block,contentVersion:null}:n.block,link).catch(error=>{if(epoch===this.epoch&&interaction===this.interaction&&!(error instanceof Error&&error.message==='WORK_UI_STALE'))this.notice(`当前来源无法定位：${String(error)}`);});
        });details.append(link,this.status);

      };
      const label=(n:StructureNode)=>`${n.deleted?'[删除] ':n.absentUnknown?'[缺失，未知] ':''}${n.block.content?.split('\n')[0]?.slice(0,100)??'[原文未知]'}\n${n.changes.join(' · ')}${n.status?' · '+n.status:''}`;
      const narrow=window.innerWidth<600||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let graph=this.mode==='graph'&&!narrow&&frame.nodes.length<=250&&frame.nodes.every(n=>n.slot<=1000);
      if(narrow)this.body.append(element('p','窄屏 / 减少动态效果：使用完整文字目录。'));
      if(this.mode==='graph'&&!graph)this.body.append(element('p','当前图形不可用或数据较大，使用完整目录。'));
      const area=element('div','',graph?'wb-history-map':'wb-history-directory');
      if(graph){try{
        const width=Math.max(600,...frame.nodes.map(n=>n.block.depth*260+250)),height=Math.max(90,...frame.nodes.map(n=>n.slot*90+85));
        const canvas=element('div');canvas.style.cssText=`position:relative;width:${width}px;height:${height}px`;
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
        const edge=(a:StructureNode,b:StructureNode,dashed:boolean)=>{const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',`M ${a.block.depth*260+230} ${a.slot*90+30} L ${b.block.depth*260} ${b.slot*90+30}`);path.setAttribute('stroke',dashed?'#6b78b8':'#888');path.setAttribute('fill','none');if(dashed)path.setAttribute('stroke-dasharray','5 4');svg.append(path);};
        for(const n of frame.nodes){const p=frame.nodes.find(p=>p.block.target.blockUuid===n.block.parentUuid&&(!p.deleted||n.deleted));if(p)edge(p,n,false);for(const id of n.dependencies){const d=frame.nodes.find(p=>p.block.target.blockUuid===id&&p.deleted===n.deleted);if(d)edge(n,d,true);}}
        canvas.append(svg);for(const n of frame.nodes){const b=button(label(n),()=>show(n));b.style.left=`${n.block.depth*260}px`;b.style.top=`${n.slot*90}px`;b.title=label(n);b.dataset.changed=String(!!n.changes.length);b.dataset.deleted=String(n.deleted);b.dataset.historyNode=n.block.target.blockUuid;canvas.append(b);}area.append(canvas);
        this.body.append(element('p','实线：父子归属；虚线：原文依赖声明；橙框：变化；红色虚框：删除。纵向位置按身份固定，横向随层级变化。'));
      }catch(error){graph=false;area.replaceChildren();area.className='wb-history-directory';this.body.append(element('p',`图形绘制失败，已切换完整目录：${String(error)}`));}}
      if(!graph)for(const n of frame.nodes){const b=button(`${'　'.repeat(Math.min(n.block.depth,12))}${label(n)}\n父块：${n.block.parentUuid??'无'}`,()=>show(n));b.dataset.historyNode=n.block.target.blockUuid;area.append(b);}
      this.body.append(area,details);
      const selected=frame.nodes.find(n=>n.id===this.nodeId);if(selected)show(selected,false);
    };render();
  }
}
