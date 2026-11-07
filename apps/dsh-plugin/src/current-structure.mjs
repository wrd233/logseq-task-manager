import { WorkspaceError } from '@task-copilot/contracts';
import { readerModel } from './reader-model.mjs';

export function currentStructure(snapshot, workRef, objects, focusUuid = snapshot.scope.rootUuid) {
  const reader = readerModel(snapshot, workRef, {includeTokens: false});
  const { scope, nodes } = reader, rootUuid = scope.rootUuid;
  const identity = new Map(objects.map(object => [object.blockUuid, object]));
  const byUuid = new Map(nodes.map(node => [node.blockUuid, node]));
  const work = new Map(), children = new Map(), owners = new Map();
  const detail = (node, uuid, parentUuid, object) => ({
    uuid, parentUuid, sourceParentUuid: node?.parentUuid ?? null,
    type: object?.kind ?? (uuid === rootUuid ? scope.kind === 'page' ? 'PAGE' : 'WORK' : 'TASK'),
    title: object?.title ?? (node?.body.markdown.split('\n')[0] || scope.pageName || 'Logseq 工作'),
    workRef: uuid === rootUuid ? workRef : object?.workRef ?? {kind: 'logseq', graphId: scope.graphId, rootUuid: uuid, sourceKind: 'block'},
    status: node?.body.status ?? null, source: node ? {sourceId: node.sourceId, graphId: scope.graphId, blockUuid: uuid,
      contentVersion: node.contentVersion, logseqUrl: node.logseqUrl, availability: node.availability} :
      {graphId: scope.graphId, pageUuid: uuid, availability: snapshot.page?.availability,
        logseqUrl: `logseq://graph/${encodeURIComponent(scope.graphId.split(':')[0])}?page=${encodeURIComponent(scope.pageName)}`},
  });
  work.set(rootUuid, detail(byUuid.get(rootUuid), rootUuid, null, identity.get(rootUuid)));
  owners.set(rootUuid, rootUuid);
  for (const node of nodes) {
    const uuid = node.blockUuid;
    if (uuid === rootUuid) continue;
    const owner = owners.get(node.parentUuid) ?? rootUuid, object = identity.get(uuid);
    if (object || node.body.status) {
      work.set(uuid, detail(node, uuid, owner, object));
      if (!children.has(owner)) children.set(owner, []);
      children.get(owner).push(work.get(uuid));
      owners.set(uuid, uuid);
    } else owners.set(uuid, owner);
  }
  const focus = work.get(focusUuid);
  if (!focus) throw new WorkspaceError('STRUCTURE_FOCUS_MISSING');
  const path = [];
  for (let item = focus; item; item = work.get(item.parentUuid)) path.unshift(item);
  const next = children.get(focusUuid) ?? [];
  return { scope, workRef, sourceSetVersion: reader.sourceSetVersion, structureVersion: reader.structureVersion,
    capturedAt: reader.capturedAt, path, root: {...focus, body: byUuid.get(focusUuid)?.body ?? null}, children: next,
    content: next.length ? [] : nodes.filter(node => owners.get(node.blockUuid) === focusUuid) };
}
