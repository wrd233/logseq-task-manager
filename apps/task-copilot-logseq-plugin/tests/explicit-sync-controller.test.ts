import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceSynchronizeExplicitObjectResult } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { ensurePersistentBlockIdentity, ExplicitSyncController, registerExplicitSyncEvents, type ExplicitSyncState, type ExplicitSyncTransport } from "../src/explicit-sync-controller.ts";

function success(objectId: string, version: number): ServiceSynchronizeExplicitObjectResult {
  const at = "2026-07-20T08:00:00.000Z";
  return {
    operation: version === 2 ? "MATERIALIZED" : "SYNCHRONIZED",
    replayed: false,
    object: { objectId, objectType: "TASK", version, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "标题", createdAt: at, updatedAt: at, sourceOrCreationEvent: "explicit" },
    anchor: { anchorId: `anchor-${objectId}`, objectId, graphId: "graph", externalId: `block-${objectId}`, role: "primary_text", status: "active", contentHash: "11111111", lastSeenAt: at },
  };
}

test("Service outage keeps a bounded latest-per-UUID recovery queue and resumes deterministically", async () => {
  const issues: Array<{ code: string; externalId?: string }> = [];
  const states: Array<{ pending: number; transportReady: boolean }> = [];
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-fixed",
    onIssue: (issue) => issues.push({ code: issue.code, ...(issue.externalId ? { externalId: issue.externalId } : {}) }),
    onState: (state) => states.push({ pending: state.pending, transportReady: state.transportReady }),
  });

  controller.onBlocksChanged([
    { uuid: "block-1", content: "[任务] 旧标题" },
    { uuid: "block-1", content: "[任务] 新标题" },
    { uuid: "internal", content: "TODO 内部步骤" },
  ]);
  await controller.flush();
  assert.deepEqual(controller.snapshot(), { pending: 1, transportReady: false, reconciliationRequired: false });

  const requests: Array<{ externalId: string; text: string; idempotencyKey: string; traceId: string }> = [];
  const transport: ExplicitSyncTransport = {
    async synchronizeExplicitObject(input) {
      requests.push({ externalId: input.externalId, text: input.text, idempotencyKey: input.idempotencyKey, traceId: input.traceId });
      return success("object-1", 2);
    },
  };
  await controller.resume(transport);
  assert.deepEqual(requests, [{
    externalId: "block-1",
    text: "新标题",
    idempotencyKey: "explicit-sync:block-1:content-e14fcad3:dc234a28",
    traceId: "trace-fixed",
  }]);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: false });
  assert.deepEqual(issues, []);
  assert.ok(states.some((state) => state.pending === 1 && !state.transportReady));
});

test("delivery failure remains pending, type conflicts surface, and a later resume retries", async () => {
  const issues: string[] = [];
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-retry",
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject() {
      const error = new Error("service unavailable") as Error & { code: string };
      error.code = "SERVICE_UNAVAILABLE";
      throw error;
    },
  });
  controller.onBlocksChanged([
    { uuid: "block-fail", content: "[任务] 等待重试" },
    { uuid: "block-invalid", content: "[任务] 冲突 [MiniProject] 不得迁移" },
  ]);
  await controller.flush();
  assert.deepEqual(controller.snapshot(), { pending: 1, transportReady: false, reconciliationRequired: true });
  assert.deepEqual(issues, ["EXPLICIT_OBJECT_MARKER_CONFLICT", "SERVICE_UNAVAILABLE"]);

  let retries = 0;
  await controller.resume({
    async synchronizeExplicitObject() {
      retries += 1;
      return success("object-retry", 2);
    },
  });
  assert.equal(retries, 1);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
});

test("proposal-required type changes are terminal conflicts, not transport retries", async () => {
  const issues: string[] = [];
  let calls = 0;
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-proposal",
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject() {
      calls += 1;
      const error = new Error("proposal required") as Error & { code: string; details: { remoteCode: string } };
      error.code = "SERVICE_HTTP_ERROR";
      error.details = { remoteCode: "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" };
      throw error;
    },
  });
  controller.onBlocksChanged([{ uuid: "block-type", content: "[MiniProject] 需要审阅" }]);
  await controller.flush();
  assert.equal(calls, 1);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
  assert.deepEqual(issues, ["V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL"]);
  await controller.flush();
  assert.equal(calls, 1);
});

