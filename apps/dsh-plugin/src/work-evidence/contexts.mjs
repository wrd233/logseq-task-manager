/* global AbortSignal */
import { realpath } from 'node:fs/promises';
import { digest } from '../../../task-copilot-cli/src/work-evidence/git.ts';
const failure = code => Object.assign(Error(code), { code });
const secret = /PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)["']?\s*[=:]\s*["']?\S+/iu;
/** Context bodies are ephemeral. Keep a version/hash reference, never a transcript archive. */
export function contextEvidence(ref, kind, value, maxChars = 8000) {
  const full = typeof value === 'string' ? value : JSON.stringify(value);
  if (secret.test(full)) return { ref, kind, state: 'sensitive-content-excluded', hash: digest(full), truncated: false };
  return { ref, kind, text: full.slice(0, maxChars), hash: digest(full), truncated: full.length > maxChars };
}
export async function relatedContexts(ctx, record, options, signal, config = {}) {
  const evidence = [], problems = [];
  const attempt = async (kind, operation) => { try { await operation(); } catch (error) { problems.push({ kind, code: signal?.aborted ? 'CONTEXT_TIMEOUT' : typeof error.code === 'string' ? error.code : 'CONTEXT_UNAVAILABLE' }); } };
  if (options.sessionId) await attempt('dsh', async () => {
    if (typeof options.sessionId !== 'string' || options.sessionId.length > 200 || !ctx.sessionController) throw failure('SESSION_CONTEXT_UNAVAILABLE');
    const session = await ctx.sessionController.inspect(options.sessionId, signal);
    if (!session.meta?.cwd || await realpath(session.meta.cwd) !== await realpath(record.directory)) throw failure('SESSION_SCOPE_MISMATCH');
    // Only visible text messages. Never system prompts, tool results, reasoning or attachments.
    const messages = session.events.filter(e => ['user/message', 'assistant/message'].includes(e.type)).slice(-6);
    for (const event of messages) {
      const content = event.type === 'user/message' ? event.data.content : event.data.message?.content;
      const text = Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
      if (text) evidence.push(contextEvidence(`dsh:${options.sessionId}:event:${event.seq}`, 'related-dsh-message', text, 1500));
    }
    if (!evidence.length) problems.push({ kind: 'dsh', code: 'SESSION_HAS_NO_TEXT_CONTEXT' });
  });
  if (options.logseq === true) await attempt('logseq', async () => {
    // Reuse the companion's existing trusted directory entry and read grant. No bind/refresh/write.
    const { CompanionTransport, sameBinding } = await import('../service.mjs');
    const transport = new CompanionTransport(config.workspaceStateDirectory);
    const entry = await transport.entry(record.directory);
    if (await realpath(entry.directory) !== await realpath(record.directory)) throw failure('LOGSEQ_SCOPE_MISMATCH');
    const packet = await transport.call(entry, 'collaboration.read', {}, 'work-evidence', signal ?? AbortSignal.timeout(5000));
    if (packet.current.permissions?.read !== true) throw failure('LOGSEQ_READ_NOT_AUTHORIZED');
    if (!sameBinding(packet.scene.binding, entry.binding) || !packet.current.sourceMatches) throw failure('LOGSEQ_SOURCE_CHANGED');
    const source = packet.scene.savedSource;
    if (!source) throw failure('LOGSEQ_CONTEXT_UNAVAILABLE');
    evidence.push(contextEvidence(`logseq:${entry.binding.scope.graphId}:${source.sourceSetVersion}`, 'related-logseq-work-structure', {
      scope: entry.binding.scope, sourceSetVersion: source.sourceSetVersion, capturedAt: source.capturedAt,
      blocks: source.blocks?.map(b => ({ sourceId: b.sourceId ?? b.uuid, parentUuid: b.parentUuid, content: b.content, contentVersion: b.contentVersion })),
    }, 7000));
  });
  return { evidence, problems };
}
