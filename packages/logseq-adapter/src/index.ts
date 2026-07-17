import type { ContentPort, CurrentBlock, PreparedTextMutation } from "@task-copilot/application";
import type { Anchor, SemanticOperation } from "@task-copilot/domain";
import type { BlobStore } from "@task-copilot/persistence";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

export interface LogseqBlockShape {
  uuid: string;
  content: string;
  page?: unknown;
}

export interface LogseqFacade {
  App: {
    getCurrentGraph(): Promise<unknown>;
  };
  Editor: {
    getCurrentBlock(): Promise<unknown>;
    getBlock(uuid: string, options?: Record<string, unknown>): Promise<unknown>;
    updateBlock(uuid: string, content: string): Promise<unknown>;
    scrollToBlockInPage?(page: string | number, uuid: string): Promise<unknown>;
  };
  FileStorage: LogseqFileStorageFacade;
}

export interface LogseqFileStorageFacade {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export const RuntimeShapeAdapter = {
  pageRef(value: unknown): string {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const shape = record(value);
    if (shape) {
      for (const key of ["id", "uuid", "name"] as const) {
        const candidate = shape[key];
        if ((typeof candidate === "string" && candidate.length > 0) || typeof candidate === "number") return String(candidate);
      }
    }
    throw new StructuredError({
      code: "LOGSEQ_RUNTIME_SHAPE_UNSUPPORTED",
      message: `Unsupported Logseq runtime shape for page reference: ${JSON.stringify(value)}`,
      ruleRefs: ["ARC-LAYER-001", "SYN-CON-001"],
    });
  },

  block(value: unknown): LogseqBlockShape | undefined {
    if (value === null || value === undefined) return undefined;
    const shape = record(value);
    if (!shape || typeof shape.uuid !== "string" || typeof shape.content !== "string") {
      throw new StructuredError({
        code: "LOGSEQ_BLOCK_SHAPE_UNSUPPORTED",
        message: `Unsupported Logseq runtime shape for Block: ${JSON.stringify(value)}`,
        ruleRefs: ["MAP-ANC-001", "SYN-CON-001"],
      });
    }
    return { uuid: shape.uuid, content: shape.content, ...(shape.page !== undefined ? { page: shape.page } : {}) };
  },

  graphId(value: unknown): string {
    const shape = record(value);
    if (!shape) {
      throw new StructuredError({
        code: "LOGSEQ_GRAPH_SHAPE_UNSUPPORTED",
        message: `Unsupported Logseq runtime shape for Graph: ${JSON.stringify(value)}`,
        ruleRefs: ["SYN-CON-001"],
      });
    }
    const name = typeof shape.name === "string" ? shape.name : "unknown-graph";
    const url = typeof shape.url === "string" ? shape.url : "unknown-location";
    return `${name}:${url}`;
  },
};

export class LogseqContentPort implements ContentPort {
  constructor(private readonly logseq: LogseqFacade) {}

  private async graphId(): Promise<string> {
    return RuntimeShapeAdapter.graphId(await this.logseq.App.getCurrentGraph());
  }

  async getCurrentBlock(): Promise<CurrentBlock | undefined> {
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getCurrentBlock());
    if (!block) return undefined;
    return {
      externalId: block.uuid,
      graphId: await this.graphId(),
      text: block.content,
      ...(block.page !== undefined ? { pageRef: RuntimeShapeAdapter.pageRef(block.page) } : {}),
    };
  }