test("Candidate review authority is a terminal conflict, not a transport retry", async () => {
  const issues: string[] = [];
  let calls = 0;
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-candidate-review",
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject() {
      calls += 1;
      const error = new Error("candidate review required") as Error & { code: string; details: { remoteCode: string } };
      error.code = "SERVICE_HTTP_ERROR";
      error.details = { remoteCode: "V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED" };
      throw error;
    },
  });
  controller.onBlocksChanged([{ uuid: "block-candidate", content: "[任务] 必须先审阅 Candidate" }]);
  await controller.flush();
  assert.equal(calls, 1);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
  assert.deepEqual(issues, ["V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED"]);
  await controller.flush();
  assert.equal(calls, 1);
});

test("Marker intent is delivered and semantic conflicts do not disable healthy transport", async () => {
  const issues: string[] = [];
  const markers: Array<string | undefined> = [];
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-marker",
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      markers.push(input.marker);
      const error = new Error("terminal conflict") as Error & { code: string; details: { remoteCode: string } };
      error.code = "SERVICE_HTTP_ERROR";
      error.details = { remoteCode: "V2_TASK_CANCELLATION_REASON_REQUIRED" };
      throw error;
    },
  });
  controller.onBlocksChanged([{ uuid: "block-marker", content: "[任务] CANCELED 不覆盖已完成终态" }]);
  await controller.flush();
  assert.deepEqual(markers, ["CANCELED"]);
  assert.deepEqual(issues, ["V2_TASK_CANCELLATION_REASON_REQUIRED"]);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
});

test("parser marker conflicts require reconciliation without attempting a formal write", async () => {
  const issues: string[] = [];
  let writes = 0;
  const controller = new ExplicitSyncController({
    delayMs: 0,
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject() {
      writes += 1;
      return success("must-not-write", 2);
    },
  });
  controller.onBlocksChanged([{ uuid: "block-conflict", content: "[任务] 冲突 [MiniProject]" }]);
  await controller.flush();
  assert.equal(writes, 0);
  assert.deepEqual(issues, ["EXPLICIT_OBJECT_MARKER_CONFLICT"]);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
});

test("queue overflow is explicit and dispose prevents late formal writes", async () => {
  const issues: string[] = [];
  let writes = 0;
  const controller = new ExplicitSyncController({
    delayMs: 0,
    maximumPending: 1,
    createTraceId: () => "trace-overflow",
    onIssue: (issue) => issues.push(issue.code),
  });
  controller.onBlocksChanged([
    { uuid: "block-1", content: "[任务] 第一项" },
    { uuid: "block-2", content: "[任务] 第二项" },
  ]);
  await controller.flush();
  assert.deepEqual(controller.snapshot(), { pending: 1, transportReady: false, reconciliationRequired: true });
  assert.deepEqual(issues, ["EXPLICIT_SYNC_QUEUE_CAPACITY_EXCEEDED"]);
  controller.dispose();
  await controller.resume({ async synchronizeExplicitObject() { writes += 1; return success("late", 2); } });
  assert.equal(writes, 0);
});

test("a bounded exact-content window suppresses duplicate plugin echoes without hiding mismatched edits", async () => {
  const requests: string[] = [];
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-echo" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("echo-object", 3);
    },
  });

  const committed = "[任务] 插件正式提交";
  controller.suppressObservedContentWindow("echo-block", checksum(committed));
  controller.onBlocksChanged([{ uuid: "echo-block", content: committed }]);
  await controller.flush();
  assert.deepEqual(requests, []);

  controller.onBlocksChanged([{ uuid: "echo-block", content: committed }]);
  await controller.flush();
  assert.deepEqual(requests, [], "duplicate same-content observations stay suppressed during the bounded window");

  controller.onBlocksChanged([{ uuid: "echo-block", content: "[任务] 用户后续编辑" }]);
  await controller.flush();
  controller.onBlocksChanged([{ uuid: "echo-block", content: committed }]);
  await controller.flush();
  assert.deepEqual(requests, ["用户后续编辑", "插件正式提交"]);
});

