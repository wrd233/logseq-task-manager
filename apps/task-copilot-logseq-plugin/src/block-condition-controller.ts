import type { V2Condition } from "@task-copilot/domain";
import { stableJson } from "@task-copilot/shared";

import { resolveBlockObject } from "./block-focus-controller.ts";
import type { ServiceRuntimeClient } from "./service-connection.ts";

export type BlockConditionClient = Pick<ServiceRuntimeClient, "listObjects" | "listPrimaryAnchors" | "changeCondition">;
export type BlockConditionIntent = "WAITING" | "BLOCKED" | "PAUSED";

export type BlockConditionDraft =
  | { intent: "WAITING"; summary: string; reviewAt: string }
  | { intent: "BLOCKED"; reason: string; blockerObjectId?: string }
  | { intent: "PAUSED"; reason: string; reviewAt: string };

export interface PreparedBlockCondition {
  blockUuid: string;
  objectId: string;
  objectText: string;
  objectVersion: number;
  condition: V2Condition;
}

export interface BlockConditionApplyInput {
  blockUuid: string;
  objectId: string;
  expectedVersion: number;
  draft: BlockConditionDraft;
}

export interface BlockConditionResult {
  status: BlockConditionIntent | "UNDONE";
  blockUuid: string;
  objectId: string;
  objectText: string;
  objectVersion: number;
  message: string;
}

interface ConditionMutation {
  blockUuid: string;
  objectId: string;
  objectText: string;
  beforeCondition: V2Condition;
  afterCondition: V2Condition;
  afterVersion: number;
}

function required(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requiredReviewAt(value: string, message: string): string {
  const raw = value.trim();
  const date = new Date(raw);
  if (!raw || !Number.isFinite(date.getTime())) throw new Error(message);
  return date.toISOString();
}

export function buildBlockCondition(draft: BlockConditionDraft): V2Condition {
  if (draft.intent === "WAITING") {
    if (!draft.summary.trim() || !draft.reviewAt.trim()) {
      throw new Error("请填写在等谁或什么结果，以及复查时间；没有保存，原状态未改变。");
    }
    const summary = required(draft.summary, "请填写在等谁或什么结果；没有保存，原状态未改变。");
    return {
      kind: "WAITING",
      waitingFor: summary,
      expectedResult: summary,
      reviewAt: requiredReviewAt(draft.reviewAt, "请填写合法的复查时间；没有保存，原状态未改变。"),
    };
  }
  if (draft.intent === "BLOCKED") {
    const reason = required(draft.reason, "请填写具体卡点；没有保存，原状态未改变。");
    const blockerObjectId = draft.blockerObjectId?.trim();
    return {
      kind: "BLOCKED",
      reason,
      ...(blockerObjectId ? { blockerObjectId } : {}),
    };
  }
  const reason = required(draft.reason, "请填写暂停原因；没有保存，原状态未改变。");
  return {
    kind: "PAUSED",
    reason,
    reviewAt: requiredReviewAt(draft.reviewAt, "请填写合法的重新判断时间；没有保存，原状态未改变。"),
  };
}

function sameCondition(left: V2Condition, right: V2Condition): boolean {
  return stableJson(left) === stableJson(right);
}

export class BlockConditionController {
  private lastMutation: ConditionMutation | undefined;
  private mutationRunning = false;

  constructor(private readonly getClient: () => BlockConditionClient | undefined) {}

  async prepare(blockUuid: string): Promise<PreparedBlockCondition> {
    const client = this.getClient();
    if (!client) throw new Error("V2 Local Service 未就绪；原状态未改变。");
    const { object } = await resolveBlockObject(client, blockUuid, "原状态未改变。");
    return {
      blockUuid,
      objectId: object.objectId,
      objectText: object.text,
      objectVersion: object.version,
      condition: object.condition,
    };
  }

  async apply(input: BlockConditionApplyInput): Promise<BlockConditionResult> {
    return this.runExclusive(async () => {
      const client = this.getClient();
      if (!client) throw new Error("V2 Local Service 未就绪；没有保存，原状态未改变。");
      const { object } = await resolveBlockObject(client, input.blockUuid, "没有保存，原状态未改变。");
      if (object.objectId !== input.objectId || object.version !== input.expectedVersion) {
        throw new Error("对象已在打开表单后变化；没有保存，原状态未改变。");
      }
      const condition = buildBlockCondition(input.draft);
      const result = await client.changeCondition(object.objectId, object.version, condition);
      if (
        result.object.objectId !== object.objectId
        || result.object.version <= object.version
        || !sameCondition(result.object.condition, condition)
      ) {
        throw new Error("Local Service 返回结果无法确认；请刷新状态核对，不会自动重试。");
      }
      this.lastMutation = {
        blockUuid: input.blockUuid,
        objectId: object.objectId,
        objectText: object.text,
        beforeCondition: object.condition,
        afterCondition: condition,
        afterVersion: result.object.version,
      };
      const label = input.draft.intent === "WAITING" ? "等待别人"
        : input.draft.intent === "BLOCKED" ? "被问题卡住"
        : "我先暂停";
      return {
        status: input.draft.intent,
        blockUuid: input.blockUuid,
        objectId: object.objectId,
        objectText: object.text,
        objectVersion: result.object.version,
        message: `已设为“${label}”：${object.text}。Focus 未改变；可用“撤销上一次状态变化”恢复。`,
      };
    });
  }

  async undoLast(): Promise<BlockConditionResult> {
    return this.runExclusive(async () => {
      const mutation = this.lastMutation;
      if (!mutation) throw new Error("没有可撤销的状态变化。");
      const client = this.getClient();
      if (!client) throw new Error("V2 Local Service 未就绪；上一次状态变化尚未撤销。");
      const { object } = await resolveBlockObject(client, mutation.blockUuid, "没有执行撤销。");
      if (
        object.objectId !== mutation.objectId
        || object.version !== mutation.afterVersion
        || !sameCondition(object.condition, mutation.afterCondition)
      ) {
        throw new Error("对象或状态已在上次操作后变化；为避免覆盖新状态，没有执行撤销。");
      }
      const result = await client.changeCondition(object.objectId, object.version, mutation.beforeCondition);
      if (
        result.object.objectId !== object.objectId
        || result.object.version <= object.version
        || !sameCondition(result.object.condition, mutation.beforeCondition)
      ) {
        throw new Error("撤销结果无法确认；请刷新状态核对，不会自动重试。");
      }
      this.lastMutation = undefined;
      return {
        status: "UNDONE",
        blockUuid: mutation.blockUuid,
        objectId: mutation.objectId,
        objectText: mutation.objectText,
        objectVersion: result.object.version,
        message: `已撤销：${mutation.objectText}已恢复为${mutation.beforeCondition.kind}；Focus 未改变。`,
      };
    });
  }

  hasUndo(): boolean {
    return this.lastMutation !== undefined;
  }

  private async runExclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.mutationRunning) throw new Error("上一次状态操作正在处理；没有重复提交。");
    this.mutationRunning = true;
    try {
      return await action();
    } finally {
      this.mutationRunning = false;
    }
  }
}
