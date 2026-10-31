import { WorkspaceError, workRecord, workText, type AgentWorkBinding } from './workspace-agent.ts';

/** Navigation identity only. Never an access grant or a directory identity.
 * Explicit catalog pages may use a durable native block anchor in the page namespace;
 * their live SourceScope still carries the actual current page UUID. */
export type WorkRef =
  | {kind: 'logseq'; graphId: string; rootUuid: string; sourceKind: 'block' | 'page'}
  | {kind: 'kernel'; objectId: string};
export function parseWorkRef(input: unknown): WorkRef {
  const value = workRecord(input, ['kind', 'graphId', 'rootUuid', 'sourceKind', 'objectId']);
  if (value.kind === 'kernel' && value.graphId === undefined && value.rootUuid === undefined && value.sourceKind === undefined)
    return {kind: 'kernel', objectId: workText(value.objectId)};
  if (value.kind === 'logseq' && value.objectId === undefined && ['block', 'page'].includes(String(value.sourceKind)))
    return {kind: 'logseq', graphId: workText(value.graphId, 2048), rootUuid: workText(value.rootUuid), sourceKind: value.sourceKind as 'block' | 'page'};
  throw new WorkspaceError('WORK_REF_INVALID');
}
export const workRefFromBinding = (binding: AgentWorkBinding): WorkRef => ({kind: 'logseq', graphId: binding.scope.graphId,
  rootUuid: binding.scope.rootUuid, sourceKind: binding.scope.kind === 'page' ? 'page' : 'block'});
export const sameWorkRef = (left: WorkRef | undefined, right: WorkRef | undefined): boolean =>
  JSON.stringify(left && parseWorkRef(left)) === JSON.stringify(right && parseWorkRef(right));