test("echo suppression is rechecked for a change already queued before a formal Commit", async () => {
  const requests: string[] = [];
  const committed = "[任务] Commit 排队竞争";
  const controller = new ExplicitSyncController({ delayMs: 60_000, createTraceId: () => "trace-queued-echo" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("queued-echo-object", 2);
    },
  });

  controller.onBlocksChanged([{ uuid: "queued-echo-block", content: committed }]);
  controller.suppressObservedContentWindow("queued-echo-block", checksum(committed));
  await controller.flush();

  assert.deepEqual(requests, [], "a pre-queued observation must not bypass the later exact Commit suppression");
  controller.dispose();
});

test("echo suppression drops an exact pending recovery item before transport resumes", async () => {
  const requests: string[] = [];
  const committed = "[任务] Commit 断线竞争";
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-pending-echo" });

  controller.onBlocksChanged([{ uuid: "pending-echo-block", content: committed }]);
  await controller.flush();
  assert.equal(controller.snapshot().pending, 1);

  controller.suppressObservedContentWindow("pending-echo-block", checksum(committed));
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("pending-echo-object", 2);
    },
  });

  assert.deepEqual(requests, [], "an exact plugin-authored pending item must be removed instead of formalized in parallel");
  assert.equal(controller.snapshot().pending, 0);
  controller.dispose();
});

test("two consecutive plugin writes suppress both late echoes for the same Block", async () => {
  const requests: string[] = [];
  const externalId = "6a5f9e91-7bbb-41ea-b8ca-3ac5d0f9552d";
  const identityOnly = `id:: ${externalId}`;
  const committed = `[任务] 连续写入竞争\nid:: ${externalId}`;
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-two-write-echo" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("two-write-object", 2);
    },
  });

  controller.suppressObservedContentWindow(externalId, checksum(""));
  controller.suppressObservedContentWindow(externalId, checksum("[任务] 连续写入竞争"));
  controller.onBlocksChanged([{ uuid: externalId, content: identityOnly }]);
  await controller.flush();
  controller.onBlocksChanged([{ uuid: externalId, content: committed }]);
  await controller.flush();

  assert.deepEqual(requests, [], "the late id:: event must not clear suppression for the following plugin-authored text patch");
  controller.dispose();
});

test("persisting id:: suppresses the Logseq property echo so Candidate review cannot materialize early", async () => {
  const requests: string[] = [];
  const externalId = "6a5f95f3-5746-4009-bf3c-a884fe493036";
  const original = "[任务] 只在 Commit 后正式化";
  let block = { uuid: externalId, content: original, properties: {} as Record<string, unknown> };
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-identity-echo" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("candidate-object", 2);
    },
  });

  await ensurePersistentBlockIdentity({
    async getBlock() { return block; },
    async upsertBlockProperty(_id, key, value) {
      block = { uuid: externalId, content: `${original}\nid:: ${externalId}`, properties: { [key]: value } };
      controller.onBlocksChanged([block]);
    },
  }, externalId, controller);
  await controller.flush();
  assert.deepEqual(requests, [], "the plugin-authored id:: event must not enter formal explicit synchronization");

  controller.onBlocksChanged([{ ...block, content: `[任务] 用户后续编辑\nid:: ${externalId}` }]);
  await controller.flush();
  assert.deepEqual(requests, ["用户后续编辑"], "a later human edit must remain observable");
});

test("a new explicit Block persists identity and still synchronizes its originating observation once", async () => {
  const requests: string[] = [];
  const externalId = "6a60988c-dab9-4fdf-a8ac-ae5721a80b70";
  const original = "[任务] 首次显式创建";
  let block = { uuid: externalId, content: original, properties: {} as Record<string, unknown> };
  const controllerCell: { current?: ExplicitSyncController } = {};
  const host = {
    async getBlock() { return block; },
    async upsertBlockProperty(_id: string, key: string, value: string) {
      block = { uuid: externalId, content: `${original}\nid:: ${externalId}`, properties: { [key]: value } };
      controllerCell.current?.onBlocksChanged([block]);
    },
  };
  const controller: ExplicitSyncController = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-originating-identity",
    ensurePersistentIdentity: async (id): Promise<boolean> => {
      const current = controllerCell.current;
      if (!current) throw new Error("controller not initialized");
      return ensurePersistentBlockIdentity(host, id, current);
    },
  });
  controllerCell.current = controller;
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("originating-identity-object", 1);
    },
  });

  controller.onBlocksChanged([{ uuid: externalId, content: original }]);
  await controller.flush();

  assert.deepEqual(requests, ["首次显式创建"], "the user observation must survive its own identity echo suppression");
  controller.dispose();
});

