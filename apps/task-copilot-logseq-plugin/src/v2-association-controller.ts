import type { V2Association, V2ManagedObject } from "@task-copilot/domain";

export interface V2AssociationSubmissionState {
  busy: boolean;
}

export interface V2AssociationClient {
  listObjects(): Promise<V2ManagedObject[]>;
  addAssociation(input: {
    sourceObjectId: string;
    targetObjectId: string;
    expectedVersion: number;
    confirmation: "ADD_ASSOCIATION";
    traceId: string;
  }): Promise<{ object: V2ManagedObject; association: V2Association; replayed: boolean }>;
}

export interface V2AssociationSubmission {
  sourceObjectId: string;
  targetObjectId: string;
  expectedVersion: number | undefined;
  confirmed: boolean;
  traceId: string;
}

export async function submitV2Association(
  state: V2AssociationSubmissionState,
  client: V2AssociationClient,
  input: V2AssociationSubmission,
  onBusy: (busy: boolean) => Promise<void>,
): Promise<{ object: V2ManagedObject; association: V2Association; replayed: boolean } | undefined> {
  if (state.busy) return undefined;
  state.busy = true;
  try {
    await onBusy(true);
    if (!input.sourceObjectId || !input.targetObjectId || input.sourceObjectId === input.targetObjectId) throw new Error("请选择两个不同的正式对象。");
    if (!input.expectedVersion) throw new Error("来源对象版本证据缺失；请刷新后重新选择。");
    if (!input.confirmed) throw new Error("请明确确认普通 Association 不改变 Primary Ownership。");
    const source = (await client.listObjects()).find((object) => object.objectId === input.sourceObjectId);
    if (!source || source.version !== input.expectedVersion) throw new Error("来源对象已变化或不存在；请刷新后重试。");
    return await client.addAssociation({
      sourceObjectId: input.sourceObjectId,
      targetObjectId: input.targetObjectId,
      expectedVersion: input.expectedVersion,
      confirmation: "ADD_ASSOCIATION",
      traceId: input.traceId,
    });
  } finally {
    state.busy = false;
    await onBusy(false);
  }
}
