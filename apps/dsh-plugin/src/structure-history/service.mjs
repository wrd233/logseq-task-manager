/* global Buffer */
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isAbsolute } from 'node:path';
import { WorkspaceError } from '@task-copilot/contracts';
import { scopedPath } from '../../../task-copilot-cli/src/workspace-files.ts';
import { historyPoints, annotations } from '../../../logseq-plugin/src/features/structure-history/model.ts';
import { compare } from './model.mjs';
import { hash } from './store.mjs';
import { observeGit } from './git.mjs';
export const metadata = r => Object.fromEntries([...['id', 'project', 'sequence', 'track', 'origin', 'kind', 'title', 'summary', 'recordedAt', 'occurredAt', 'sourceRecordedAt', 'reconstructedAt', 'coverage', 'parentId'].map(k => [k, r[k]]), ['nodeCount', r.nodes.length]].filter(([, v]) => v !== undefined));
const moment = value => { if (value == null)
    return null; if (!Number.isFinite(Date.parse(value)))
    throw Error('HISTORY_INVALID_TIME'); return new Date(value).toISOString(); };
export class HistoryService {
    constructor({ store, workbench }) { this.store = store; this.workbench = workbench; this.observing = new Map(); }
    async project(sessionId, signal) {
        const status = await this.workbench.status(sessionId, signal);
        const directory = status.binding?.directory ?? status.cwd;
        if (!directory || !isAbsolute(directory))
            throw new WorkspaceError('HISTORY_PROJECT_REQUIRED', '此会话尚无工作目录。');
        return { directory: await realpath(directory), binding: status.binding, generation: this.workbench.generations.get(sessionId) ?? 0, sessionId };
    }
    async check(project, signal) {
        const current = await this.project(project.sessionId, signal);
        if (current.directory !== project.directory || current.generation !== project.generation)
            throw new WorkspaceError('BINDING_CHANGED');
    }
    async observe(sessionId, signal) {
        const project = await this.project(sessionId, signal), key = `${project.directory}:${sessionId}:${project.generation}`;
        if (this.observing.has(key))
            return this.observing.get(key);
        const task = this.collect(project).finally(() => this.observing.delete(key));
        this.observing.set(key, task);
        return task;
    }
    async collect(project, signal) {
        const issues = [], saved = await this.store.records(project.directory);
        try {
            const git = await observeGit(project.directory, saved.records.filter(r => r.track === 'git-changes' && r.kind === 'snapshot').at(-1));
            await this.check(project, signal);
            if (git.unavailable)
                issues.push(git.unavailable);
            else
                await this.store.append(project.directory, git);
        }
        catch (error) {
            if (signal?.aborted || error.code === 'BINDING_CHANGED')
                throw error;
            issues.push(`Git 检查点未保存：${error.code ?? error.message}`);
        }
        if (project.binding) {
            try {
                const history = await this.workbench.command(project.sessionId, 'stage.history', {}, signal);
                await this.check(project, signal);
                issues.push(...history.problems, ...(history.storageNotes ?? []), ...historyPoints(history).flatMap(p => p.problems));
                for (const point of historyPoints(history)) {
                    const source = point.source, track = `logseq:${hash([source.scope.graphId, source.scope.rootUuid])}`;
                    const nodes = source.blocks.map(b => ({ id: b.sourceId, title: b.content?.split('\n')[0].slice(0, 512) ?? '原文当时不可用', body: b.content ?? '',
                        parentId: source.blocks.some(p => p.target.blockUuid === b.parentUuid) ? JSON.stringify(['logseq', source.scope.graphId, b.parentUuid]) : null,
                        order: b.order, depth: b.depth, status: annotations(b).status, dependencies: annotations(b).dependencies.map(uuid => JSON.stringify(['logseq', source.scope.graphId, uuid])),
                        availability: b.availability, sources: [{ kind: 'logseq', ref: b.sourceId, version: b.contentVersion, excerpt: '' }] }));
                    await this.store.append(project.directory, { kind: 'snapshot', origin: 'observed', track, requestId: `logseq:${point.id}`, title: point.goal,
                        summary: point.parent ? '已校验 Logseq 阶段修订' : 'Logseq 阶段起点', occurredAt: source.capturedAt, sourceRecordedAt: point.at,
                        coverage: source.blocks.every(b => b.availability === 'available') ? 'complete' : 'partial', nodes,
                        facts: { provider: 'StageStore.history', stageId: point.stageId, revisionId: point.id, parentRevision: point.parent, scope: source.scope } });
                }
            }
            catch (error) {
                if (signal?.aborted || error.code === 'BINDING_CHANGED')
                    throw error;
                issues.push(`Logseq 历史暂不可读取；已保存副本仍可浏览：${error.code ?? error.message}`);
            }
        }
        return { project, issues };
    }
    async list(sessionId, input = {}, signal) {
        const observed = await this.observe(sessionId, signal), { records, problems } = await this.store.records(observed.project.directory);
        await this.check(observed.project, signal);
        const snapshots = records.filter(r => r.kind === 'snapshot');
        const preferredTrack = snapshots.filter(r => r.origin === 'agent' && r.track === 'work-structure').at(-1)?.track ?? snapshots.filter(r => r.track.startsWith('logseq:')).at(-1)?.track ?? snapshots.at(-1)?.track ?? 'work-structure';
        const track = input.track === 'default' ? preferredTrack : input.track;
        const visible = records.filter(r => r.kind === 'snapshot' && (!track || r.track === track) && (!input.before || r.sequence < input.before));
        const preferredId = snapshots.filter(r => r.track === (track ?? preferredTrack) && r.origin !== 'reconstructed').at(-1)?.id ?? snapshots.filter(r => r.track === (track ?? preferredTrack)).at(-1)?.id ?? null;
        const limit = Math.min(200, Math.max(1, input.limit ?? 80)), page = visible.slice(-limit).reverse();
        return { project: observed.project.directory, track: track ?? null, preferredTrack, preferredId, activity: snapshots.filter(r => r.origin === 'observed').slice(-3).reverse().map(metadata), issues: [...observed.issues, ...problems.map(p => p.message)],
            tracks: [...new Set(records.filter(r => r.kind === 'snapshot').map(r => r.track))],
            records: page.map(r => ({ ...metadata(r), explanations: records.filter(e => e.kind === 'explanation' && e.targetId === r.id).map(e => ({ text: e.summary, sessionId: e.sessionId, recordedAt: e.recordedAt })) })),
            more: visible.length > limit, next: page.at(-1)?.sequence ?? null };
    }
    async read(sessionId, id, signal) {
        const project = await this.project(sessionId, signal), record = await this.store.get(project.directory, id);
        await this.check(project, signal);
        return record;
    }
    async publish(sessionId, input, signal) {
        const project = await this.project(sessionId, signal);
        if (!['agent', 'reconstructed'].includes(input.origin ?? 'agent'))
            throw Error('HISTORY_ORIGIN_RESERVED');
        if (typeof input.requestId !== 'string' || !input.requestId || typeof input.title !== 'string' || !input.title.trim() || input.summary !== undefined && typeof input.summary !== 'string')
            throw Error('HISTORY_TITLE_AND_REQUEST_REQUIRED');
        const origin = input.origin ?? 'agent';
        if (origin === 'reconstructed') {
            if (!input.occurredAt || !input.reconstructedFrom?.length)
                throw Error('HISTORY_RECONSTRUCTION_BASIS_REQUIRED');
            await Promise.all(input.reconstructedFrom.map(id => this.store.get(project.directory, id)));
        }
        await this.check(project, signal);
        const record = await this.store.append(project.directory, { nodes: input.nodes, coverage: input.coverage, kind: 'snapshot', track: 'work-structure', origin,
            requestId: input.requestId, title: input.title, summary: input.summary ?? '', occurredAt: moment(input.occurredAt),
            ...(input.expectedParent !== undefined ? { expectedParent: input.expectedParent } : {}), sessionId,
            facts: { semantics: 'Agent 整理的工作结构，不是 Kernel 正式状态。', reconstructedFrom: input.reconstructedFrom ?? [] } });
        await this.check(project, signal);
        return record;
    }
    async explain(sessionId, input, signal) {
        const project = await this.project(sessionId, signal), target = await this.store.get(project.directory, input.snapshotId);
        if (target.kind !== 'snapshot')
            throw Error('HISTORY_SNAPSHOTS_REQUIRED');
        if (typeof input.text !== 'string' || !input.text.trim() || typeof input.requestId !== 'string')
            throw Error('HISTORY_EXPLANATION_REQUIRED');
        await this.check(project, signal);
        return this.store.append(project.directory, { kind: 'explanation', origin: 'agent', track: target.track, requestId: input.requestId,
            targetId: target.id, title: 'Agent 解释', summary: input.text, sessionId, occurredAt: null, nodes: [], coverage: 'partial' });
    }
    async diff(sessionId, beforeId, afterId, signal) {
        const project = await this.project(sessionId, signal);
        const [before, after] = await Promise.all([this.store.get(project.directory, beforeId), this.store.get(project.directory, afterId)]);
        await this.check(project, signal);
        if (before.kind !== 'snapshot' || after.kind !== 'snapshot')
            throw Error('HISTORY_SNAPSHOTS_REQUIRED');
        return { before, after, changes: compare(before, after) };
    }
    async source(sessionId, input, signal) {
        const project = await this.project(sessionId, signal), record = await this.store.get(project.directory, input.snapshotId);
        const node = record.nodes.find(n => n.id === input.nodeId), source = node?.sources[input.sourceIndex ?? 0];
        if (!source)
            throw Error('HISTORY_SOURCE_MISSING');
        let current;
        if (source.kind === 'logseq') {
            if (!project.binding || record.facts.scope && (project.binding.scope.graphId !== record.facts.scope.graphId || project.binding.scope.rootUuid !== record.facts.scope.rootUuid))
                throw Error('HISTORY_LOGSEQ_CONNECTION_CHANGED');
            try {
                const result = await this.workbench.command(sessionId, 'source.read', { sourceId: source.ref }, signal);
                const block = result.source;
                current = { content: block.content, version: block.contentVersion, availability: block.availability };
            }
            catch (error) {
                if (error.code !== 'SOURCE_OUTSIDE_SCOPE')
                    throw error;
                current = { content: null, version: null, availability: 'outside-scope' };
            }
        }
        else if (source.kind === 'file') {
            const path = await scopedPath(project.directory, source.ref), digest = createHash('sha256'), chunks = [];
            let size = 0;
            for await (const chunk of createReadStream(path, { signal })) {
                digest.update(chunk);
                if (size < 262144)
                    chunks.push(chunk.subarray(0, 262144 - size));
                size += chunk.length;
            }
            current = { content: Buffer.concat(chunks).toString('utf8'), version: digest.digest('hex'), truncated: size > 262144, availability: 'available' };
        }
        else
            return { source, current: null, notice: '这是历史证据定位，不包含当前来源读取。' };
        await this.check(project, signal);
        return { source, current, notice: current.availability === 'outside-scope' ? '当前来源已删除或移出已授权工作范围；不扩大读取范围，保存的历史正文保持原样。' : current.availability !== 'available' ? '当前来源已删除或不可用；保存的历史正文保持原样。' : !source.version ? '历史未保存此来源的正文版本，不能判断是否一致。' : source.version === current.version ? '刚读取的来源版本一致。' : '来源已变化；下面是今天的内容，历史快照保持不变。' };
    }
}