test("identity echo suppression survives an already in-flight event-bridge read for the same Block", async () => {
  const requests: string[] = [];
  const externalId = "6a5f991a-53f9-466a-ac34-ee03648f48d0";
  const original = "[任务] 事件桥竞争窗口";
  let block = { uuid: externalId, content: original, properties: {} as Record<string, unknown> };
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  let releaseFirstRead: (() => void) | undefined;
  let signalFirstRead: (() => void) | undefined;
  const firstReadStarted = new Promise<void>((resolve) => { signalFirstRead = resolve; });
  const firstReadReleased = new Promise<void>((resolve) => { releaseFirstRead = resolve; });
  let reads = 0;
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-identity-race" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.text);
      return success("candidate-race-object", 2);
    },
  });
  const unregister = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: {
      async getBlock() {
        reads += 1;
        if (reads === 1) {
          const staleSnapshot = { ...block, properties: { ...block.properties } };
          signalFirstRead?.();
          await firstReadReleased;
          return staleSnapshot;
        }
        return block;
      },
    },
  }, controller, { subtreeDelayMs: 0 });

  listener?.({ blocks: [{ uuid: externalId }] });
  await firstReadStarted;
  await ensurePersistentBlockIdentity({
    async getBlock() { return block; },
    async upsertBlockProperty(_id, key, value) {
      block = { uuid: externalId, content: `${original}\nid:: ${externalId}`, properties: { [key]: value } };
      listener?.({ blocks: [{ uuid: externalId }] });
    },
  }, externalId, controller);
  releaseFirstRead?.();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  await controller.flush();
  assert.deepEqual(requests, [], "both the stale queued read and the real id:: echo must remain Candidate-only");

  unregister();
  controller.dispose();
});

test("Logseq DB event registration forwards only transaction Blocks and unregisters cleanly", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  let unregistered = 0;
  const requests: string[] = [];
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-event" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.externalId);
      return success("event-object", 2);
    },
  });
  const unregister = registerExplicitSyncEvents({
    DB: {
      onChanged(callback) {
        listener = callback;
        return () => { unregistered += 1; };
      },
    },
    Editor: { getBlock: async (externalId) => ({ uuid: externalId, content: "[任务] 事件同步", children: [] }) },
  }, controller, { subtreeDelayMs: 0 });
  listener?.({ blocks: [{ uuid: "event-block" }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await controller.flush();
  assert.deepEqual(requests, ["event-block"]);
  unregister();
  assert.equal(unregistered, 1);
});

test("event registration expands a finite subtree without materializing an internal bare TODO", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  const requests: string[] = [];
  const issues: string[] = [];
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-subtree", onIssue: (issue) => issues.push(issue.code) });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push(input.externalId);
      return success(input.externalId, 2);
    },
  });
  const values: Record<string, unknown> = {
    root: { uuid: "root", content: "[任务] 主任务", "updated-at": 1, children: [["uuid", "step"]] },
    step: { uuid: "step", content: "TODO 内部步骤", "updated-at": 2, children: [["uuid", "decision"]] },
    decision: { uuid: "decision", content: "[决策] 保留证据", "updated-at": 3, children: [] },
  };
  const unregister = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => values[externalId] },
  }, controller, { subtreeDelayMs: 0 });
  listener?.({ blocks: [{ uuid: "root", content: "[任务] 主任务", "updated-at": 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await controller.flush();
  assert.deepEqual(requests, ["root", "decision"]);
  assert.deepEqual(issues, []);
  unregister();
});

test("event registration stops exactly at the 256-block subtree budget and exposes reconciliation", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  const reads: string[] = [];
  const delivered: string[] = [];
  const issues: string[] = [];
  const values = Object.fromEntries(Array.from({ length: 257 }, (_, index) => {
    const uuid = `bounded-${index}`;
    return [uuid, {
      uuid,
      content: `[任务] 有限子树 ${index}`,
      "updated-at": index + 1,
      children: index < 256 ? [["uuid", `bounded-${index + 1}`]] : [],
    }];
  }));
  const controller = new ExplicitSyncController({
    delayMs: 0,
    maximumPending: 512,
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      delivered.push(input.externalId);
      return success(input.externalId, 2);
    },
  });
  const unregister = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => {
      reads.push(externalId);
      return values[externalId];
    } },
  }, controller, { subtreeDelayMs: 0 });

  listener?.({ blocks: [{ uuid: "bounded-0" }] });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await controller.flush();

  assert.equal(reads.length, 256);
  assert.equal(delivered.length, 256);
  assert.equal(reads.at(-1), "bounded-255");
  assert.equal(reads.includes("bounded-256"), false);
  assert.equal(delivered.includes("bounded-256"), false);
  assert.deepEqual(issues, ["EXPLICIT_SYNC_SUBTREE_TRUNCATED"]);
  assert.equal(controller.snapshot().reconciliationRequired, true);
  unregister();
});

