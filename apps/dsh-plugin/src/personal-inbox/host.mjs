import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import process from 'node:process';
import {KernelClient, parsePluginKernelDescriptor} from '@task-copilot/client';
import {parseWorkRef, sameWorkRef} from '@task-copilot/contracts';
import {readCatalog} from '../../../task-copilot-cli/src/work-catalog.ts';
import {PersonalInboxStore} from './store.mjs';
import {object, text, uuid, fail, sourceTypes} from './model.mjs';
import {blockUrl} from '../reader-model.mjs';

async function localKernel() {
  // Only the trusted host reads this capability; never send it to the UI or model.
  const path = process.env.TASK_COPILOT_GRAPH_DESCRIPTOR ?? join(homedir(), '.task-copilot-vnext', 'graph-adapter.json');
  try {
    const descriptor = parsePluginKernelDescriptor(JSON.parse(await readFile(path, 'utf8')));
    if (!descriptor.userChannelToken) fail('INBOX_KERNEL_USER_CHANNEL_REQUIRED');
    return new KernelClient(descriptor);
  } catch(error) {if (error.code?.startsWith('INBOX_')) throw error; fail('INBOX_KERNEL_UNAVAILABLE');}
}

export async function installPersonalInboxHost({service, planner, handoffs, directory, kernelClient = localKernel}) {
  const store = new PersonalInboxStore(directory);
  const catalog = async () => (await readCatalog(service.transport.stateDirectory)).flatMap(graph => graph.works);
  const chooseWork = async parameters => {
    if (!parameters.workRef) fail('INBOX_WORK_SOURCE_REQUIRED');
    const workRef = parseWorkRef(parameters.workRef);
    const work = (await catalog()).find(item => sameWorkRef(item.workRef, workRef));
    // A Logseq block imported earlier can be entered as natural work using existing navigation.
    return work ?? {workRef, title:parameters.title ?? 'Inbox 工作'};
  };
  const normalizeConversion = async input => {
    object(input, ['id', 'revision', 'operationId', 'kind', 'confirmed', 'resolve', 'parameters']);
    uuid(input.id); uuid(input.operationId);
    if(input.confirmed !== true) fail('INBOX_CONFIRM_REQUIRED');
    if(input.resolve !== undefined && typeof input.resolve !== 'boolean') fail('INBOX_INVALID');
    const item = await store.get(input.id), parameters = input.parameters ?? {};
    if(input.kind === 'planner') {
      object(parameters, ['entry']);
      object(parameters.entry, ['title', 'schedule', 'date', 'slotId', 'startAt', 'endAt', 'dueAt', 'plannedMinutes', 'actualMinutes']);
      text(parameters.entry.title, 300);
      return {...input, parameters};
    }
    if(input.kind === 'work') {
      object(parameters, ['workRef', 'title']);
      const ref = parameters.workRef ?? item.workRef ?? (item.source?.type === 'logseq' ? {
        kind:'logseq', graphId:item.source.graphId, rootUuid:item.source.blockUuid, sourceKind:'block'} : null);
      if (!ref) fail('INBOX_WORK_SOURCE_REQUIRED');
      return {...input, parameters:{workRef:parseWorkRef(ref), title:text(parameters.title ?? item.content.slice(0,300), 300)}};
    }
    if(input.kind === 'formal-task') {
      object(parameters, ['title', 'anchor']);
      const anchor = parameters.anchor ?? (item.source?.type === 'logseq' ? {graphId:item.source.graphId, blockUuid:item.source.blockUuid} : null);
      if (!anchor) fail('INBOX_FORMAL_ANCHOR_REQUIRED');
      object(anchor, ['graphId', 'blockUuid']);
      return {...input, parameters:{title:text(parameters.title ?? item.content.slice(0,300), 300), anchor:{graphId:text(anchor.graphId, 2048), blockUuid:text(anchor.blockUuid, 200)}}};
    }
    fail('INBOX_INVALID');
  };
  const routes = {
    'inbox-options': async input => {
      object(input, []);
      return {schemaVersion:1, sourceTypes, slots:planner.store.read().slots, formalTaskRequiresAnchor:true,
        workRequiresReference:true, attachments:'external-references', storage:'application-user-data'};
    },
    'inbox-create': async input => {
      object(input, ['id', 'originalContent', 'source']);
      if (input.source?.type === 'logseq') fail('INBOX_USE_LOGSEQ_IMPORT');
      return store.create(input);
    },
    'inbox-get': input => {object(input, ['id']); return store.get(input.id);},
    'inbox-list': input => store.list(input),
    'inbox-update': input => {object(input, ['id', 'revision', 'patch']); return store.change({...input, action:'update'});},
    'inbox-edit': input => {object(input, ['id', 'revision', 'content', 'confirmed']); return store.change({...input, action:'edit'});},
    ...Object.fromEntries(['archive', 'restore', 'undo'].map(action => [`inbox-${action}`, input => {
      object(input, ['id', 'revision']); return store.change({...input, action});
    }])),
    'inbox-export': input => {object(input, []); return store.export();},
    'inbox-import': input => {object(input, ['backup']); return store.import(input.backup);},
    'inbox-import-logseq': async (input, signal) => {
      object(input, ['id', 'sessionId', 'sourceId']); uuid(input.id);
      // A successful previous import must remain retryable after the source disconnects.
      try {
        const existing = await store.get(input.id);
        if (existing.source?.type !== 'logseq' || existing.source.sessionId !== input.sessionId || existing.source.locator !== input.sourceId) fail('INBOX_ID_REUSED');
        return existing;
      } catch(error) {if(error.code !== 'INBOX_MISSING') throw error;}
      const packet = await service.command(text(input.sessionId, 200), 'source.read', {sourceId:text(input.sourceId, 4096)}, signal);
      const block = packet?.source;
      if (packet?.freshness !== 'checked' || block?.availability !== 'available' || block.sourceId !== input.sourceId || block.target?.kind !== 'logseq-block') fail('INBOX_SOURCE_UNAVAILABLE');
      const pageName = service.store?.bindings?.get(input.sessionId)?.scope?.pageName;
      return store.create({id:input.id, originalContent:text(block.content), source:{type:'logseq',
        sessionId:input.sessionId, locator:input.sourceId, graphId:block.target.graphId, blockUuid:block.target.blockUuid,
        ...(pageName ? {pageName} : {}),
        ...(block.contentVersion ? {contentVersion:block.contentVersion} : {})}});
    },
    'inbox-open-work': async (input, signal) => {
      object(input, ['id', 'operationId']); uuid(input.operationId);
      const item = await store.get(input.id);
      if (!item.workRef) fail('INBOX_WORK_SOURCE_REQUIRED');
      return handoffs.enterCatalog(await chooseWork({workRef:item.workRef, title:item.content.slice(0,300)}), input.operationId, signal);
    },
    'inbox-convert': async (input, signal) => {
      const value = await normalizeConversion(input);
      return store.convert(value, async ({item, operationId, kind, parameters}) => {
        if (kind === 'planner') {
          const result = await planner.store.change({action:'fromInbox', revision:planner.store.read().revision, entry:parameters.entry,
            inboxRef:{inboxId:item.id, operationId}});
          if(!result.inboxEntryId) fail('INBOX_PLANNER_RESULT_MISSING');
          return {entryId:result.inboxEntryId};
        }
        if (kind === 'work') {
          const work = await chooseWork(parameters);
          const result = await handoffs.enterCatalog(work, operationId, signal);
          return {workRef:work.workRef, sessionId:result.sessionId};
        }
        const client = await kernelClient();
        const result = await client.createInboxTask({inboxId:item.id, operationId, title:parameters.title, ...parameters.anchor, confirmed:true});
        return {workRef:{kind:'kernel', objectId:result.commit.targetId}, commitId:result.commit.id,
          graphId:parameters.anchor.graphId, blockUuid:parameters.anchor.blockUuid,
          logseqUrl:blockUrl(parameters.anchor.graphId, parameters.anchor.blockUuid)};
      });
    },
  };
  return {store, routes};
}
