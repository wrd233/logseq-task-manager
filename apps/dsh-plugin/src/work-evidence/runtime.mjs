/* global AbortController, AbortSignal */
import { randomUUID } from 'node:crypto';
import { analysisModel } from './analysis.mjs';
import { contextEvidence, relatedContexts } from './contexts.mjs';
import { handoffDraft } from '../../../task-copilot-cli/src/work-evidence/reconstruction.ts';
import { structureComparison } from './structure.mjs';
const failure = code => Object.assign(Error(code), { code });
const keyOf = p => `${p.scopeId}:${p.observationId}:${p.itemId}`;
/** One local job per selected file; no scanner, tools, session submission or automatic retries. */
export function reconstructionRuntime(store, ctx, config = {}) {
  const active = new Map(), preparing = new Map(), model = analysisModel(ctx);
  let disposed = false;
  async function view(p) {
    const value = await store.reconstruct(p.scopeId, p.observationId);
    let modelConfigured = false;
    try { model.selection(); modelConfigured = true; } catch { /* Read-only availability; never invokes the model. */ }
    return { ...value, modelConfigured, items: value.items.map(item => ({ ...item,
      state: active.has(keyOf({ ...p, itemId: item.fact.id })) ? item.interpretation ? 'reanalyzing' : 'analyzing'
        : item.state === 'interrupted-or-running' ? 'interrupted' : item.state,
    })) };
  }
  async function packet(p, item, record, signal) {
    const ref = `work-evidence:v1:${p.scopeId}:${p.observationId}:file:${item.fact.id}`;
    const evidence = [contextEvidence(ref, 'git-observation', { path: item.fact.path, aliases: item.fact.aliases, commits: item.fact.commits, workspace: item.fact.workspace,
      observation: { id: record.id, observedAt: record.observedAt, head: record.head, consistent: record.consistent, truncated: record.truncated, sync: record.sync?.state } })];
    const problems = [];
    const readDiff = async (ref, operation) => {
      try { const result = await operation(); evidence.push(contextEvidence(ref, 'git-diff', result, 7000)); }
      catch (error) { problems.push({ ref, code: error.code ?? 'DIFF_UNAVAILABLE' }); }
    };
    if (!item.fact.restricted) {
      for (const sha of item.fact.commits.slice(-3)) await readDiff(`git:${sha}:file:${item.fact.id}`, () => store.commitDiff(p.scopeId, p.observationId, p.itemId, sha));
      if (item.fact.commits.length > 3) problems.push({ code: 'OLDER_COMMIT_DIFFS_OMITTED' });
      const file = item.fact.workspace;
      if (file && !file.untracked) for (const side of ['staged', 'unstaged']) if (file[side] !== '.') await readDiff(`${ref}:${side}`, () => store.diff(p.scopeId, p.observationId, file.path, side));
    }
    const context = await relatedContexts(ctx, record, p.context ?? {}, AbortSignal.any([signal, AbortSignal.timeout(5000)]), config);
    evidence.push(...context.evidence); problems.push(...context.problems);
    const notes = await store.notesReport(p.scopeId, p.observationId);
    const superseded = new Set(notes.items.map(n => n.value.supersedesId));
    for (const note of notes.items.filter(n => !superseded.has(n.value.id)).slice(-3)) evidence.push(contextEvidence(`work-evidence:note:${note.value.id}`, 'user-intent', note.value.text, 1500));
    const work = await store.reconstruct(p.scopeId, p.observationId);
    // Reuse already explained purposes as candidates, with their own provenance, rather than inventing a new name for every file.
    const related = work.items.filter(other => other.fact.id !== p.itemId && other.interpretation).slice(-4);
    for (const other of related) evidence.push(contextEvidence(`work-evidence:interpretation:${other.interpretation.id}`, 'related-file-interpretation', {
      path: other.fact.path, group: other.interpretation.interpretation.group, explanation: other.interpretation.interpretation.explanation.slice(0, 500),
    }, 900));
    const clarifications = work.events.filter(e => e.kind === 'clarification' && e.itemId === p.itemId).slice(-3);
    for (const c of clarifications) evidence.push(contextEvidence(`work-evidence:clarification:${c.id}`, 'user-clarification', { text: c.text, skipped: c.skipped }, 2000));
    // Large diffs must not consume the user's answer. Reserve context space and share the remaining budget across diffs.
    const priority = { 'user-clarification': 0, 'git-observation': 1, 'user-intent': 2, 'related-file-interpretation': 3 };
    let contextBudget = 16000;
    const clip = (source, budget) => { const length = source.text?.length ?? 0; if (source.text) source.text = source.text.slice(0, budget); source.truncated ||= (source.text?.length ?? 0) < length; return source.text?.length ?? 0; };
    for (const source of evidence.filter(e => e.kind !== 'git-diff').sort((a,b) => (priority[a.kind] ?? 4) - (priority[b.kind] ?? 4))) contextBudget -= clip(source, contextBudget);
    const diffs = evidence.filter(e => e.kind === 'git-diff'), diffShare = Math.floor((8000 + contextBudget) / Math.max(1, diffs.length));
    for (const source of diffs) clip(source, diffShare);
    for (const source of evidence) if (source.state) problems.push({ ref: source.ref, code: source.state });
    const previous = item.interpretation?.interpretation;
    return { file: item.fact.path, previousExplanation: previous ? { explanation: previous.explanation.slice(0, 1200), group: previous.group } : null, evidence, unavailable: problems,
      instruction: '只还原此条目。缺失或截断信息保持未知；用户说明与机器证据分开。' };
  }
  async function start(p) {
    if (disposed) throw failure('ANALYSIS_DISPOSED');
    if (p.allowModel !== true) throw failure('MODEL_CONSENT_REQUIRED');
    const key = keyOf(p);
    if (active.has(key)) return view(p);
    const current = await view(p), item = current.items.find(i => i.fact.id === p.itemId);
    if (!item) throw failure('INVALID_SELECTION');
    const replay = current.events.find(e => e.id === p.requestId);
    if (replay) {
      if (replay.kind !== 'analysis-started' || replay.itemId !== p.itemId) throw failure('WORK_KEY_REUSED');
      return current; // Lost receipt/restart never repeats a paid model request.
    }
    const controller = new AbortController(); active.set(key, { controller, promise: null });
    let run;
    try {
      const record = (await store.observation(p.scopeId, p.observationId)).value;
      let selection, selectionError;
      try { selection = model.selection(); } catch (error) { selectionError = error; }
      const input = selection ? await packet(p, item, record, controller.signal) : null;
      run = await store.appendWork(p.scopeId, p.observationId, { kind: 'analysis-started', itemId: p.itemId,
        model: selection ? `${selection.provider}/${selection.model}` : 'unconfigured',
        sources: (input?.evidence ?? []).map(e => ({ ref: e.ref, hash: e.hash, kind: e.kind, truncated: e.truncated, capturedAt: new Date().toISOString() })),
        sourceProblems: (input?.unavailable ?? []).map(problem => `${problem.kind ?? problem.ref ?? 'source'}: ${problem.code}`.slice(0, 500)),
      }, p.requestId);
      const promise = (async () => {
        try {
          if (selectionError) throw selectionError;
          const interpretation = await model.explain(input, selection, controller.signal);
          controller.signal.throwIfAborted();
          await store.appendWork(p.scopeId, p.observationId, { kind: 'analysis-result', itemId: p.itemId, runId: run.value.id, interpretation }, randomUUID());
        } catch (error) {
          await store.appendWork(p.scopeId, p.observationId, { kind: 'analysis-failed', itemId: p.itemId, runId: run.value.id,
            error: controller.signal.aborted ? 'ANALYSIS_INTERRUPTED' : typeof error.code === 'string' ? error.code : 'ANALYSIS_FAILED' }, randomUUID());
        }
      })().catch(() => { /* Read view retains unfinished run when storage fails. No false success. */ }).finally(() => active.delete(key));
      active.get(key).promise = promise;
      return await view(p);
    } catch (error) { active.delete(key); throw error; }
  }
  return {
    view,
    analyze(p) {
      const key = keyOf(p);
      if (!preparing.has(key)) {
        const work = start(p).finally(() => preparing.delete(key)); preparing.set(key, work);
      }
      return preparing.get(key);
    },
    async clarify(p) {
      const value = await view(p), item = value.items.find(i => i.fact.id === p.itemId);
      // A replay may confirm an already-saved answer; a new answer must target the displayed version.
      const replay = value.events.find(e => e.id === p.requestId);
      if (!replay && (active.has(keyOf(p)) || item?.interpretation?.id !== p.interpretationId)) throw failure('INTERPRETATION_CHANGED');
      return store.appendWork(p.scopeId, p.observationId, { kind: 'clarification', itemId: p.itemId,
        interpretationId: p.interpretationId, text: p.text, skipped: p.skipped }, p.requestId);
    },
    async handoffDraft(p) {
      const record = await store.observation(p.scopeId, p.observationId), value = await view(p);
      if (!value.complete) throw failure('WORK_HISTORY_INCOMPLETE');
      const notes = await store.notesReport(p.scopeId, p.observationId), superseded = new Set(notes.items.map(n => n.value.supersedesId));
      const intents = notes.items.filter(n => !superseded.has(n.value.id)).map(n => `据用户意图（${n.value.createdAt}）：${n.value.text}\n意图来源：work-evidence:note:${n.value.id} · ${n.hash}`);
      const latestRuns = new Set(value.items.map(item => item.runId));
      const sourceProblems = value.events.filter(e => e.kind === 'analysis-started' && latestRuns.has(e.id)).flatMap(e => e.sourceProblems ?? []);
      const structural = await structureComparison(store, p.scopeId, p.observationId);
      const structureNote = structural.state === 'comparable'
        ? `结构观察：${structural.before.capturedAt} → ${structural.after.capturedAt}，${structural.changes.length} 个节点有变化。来源：work-evidence:v1:${p.scopeId}:${structural.beforeObservationId}:structure → work-evidence:v1:${p.scopeId}:${p.observationId}:structure；采集时间可能早于同步，不能证明任务完成。`
        : '结构观察：本轮没有可比较的可信前后快照，结构变化未知。';
      return { text: [handoffDraft(record.value, value.events), structureNote, ...intents, ...[...new Set(sourceProblems)].map(code => `未能读取的分析来源：${code}`), ...(!notes.complete ? ['未知：部分用户意图记录不可用。'] : [])].join('\n'), sourceEventIds: value.events.filter(e => e.kind !== 'handoff').map(e => e.id) };
    },
    saveHandoff: p => store.appendWork(p.scopeId, p.observationId, { kind: 'handoff', text: p.text,
      sourceEventIds: p.sourceEventIds, supersedesId: p.supersedesId ?? null }, p.requestId),
    async quoteHandoff(p) {
      const records = await store.workEvents(p.scopeId, p.observationId), saved = records.items.find(e => e.value.id === p.handoffId && e.value.kind === 'handoff');
      if (!saved) throw failure('HANDOFF_UNAVAILABLE');
      return `\n[工作交接记录 · 来源数据，由用户决定是否发送]\n引用：work-evidence:v1:${p.scopeId}:${p.observationId}:handoff:${saved.value.id}\n记录哈希：${saved.hash}\n保存时间：${saved.value.createdAt}\n${saved.value.text}\n`;
    },
    async settle() { await Promise.all([...preparing.values()]); await Promise.all([...active.values()].map(job => job.promise)); },
    dispose() { disposed = true; for (const job of active.values()) job.controller.abort(); },
  };
}
