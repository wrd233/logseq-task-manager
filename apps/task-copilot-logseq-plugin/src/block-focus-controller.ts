import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

import type { ServiceRuntimeClient } from "./service-connection.ts";

export type BlockFocusClient = Pick<ServiceRuntimeClient, "listObjects" | "listPrimaryAnchors" | "nowWork" | "selectFocus" | "removeFocus">;

export type BlockFocusResult = {
  status: "SELECTED" | "REMOVED" | "UNDONE";
  blockUuid: string;
  objectId: string;
  objectText: string;
  message: string;
};

interface FocusMutation {
  blockUuid: string;
  objectId: string;
  objectText: string;
  objectVersion: number;
  wasFocused: boolean;
  previousRank?: number;
}

interface ResolvedBlockObject {
  anchor: V2Anchor;
  object: V2ManagedObject;
}

export async function resolveBlockObject(
  client: Pick<BlockFocusClient, "listObjects" | "listPrimaryAnchors">,
  blockUuid: string,
  failureSuffix = "当前关注没有改变。",
): Promise<ResolvedBlockObject> {
  if (!blockUuid.trim()) throw new Error(`当前内容缺少可识别位置；${failureSuffix}`);
  const objectsPromise = client.listObjects();
  const matches: V2Anchor[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listPrimaryAnchors(cursor);
    matches.push(...page.anchors.filter((value) => (
      value.externalId === blockUuid
      && value.role === "primary_text"
      && value.status === "active"
    )));
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error(`暂时无法确认这条内容对应的事项；${failureSuffix}`);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  const objects = await objectsPromise;
  if (matches.length === 0) {
    throw new Error(`这条内容尚未由 Task Copilot 管理；${failureSuffix}`);
  }
  if (matches.length !== 1) {
    throw new Error(`这条内容的关联不唯一；为避免改错，${failureSuffix}`);
  }
  const anchor = matches[0]!;
  const object = objects.find((value) => value.objectId === anchor.objectId);
  if (!object) throw new Error(`这条内容的事项状态暂时不可用；${failureSuffix}`);
  if (object.lifecycle !== "OPEN") throw new Error(`这条内容对应的事项已经结束；${failureSuffix}`);
  return { anchor, object };
}

export class BlockFocusController {
  private lastMutation: FocusMutation | undefined;
  private mutationRunning = false;

  constructor(private readonly getClient: () => BlockFocusClient | undefined) {}

  async toggle(blockUuid: string): Promise<BlockFocusResult> {
    return this.runExclusive(() => this.toggleOnce(blockUuid));
  }

  private async toggleOnce(blockUuid: string): Promise<BlockFocusResult> {
    const client = this.getClient();
    if (!client) throw new Error("正式功能暂时不可用；当前关注没有改变。");
    const [{ object }, current] = await Promise.all([
      resolveBlockObject(client, blockUuid),
      client.nowWork(),
    ]);
    const previousRank = current.focus.findIndex((value) => value.objectId === object.objectId);
    const wasFocused = previousRank >= 0;
    if (wasFocused) {
      await client.removeFocus(object.objectId, object.version);
    } else {
      await client.selectFocus(object.objectId, object.version, current.focus.length);
    }
    this.lastMutation = {
      blockUuid,
      objectId: object.objectId,
      objectText: object.text,
      objectVersion: object.version,
      wasFocused,
      ...(wasFocused ? { previousRank } : {}),
    };
    return {
      status: wasFocused ? "REMOVED" : "SELECTED",
      blockUuid,
      objectId: object.objectId,
      objectText: object.text,
      message: `已${wasFocused ? "移出" : "加入"}当前关注：${object.text}。可用“撤销上一次关注变化”恢复。`,
    };
  }

  async undoLast(): Promise<BlockFocusResult> {
    return this.runExclusive(() => this.undoLastOnce());
  }

  private async undoLastOnce(): Promise<BlockFocusResult> {
    const mutation = this.lastMutation;
    if (!mutation) throw new Error("没有可撤销的当前关注变化。");
    const client = this.getClient();
    if (!client) throw new Error("正式功能暂时不可用；上一次关注变化尚未撤销。");
    const [objects, current] = await Promise.all([client.listObjects(), client.nowWork()]);
    const object = objects.find((value) => value.objectId === mutation.objectId);
    if (!object || object.lifecycle !== "OPEN" || object.version !== mutation.objectVersion) {
      throw new Error("对象已在上次操作后变化；为避免覆盖新状态，没有执行撤销。");
    }
    const isFocused = current.focus.some((value) => value.objectId === mutation.objectId);
    if (mutation.wasFocused) {
      if (isFocused) throw new Error("当前关注已在上次操作后变化；没有执行撤销。");
      await client.selectFocus(mutation.objectId, mutation.objectVersion, mutation.previousRank!);
    } else {
      if (!isFocused) throw new Error("当前关注已在上次操作后变化；没有执行撤销。");
      await client.removeFocus(mutation.objectId, mutation.objectVersion);
    }
    this.lastMutation = undefined;
    return {
      status: "UNDONE",
      blockUuid: mutation.blockUuid,
      objectId: mutation.objectId,
      objectText: mutation.objectText,
      message: `已撤销：${mutation.objectText}已${mutation.wasFocused ? "恢复到" : "移出"}当前关注。`,
    };
  }

  private async runExclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.mutationRunning) throw new Error("上一次当前关注操作正在处理；没有重复提交。");
    this.mutationRunning = true;
    try {
      return await action();
    } finally {
      this.mutationRunning = false;
    }
  }

  hasUndo(): boolean {
    return this.lastMutation !== undefined;
  }
}
