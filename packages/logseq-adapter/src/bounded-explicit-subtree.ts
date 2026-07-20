export interface BoundedExplicitSubtreeLimits {
  maximumRoots: number;
  maximumBlocks: number;
}

export interface BoundedExplicitSubtreeResult {
  blocks: unknown[];
  truncated: boolean;
  cancelled: boolean;
  failure?: unknown;
}

const DEFAULT_LIMITS: BoundedExplicitSubtreeLimits = { maximumRoots: 32, maximumBlocks: 256 };

function requireLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_024) throw new Error(`${label} must be a bounded integer from 1 to 1024.`);
}

function entityUuid(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const uuid = (value as { uuid?: unknown }).uuid;
  return typeof uuid === "string" && uuid.trim() ? uuid : undefined;
}

function childUuid(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 2 && value[0] === "uuid" && typeof value[1] === "string" && value[1].trim()) return value[1];
    throw new Error("有限子树包含无法识别的 Block UUID 引用形态。");
  }
  const uuid = entityUuid(value);
  if (!uuid) throw new Error("有限子树包含无法识别的 Block 实体形态。");
  return uuid;
}

export async function readBoundedExplicitSubtrees(
  changedBlocks: readonly unknown[],
  readBlock: (externalId: string) => Promise<unknown>,
  limits: BoundedExplicitSubtreeLimits = DEFAULT_LIMITS,
  isCancelled: () => boolean = () => false,
): Promise<BoundedExplicitSubtreeResult> {
  requireLimit(limits.maximumRoots, "maximumRoots");
  requireLimit(limits.maximumBlocks, "maximumBlocks");
  const queue: string[] = [];
  const scheduled = new Set<string>();
  const blocks: unknown[] = [];
  let truncated = false;
  const rootCapacity = Math.min(limits.maximumRoots, limits.maximumBlocks);
  for (const value of changedBlocks) {
    const uuid = entityUuid(value);
    if (!uuid || scheduled.has(uuid)) continue;
    if (queue.length >= rootCapacity) {
      truncated = true;
      break;
    }
    scheduled.add(uuid);
    queue.push(uuid);
  }

  while (queue.length > 0 && blocks.length < limits.maximumBlocks) {
    if (isCancelled()) return { blocks, truncated: true, cancelled: true };
    const expectedUuid = queue.shift();
    if (!expectedUuid) break;
    let entity: unknown;
    try {
      entity = await readBlock(expectedUuid);
    } catch (error) {
      return { blocks, truncated, cancelled: false, failure: error };
    }
    const actualUuid = entityUuid(entity);
    if (actualUuid !== expectedUuid) {
      return { blocks, truncated, cancelled: false, failure: new Error(`有限子树 Block ${expectedUuid} 返回了不匹配或不可读的实体。`) };
    }
    blocks.push(entity);
    const children = (entity as { children?: unknown }).children;
    if (children === undefined) continue;
    if (!Array.isArray(children)) return { blocks, truncated, cancelled: false, failure: new Error(`有限子树 Block ${expectedUuid} 的 children 形态无效。`) };
    for (const child of children) {
      let uuid: string;
      try {
        uuid = childUuid(child);
      } catch (error) {
        return { blocks, truncated, cancelled: false, failure: error };
      }
      if (scheduled.has(uuid)) continue;
      if (blocks.length + queue.length >= limits.maximumBlocks) {
        truncated = true;
        break;
      }
      scheduled.add(uuid);
      queue.push(uuid);
    }
  }
  if (queue.length > 0) truncated = true;
  return { blocks, truncated, cancelled: false };
}
