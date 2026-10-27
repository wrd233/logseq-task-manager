/* global AbortController */
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../project-records.mjs';
import { validateSnapshot } from '../../../logseq-plugin/src/workspace/source-protocol.ts';
import { sourceStructure } from '../structure-view/source.mjs';
import { compare } from '../structure-view/model.mjs';
import { collectGit, fail, hasSecret } from './git.mjs';

const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail('EVIDENCE_INVALID_INPUT'); return value; };
const latest = (rows, kind, predicate = () => true) => rows.filter(r => r.kind === kind && predicate(r)).at(-1);
const sourceIdentity = binding => binding ? JSON.stringify([binding.workspaceId ?? null, binding.scope]) : null;
const cleanText = s => hasSecret(s) ? '（上下文含受限内容，未提供）' : s;
const meta = r => ({ id: r.id, at: r.recordedAt, title: r.title, syncId: r.syncId, entityId: r.entityId, parent: r.parent });

export class EvidenceService {
  constructor({ store, workbench, model }) { this.store = store; this.workbench = workbench; this.model = model; this.queues = new Map(); this.jobs = new Map(); }
  async project(sessionId, signal) {
    text(sessionId, 512);
    const status = await this.workbench.status(sessionId, signal), directory = status.binding?.directory ?? status.cwd;
    if (!directory || !isAbsolute(directory)) throw fail('EVIDENCE_PROJECT_REQUIRED');
    return { directory: await realpath(directory), binding: status.binding, generation: this.workbench.generations.get(sessionId) ?? 0, sessionId };
  }
  async check(project, signal) {
    signal?.throwIfAborted();
    const current = await this.project(project.sessionId, signal);
    if (current.directory !== project.directory || current.generation !== project.generation || sourceIdentity(current.binding) !== sourceIdentity(project.binding)) throw fail('EVIDENCE_BINDING_CHANGED');
  }
  serial(directory, operation) {
    const task = (this.queues.get(directory) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.queues.set(directory, task);
    return task.finally(() => { if (this.queues.get(directory) === task) this.queues.delete(directory); });
  }
  async records(project) {
    const result = await this.store.records(project.directory);
    return { rows: result.records.filter(r => r.track === 'work-evidence-v1'), issues: result.problems.map(p => p.message) };
  }
  append(project, kind, input) {
    const origin = ['evidence-analysis', 'evidence-groups'].includes(kind) ? 'agent' : ['evidence-clarification', 'evidence-handoff'].includes(kind) ? 'user' : 'observed';
    return this.store.append(project.directory, { nodes: [], coverage: 'partial', track: 'work-evidence-v1', origin, kind, ...input });
  }
  async sync(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), requestId = text(input.requestId, 128);
    return this.serial(project.directory, async () => {
      const { rows, issues } = await this.records(project);
      if (issues.length) throw fail('EVIDENCE_STORAGE_NEEDS_ATTENTION');
      const receipt = rows.find(r => r.requestId === requestId);
      if (receipt) { if (receipt.kind !== 'evidence-sync' || receipt.resetBaseline !== (input.resetBaseline === true)) throw fail('EVIDENCE_REQUEST_REUSED'); return receipt; }
      if (input.resetBaseline !== undefined && typeof input.resetBaseline !== 'boolean') throw fail('EVIDENCE_INVALID_INPUT');
      const previous = latest(rows, 'evidence-sync'), git = await collectGit(project.directory, input.resetBaseline ? null : previous?.git);
      let source = null, sourceIssue = '此会话未关联 Logseq 块范围。';
      if (project.binding) {
        try {
          if (project.binding.scope.kind === 'page') throw fail('EVIDENCE_BLOCK_SCOPE_REQUIRED');
          source = await validateSnapshot(await this.workbench.command(sessionId, 'content.read', {}, signal));
          if (JSON.stringify(source.scope) !== JSON.stringify(project.binding.scope) || source.blocks.length > 5000 || source.blocks.some(b => b.availability !== 'available')) throw fail('EVIDENCE_STRUCTURE_INCOMPLETE');
          sourceIssue = null;
        } catch (error) {
          if (signal?.aborted) throw error;
          source = null; sourceIssue = `结构变化暂不可用：${error.code ?? error.message}。文件回顾与交接仍可使用。`;
        }
      }
      await this.check(project, signal);
      return this.append(project, 'evidence-sync', { requestId, title: git.baseline ? '已建立同步起点' : '刚才的工作', previousId: previous?.id ?? null,
        git, source, sourceIdentity: sourceIdentity(project.binding), sourceIssue, resetBaseline: input.resetBaseline === true });
    });
  }
  state(rows, sync) {
    if (!sync) return { items: [], groups: [] };
    const items = sync.git.items.map(item => {
      const clarification = latest(rows, 'evidence-clarification', r => r.syncId === sync.id && r.itemId === item.id);
      const analysis = latest(rows, 'evidence-analysis', r => r.syncId === sync.id && r.itemId === item.id);
      const job = latest(rows, 'evidence-run', r => r.syncId === sync.id && r.itemId === item.id);
      const active = job?.status === 'started' && this.jobs.get(job.runId);
      const status = active ? active.itemId === item.id ? 'analyzing' : 'queued' : job?.status === 'started' ? 'interrupted' : job?.status === 'failed' && (!analysis || job.sequence > analysis.sequence) ? 'failed' : clarification?.skipped ? 'skipped' : !analysis ? 'pending' : analysis.clarificationId !== (clarification?.id ?? null) ? 'stale' : analysis.result.question ? 'question' : 'complete';
      return { ...item, clarification: clarification ?? null, analysis: analysis ?? null, status, error: job?.error ?? null };
    });
    const grouping = latest(rows, 'evidence-groups', r => r.syncId === sync.id);
    return { items, groups: grouping?.groups ?? [] };
  }
  async view(sessionId, input = {}, signal) {
    const project = await this.project(sessionId, signal), { rows, issues } = await this.records(project);
    const sync = input.syncId ? rows.find(r => r.id === input.syncId && r.kind === 'evidence-sync') : latest(rows, 'evidence-sync');
    if (input.syncId && !sync) throw fail('EVIDENCE_RECORD_MISSING');
    await this.check(project, signal);
    return { project: project.directory, sync: sync ?? null, ...this.state(rows, sync), issues,
      syncs: rows.filter(r => r.kind === 'evidence-sync').reverse().map(meta), handoffs: rows.filter(r => r.kind === 'evidence-handoff').reverse().map(meta) };
  }
  async clarify(sessionId, input, signal) {
    const project = await this.project(sessionId, signal);
    return this.serial(project.directory, async () => {
      const { rows } = await this.records(project), sync = rows.find(r => r.id === input.syncId && r.kind === 'evidence-sync');
      if (!sync?.git.items.some(i => i.id === input.itemId) || typeof input.skipped !== 'boolean') throw fail('EVIDENCE_INVALID_INPUT');
      const previous = latest(rows, 'evidence-clarification', r => r.syncId === sync.id && r.itemId === input.itemId);
      const question = input.question === undefined ? previous?.question ?? null : text(input.question, 1000);
      const answer = input.skipped ? input.text ?? previous?.text ?? '' : input.text === '' && question ? '' : text(input.text, 6000), requestId = text(input.requestId, 128);
      if (typeof answer !== 'string' || answer.length > 6000) throw fail('EVIDENCE_INVALID_INPUT');
      const receipt = rows.find(r => r.requestId === requestId);
      if (receipt) { if (receipt.kind !== 'evidence-clarification' || receipt.syncId !== sync.id || receipt.itemId !== input.itemId || receipt.text !== answer || receipt.skipped !== input.skipped || input.question !== undefined && receipt.question !== question) throw fail('EVIDENCE_REQUEST_REUSED'); return receipt; }
      if (previous?.text === answer && previous.skipped === input.skipped && previous.question === question) return previous;
      if ((input.expectedId ?? null) !== (previous?.id ?? null)) throw fail('EVIDENCE_EDIT_CONFLICT');
      await this.check(project, signal);
      return this.append(project, 'evidence-clarification', { requestId, title: '用户说明', syncId: sync.id, itemId: input.itemId, text: answer, question, skipped: input.skipped, parent: previous?.id ?? null });
    });
  }
  async analyze(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), requestId = text(input.requestId, 128);
    return this.serial(project.directory, async () => {
      const { rows } = await this.records(project), sync = rows.find(r => r.id === input.syncId && r.kind === 'evidence-sync');
      if (!sync) throw fail('EVIDENCE_RECORD_MISSING');
      const receipts = rows.filter(r => r.kind === 'evidence-run' && r.requestId.startsWith(`${requestId}:`));
      if (receipts.length) {
        if (receipts.some(r => r.syncId !== sync.id) || input.itemIds && (input.itemIds.length !== receipts.length || receipts.some(r => !input.itemIds.includes(r.itemId)))) throw fail('EVIDENCE_REQUEST_REUSED');
        return { accepted: true, runId: receipts[0].runId };
      }
      const ids = input.itemIds ?? this.state(rows, sync).items.filter(i => i.status === 'pending').map(i => i.id);
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !sync.git.items.some(i => i.id === id))) throw fail('EVIDENCE_INVALID_INPUT');
      if ([...this.jobs.values()].some(j => j.project.directory === project.directory)) throw fail('EVIDENCE_ANALYSIS_BUSY');
      const controller = new AbortController(), runId = randomUUID();
      for (const itemId of ids) await this.append(project, 'evidence-run', { requestId: `${requestId}:${itemId}`, title: '等待分析', runId, syncId: sync.id, itemId, status: 'started' });
      this.jobs.set(runId, { controller, project });
      void this.run(project, sync, ids, runId, controller.signal).finally(() => this.jobs.delete(runId));
      return { accepted: true, runId };
    });
  }
  async run(project, sync, ids, runId, signal) {
    // Errors are recorded at the operation boundary. Never synthesize a model result.
    try {
      for (const itemId of ids) {
        this.jobs.get(runId).itemId = itemId;
        await this.check(project, signal);
        const { rows } = await this.records(project), item = this.state(rows, sync).items.find(i => i.id === itemId);
        const clarificationId = item.clarification?.id ?? null;
        let budget = 26000;
        const evidence = item.parts.map((p, index) => { const excerpt = p.text.slice(0, Math.max(0, Math.min(10000, budget))); budget -= excerpt.length;
          return { ref: `${sync.id}:${item.id}:${index}`, kind: p.kind, sha: p.sha, status: p.status, state: p.state, existed: p.existed, text: excerpt, truncated: excerpt.length !== p.text.length }; });
        const source = sync.source?.blocks.slice(0, 30).map(b => ({ ref: b.sourceId, kind: 'logseq-snapshot', version: b.contentVersion, text: cleanText(b.content).slice(0, 400) })) ?? [];
        const conversation = [];
        if (this.workbench.inspectSession) {
          try {
            const session = await this.workbench.inspectSession(project.sessionId, signal);
            if (session.meta?.cwd && await realpath(session.meta.cwd) === project.directory) {
              for (const event of session.events.filter(e => ['user/message', 'assistant/message'].includes(e.type)).slice(-6)) {
                const content = event.type === 'user/message' ? event.data.content : event.data.message?.content;
                const body = Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
                if (body) conversation.push({ ref: `dsh:${project.sessionId}:${event.seq}`, kind: 'conversation-text', version: hash(body), text: cleanText(body).slice(0, 1200) });
              }
            }
          } catch (error) { if (signal.aborted) throw error; /* Optional conversation context does not prevent file analysis. */ }
        }
        const packet = { file: { path: item.path, originalPath: item.originalPath, code: item.code }, evidence: [...evidence, ...source, ...conversation],
          clarification: item.clarification ? { text: cleanText(item.clarification.text), question: item.clarification.question, skipped: item.clarification.skipped } : null,
          session: { id: project.sessionId }, boundary: '未运行测试；用户说明属于自述。' };
        try {
          const result = await this.model('file', packet, signal);
          await this.check(project, signal);
          await this.append(project, 'evidence-analysis', { requestId: `${runId}:${itemId}:result`, title: 'Agent 解释', syncId: sync.id, itemId, clarificationId, result: result.value, model: result.model });
          await this.group(project, sync, itemId, signal);
          await this.append(project, 'evidence-run', { requestId: `${runId}:${itemId}:end`, title: '分析完成', runId, syncId: sync.id, itemId, status: 'complete' });
        } catch (error) {
          await this.append(project, 'evidence-run', { requestId: `${runId}:${itemId}:end`, title: '分析未完成', runId, syncId: sync.id, itemId, status: 'failed', error: error.code ?? 'EVIDENCE_ANALYSIS_FAILED' });
          if (signal.aborted || error.code === 'EVIDENCE_BINDING_CHANGED') break;
        }
      }
    } catch { /* A storage failure leaves the durable start as interrupted after the job exits. */ }
  }
  async group(project, sync, itemId, signal) {
    const { rows } = await this.records(project), state = this.state(rows, sync);
    const affected = state.groups.find(g => g.itemIds.includes(itemId));
    const selected = state.items.filter(i => i.analysis && (i.id === itemId || affected?.itemIds.includes(i.id) || !state.groups.some(g => g.itemIds.includes(i.id))));
    // Only this item, its former group, and newly explained files participate.
    const result = await this.model('groups', { files: selected.map(i => ({ id: i.id, path: i.path, explanation: i.analysis.result.explanation, purpose: i.analysis.result.purpose })),
      existing: state.groups.map(g => ({ title: g.title })) }, signal);
    await this.check(project, signal);
    const groups = [...state.groups.filter(g => g !== affected), ...result.value.groups];
    const merged = new Map();
    for (const g of groups) merged.set(g.title, { title: g.title, itemIds: [...new Set([...(merged.get(g.title)?.itemIds ?? []), ...g.itemIds])] });
    await this.append(project, 'evidence-groups', { requestId: randomUUID(), title: '按工作目的归组', syncId: sync.id, groups: [...merged.values()], model: result.model });
  }
  async structure(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), { rows } = await this.records(project);
    const sync = rows.find(r => r.id === input.syncId && r.kind === 'evidence-sync');
    if (!sync) throw fail('EVIDENCE_RECORD_MISSING');
    if (!sync.source) return { state: 'unavailable', notice: sync.sourceIssue };
    const after = { ...sourceStructure(await validateSnapshot(sync.source)), id: sync.id, recordedAt: sync.recordedAt };
    const beforeSync = rows.find(r => r.id === sync.previousId);
    if (!beforeSync?.source) return { state: 'baseline', after, notice: '这次采集建立结构起点；尚无可信的前后快照。' };
    if (sync.sourceIdentity !== beforeSync.sourceIdentity || JSON.stringify(beforeSync.source.scope) !== JSON.stringify(sync.source.scope)) return { state: 'unavailable', notice: 'Graph 或工作范围已改变，本次重新建立结构起点。' };
    const before = { ...sourceStructure(await validateSnapshot(beforeSync.source)), id: beforeSync.id, recordedAt: beforeSync.recordedAt };
    await this.check(project, signal);
    return { state: 'comparable', before, after, changes: compare(before, after) };
  }
  async source(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), record = await this.store.get(project.directory, input.syncId);
    if (record.kind !== 'evidence-sync' || !record.source || record.sourceIdentity !== sourceIdentity(project.binding)) throw fail('EVIDENCE_BINDING_CHANGED');
    const source = await validateSnapshot(record.source), block = source.blocks.find(b => b.sourceId === input.nodeId);
    if (!block) throw fail('EVIDENCE_RECORD_MISSING');
    let current;
    try { current = await this.workbench.command(sessionId, 'source.read', { sourceId: block.sourceId }, signal); }
    catch (error) { if (error.code !== 'SOURCE_OUTSIDE_SCOPE') throw error; current = { source: { availability: 'outside-scope', content: null, contentVersion: null } }; }
    await this.check(project, signal);
    return { source: current.source, matches: current.source?.availability === 'available' && current.source.contentVersion === block.contentVersion };
  }
  async handoff(sessionId, input, signal) {
    const view = await this.view(sessionId, input, signal);
    if (!view.sync) throw fail('EVIDENCE_RECORD_MISSING');
    const parts = ['# 工作交接', view.sync.git.baseline ? '这次建立了同步起点，已有改动保留为基线。' : `本次回顾涉及 ${view.sync.git.commits.length} 个新提交和 ${view.items.length} 个文件。`];
    if (view.items.length) parts.push('## 主要变化');
    const unknown = new Set();
    for (const item of view.items) {
      const observed = [...new Set(item.parts.map(p => ({ commit: '新提交', staged: '已暂存', unstaged: '未暂存', untracked: '未跟踪' })[p.kind]))].join('、');
      parts.push(`- ${item.path}：${observed}${item.changed ? '' : '；同步前已存在，未改变'}。`);
      if (item.analysis) parts.push(`Agent 解释${item.analysis.clarificationId !== (item.clarification?.id ?? null) ? '（待纳入最新说明）' : ''}：${item.analysis.result.explanation}`);
      else parts.push('这个文件尚未形成 Agent 解释。');
      if (item.clarification?.text) parts.push(`补充说明（用户自述）：${item.clarification.text}`);
      if (item.clarification?.skipped) parts.push('用户跳过澄清，相关结论仍未知。');
      if (item.clarification?.question) parts.push(`用户调整的问题：${item.clarification.question}`);
      for (const value of item.analysis?.result.uncertainties ?? []) unknown.add(value);
      if (item.analysis?.result.question && (!item.clarification || item.status === 'question' || item.clarification.skipped)) unknown.add(item.analysis.result.question);
      if (['failed', 'interrupted'].includes(item.status)) unknown.add(`${item.path} 的分析未完成。`);
    }
    parts.push('## 验证与未决问题', '此次同步未执行验证；如有实际检查结果，请在这里补充。');
    if (unknown.size) parts.push(...[...unknown].map(value => `- ${value}`));
    parts.push('## 接着做', unknown.size ? '先核对上述未决问题，再决定下一步；文件变化与分析结果不代表任务已经完成。' : '核对主要变化，补充实际检查结果和下一步安排。');
    return { text: parts.join('\n\n'), syncId: view.sync.id };
  }
  async save(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), body = text(input.text, 60000), requestId = text(input.requestId, 128);
    return this.serial(project.directory, async () => {
      const { rows } = await this.records(project), contentKey = hash([input.syncId, input.parent ?? null, body]);
      const receipt = rows.find(r => r.requestId === requestId || r.kind === 'evidence-handoff' && r.contentKey === contentKey);
      if (receipt) { if (receipt.kind !== 'evidence-handoff' || receipt.contentKey !== contentKey) throw fail('EVIDENCE_REQUEST_REUSED'); return receipt; }
      if (!rows.some(r => r.id === input.syncId && r.kind === 'evidence-sync')) throw fail('EVIDENCE_RECORD_MISSING');
      const previous = input.parent ? rows.find(r => r.id === input.parent && r.kind === 'evidence-handoff') : null;
      if (input.parent && (!previous || previous.syncId !== input.syncId)) throw fail('EVIDENCE_RECORD_MISSING');
      const current = previous && latest(rows, 'evidence-handoff', r => r.entityId === previous.entityId);
      if (current && current.id !== previous.id) throw fail('EVIDENCE_EDIT_CONFLICT');
      await this.check(project, signal);
      return this.append(project, 'evidence-handoff', { requestId, title: body.split('\n')[0].replace(/^#+\s*/, '').slice(0, 120), syncId: input.syncId,
        entityId: previous?.entityId ?? randomUUID(), parent: previous?.id ?? null, text: body, sessionId, contentKey });
    });
  }
  async readHandoff(sessionId, input, signal) {
    const project = await this.project(sessionId, signal), record = await this.store.get(project.directory, input.id);
    if (record.kind !== 'evidence-handoff') throw fail('EVIDENCE_RECORD_MISSING');
    await this.check(project, signal);
    return record;
  }
  async quote(sessionId, input, signal) {
    const record = await this.readHandoff(sessionId, input, signal);
    return { text: `\n[工作交接记录 ${record.id}]\n${record.text}\n`, reference: { id: record.id, project: record.project, sync: record.syncId, version: record.inputHash, at: record.recordedAt } };
  }
  async cancel(sessionId, _input, signal) {
    const project = await this.project(sessionId, signal);
    for (const job of this.jobs.values()) if (job.project.directory === project.directory) job.controller.abort();
    return { requested: true };
  }
  dispose() { for (const job of this.jobs.values()) job.controller.abort(); }
}
