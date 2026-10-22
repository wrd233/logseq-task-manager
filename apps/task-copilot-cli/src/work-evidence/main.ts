#!/usr/bin/env node
import { resolve } from 'node:path';
import { EvidenceStore } from './store.ts';
const [state, command, ...args] = process.argv.slice(2);
if (!state || !command) { console.error('用法: work-evidence <专属状态目录> select <Git根目录> | scopes | observe <scopeId> | history <scopeId> | read <scopeId> <observationId> | work <scopeId> <observationId> | items <scopeId> <observationId> | commit-diff <scopeId> <observationId> <itemId> <sha> | note <scopeId> <observationId> <意图> [requestId] | diff <scopeId> <observationId> <path> <staged|unstaged> | quote <scopeId> <observationId> <paths...>'); process.exitCode = 1; }
else {
  try {
    const store = new EvidenceStore(resolve(state)), [a = '', b = '', c = '', d = ''] = args;
    const result = command === 'select' ? await store.select(a) : command === 'scopes' ? await store.scopesReport() : command === 'observe' ? await store.observe(a) : command === 'history' ? await store.historyReport(a) : command === 'read' ? { observation: await store.observation(a,b), notes: await store.notesReport(a,b) } : command === 'work' ? { records: await store.workEvents(a,b), view: await store.reconstruct(a,b) } : command === 'items' ? await store.items(a,b) : command === 'commit-diff' ? await store.commitDiff(a,b,c,d) : command === 'note' ? await store.note(a,b,c,d || undefined) : command === 'diff' ? await store.diff(a,b,c,d as 'staged' | 'unstaged') : command === 'quote' ? await store.quote(a,b,args.slice(2)) : (() => { throw Error('UNKNOWN_COMMAND'); })();
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  } catch (e) { console.error((e as { code?: string }).code ?? 'WORK_EVIDENCE_FAILED'); process.exitCode = 1; }
}
