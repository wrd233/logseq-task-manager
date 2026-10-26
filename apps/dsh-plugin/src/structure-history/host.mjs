import { join } from 'node:path';
import { HistoryStore } from './store.mjs';
import { HistoryService, metadata } from './service.mjs';
const source = { type: 'object', properties: { kind: { type: 'string', enum: ['file', 'logseq', 'git'] }, ref: { type: 'string' }, version: { type: ['string', 'null'] }, excerpt: { type: 'string' } }, required: ['kind', 'ref'], additionalProperties: false };
const node = { type: 'object', properties: {
        id: { type: 'string', description: 'Stable identity. Reuse when renaming or moving the same work.' }, title: { type: 'string' }, body: { type: 'string' }, parentId: { type: ['string', 'null'] }, order: { type: 'integer', minimum: 0 },
        availability: { type: 'string', enum: ['available', 'unavailable'], description: 'Use unavailable when past source content is unknown; never fill it from today.' },
        status: { type: ['string', 'null'], description: 'Source/Agent declaration only; never a Kernel operation.' }, dependencies: { type: 'array', items: { type: 'string' } }, sources: { type: 'array', items: source },
    }, required: ['id', 'title'], additionalProperties: false };
export function installHistoryHost(ctx, workbench, directory) {
    const history = new HistoryService({ workbench, store: new HistoryStore(join(directory, 'history')) });
    const routes = {
        'history-list': (v, signal) => history.list(v.sessionId, v, signal),
        'history-read': (v, signal) => history.read(v.sessionId, v.id, signal),
        'history-diff': (v, signal) => history.diff(v.sessionId, v.beforeId, v.afterId, signal),
        'history-source': (v, signal) => history.source(v.sessionId, v, signal),
    };
    for (const [name, description, properties, required, execute] of [
        ['work_history_list', 'Read saved project history without creating checkpoints. No Task, Graph or project source writes. Types agent/observed/reconstructed stay distinct.', { track: { type: 'string' }, before: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, [], (a, e) => history.list(e.agent.session.id, a, e.signal)],
        ['work_history_read', 'Read an immutable snapshot, optionally one node or a page. Use saved IDs; do not guess missing past content.', { id: { type: 'string' }, nodeId: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['id'], async (a, e) => {
                const record = await history.read(e.agent.session.id, a.id, e.signal), offset = a.offset ?? 0, nodes = a.nodeId ? record.nodes.filter(n => n.id === a.nodeId) : record.nodes.slice(offset, offset + Math.min(100, a.limit ?? 30));
                return { ...metadata(record), facts: record.facts ?? null, nodes, totalNodes: record.nodes.length, more: !a.nodeId && offset + nodes.length < record.nodes.length };
            }],
        ['work_history_compare', 'Compare any two snapshots in the same projection. Computes node, content, parent/order/depth, declared state, dependency and source changes. Different projections cannot be treated as one truth.', { beforeId: { type: 'string' }, afterId: { type: 'string' } }, ['beforeId', 'afterId'], async (a, e) => { const d = await history.diff(e.agent.session.id, a.beforeId, a.afterId, e.signal); return { before: metadata(d.before), after: metadata(d.after), changes: d.changes }; }],
        ['work_history_source', 'Read and check a saved node source against its current version within this project. Never changes saved history or expands Logseq scope.', { snapshotId: { type: 'string' }, nodeId: { type: 'string' }, sourceIndex: { type: 'integer', minimum: 0 } }, ['snapshotId', 'nodeId'], (a, e) => history.source(e.agent.session.id, a, e.signal)],
        ['work_history_snapshot', 'Save a meaningful Agent-organized work structure, or explicitly reconstructed past state. Supply the whole chosen structure, stable node IDs and source refs; the tool computes changes. No formal state writes. Reconstructed snapshots require occurredAt and existing history IDs in reconstructedFrom.', {
                requestId: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, nodes: { type: 'array', items: node, maxItems: 5000 }, origin: { type: 'string', enum: ['agent', 'reconstructed'] }, coverage: { type: 'string', enum: ['complete', 'partial'] }, occurredAt: { type: 'string' }, expectedParent: { type: ['string', 'null'] }, reconstructedFrom: { type: 'array', items: { type: 'string' } },
            }, ['requestId', 'title', 'nodes'], async (a, e) => metadata(await history.publish(e.agent.session.id, a, e.signal))],
        ['work_history_explain', 'Append attributed semantic interpretation to a saved record. This is Agent explanation, not an observed fact and never changes the snapshot.', { requestId: { type: 'string' }, snapshotId: { type: 'string' }, text: { type: 'string' } }, ['requestId', 'snapshotId', 'text'], async (a, e) => metadata(await history.explain(e.agent.session.id, a, e.signal))],
    ])
        ctx.tools.register({ name, description, parameters: { type: 'object', properties, required, additionalProperties: false }, output: { schema: {}, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] }, execute });
    ctx.systemPrompt.section({ name: 'work-history:instructions', order: 4510, interpolate: false, text: 'Use work_history_list/read/compare/source for saved project history and version-checked source context. Browsing and comparison are read-only. Git and existing Logseq revisions are checkpointed automatically at work re-entry; do not publish duplicate full structures every turn. When project understanding or organization changes meaningfully, use work_history_snapshot with stable node IDs, descriptions, parent IDs, dependencies and source refs. You interpret the work; the tool computes deterministic differences. Never treat Agent interpretation or historical reconstruction as an observed fact or formal completion. Reconstructed past states need a historical date and existing record IDs as evidence. Use work_history_explain to explain an observed change, without altering its facts. All tools stay in this session project and do not create Tasks or mutate Graph source.' });
    const checkpoint = new WeakMap();
    ctx.systemPrompt.context({ name: 'work-history:checkpoint', order: 310, required: false, interpolate: false, text: c => checkpoint.get(c.scope) ?? '' });
    ctx.on('system-prompt/assemble', async (_a, c, next) => {
        const sessionId = c.scope?.session?.id;
        if (sessionId) {
            try {
                const observed = await history.observe(sessionId, c.signal);
                const list = await history.list(sessionId, { limit: 3 }, c.signal);
                checkpoint.set(c.scope, JSON.stringify({ project: list.project, recent: list.records.map(r => ({ id: r.id, title: r.title, origin: r.origin, recordedAt: r.recordedAt })), issues: [...observed.issues, ...list.issues] }));
            }
            catch (error) {
                if (c.signal?.aborted)
                    throw error;
                checkpoint.set(c.scope, JSON.stringify({ checkpoint: 'unavailable', code: error.code ?? error.message }));
            }
        }
        return next();
    });
    ctx.on('agent/status', ({ agent, status }) => {
        if (status !== 'idle')
            return;
        void history.observe(agent.session.id).catch(error => ctx.logger.warn('History checkpoint unavailable: %s', error.code ?? error.message));
    });
    return { history, routes };
}
