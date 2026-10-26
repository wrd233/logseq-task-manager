import { sameWorkScope } from '@task-copilot/contracts';
import { sameWorkUiContext, type SourceSelection, type WorkUiContext } from './copilot-ui-port.ts';
import { sha256, sourceId } from './source-protocol.ts';

export interface HistorySourceHost {
  graphId():Promise<string>;
  block(uuid:string):Promise<{uuid:string;content:string}|null>;
  navigate(uuid:string):Promise<void>;
}
/** Shared owner adapter. No source writes. Each interaction cancels older navigation. */
export function historySourceOpener(options:{
  context():WorkUiContext|null;
  host:HistorySourceHost;
  notice(message:string):void;
}){
  let interaction=0;
  const cancel=()=>{interaction++;};
  return {cancel,open:async(source:SourceSelection,context:WorkUiContext):Promise<void>=>{
    const ticket=++interaction,expected=structuredClone(context),selected=structuredClone(source);
    const check=()=>{
      const current=options.context();
      if(ticket!==interaction||!current||!sameWorkUiContext(expected,current))throw Error('WORK_UI_STALE');
      if(!expected.scope||expected.scope.kind==='page'||expected.binding&&!sameWorkScope(expected.scope,expected.binding.scope)||selected.target.kind!=='logseq-block'||selected.target.graphId!==expected.scope.graphId||selected.sourceId!==sourceId(selected.target.graphId,selected.target.blockUuid))throw Error('WORK_UI_SOURCE_SCOPE');
    };
    const graph=async()=>{check();const id=await options.host.graphId();check();if(id!==expected.scope!.graphId)throw Error('WORK_UI_GRAPH_CHANGED');};
    check();await graph();check();
    const block=await options.host.block(selected.target.blockUuid);check();await graph();check();
    if(!block||block.uuid!==selected.target.blockUuid)throw Error('来源已删除或不可用；历史正文仍保留。');
    const version=await sha256(block.content);check();await graph();check();
    options.notice(selected.contentVersion===null?'历史正文版本未知：仅定位今天的块，不声称版本一致。':selected.contentVersion===version?'刚读取的来源版本一致：即将定位今天的块。':'来源已变化：即将打开今天的块；历史正文与版本保持不变。');
    // No await between final synchronous context fence and navigation dispatch.
    check();await options.host.navigate(selected.target.blockUuid);check();
  }};
}