test("subtree read failures require reconciliation and unregister prevents late descendant delivery", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  const issues: string[] = [];
  const controller = new ExplicitSyncController({ delayMs: 0, onIssue: (issue) => issues.push(issue.code) });
  const unregisterFailure = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async () => ({ uuid: "wrong", content: "[任务] 错误实体", children: [] }) },
  }, controller, { subtreeDelayMs: 0 });
  listener?.({ blocks: [{ uuid: "root", content: "普通正文" }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(issues, ["EXPLICIT_SYNC_SUBTREE_READ_FAILED"]);
  assert.equal(controller.snapshot().reconciliationRequired, true);
  unregisterFailure();

  const verifiedPrefix: string[] = [];
  const prefixIssues: string[] = [];
  const prefixController = new ExplicitSyncController({ delayMs: 0, onIssue: (issue) => prefixIssues.push(issue.code) });
  await prefixController.resume({
    async synchronizeExplicitObject(input) {
      verifiedPrefix.push(input.externalId);
      return success(input.externalId, 2);
    },
  });
  const unregisterPrefix = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => externalId === "root"
      ? { uuid: "root", content: "[任务] 已验证根", children: [["uuid", "bad-child"]] }
      : { uuid: "wrong-child", content: "[决策] 不得写入", children: [] } },
  }, prefixController, { subtreeDelayMs: 0 });
  listener?.({ blocks: [{ uuid: "root" }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await prefixController.flush();
  assert.deepEqual(verifiedPrefix, ["root"]);
  assert.deepEqual(prefixIssues, ["EXPLICIT_SYNC_SUBTREE_READ_FAILED"]);
  unregisterPrefix();

  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const delivered: string[] = [];
  const reads: string[] = [];
  const lateController = new ExplicitSyncController({ delayMs: 0 });
  await lateController.resume({
    async synchronizeExplicitObject(input) {
      delivered.push(input.externalId);
      return success(input.externalId, 2);
    },
  });
  const unregisterLate = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => {
      reads.push(externalId);
      await gate;
      return { uuid: "root", content: "[任务] 根", children: [["uuid", "late-decision"]] };
    } },
  }, lateController, { subtreeDelayMs: 0 });
  listener?.({ blocks: [{ uuid: "root", content: "[任务] 根" }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(reads, ["root"]);
  unregisterLate();
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await lateController.flush();
  assert.deepEqual(reads, ["root"], "unregister must stop before reading the queued child UUID");
  assert.deepEqual(delivered, []);
});

test("rapid subtree events use a bounded latest-per-root queue and report overflow", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reads: string[] = [];
  const issues: string[] = [];
  let firstRead = true;
  const controller = new ExplicitSyncController({ delayMs: 0, onIssue: (issue) => issues.push(issue.code) });
  const unregister = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => {
      reads.push(externalId);
      if (firstRead) {
        firstRead = false;
        await gate;
      }
      return { uuid: externalId, content: "普通正文", children: [] };
    } },
  }, controller, { subtreeDelayMs: 0, maximumPendingRoots: 2 });
  listener?.({ blocks: [{ uuid: "root" }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (let index = 0; index < 100; index += 1) listener?.({ blocks: [{ uuid: "root", revision: index }] });
  listener?.({ blocks: [{ uuid: "root-2" }] });
  listener?.({ blocks: [{ uuid: "root-3" }] });
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(reads, ["root", "root", "root-2"]);
  assert.ok(issues.includes("EXPLICIT_SYNC_SUBTREE_QUEUE_CAPACITY_EXCEEDED"));
  assert.equal(controller.snapshot().reconciliationRequired, true);
  unregister();
});

test("an event arriving during traversal still receives the full subtree debounce window", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reads: string[] = [];
  const controller = new ExplicitSyncController({ delayMs: 0 });
  const unregister = registerExplicitSyncEvents({
    DB: { onChanged(callback) { listener = callback; return () => undefined; } },
    Editor: { getBlock: async (externalId) => {
      reads.push(externalId);
      if (externalId === "root-1") await gate;
      return { uuid: externalId, content: "普通正文", children: [] };
    } },
  }, controller, { subtreeDelayMs: 30 });

  listener?.({ blocks: [{ uuid: "root-1" }] });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(reads, ["root-1"]);
  listener?.({ blocks: [{ uuid: "root-2" }] });
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(reads, ["root-1"], "the second root must not bypass its debounce while the first traversal finishes");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(reads, ["root-1", "root-2"]);
  unregister();
});

