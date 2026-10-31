import { sourceBody, inlineDiff } from '../../../logseq-plugin/src/features/stage-workbench/diff.ts';
/** Shared by host and browser. Facts are structural; semantic explanations stay attributed. */
export const origins = { agent: 'Agent 整理', observed: '工具观察', reconstructed: '历史重建' };
const text = (value, name, max = Infinity) => {
    if (typeof value !== 'string' || value.length > max)
        throw Error(`HISTORY_INVALID_${name}`);
    return value;
};
export function structure(input) {
    if (!Array.isArray(input.nodes) || input.nodes.length > 5000)
        throw Error('HISTORY_NODES_REQUIRED');
    const siblings = new Map();
    const nodes = input.nodes.map(n => {
        const parent = n.parentId ?? null, order = siblings.get(parent) ?? 0;
        siblings.set(parent, order + 1);
        return ({
            id: text(n.id, 'ID', 512), title: text(n.title, 'TITLE', 512), body: text(n.body ?? '', 'BODY'),
            parentId: n.parentId == null ? null : text(n.parentId, 'PARENT', 512), order: n.order ?? order,
            status: n.status == null ? null : text(n.status, 'STATUS', 128),
            dependencies: [...new Set(n.dependencies ?? [])].map(id => text(id, 'DEPENDENCY', 512)).sort(),
            sources: (n.sources ?? []).map(s => ({ kind: text(s.kind, 'SOURCE_KIND', 32), ref: text(s.ref, 'SOURCE', 4096),
                version: s.version == null ? null : text(s.version, 'VERSION', 256), excerpt: text(s.excerpt ?? '', 'EXCERPT') })),
            availability: n.availability ?? 'available',
        });
    });
    const byId = new Map(nodes.map(n => [n.id, n]));
    if (byId.size !== nodes.length || nodes.some(n => !n.id || !Number.isSafeInteger(n.order) || n.order < 0))
        throw Error('HISTORY_NODE_ID_OR_ORDER');
    const coverage = input.coverage === 'partial' ? 'partial' : 'complete', visited = new Set(), active = new Set();
    const visit = n => {
        if (active.has(n.id))
            throw Error('HISTORY_PARENT_CYCLE');
        if (visited.has(n.id))
            return;
        active.add(n.id);
        if (n.parentId) {
            const parent = byId.get(n.parentId);
            if (parent)
                visit(parent);
            else if (coverage === 'complete')
                throw Error('HISTORY_PARENT_MISSING');
        }
        active.delete(n.id);
        visited.add(n.id);
    };
    nodes.forEach(visit);
    return { nodes, coverage };
}
export function compare(before, after) {
    if (before.track !== after.track)
        throw Error('HISTORY_DIFFERENT_TRACKS');
    const old = new Map(before.nodes.map(n => [n.id, n])), current = new Map(after.nodes.map(n => [n.id, n]));
    const depth = (node, map) => { let level = 0; for (let p = node.parentId; p && map.has(p); p = map.get(p).parentId)
        level++; return level; };
    const changes = [], value = (n, k) => k === 'body' && before.track.startsWith('logseq:') ? sourceBody(n[k]) : n[k];
    for (const node of after.nodes) {
        const prior = old.get(node.id), kinds = [];
        if (!prior)
            kinds.push(before.coverage === 'partial' ? '首次观察' : '新增');
        else {
            for (const [field, label] of [['title', '改名'], ['body', '正文'], ['parentId', '归属'], ['order', '顺序'], ['status', '声明状态'], ['dependencies', '依赖'], ['sources', '来源'], ['availability', '可用性']])
                if ((!['title', 'body', 'status', 'dependencies'].includes(field) || prior.availability === 'available' && node.availability === 'available') && JSON.stringify(value(prior, field)) !== JSON.stringify(value(node, field)))
                    kinds.push(label);
            if (depth(prior, old) !== depth(node, current))
                kinds.push('深度');
        }
        if (kinds.length)
            changes.push({ id: node.id, kinds, before: prior ?? null, after: node, inline: prior && kinds.includes('正文') ? inlineDiff(value(prior, 'body'), value(node, 'body')) : null });
    }
    for (const node of before.nodes)
        if (!current.has(node.id))
            changes.push({ id: node.id, kinds: [after.coverage === 'partial' ? '未再观察' : '删除'], before: node, after: null });
    return changes;
}
export function outline(nodes) {
    const byId = new Map(nodes.map(n => [n.id, n])), children = new Map(), result = [];
    for (const node of nodes) {
        const parent = byId.has(node.parentId) ? node.parentId : null;
        if (!children.has(parent))
            children.set(parent, []);
        children.get(parent).push(node);
    }
    const visit = parent => { for (const node of (children.get(parent) ?? []).sort((a, b) => a.order - b.order)) {
        result.push(node);
        visit(node.id);
    } };
    visit(null);
    return result;
}

/** Walk stable parent links from a node to its root. Missing parents end the chain. */
export function lineage(node, nodes) {
    const byId = new Map(nodes.map(n => [n.id, n])), path = [], seen = new Set();
    let current = node;
    while (current && !seen.has(current.id)) {
        path.unshift(current);
        seen.add(current.id);
        current = byId.get(current.parentId) ?? null;
    }
    return path;
}

/** Select the saved causal chain that ends at the newest record; never reorder by timestamp.
 *  Logseq revisions carry their real parent revision in facts; Agent snapshots use the
 *  append-chain parent. Unresolvable links fall back to the append parent and are flagged. */
export function historyChain(records) {
    if (!records.length)
        return { records: [], omitted: [], broken: false };
    const byId = new Map(records.map(r => [r.id, r]));
    const byRevision = new Map(records.filter(r => r.facts?.revisionId).map(r => [r.facts.revisionId, r]));
    let latest = records[0];
    for (const record of records)
        if ((record.sequence ?? -1) >= (latest.sequence ?? -1))
            latest = record;
    const ordered = [], seen = new Set();
    let cursor = latest, broken = false;
    while (cursor) {
        if (seen.has(cursor.id)) { broken = true; break; }
        ordered.push(cursor);
        seen.add(cursor.id);
        let parent = null;
        const revisionParent = cursor.facts?.parentRevision;
        if (revisionParent) {
            parent = byRevision.get(revisionParent) ?? null;
            if (!parent) broken = true;
        }
        if (!parent && cursor.parentId) parent = byId.get(cursor.parentId) ?? null;
        if (!parent) break;
        cursor = parent;
    }
    ordered.reverse();
    const omitted = records.filter(r => !seen.has(r.id)).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return { records: ordered, omitted, broken };
}
