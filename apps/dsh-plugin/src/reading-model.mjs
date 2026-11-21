/* global AbortSignal */
import { WorkspaceError } from '@task-copilot/contracts';
import { articleEditorialRules, filterReadingMaterialsForLocality, isShortReadingInput, readingInstructions, readingTask } from '@task-copilot/reading-runtime';
import { readingAgent } from './reading-agent.mjs';

export { articleEditorialRules, readingInstructions, readingTask };

const fail = code => { throw new WorkspaceError(code); };

function sanitizeDshInput(input) {
  if (input?.privacyMode === 'local-only') fail('READING_LOCAL_MODEL_REQUIRED');
  if (!Array.isArray(input?.materials) || !input.materials.length) return input;
  const { materials } = filterReadingMaterialsForLocality(input.materials, 'remote');
  return { ...input, materials };
}

export function readingModel(ctx) {
  return async (input, signal) => {
    const model = ctx.agentDefaultModel?.currentSelection();
    if (!ctx.llm || !model?.provider || !model?.model) fail('READING_MODEL_NOT_CONFIGURED');
    const safeInput = sanitizeDshInput(input);
    const task = readingTask(safeInput), packet = task.packet;
    const rewrite = packet.mode === 'rewrite' && packet.selection?.sourceIds?.length;
    const materials = rewrite ? [] : packet.materials.map(material => { const summary = { ...material }; delete summary.text; return summary; });
    const text = JSON.stringify({ ...packet, blocks: rewrite ? packet.blocks.filter(block => packet.selection.sourceIds.includes(block.id)) : packet.blocks, materials });
    if (text.length > 100000) fail('READING_MODEL_CONTEXT_LIMIT');
    const cancellation = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(70000)]);
    let output = '', finish;
    try {
      for await (const chunk of ctx.llm.stream({
        provider: model.provider, model: model.model, ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
        system: `${readingInstructions}\n不要使用工具。只输出 JSON，不要代码围栏。`, messages: [{ role: 'user', content: [{ type: 'text', text }] }], maxTokens: 8192, signal: cancellation,
      })) {
        if (chunk.type === 'text-delta') output += chunk.text;
        if (chunk.type === 'finish') finish = chunk.reason;
        if (chunk.type === 'tool-call-delta' || chunk.type === 'block-start' && chunk.blockType === 'tool-call' || output.length > 180000) fail('READING_MODEL_OUTPUT');
      }
    } catch (error) {
      if (cancellation.aborted) fail('READING_MODEL_INTERRUPTED');
      if (error instanceof WorkspaceError) throw error;
      fail('READING_MODEL_PROVIDER_FAILED');
    }
    if (finish?.kind === 'error') fail('READING_MODEL_PROVIDER_FAILED');
    if (finish?.kind !== 'stop') fail('READING_MODEL_INCOMPLETE');
    let value;
    try { value = JSON.parse(output.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')); } catch { fail('READING_MODEL_OUTPUT'); }
    return task.output(value);
  };
}

export function installReadingModel(ctx) {
  const unavailable = async () => fail('READING_MODEL_NOT_CONFIGURED');
  let model = unavailable, agent = unavailable;
  ctx.inject?.(['llm', 'agentDefaultModel'], child => {
    model = readingModel(child); child.on('dispose', () => { model = unavailable; });
  });
  ctx.inject?.(['agents', 'agentDefaultModel'], child => {
    agent = (input, signal) => readingAgent(child, readingTask(sanitizeDshInput(input)), readingInstructions, signal);
    child.on('dispose', () => { agent = unavailable; });
  });
  return (input, signal) => {
    return input?.mode === 'rewrite' || isShortReadingInput(input) ? model(input, signal) : agent(input, signal);
  };
}
