export { structure, compare, outline, origins } from '../structure-view/model.mjs';
export function quote({ snapshot, node, baseline, changes, source }) {
    const ref = { history: snapshot.id, project: snapshot.project, origin: snapshot.origin, title: snapshot.title,
        occurredAt: snapshot.occurredAt, recordedAt: snapshot.recordedAt, reconstructedAt: snapshot.reconstructedAt,
        ...(source ? { source: source.source, currentVersion: source.current?.version, notice: source.notice } : {}), ...(baseline ? { comparedWith: baseline.id } : {}), ...(node ? { node: node.id, sources: node.sources } : {}) };
    const body = source ? `${source.notice}\n${source.current?.content ?? source.source?.excerpt ?? ''}` : node ? `${node.title}\n${node.availability === 'available' ? node.body : '历史正文未知'}` : changes ? changes.map(c => `${(c.after ?? c.before).title}：${c.kinds.join('、')}`).join('\n') : snapshot.summary;
    return `\n[工作历史 ${JSON.stringify(ref)}]\n${body.slice(0, 12000)}${body.length > 12000 ? '\n（引用正文已节选，完整内容见历史记录）' : ''}\n`;
}
