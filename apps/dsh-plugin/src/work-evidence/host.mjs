import { EvidenceService } from './service.mjs';
import { hostModel } from './model.mjs';
import { fail } from './git.mjs';

/** UI-only operations, on the existing authenticated workbench RPC transport. */
export function installEvidenceHost(ctx, workbench, records) {
  const unavailable = async () => { throw fail('EVIDENCE_MODEL_NOT_CONFIGURED'); };
  const service = new EvidenceService({ store: records, workbench, model: unavailable });
  // Loading the file/record UI does not depend on model services being installed.
  ctx.inject?.(['llm', 'agentDefaultModel'], child => {
    service.model = hostModel(child);
    child.on('dispose', () => { service.model = unavailable; });
  });
  ctx.on('dispose', () => service.dispose());
  return Object.fromEntries(Object.entries({ view: 'view', sync: 'sync', analyze: 'analyze', cancel: 'cancel', clarify: 'clarify', structure: 'structure', source: 'source',
    handoff: 'handoff', save: 'save', 'read-handoff': 'readHandoff', quote: 'quote' }).map(([route, method]) =>
    [`evidence-${route}`, (input, signal) => service[method](input.sessionId, input, signal)]));
}
