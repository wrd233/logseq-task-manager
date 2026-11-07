import { currentPlanning } from './planner-model.mjs';
import { blockUrl } from './reader-model.mjs';
import { sameWorkRef, WorkspaceError } from '@task-copilot/contracts';
import { readCatalog } from '../../task-copilot-cli/src/work-catalog.ts';
import { PlannerStore } from './planner-store.mjs';
import { request } from './service.mjs';

const sameReference = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Host-owned personal planner: one JSON file per configured DSH data directory, shared by sessions of this host. */
export async function installPlannerHost(ctx, service, directory, handoffs) {
  const store = new PlannerStore(directory);
  // A damaged personal file must not take the whole Logseq workbench down. Keep the plugin active and
  // let the planner surface its own error without ever replacing the file with empty data.
  let loadError = null;
  try { await store.load(); } catch (error) { loadError = error; }
  const ready = () => {
    if (!loadError) return;
    const code = ['PLANNER_CORRUPT', 'PLANNER_VERSION'].includes(loadError.code) ? loadError.code : 'PLANNER_CORRUPT';
    throw Object.assign(Error(code), { code });
  };
  const inspect = (sessionId, signal) => ctx.sessionController.inspect(sessionId, signal);
  return {
    store,
    routes: {
      'planner-read': async (input, signal) => {
        const value = request(input, ['sessionId']);
        await inspect(value.sessionId, signal);
        ready();
        return store.read();
      },
      'planner-current': async (input, signal) => {
        const {sessionId, localAt} = request(input, ['sessionId', 'localAt']);
        await inspect(sessionId, signal);
        ready();
        return currentPlanning(store.read(), localAt);
      },
      'planner-navigate': async (input, signal) => {
        const {sessionId, id, action, operationId} = request(input, ['sessionId', 'id', 'action', 'operationId']);
        await inspect(sessionId, signal);
        ready();
        const reference = store.read().entries.find(entry => entry.id === id)?.reference;
        if (!reference) throw new WorkspaceError('PLANNER_REFERENCE_MISSING');
        const {graphId, blockUuid, objectId, title} = reference;
        const workRef = reference.workRef ?? (objectId ? {kind: 'kernel', objectId} : {kind: 'logseq', graphId, rootUuid: blockUuid, sourceKind: 'block'});
        const logseqUrl = blockUrl(graphId, blockUuid);
        if (action === 'logseq') return {workRef, logseqUrl};
        if (action !== 'continue') throw new WorkspaceError('PLANNER_INVALID');
        const graphs = await readCatalog(service.transport.stateDirectory);
        const work = graphs.find(graph => graph.graphId === graphId)?.works.find(item => sameWorkRef(item.workRef, workRef));
        const result = await handoffs.enterCatalog(work ?? {workRef, title}, operationId, signal);
        return {...result, workRef, logseqUrl};
      },
      'planner-references': async (input, signal) => {
        const value = request(input, ['sessionId']);
        await inspect(value.sessionId, signal);
        return service.command(value.sessionId, 'planner.references', {}, signal);
      },
      'planner-change': async (input, signal) => {
        const value = request(input, ['sessionId', 'revision', 'action', 'entry', 'id', 'slots', 'date', 'slotId', 'beforeId', 'direction', 'minutes']);
        await inspect(value.sessionId, signal);
        ready();
        if (value.action === 'save' && value.entry?.reference) {
          // Reuse today's authorized read-only work list. An unchanged reference is kept as the saved snapshot,
          // so editing a title from another session never rewrites the formal object or its identity.
          const old = store.read().entries.find(entry => entry.id === value.entry.id);
          if (!old || !sameReference(old.reference, value.entry.reference)) {
            const references = await service.command(value.sessionId, 'planner.references', {}, signal);
            const match = references.find(item => item.graphId === value.entry.reference.graphId && item.blockUuid === value.entry.reference.blockUuid);
            if (!match) throw Object.assign(Error('PLANNER_REFERENCE_MISSING'), { code: 'PLANNER_REFERENCE_MISSING' });
            value.entry = { ...value.entry, reference: match };
          } else value.entry = { ...value.entry, reference: old.reference };
        }
        return store.change(value);
      },
    },
  };
}