test("move and copy DB events keep the stable UUID and deliver each copied UUID once at its latest version", async () => {
  let listener: ((event: { blocks?: unknown[] }) => void) | undefined;
  const requests: Array<[string, string]> = [];
  const runtimeBlocks = new Map<string, unknown>();
  const controller = new ExplicitSyncController({ delayMs: 0, createTraceId: () => "trace-copy-move" });
  await controller.resume({
    async synchronizeExplicitObject(input) {
      requests.push([input.externalId, input.inputVersion]);
      return success(input.externalId, input.externalId === "uuid-copy" ? 2 : 3);
    },
  });
  const unregister = registerExplicitSyncEvents({
    DB: {
      onChanged(callback) {
        listener = callback;
        return () => undefined;
      },
    },
    Editor: { getBlock: async (externalId) => runtimeBlocks.get(externalId) },
  }, controller, { subtreeDelayMs: 0 });

  runtimeBlocks.set("uuid-original", { uuid: "uuid-original", content: "[任务] 验证外部推送", "updated-at": 2001, children: [] });
  listener?.({ blocks: [{ uuid: "uuid-original", content: "[任务] 验证外部推送", "updated-at": 2001, page: { id: 1 } }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await controller.flush();
  runtimeBlocks.set("uuid-copy", { uuid: "uuid-copy", content: "[任务] 验证外部推送", "updated-at": 2003, children: [] });
  runtimeBlocks.set("uuid-original", { uuid: "uuid-original", content: "[任务] 验证外部推送", "updated-at": 2002, children: [] });
  listener?.({ blocks: [
    { uuid: "uuid-copy", content: "[任务] 验证外部推送", "updated-at": 2002, page: { id: 2 } },
    { uuid: "uuid-original", content: "[任务] 验证外部推送", "updated-at": 2002, page: { id: 2 } },
    { uuid: "uuid-copy", content: "[任务] 验证外部推送", "updated-at": 2003, page: { id: 2 } },
  ] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await controller.flush();

  assert.deepEqual(requests, [
    ["uuid-original", "2001"],
    ["uuid-copy", "2003"],
    ["uuid-original", "2002"],
  ]);
  unregister();
});

test("service recovery reconciles only known Anchors and reports missing or removed markers", async () => {
  const issues: string[] = [];
  const synchronized: string[] = [];
  const observations: Array<[string, string]> = [];
  const controller = new ExplicitSyncController({
    delayMs: 0,
    createTraceId: () => "trace-reconcile",
    readBlock: async (externalId) => {
      if (externalId === "block-changed") return { uuid: externalId, content: "[任务] 恢复后新标题", "updated-at": 2002 };
      if (externalId === "block-removed") return { uuid: externalId, content: "普通正文", "updated-at": 2003 };
      if (externalId === "block-recovered") return { uuid: externalId, content: "[任务] 原文", "updated-at": 2004 };
      return null;
    },
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async listPrimaryAnchors() {
      const at = "2026-07-20T08:00:00.000Z";
      return { anchors: [
        { anchorId: "a1", objectId: "o1", graphId: "graph", externalId: "block-changed", role: "primary_text", status: "active", contentHash: "00000000", lastSeenAt: at },
        { anchorId: "a2", objectId: "o2", graphId: "graph", externalId: "block-removed", role: "primary_text", status: "active", contentHash: "00000000", lastSeenAt: at },
        { anchorId: "a3", objectId: "o3", graphId: "graph", externalId: "block-missing", role: "primary_text", status: "active", contentHash: "00000000", lastSeenAt: at },
        { anchorId: "a4", objectId: "o4", graphId: "graph", externalId: "block-recovered", role: "primary_text", status: "missing", contentHash: checksum("[任务] 原文"), lastSeenAt: at },
      ] };
    },
    async synchronizeExplicitObject(input) {
      synchronized.push(input.externalId);
      return success("reconciled", 3);
    },
    async observePrimaryAnchor(input) {
      observations.push([input.anchorId, input.status]);
      return {};
    },
  });
  assert.deepEqual(synchronized, ["block-changed"]);
  assert.deepEqual(observations, [["a2", "conflict"], ["a3", "missing"], ["a4", "active"]]);
  assert.deepEqual(issues, ["EXPLICIT_SYNC_MARKER_REMOVED", "EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING"]);
  assert.deepEqual(controller.snapshot(), { pending: 0, transportReady: true, reconciliationRequired: true });
});

test("a complete clean Anchor reconciliation clears a repaired Anchor risk without clearing broad sync risks", async () => {
  const at = "2026-07-20T08:00:00.000Z";
  const content = "[任务] 已恢复连接";
  let readable = false;
  const controller = new ExplicitSyncController({
    delayMs: 0,
    readBlock: async (externalId) => readable
      ? { uuid: externalId, content, "updated-at": 2002 }
      : null,
  });
  const transport: ExplicitSyncTransport = {
    async listPrimaryAnchors() {
      return { anchors: [{
        anchorId: "a-repaired",
        objectId: "o-repaired",
        graphId: "graph",
        externalId: "block-repaired",
        role: "primary_text",
        status: readable ? "active" : "missing",
        contentHash: checksum(content),
        lastSeenAt: at,
      }] };
    },
    async listObjects() {
      return [{ objectId: "o-repaired", objectType: "TASK" }];
    },
    async synchronizeExplicitObject() {
      throw new Error("matching restored content must not synchronize");
    },
    async observePrimaryAnchor() {
      return {};
    },
  };
  await controller.resume(transport);
  assert.equal(controller.snapshot().reconciliationRequired, true);

  readable = true;
  await controller.reconcileKnownAnchors();
  assert.equal(controller.snapshot().reconciliationRequired, false);

  controller.onSubtreeTraversalIssue("EXPLICIT_SYNC_SUBTREE_READ_FAILED", "有界子树读取失败。");
  assert.equal(controller.snapshot().reconciliationRequired, true);
  await controller.reconcileKnownAnchors();
  assert.equal(controller.snapshot().reconciliationRequired, true);
});

test("cold-start reconciliation waits for Logseq indexing before declaring a persisted Anchor missing", async () => {
  let graphReadable = false;
  const issues: string[] = [];
  const observations: Array<[string, string]> = [];
  const content = "[任务] reload 后仍可定位";
  const controller = new ExplicitSyncController({
    delayMs: 0,
    reconciliationDelayMs: 20,
    readBlock: async (externalId) => graphReadable ? { uuid: externalId, content, "updated-at": 2001 } : null,
    onIssue: (issue) => issues.push(issue.code),
  });
  const resumed = controller.resume({
    async listPrimaryAnchors() {
      return { anchors: [{ anchorId: "a-reload", objectId: "o-reload", graphId: "graph", externalId: "block-reload", role: "primary_text", status: "active", contentHash: checksum(content), lastSeenAt: "2026-07-20T08:00:00.000Z" }] };
    },
    async synchronizeExplicitObject() {
      throw new Error("unchanged persisted content must not synchronize");
    },
    async observePrimaryAnchor(input) {
      observations.push([input.anchorId, input.status]);
      return {};
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  graphReadable = true;
  await resumed;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(issues, []);
  assert.deepEqual(observations, []);
});

test("Block reconciliation leaves Project page Anchors to their page-specific workflow", async () => {
  const reads: string[] = [];
  const observations: Array<[string, string]> = [];
  const at = "2026-07-20T08:00:00.000Z";
  const controller = new ExplicitSyncController({
    delayMs: 0,
    readBlock: async (externalId) => {
      reads.push(externalId);
      return null;
    },
  });
  await controller.resume({
    async listObjects() {
      return [
        { objectId: "task-object", objectType: "TASK" },
        { objectId: "project-object", objectType: "PROJECT" },
      ];
    },
    async listPrimaryAnchors() {
      return { anchors: [
        { anchorId: "task-anchor", objectId: "task-object", graphId: "graph", externalId: "task-block", role: "primary_text", status: "active", contentHash: "11111111", lastSeenAt: at },
        { anchorId: "project-anchor", objectId: "project-object", graphId: "graph", externalId: "project-page", role: "primary_text", status: "active", contentHash: "22222222", lastSeenAt: at },
      ] };
    },
    async synchronizeExplicitObject() {
      throw new Error("a missing Block must not synchronize");
    },
    async observePrimaryAnchor(input) {
      observations.push([input.anchorId, input.status]);
      return {};
    },
  } as ExplicitSyncTransport);

  assert.deepEqual(reads, ["task-block"]);
  assert.deepEqual(observations, [["task-anchor", "missing"]]);
});

test("known Anchor reconciliation advances a bounded cursor across low-frequency runs", async () => {
  const cursors: Array<string | undefined> = [];
  const synchronized: string[] = [];
  const at = "2026-07-20T08:00:00.000Z";
  const controller = new ExplicitSyncController({
    delayMs: 0,
    readBlock: async (externalId) => ({ uuid: externalId, content: `[任务] ${externalId}`, "updated-at": 3001 }),
  });
  await controller.resume({
    async listPrimaryAnchors(cursor) {
      cursors.push(cursor);
      const externalId = cursor ? "block-2" : "block-1";
      return {
        anchors: [{ anchorId: `a-${externalId}`, objectId: `o-${externalId}`, graphId: "graph", externalId, role: "primary_text", status: "active", contentHash: "00000000", lastSeenAt: at }],
        ...(!cursor ? { nextCursor: "block-1" } : {}),
      };
    },
    async synchronizeExplicitObject(input) {
      synchronized.push(input.externalId);
      return success(`object-${input.externalId}`, 3);
    },
  });
  await controller.reconcileKnownAnchors();
  assert.deepEqual(cursors, [undefined, "block-1"]);
  assert.deepEqual(synchronized, ["block-1", "block-2"]);
});

test("failed Anchor observation is explicit and retries without deleting or blocking other Graph reads", async () => {
  const issues: string[] = [];
  let attempts = 0;
  const at = "2026-07-20T08:00:00.000Z";
  const controller = new ExplicitSyncController({
    delayMs: 0,
    readBlock: async () => null,
    onIssue: (issue) => issues.push(issue.code),
  });
  await controller.resume({
    async listPrimaryAnchors() {
      return { anchors: [{ anchorId: "a-retry", objectId: "o-retry", graphId: "graph", externalId: "block-retry", role: "primary_text", status: "active", contentHash: "11111111", lastSeenAt: at }] };
    },
    async synchronizeExplicitObject() {
      throw new Error("must not synchronize a missing block");
    },
    async observePrimaryAnchor() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("temporary service failure"), { code: "SERVICE_UNAVAILABLE" });
      return {};
    },
  });
  await controller.reconcileKnownAnchors();
  assert.equal(attempts, 2);
  assert.deepEqual(issues, [
    "EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING",
    "SERVICE_UNAVAILABLE",
    "EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING",
  ]);
  assert.equal(controller.snapshot().reconciliationRequired, true);
});

test("dispose stops an in-flight known Anchor check before any late Graph or Service work", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  const issues: string[] = [];
  const states: ExplicitSyncState[] = [];
  const controller = new ExplicitSyncController({
    delayMs: 0,
    readBlock: async (externalId) => {
      await gate;
      return { uuid: externalId, content: "[任务] 不得迟到同步", "updated-at": 4001 };
    },
    onIssue: (issue) => issues.push(issue.code),
    onState: (state) => states.push(state),
  });
  const resume = controller.resume({
    async listPrimaryAnchors() {
      return { anchors: [{ anchorId: "a-late", objectId: "o-late", graphId: "graph", externalId: "block-late", role: "primary_text", status: "active", contentHash: "00000000", lastSeenAt: "2026-07-20T08:00:00.000Z" }] };
    },
    async synchronizeExplicitObject() {
      writes += 1;
      return success("late-object", 3);
    },
  });
  await Promise.resolve();
  controller.dispose();
  const stateCountAfterDispose = states.length;
  release?.();
  await resume;
  assert.equal(writes, 0);
  assert.deepEqual(issues, []);
  assert.equal(states.length, stateCountAfterDispose);
});
