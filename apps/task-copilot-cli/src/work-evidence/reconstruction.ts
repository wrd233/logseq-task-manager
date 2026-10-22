import { fileItems } from './items.ts';
import type { Observation } from './git.ts';
export type Interpretation = { explanation: string; group: string; question: string | null; uncertainties: string[]; evidenceRefs: string[] };
export type WorkPayload =
  | { kind: 'analysis-started'; itemId: string; model: string }
  | { kind: 'analysis-result'; itemId: string; runId: string; interpretation: Interpretation }
  | { kind: 'analysis-failed'; itemId: string; runId: string; error: string }
  | { kind: 'clarification'; itemId: string; interpretationId: string; text: string; skipped: boolean }
  | { kind: 'handoff'; text: string; sourceEventIds: string[]; supersedesId: string | null };
export type WorkEvent = WorkPayload & { schemaVersion: 1; id: string; scopeId: string; observationId: string; createdAt: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, limit = 4000): v is string => typeof v === 'string' && v.length <= limit;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(v);
export function validInterpretation(value: unknown): value is Interpretation {
  return object(value) && text(value.explanation) && !!value.explanation.trim() && text(value.group, 160) && !!value.group.trim() && (value.question === null || text(value.question, 500)) && Array.isArray(value.uncertainties) && value.uncertainties.length <= 12 && value.uncertainties.every(v => text(v, 500)) && Array.isArray(value.evidenceRefs) && value.evidenceRefs.length <= 100 && value.evidenceRefs.every(v => text(v, 4096));
}
export function validWorkEvent(value: unknown): value is WorkEvent {
  if (!object(value) || value.schemaVersion !== 1 || !uuid(value.id) || !uuid(value.scopeId) || !uuid(value.observationId) || !text(value.createdAt, 64) || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (value.kind === 'handoff') return text(value.text, 24000) && !!value.text.trim() && Array.isArray(value.sourceEventIds) && value.sourceEventIds.length <= 2000 && value.sourceEventIds.every(uuid) && (value.supersedesId === null || uuid(value.supersedesId));
  if (!text(value.itemId, 64) || !/^[a-f\d]{64}$/u.test(value.itemId)) return false;
  switch (value.kind) {
    case 'analysis-started': return text(value.model, 200);
    case 'analysis-result': return uuid(value.runId) && validInterpretation(value.interpretation);
    case 'analysis-failed': return uuid(value.runId) && text(value.error, 200);
    case 'clarification': return uuid(value.interpretationId) && text(value.text, 2000) && typeof value.skipped === 'boolean' && (value.skipped || !!value.text.trim());
    default: return false;
  }
}
export function reconstruction(record: Observation, events: WorkEvent[]) {
  const relevant = events.filter(e => e.scopeId === record.scopeId && e.observationId === record.id).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const items = fileItems(record).map(fact => {
    const local = relevant.filter(e => 'itemId' in e && e.itemId === fact.id);
    const run = local.filter(e => e.kind === 'analysis-started').at(-1);
    const result = local.slice().reverse().find(e => 'runId' in e && e.runId === run?.id);
    const interpretation = result?.kind === 'analysis-result' ? result : null;
    const clarification = local.slice().reverse().find(e => e.kind === 'clarification' && e.interpretationId === interpretation?.id);
    const state = result?.kind === 'analysis-failed' ? 'failed' : interpretation ? interpretation.interpretation.question && !clarification ? 'needs-clarification' : 'interpreted' : run ? 'interrupted-or-running' : 'pending';
    return { fact, state, runId: run?.id ?? null, interpretation, clarification, error: result?.kind === 'analysis-failed' ? result.error : null };
  });
  return { items, handoffs: relevant.filter(e => e.kind === 'handoff'), events: relevant };
}
/** A draft assembled from explicit layers; unknown and skipped entries remain visible. */
export function handoffDraft(record: Observation, events: WorkEvent[]) {
  const view = reconstruction(record, events);
  const lines = [`工作交接 · ${record.observedAt}`, `观察来源：work-evidence:v1:${record.scopeId}:${record.id}`, `范围：${record.directory}`, `提交区间：${record.sync?.fromHead ?? '初始/未知'} → ${record.head ?? '无 HEAD'}；${record.sync?.state ?? '旧观察，未保存增量范围'}`, ''];
  for (const item of view.items) {
    lines.push(`文件：${JSON.stringify(item.fact.path)}`, `观察事实：${item.fact.commits.length} 个来源提交；当前工作区${item.fact.workspace ? '有变化' : '没有本次变化条目'}。`);
    if (item.interpretation) {
      const i = item.interpretation.interpretation;
      lines.push(`Agent 解释（非完成证明）：${i.explanation}`, `工作主题（Agent 归组）：${i.group}`, ...i.uncertainties.map(u => `未知：${u}`));
      if (i.question) lines.push(`关键问题：${i.question}`);
    } else lines.push(`未知：${item.error ? `分析失败 ${item.error}` : '尚未获得解释'}。`);
    if (item.clarification?.kind === 'clarification') lines.push(item.clarification.skipped ? '用户跳过澄清：相关结论仍待确认。' : `据用户澄清：${item.clarification.text}`);
    else if (item.state === 'needs-clarification') lines.push('未知：关键问题尚未回答。');
    lines.push('');
  }
  lines.push('验证：这里只组织来源与解释；未附实际测试证据的检查不能视为通过。', '下一步：核对未知项，由用户决定后续工作；不自动创建任务或发送。');
  return lines.join('\n');
}
