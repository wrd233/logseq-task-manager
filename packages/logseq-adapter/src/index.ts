import type { AnchorObservation, ContentPort, CurrentBlock, PreparedTextMutation, SourcePageIdentity, SourceResolution } from "@task-copilot/application";
import type { Anchor, SemanticOperation } from "@task-copilot/domain";
import type { BlobStore } from "@task-copilot/persistence";
import { StructuredError, checksum, classifyStorageError, stableJson } from "@task-copilot/shared";
export { classifyStorageError, type StorageErrorKind } from "@task-copilot/shared";

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
    getPage?(identity: string | number): Promise<unknown>;
  };
  FileStorage: LogseqFileStorageFacade;
}

export interface LogseqFileStorageFacade {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

export function assertStorageKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("//") || !key.startsWith("task-copilot/") || key === "task-copilot/") {
    throw new StructuredError({
      code: "FILE_STORAGE_PATH_INVALID",
      message: "FileStorage key must be a non-empty relative path inside the task-copilot/ namespace and contain no empty or parent segments.",
      ruleRefs: ["INF-OWN-001", "SYN-CON-001"],
    });
  }
  return key;
}

export function physicalStorageKey(key: string): string {
  assertStorageKey(key);
  return key.replaceAll("/", "__slash__");
}

function storageAccessError(operation: "read" | "write" | "remove", error: unknown): StructuredError {
  const kind = classifyStorageError(error);
  const cause = error instanceof Error ? error.message : String(error);
  return new StructuredError({
    code: `FILE_STORAGE_${kind}`,
    message: `FileStorage ${operation} failed (${kind}): ${cause}`,
    ruleRefs: ["SYN-CON-001", "SYN-REC-001"],
    details: { kind, operation, cause },
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function formatJournalDay(value: unknown): string | undefined {
  const digits = typeof value === "number" && Number.isInteger(value) ? String(value) : nonEmpty(value);
  if (!digits || !/^\d{8}$/.test(digits)) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function pageIdentity(value: unknown): Omit<SourcePageIdentity, "displayName" | "resolutionPath"> {
  const shape = record(value);
  const rawShape = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? `object:${Object.keys(shape ?? {}).sort().join(",")}` : typeof value;
  if (typeof value === "number") return { rawShape, pageId: value };
  if (typeof value === "string") return /^\d+$/.test(value) ? { rawShape, pageId: Number(value) } : { rawShape, pageName: value };
  if (!shape) return { rawShape };
  const id = typeof shape.id === "number" || typeof shape.id === "string" ? shape.id : undefined;
  const journalDay = typeof shape.journalDay === "number" || typeof shape.journalDay === "string" ? shape.journalDay : undefined;
  const pageUuid = nonEmpty(shape.uuid);
  const pageName = nonEmpty(shape.name);
  const originalName = nonEmpty(shape.originalName);
  return {
    rawShape,
    ...(id !== undefined ? { pageId: id } : {}),
    ...(pageUuid ? { pageUuid } : {}),
    ...(pageName ? { pageName } : {}),
    ...(originalName ? { originalName } : {}),
    ...(journalDay !== undefined ? { journalDay } : {}),
  };
}

function displayFromIdentity(identity: Omit<SourcePageIdentity, "displayName" | "resolutionPath">, path: string[]): string | undefined {
  if (identity.originalName) { path.push("originalName"); return identity.originalName; }
  if (identity.pageName) { path.push("name"); return identity.pageName; }
  const journal = formatJournalDay(identity.journalDay);
  if (journal) { path.push("journalDay"); return `${journal} · Journal`; }
  return undefined;
}

export async function resolveLogseqPageReference(
  value: unknown,
  getPage?: (identity: string | number) => Promise<unknown>,
  cachedPageRef?: string,
): Promise<SourcePageIdentity> {
  const path: string[] = ["inspect-runtime-shape"];
  let identity = pageIdentity(value);
  let displayName = displayFromIdentity(identity, path);
  const queryIdentity = identity.pageUuid ?? identity.pageId;
  if (!displayName && queryIdentity !== undefined && getPage) {
    path.push(identity.pageUuid ? "getPage(uuid)" : "getPage(id)");
    const queried = await getPage(queryIdentity);
    const queriedIdentity = pageIdentity(queried);
    identity = { ...identity, ...Object.fromEntries(Object.entries(queriedIdentity).filter(([, candidate]) => candidate !== undefined)) };
    displayName = displayFromIdentity(identity, path);
  }
  if (!displayName && cachedPageRef && !/^\d+$/.test(cachedPageRef)) { path.push("cachedPageRef"); displayName = cachedPageRef; }
  if (!displayName) { path.push("fallback"); displayName = "无法解析的 Logseq 页面"; }
  return { ...identity, displayName, resolutionPath: path };
}

export const RuntimeShapeAdapter = {
  pageRef(value: unknown): string {
    if (typeof value === "string" && value.length > 0 && !/^\d+$/.test(value)) return value;
    const shape = record(value);
    if (shape) {
      for (const key of ["originalName", "name", "uuid"] as const) {
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
    const resolved = block.page !== undefined
      ? await resolveLogseqPageReference(block.page, this.logseq.Editor.getPage?.bind(this.logseq.Editor))
      : undefined;
    return {
      externalId: block.uuid,
      graphId: await this.graphId(),
      text: block.content,
      ...(resolved ? { pageRef: resolved.displayName, pageIdentity: resolved } : {}),
    };
  }

  async sourceProbe(): Promise<Record<string, unknown>> {
    const raw = await this.logseq.Editor.getCurrentBlock();
    const block = RuntimeShapeAdapter.block(raw);
    if (!block) return { status: "no-current-block" };
    const pageIdentity = block.page === undefined ? undefined : await resolveLogseqPageReference(block.page, this.logseq.Editor.getPage?.bind(this.logseq.Editor));
    return {
      status: "read-only",
      blockUuid: block.uuid,
      blockRuntimeShape: raw && typeof raw === "object" ? Object.keys(raw as Record<string, unknown>).sort() : typeof raw,
      contentLength: block.content.length,
      contentHash: checksum(block.content),
      pageRawReference: block.page,
      pageRefType: block.page === null ? "null" : Array.isArray(block.page) ? "array" : typeof block.page,
      pageIdentity,
      finalDisplaySource: pageIdentity?.displayName ?? "未知来源",
      fallbackPath: pageIdentity?.resolutionPath ?? ["no-page-reference"],
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
        message: "正文已在 Proposal 之后变化，提交已停止。请扫描 Anchor，在审计中比较预期/当前版本，再选择重新绑定或手工合并。",
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
      graphId: anchor.graphId,
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
    if (mutation.graphId !== (await this.graphId())) return false;
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

  async open(externalId: string, graphId: string): Promise<void> {
    if (graphId !== (await this.graphId())) {
      throw new StructuredError({ code: "GRAPH_IDENTITY_CONFLICT", message: "当前 Graph 与 Anchor 不一致，定位已停止。", ruleRefs: ["SYN-CON-001"] });
    }
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(externalId, { includeChildren: false }));
    if (!block) throw new StructuredError({ code: "ANCHOR_MISSING", message: "Block 已失联。", ruleRefs: ["MAP-PAGE-002"] });
    if (!this.logseq.Editor.scrollToBlockInPage || block.page === undefined) {
      throw new StructuredError({
        code: "OPEN_BLOCK_UNSUPPORTED",
        message: "当前运行时无法安全定位该 Block；请从 Anchor 报告手工重新绑定。",
        ruleRefs: ["MAP-ANC-001"],
      });
    }
    const page = await resolveLogseqPageReference(block.page, this.logseq.Editor.getPage?.bind(this.logseq.Editor));
    if (page.displayName === "无法解析的 Logseq 页面") throw new StructuredError({ code: "SOURCE_PAGE_UNRESOLVED", message: "无法解析来源页面；来源块和 Capture 均未修改。", ruleRefs: ["MAP-ANC-001"] });
    await this.logseq.Editor.scrollToBlockInPage(page.pageUuid ?? page.pageName ?? page.displayName.replace(" · Journal", ""), externalId);
  }

  async resolveSource(externalId: string, cachedPageRef?: string): Promise<SourceResolution> {
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(externalId, { includeChildren: false }));
    if (!block) return { status: "missing", displayName: "未知来源" };
    if (block.page === undefined) return { status: "unresolved", displayName: "无法解析的 Logseq 页面" };
    const pageIdentity = await resolveLogseqPageReference(block.page, this.logseq.Editor.getPage?.bind(this.logseq.Editor), cachedPageRef);
    return pageIdentity.displayName === "无法解析的 Logseq 页面"
      ? { status: "unresolved", displayName: pageIdentity.displayName, pageIdentity }
      : { status: "resolved", displayName: pageIdentity.displayName, pageIdentity };
  }

  async observe(anchor: Anchor): Promise<AnchorObservation> {
    if (anchor.graphId !== (await this.graphId())) return { status: "unavailable" };
    const block = RuntimeShapeAdapter.block(await this.logseq.Editor.getBlock(anchor.externalId, { includeChildren: false }));
    if (!block) return { status: "missing" };
    const currentHash = checksum(block.content);
    return currentHash === anchor.contentHash
      ? { status: "active", currentText: block.content, currentHash }
      : { status: "conflict", currentText: block.content, currentHash };
  }
}

const registryKey = "task-copilot/registry/keys.json";

export class LogseqFileStorageBlobStore implements BlobStore {
  constructor(private readonly storage: LogseqFileStorageFacade) {}

  private assertKey(key: string): void {
    assertStorageKey(key);
  }

  private async read(key: string): Promise<unknown> {
    const physical = physicalStorageKey(key);
    try {
      return await this.storage.getItem(physical);
    } catch (error) {
      if (classifyStorageError(error) === "NOT_FOUND") return undefined;
      throw storageAccessError("read", error);
    }
  }

  private async registry(): Promise<string[]> {
    const value = await this.read(registryKey);
    if (value === null || value === undefined) return [];
    if (typeof value !== "string") throw new Error("FileStorage registry runtime shape is not a string");
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((key) => typeof key === "string")) throw new Error("FileStorage registry is corrupted");
    return parsed;
  }

  private async saveRegistry(keys: string[]): Promise<void> {
    try {
      await this.storage.setItem(physicalStorageKey(registryKey), stableJson([...new Set(keys)].sort()));
    } catch (error) {
      throw storageAccessError("write", error);
    }
  }

  async get(key: string): Promise<string | undefined> {
    this.assertKey(key);
    const value = await this.read(key);
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
    if (key !== registryKey) await this.saveRegistry([...(await this.registry()), key]);
    try {
      await this.storage.setItem(physicalStorageKey(key), value);
    } catch (error) {
      throw storageAccessError("write", error);
    }
  }

  async remove(key: string): Promise<void> {
    this.assertKey(key);
    try {
      await this.storage.removeItem(physicalStorageKey(key));
    } catch (error) {
      if (classifyStorageError(error) !== "NOT_FOUND") throw storageAccessError("remove", error);
    }
    if (key !== registryKey) await this.saveRegistry((await this.registry()).filter((candidate) => candidate !== key));
  }

  async keys(prefix: string): Promise<string[]> {
    this.assertKey(prefix);
    return (await this.registry()).filter((key) => key.startsWith(prefix));
  }
}