  async prepare(operation: SemanticOperation, anchor: Anchor): Promise<PreparedTextMutation> {
    if (anchor.status !== "active") {
      throw new StructuredError({
        code: "ANCHOR_NOT_ACTIVE",
        message: "Anchor 不是 active，正文操作已停止。",
        ruleRefs: ["MAP-PAGE-002", "SYN-CON-001"],
      });
    }
    if (anchor.graphId !== (await this.graphId())) {
      throw new StructuredError({
        code: "GRAPH_IDENTITY_CONFLICT",
        message: "当前 Graph 与 Proposal 的 Graph 不一致，正文操作已停止。",
        ruleRefs: ["SYN-CON-001"],
      });
    }
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(anchor.externalId, { includeChildren: false }));
    if (!block) {
      throw new StructuredError({
        code: "ANCHOR_MISSING",
        message: "主正文 Block 已删除或不可读取；对象保留并需要重新绑定。",
        ruleRefs: ["MAP-PAGE-002", "SYN-CON-001"],
      });
    }
    if (checksum(block.content) !== anchor.contentHash) {
      throw new StructuredError({
        code: "ANCHOR_CONTENT_CONFLICT",
        message: "正文已在 Proposal 之后变化，提交已停止。",
        ruleRefs: ["SYN-CON-001", "MAP-RWT-001"],
      });
    }
    if (operation.operationType === "move_content") {
      throw new StructuredError({
        code: "MOVE_RUNTIME_UNVERIFIED",
        message: "当前 Logseq Desktop 的 UUID 移动语义尚未完成集中验证；move_content 保持为未执行的高影响操作。",
        ruleRefs: ["REL-PLC-002", "SYN-CON-001"],
      });
    }
    if (operation.operationType !== "rewrite_content" || typeof operation.payload.text !== "string") {
      throw new StructuredError({
        code: "TEXT_OPERATION_UNSUPPORTED",
        message: `Logseq Adapter 不支持 ${operation.operationType}。`,
        ruleRefs: ["ARC-LAYER-001"],
      });
    }
    const afterText = operation.payload.text;
    return {
      operationId: operation.operationId,
      anchorId: anchor.anchorId,
      externalId: anchor.externalId,
      beforeText: block.content,
      afterText,
      beforeHash: checksum(block.content),
      afterHash: checksum(afterText),
    };
  }

  async apply(mutation: PreparedTextMutation): Promise<void> {
    if (!(await this.verify(mutation, "before"))) {
      throw new StructuredError({
        code: "TEXT_PRECONDITION_CONFLICT",
        message: "正文前置版本不匹配，写入已停止。",
        ruleRefs: ["SYN-CON-001"],
      });
    }
    await this.logseq.Editor.updateBlock(mutation.externalId, mutation.afterText);
  }

  async verify(mutation: PreparedTextMutation, expected: "before" | "after"): Promise<boolean> {
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(mutation.externalId, { includeChildren: false }));
    if (!block) return false;
    return checksum(block.content) === (expected === "before" ? mutation.beforeHash : mutation.afterHash);
  }

  async compensate(mutation: PreparedTextMutation): Promise<void> {
    if (!(await this.verify(mutation, "after"))) {
      throw new StructuredError({
        code: "COMPENSATION_TEXT_CONFLICT",
        message: "补偿前正文已再次变化，禁止强行覆盖。",
        ruleRefs: ["SYN-CON-001", "COM-ATM-001"],
      });
    }
    await this.logseq.Editor.updateBlock(mutation.externalId, mutation.beforeText);
  }

  async open(externalId: string): Promise<void> {
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(externalId, { includeChildren: false }));
    if (!block) throw new StructuredError({ code: "ANCHOR_MISSING", message: "Block 已失联。", ruleRefs: ["MAP-PAGE-002"] });
    if (!this.logseq.Editor.scrollToBlockInPage || block.page === undefined) {
      throw new StructuredError({
        code: "OPEN_BLOCK_UNSUPPORTED",
        message: "当前运行时无法安全定位该 Block；请从 Anchor 报告手工重新绑定。",
        ruleRefs: ["MAP-ANC-001"],
      });
    }
    await this.logseq.Editor.scrollToBlockInPage(RuntimeShapeAdapter.pageRef(block.page), externalId);
  }
}

const namespace = "task-copilot/";
const registryKey = "task-copilot/registry/keys.json";

export class LogseqFileStorageBlobStore implements BlobStore {
  constructor(private readonly storage: LogseqFileStorageFacade) {}

  private assertKey(key: string): void {
    if (!key.startsWith(namespace) || key.includes("..")) {
      throw new StructuredError({
        code: "FILE_STORAGE_NAMESPACE_VIOLATION",
        message: "FileStorage key must remain inside the task-copilot namespace.",
        ruleRefs: ["INF-OWN-001"],
      });
    }
  }

  private async registry(): Promise<string[]> {
    const value = await this.storage.getItem(registryKey);
    if (value === null || value === undefined) return [];
    if (typeof value !== "string") throw new Error("FileStorage registry runtime shape is not a string");
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((key) => typeof key === "string")) throw new Error("FileStorage registry is corrupted");
    return parsed;
  }

  private async saveRegistry(keys: string[]): Promise<void> {
    await this.storage.setItem(registryKey, stableJson([...new Set(keys)].sort()));
  }

  async get(key: string): Promise<string | undefined> {
    this.assertKey(key);
    const value = await this.storage.getItem(key);
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") {
      throw new StructuredError({
        code: "FILE_STORAGE_SHAPE_UNSUPPORTED",
        message: "FileStorage 返回了非字符串 runtime shape。",
        ruleRefs: ["SYN-CON-001"],
      });
    }
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    this.assertKey(key);
    await this.storage.setItem(key, value);
    if (key !== registryKey) await this.saveRegistry([...(await this.registry()), key]);
  }

  async remove(key: string): Promise<void> {
    this.assertKey(key);
    await this.storage.removeItem(key);
    if (key !== registryKey) await this.saveRegistry((await this.registry()).filter((candidate) => candidate !== key));
  }

  async keys(prefix: string): Promise<string[]> {
    this.assertKey(prefix);
    return (await this.registry()).filter((key) => key.startsWith(prefix));
  }
}
