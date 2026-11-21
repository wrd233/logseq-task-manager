import { sha256, type SourceScope } from "../../workspace/source-protocol.ts";

export interface TidySnapshotBlock {
  blockUuid: string;
  sourceId: string;
  beforeContent: string;
  beforeVersion: string;
  afterContent: string;
  afterVersion: string;
}

export interface TidySnapshotInserted {
  blockUuid: string;
  parentBlockUuid: string;
  content: string;
  version: string;
}

export interface TidySnapshotRecord {
  schemaVersion: 1;
  snapshotId: string;
  workKey: string;
  scope: SourceScope;
  createdAt: string;
  summary: string;
  origin: "local-model" | "external-mcp";
  blocks: TidySnapshotBlock[];
  inserted: TidySnapshotInserted[];
  undone?: boolean;
}

const MAX_SNAPSHOTS_PER_WORK = 5;
const storageKey = (workKey: string) => `workbench:note-tidy-snapshots:${workKey}`;

export function listTidySnapshots(workKey: string, storage: Pick<Storage, "getItem"> = localStorage): TidySnapshotRecord[] {
  if (!workKey) return [];
  try {
    const raw = storage.getItem(storageKey(workKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as TidySnapshotRecord[]).filter(
      (item) => item && item.schemaVersion === 1 && typeof item.snapshotId === "string" && Array.isArray(item.blocks)
    );
  } catch {
    return [];
  }
}

export function saveTidySnapshot(
  record: TidySnapshotRecord,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage
): void {
  if (!record.workKey) return;
  const existing = listTidySnapshots(record.workKey, storage).filter((item) => item.snapshotId !== record.snapshotId);
  const next = [record, ...existing].slice(0, MAX_SNAPSHOTS_PER_WORK);
  try {
    storage.setItem(storageKey(record.workKey), JSON.stringify(next));
  } catch {
    // Storage quota failures must never corrupt applied notes.
  }
}

export function markTidySnapshotUndone(
  workKey: string,
  snapshotId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage
): void {
  const existing = listTidySnapshots(workKey, storage);
  const next = existing.map((item) => (item.snapshotId === snapshotId ? { ...item, undone: true } : item));
  try {
    storage.setItem(storageKey(workKey), JSON.stringify(next));
  } catch {
    // Ignore storage error.
  }
}

export interface LiveBlockLookup {
  (uuid: string): Promise<{ uuid?: string; content?: string; children?: unknown[] } | null>;
}

export async function canSafelyUndoSnapshot(
  snapshot: TidySnapshotRecord,
  getBlock: LiveBlockLookup
): Promise<{ canUndo: boolean; changedBlockUuids: string[]; reason?: string }> {
  if (snapshot.undone) {
    return { canUndo: false, changedBlockUuids: [], reason: "该次整理已撤销。" };
  }
  const changedBlockUuids: string[] = [];
  for (const block of snapshot.blocks) {
    const live = await getBlock(block.blockUuid);
    if (!live || typeof live.content !== "string") {
      changedBlockUuids.push(block.blockUuid);
      continue;
    }
    const liveVersion = await sha256(live.content);
    if (liveVersion !== block.afterVersion) {
      changedBlockUuids.push(block.blockUuid);
    }
  }
  for (const ins of snapshot.inserted) {
    const live = await getBlock(ins.blockUuid);
    if (!live || typeof live.content !== "string") {
      changedBlockUuids.push(ins.blockUuid);
      continue;
    }
    const liveVersion = await sha256(live.content);
    const hasChildren = Array.isArray(live.children) && live.children.length > 0;
    if (liveVersion !== ins.version || hasChildren) {
      changedBlockUuids.push(ins.blockUuid);
    }
  }
  if (changedBlockUuids.length) {
    return {
      canUndo: false,
      changedBlockUuids,
      reason: "你已在整理后的笔记上续写新内容，已禁用覆盖还原；可在下方只读查看或复制整理前原文。",
    };
  }
  return { canUndo: true, changedBlockUuids: [] };
}

export async function undoTidySnapshot(
  snapshot: TidySnapshotRecord,
  ports: {
    checkSafe(): Promise<void>;
    getBlock: LiveBlockLookup;
    updateBlock(uuid: string, content: string): Promise<void>;
    removeBlock?(uuid: string): Promise<void>;
    storage?: Pick<Storage, "getItem" | "setItem">;
  }
): Promise<{ restored: boolean; reason?: string }> {
  await ports.checkSafe();
  const check = await canSafelyUndoSnapshot(snapshot, ports.getBlock);
  if (!check.canUndo) {
    return { restored: false, ...(check.reason ? { reason: check.reason } : {}) };
  }
  if (snapshot.inserted.length && !ports.removeBlock) {
    return { restored: false, reason: "当前宿主暂不支持自动移除新增子块，请参考只读快照手动调整。" };
  }
  for (const block of snapshot.blocks) {
    await ports.checkSafe();
    await ports.updateBlock(block.blockUuid, block.beforeContent);
    const verified = await ports.getBlock(block.blockUuid);
    if (verified?.content !== block.beforeContent) {
      throw new Error("撤回写入后读回校验不一致，请核对原块内容。");
    }
  }
  for (const ins of [...snapshot.inserted].reverse()) {
    await ports.checkSafe();
    await ports.removeBlock!(ins.blockUuid);
  }
  markTidySnapshotUndone(snapshot.workKey, snapshot.snapshotId, ports.storage ?? localStorage);
  return { restored: true };
}
