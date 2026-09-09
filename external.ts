import {render,layoutState,type Snapshot} from './render';
const token=location.hash.slice(1);let last:Snapshot|null=null;
document.getElementById('close')!.style.display='none';document.getElementById('locate')!.style.display='none';
const events=new EventSource('/events?token='+encodeURIComponent(token));
events.onmessage=e=>{const s=JSON.parse(e.data) as Snapshot;last=s;render(s,uuid=>fetch('/command',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({graph:s.graph,root:s.root,uuid,id:crypto.randomUUID()})}).catch(()=>{document.getElementById('status')!.textContent='定位请求失败'}));requestAnimationFrame(()=>fetch('/ack',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({layout:layoutState(),seq:s.seq,kind:s.kind,observedToFrameMs:Date.now()-s.observedAt,readToFrameMs:Date.now()-s.startedAt,at:Date.now()})}).catch(()=>{}))};
events.onerror=()=>{document.getElementById('status')!.textContent='连接断开 · 保留上次预览，正在重连'};
