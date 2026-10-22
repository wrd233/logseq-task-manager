import { sameWorkScope } from '@task-copilot/contracts';
import { sameWorkUiContext, type SharedUiPort, type StageHistoryPort, type WorkUiContext } from '../../workspace/copilot-ui-port.ts';
import type { StageHistory } from '../stage-workbench/protocol.ts';
import { StructureHistoryView } from './view.ts';

/** Capability-limited controller: ports expose no writers or recording APIs. */
export class HistoryPlayer {
  readonly view:StructureHistoryView;
  private generation=0;
  private returnPort:SharedUiPort|null=null;
  private returnContext:WorkUiContext|null=null;
  constructor(private readonly options:{context():WorkUiContext|null;history:StageHistoryPort;ui(trigger:HTMLElement):SharedUiPort;cancel():void}){
    this.view=new StructureHistoryView({cancel:()=>options.cancel(),openSource:async(source,trigger)=>{
      const context=options.context();if(!context)throw Error('WORK_UI_UNAVAILABLE');
      const port=options.ui(trigger);await port.openSource(source,context);
    },returnFocus:()=>{if(this.returnContext)this.returnPort?.returnFocus(this.returnContext);}});
  }
  get element(){return this.view.element;}
  notice(message:string):void {this.view.notice(message);}
  enter(trigger:HTMLElement):void {const context=this.options.context();this.returnContext=context?structuredClone(context):null;this.returnPort=null;if(!context)return;try{this.returnPort=this.options.ui(trigger);}catch{this.returnContext=null;}}
  reset():void {this.generation++;this.options.cancel();this.returnContext=null;this.returnPort=null;this.view.reset();}
  async read():Promise<StageHistory>{
    const generation=++this.generation,raw=this.options.context(),context=raw?structuredClone(raw):null;
    if(!context?.scope||context.scope.kind==='page'){this.view.reset();this.view.update({stages:[],current:null,currentEventId:null,problems:['阶段历史仅支持已选中的块范围；页面 / 无授权范围不可用。']});throw Error('HISTORY_BLOCK_SCOPE_REQUIRED');}
    if(context.binding&&!sameWorkScope(context.scope,context.binding.scope))throw Error('WORK_UI_SCOPE_MISMATCH');
    let history:StageHistory;
    try{history=await this.options.history.read(structuredClone(context));}
    catch(error){const current=this.options.context();if(generation===this.generation&&current&&sameWorkUiContext(context,current))this.view.update({stages:[],current:null,currentEventId:null,problems:[`历史不可用：${String(error)}`]});throw error;}
    const current=this.options.context();
    if(generation!==this.generation||!current||!sameWorkUiContext(context,current))throw Error('WORK_UI_STALE');
    this.view.update(history);return history;
  }
}
