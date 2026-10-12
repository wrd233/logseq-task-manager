import { atomicJson } from '../../task-copilot-cli/src/workspace-files.ts';
import { readDshHandoff, handoffPath } from '../../task-copilot-cli/src/dsh-handoff.ts';
import { WorkspaceError } from '@task-copilot/contracts';

const sameWork = (a,b) => a?.workspaceId===b?.workspaceId && JSON.stringify(a?.scope)===JSON.stringify(b?.scope);
/** A local click selects a session; it never submits a model message. */
export class DshHandoffs {
  constructor({service,createSession,renameSession}) {Object.assign(this,{service,createSession,renameSession});this.queue=Promise.resolve();}
  open(ticket, currentSessionId, replace=false, signal, fresh=false) {
    const result=this.queue.then(()=>this.consume(ticket,currentSessionId,replace,signal,fresh));
    this.queue=result.catch(()=>{});return result;
  }
  async consume(ticket,currentSessionId,replace,signal,fresh) {
    const {service}=this, state=service.transport.stateDirectory, request=await readDshHandoff(state,ticket), entry=await service.transport.entry(request.entry.directory);
    if(entry.connectionId!==request.entry.connectionId||entry.instanceId!==request.entry.instanceId||!sameWork(entry.binding,request.entry.binding))throw new WorkspaceError('CONNECTION_STALE');
    await service.transport.call(entry,'status',{},'handoff',signal);
    let sessionId=request.sessionId;
    if(!sessionId&&!fresh&&request.mode==='current'&&currentSessionId){
      await service.inspectSession(currentSessionId,signal);
      if(!replace&&!sameWork(service.store.bindings.get(currentSessionId),entry.binding))return {conflict:true,ticket,title:request.title};
      sessionId=currentSessionId;
    }
    if(!sessionId&&!fresh&&request.mode!=='new'){
      for(const [id,binding] of [...service.store.bindings].reverse())if(sameWork(binding,entry.binding)){
        try{await service.inspectSession(id,signal);sessionId=id;break;}
        catch(error){if(!/not[-_ ]found|missing/i.test(String(error.code??error.message)))throw error;}
      }
    }
    if(!sessionId){const created=await this.createSession({cwd:entry.binding.directory,title:request.title});sessionId=created.sessionId;await this.renameSession({sessionId,title:request.title});}
    await service.bind(sessionId,entry.binding.directory,signal);
    await atomicJson(handoffPath(state,ticket),{...request,sessionId});
    await service.command(sessionId,'sessions.add',{platform:'dsh',externalId:sessionId,description:request.title},signal);
    return {sessionId,title:request.title,conflict:false};
  }
}
