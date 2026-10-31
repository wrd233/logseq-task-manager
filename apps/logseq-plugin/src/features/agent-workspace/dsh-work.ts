import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { ContextReading } from "../../workspace/context-service.ts";
import type { WorkspaceBinding } from "../../workspace/registry.ts";

/** Only the explicit collaboration click calls this. Reading creates no folders. */
export async function ensureDshWork(scope: SourceScope, ports: {
  resolve(scope: SourceScope): Promise<WorkspaceBinding | null>;
  directory(scope: SourceScope): Promise<string>;
  bind(input: {scope: SourceScope; directory: string; organization: "flat"}): Promise<ContextReading>;
  check(): Promise<void>;
}): Promise<WorkspaceBinding> {
  await ports.check();
  const existing = await ports.resolve(scope); await ports.check();
  if (existing) return existing;
  const directory = await ports.directory(scope); await ports.check();
  const result = await ports.bind({scope, directory, organization: "flat"}); await ports.check();
  if (!result.binding || result.freshness !== "checked") throw new Error(result.problem ?? "工作原文暂不可读，请保存当前输入后再试。");
  return result.binding;
}

import { ancestry } from '../work-view/focus.mjs';
import { WorkspaceError, type WorkRef } from '@task-copilot/contracts';
export interface DshWorkTarget {scope: SourceScope; workRef: WorkRef; temporary: boolean; title?: string}
/** Shared by navigation entries only; exact write-scope selection never calls this. */
export async function resolveDshTarget(scope: SourceScope, ports: {
  getBlock(id: string | number): Promise<{uuid?: string; content?: string; parent?: {id?: string | number; uuid?: string}; page?: {id?: string | number}} | null>;
  formal(uuid: string): Promise<{objectId: string; title: string} | null>;
  check(): Promise<void>;
}): Promise<DshWorkTarget> {
  await ports.check();
  if (scope.kind === 'page') return {scope, workRef: {kind: 'logseq', graphId: scope.graphId, rootUuid: scope.rootUuid, sourceKind: 'page'}, temporary: true};
  const formal = new Map<string, {objectId: string; title: string}>();
  const trace = await ancestry(scope.rootUuid, async id => {
    const block = await ports.getBlock(id); await ports.check();
    if (block?.uuid) {const object = await ports.formal(block.uuid); await ports.check(); if (object) formal.set(block.uuid, object);}
    return block;
  }, {resolve: uuid => {const value = formal.get(uuid); return value ? {type: 'formal', title: value.title} : null;}});
  if (!trace.complete) throw new WorkspaceError('WORK_ANCESTRY_UNAVAILABLE');
  const root = trace.objects.at(-1), rootUuid = root?.uuid ?? scope.rootUuid, object = formal.get(rootUuid);
  return {scope: {graphId: scope.graphId, rootUuid}, temporary: !root,
    ...(root ? {title: root.title} : {}), workRef: object ? {kind: 'kernel', objectId: object.objectId}
      : {kind: 'logseq', graphId: scope.graphId, rootUuid, sourceKind: 'block'}};
}
