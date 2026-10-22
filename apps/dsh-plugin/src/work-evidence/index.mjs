/* global Response */
import { EvidenceStore } from '../../../task-copilot-cli/src/work-evidence/store.ts';
import { isAbsolute } from 'node:path';
export const name = 'work-evidence';
export const inject = ['connection'];
export async function apply(ctx, config = {}) {
  if (!config.stateDirectory || !isAbsolute(config.stateDirectory)) throw Error('EXPLICIT_STATE_DIRECTORY_REQUIRED');
  const store = new EvidenceStore(config.stateDirectory); await store.init();
  const routes = {
    scopes: () => store.scopesReport(), select: p => store.select(p.directory),
    observe: p => store.observe(p.scopeId), history: p => store.historyReport(p.scopeId),
    read: async p => ({ observation: await store.observation(p.scopeId, p.observationId), notes: await store.notesReport(p.scopeId, p.observationId) }),
    note: p => store.note(p.scopeId, p.observationId, p.text, p.requestId, p.supersedesId),
    diff: p => store.diff(p.scopeId, p.observationId, p.path, p.side),
    quote: p => store.quote(p.scopeId, p.observationId, p.paths),
  };
  // UI-only authenticated RPC. No model tool, system context, session cwd or grant mutation.
  for (const [method, operation] of Object.entries(routes)) ctx.connection.fetch.register({
    path: `/api/work-evidence/${method}`, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      let input; try { input = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
      if (input?.type !== 'client-request' || input.method !== `work-evidence/${method}` || typeof input.rpcId !== 'string' || input.rpcId.length > 128 || !input.payload || typeof input.payload !== 'object') return new Response('Invalid envelope', { status: 400 });
      let result;
      try { result = { ok: true, value: await operation(input.payload) }; }
      catch (error) { const code = typeof error?.code === 'string' ? error.code : 'WORK_EVIDENCE_FAILED'; result = { ok: false, error: { code, message: code, details: {} } }; }
      return Response.json({ type: 'server-response', rpcId: input.rpcId, result });
    },
  });
}
