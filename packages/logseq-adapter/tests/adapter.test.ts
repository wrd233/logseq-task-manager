import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";
import { VersionedStateRepository, createEmptyState } from "@task-copilot/persistence";

import {
  LogseqContentPort,
  LogseqFileStorageBlobStore,
  RuntimeShapeAdapter,
  formatJournalDay,
  resolveLogseqPageReference,
  assertStorageKey,
  classifyStorageError,
  physicalStorageKey,
  type LogseqFacade,
} from "../src/index.ts";

function facade(content: string): LogseqFacade & { block: { uuid: string; content: string; page: unknown }; graph: { name: string; url: string } } {
  const block = { uuid: "block-uuid", content, page: { name: "Journal" } };
  const graph = { name: "Test Graph", url: "/graph" };
  const values = new Map<string, string>();
  return {
    block,
    graph,
    App: {
      async getCurrentGraph() {
        return graph;
      },
    },
    Editor: {
      async getCurrentBlock() {
        return block;
      },
      async getBlock() {
        return block;
      },
      async updateBlock(_uuid, next) {
        block.content = next;
      },
      async scrollToBlockInPage() {},
    },
    FileStorage: {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    },
  };
}

test("runtime shape adapter accepts supported page references and refuses unknown shapes", () => {
  assert.equal(RuntimeShapeAdapter.pageRef("Journal"), "Journal");
  assert.throws(() => RuntimeShapeAdapter.pageRef(42), /runtime shape/i);
  assert.throws(() => RuntimeShapeAdapter.pageRef({ id: 7 }), /runtime shape/i);
  assert.equal(RuntimeShapeAdapter.pageRef({ uuid: "page-uuid" }), "page-uuid");
  assert.equal(RuntimeShapeAdapter.pageRef({ name: "Project/Test" }), "Project/Test");
  assert.throws(() => RuntimeShapeAdapter.pageRef({ nested: true }), /runtime shape/i);
});

test("page resolver never exposes numeric IDs and resolves the real page 19 Journal shape", async () => {
  const runtimeJournal = { id: 19, uuid: "journal-uuid", name: "2026_07_18", originalName: "2026-07-18", journalDay: 20260718 };
  for (const raw of [19, "19", { id: 19 }, { uuid: "journal-uuid" }]) {
    const resolved = await resolveLogseqPageReference(raw, async () => runtimeJournal);
    assert.equal(resolved.displayName, "2026-07-18");
    assert.notEqual(resolved.displayName, "19");
    assert.equal(resolved.pageId, 19);
  }
  assert.equal((await resolveLogseqPageReference({ journalDay: "20260718" })).displayName, "2026-07-18 · Journal");
  assert.equal((await resolveLogseqPageReference("Project/Graylog")).displayName, "Project/Graylog");
  assert.equal((await resolveLogseqPageReference({ name: "graylog", originalName: "Graylog" })).displayName, "Graylog");
  assert.equal((await resolveLogseqPageReference({ id: 19, uuid: "journal-uuid", name: "fallback", originalName: "2026-07-18", journalDay: "20260718" })).displayName, "2026-07-18");
  assert.equal((await resolveLogseqPageReference({ id: 19 })).displayName, "无法解析的 Logseq 页面");
  assert.equal((await resolveLogseqPageReference({ invalid: true })).displayName, "无法解析的 Logseq 页面");
  assert.equal(formatJournalDay(20260230), undefined);
});

test("content port resolves and opens a moved Journal block by UUID", async () => {
  const api = facade("runtime source");
  api.block.page = { id: 19 };
  let opened: [string | number, string] | undefined;
  api.Editor.getPage = async () => ({ id: 19, uuid: "journal-uuid", journalDay: 20260718 });
  api.Editor.scrollToBlockInPage = async (page, uuid) => { opened = [page, uuid]; };
  const port = new LogseqContentPort(api);
  const current = await port.getCurrentBlock();
  assert.equal(current?.pageRef, "2026-07-18 · Journal");
  assert.equal(current?.pageIdentity?.pageId, 19);
  assert.equal((await port.resolveSource("block-uuid", "19")).status, "resolved");
  await port.open("block-uuid", "Test Graph:/graph");
  assert.deepEqual(opened, ["journal-uuid", "block-uuid"]);
});

test("content port prepares, applies, verifies and compensates Unicode long-text rewrites", async () => {
  const original = "告警链路".repeat(12_500);
  const api = facade(original);
  const port = new LogseqContentPort(api);
  const current = await port.getCurrentBlock();
  assert.equal(current?.text.length, original.length);
  const mutation = await port.prepare(
    {
      operationId: "op_1",
      operationType: "rewrite_content",
      target: { kind: "ANCHOR", id: "anc_1" },
      payload: { text: "正式正文" },
      preconditions: [],
      dependencies: [],
      riskLevel: "MEDIUM",
      ruleRefs: ["MAP-RWT-001"],
      rationale: "测试",
      confidence: 1,
      status: "ACCEPTED",
    },
    {
      anchorId: "anc_1",
      objectId: "obj_1",
      adapter: "logseq",
      graphId: "Test Graph:/graph",
      externalId: "block-uuid",
      role: "primary_text",
      contentHash: checksum(original),
      lastSeenAt: "2026-07-17T00:00:00.000Z",
      status: "active",
      cachedPageRef: "Journal",
    },
  );
  await port.apply(mutation);
  assert.equal(await port.verify(mutation, "after"), true);
  await port.compensate(mutation);
  assert.equal(await port.verify(mutation, "before"), true);
});

test("content writes refuse the same UUID and content after the active Graph changes", async () => {
  const api = facade("same text");
  const port = new LogseqContentPort(api);
  const mutation = await port.prepare(
    {
      operationId: "op_graph",
      operationType: "rewrite_content",
      target: { kind: "ANCHOR", id: "anc_graph" },
      payload: { text: "must not cross graphs" },
      preconditions: [],
      dependencies: [],
      riskLevel: "MEDIUM",
      ruleRefs: ["SYN-CON-001"],
      rationale: "cross-graph guard",
      confidence: 1,
      status: "ACCEPTED",
    },
    {
      anchorId: "anc_graph",
      objectId: "obj_graph",
      adapter: "logseq",
      graphId: "Test Graph:/graph",
      externalId: "block-uuid",
      role: "primary_text",
      contentHash: checksum("same text"),
      lastSeenAt: "2026-07-17T00:00:00.000Z",
      status: "active",
    },
  );
  api.graph.name = "Other Graph";
  api.graph.url = "/other";
  assert.equal(await port.verify(mutation, "before"), false);
  await assert.rejects(port.apply(mutation), /前置版本不匹配/);
  assert.equal(api.block.content, "same text");
});

test("FileStorage adapter round trips only namespaced keys and maintains its registry", async () => {
  const api = facade("text");
  const blobs = new LogseqFileStorageBlobStore(api.FileStorage);
  await blobs.set("task-copilot/state/slot-a.json", "payload");
  assert.equal(await blobs.get("task-copilot/state/slot-a.json"), "payload");
  assert.deepEqual(await blobs.keys("task-copilot/state"), ["task-copilot/state/slot-a.json"]);
  await assert.rejects(blobs.set("other/key", "unsafe"), /namespace/i);
});

test("FileStorage registry bookkeeping happens before the manifest activation write", async () => {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const blobs = new LogseqFileStorageBlobStore({
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { writes.push(key); values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  });
  await blobs.set("task-copilot/state/slot-a.json", "payload");
  await blobs.set("task-copilot/state/manifest.json", "manifest");
  assert.equal(writes.at(-1), physicalStorageKey("task-copilot/state/manifest.json"));
  assert.deepEqual(writes.slice(-2), [physicalStorageKey("task-copilot/registry/keys.json"), physicalStorageKey("task-copilot/state/manifest.json")]);
});

test("a registry failure cannot occur after a new state manifest becomes visible", async () => {
  const values = new Map<string, string>();
  let registryWrites = 0;
  const blobs = new LogseqFileStorageBlobStore({
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      if (key === physicalStorageKey("task-copilot/registry/keys.json") && ++registryWrites === 2) throw new Error("registry unavailable");
      values.set(key, value);
    },
    async removeItem(key) { values.delete(key); },
  });
  const repository = new VersionedStateRepository(blobs);
  await assert.rejects(repository.save(createEmptyState()), /registry unavailable/);
  assert.equal(values.has(physicalStorageKey("task-copilot/state/manifest.json")), false);
  assert.equal((await repository.load()).revision, 0);
});

test("storage error classification handles Logseq missing-file shapes centrally", () => {
  assert.equal(classifyStorageError(new Error("file not existed")), "NOT_FOUND");
  assert.equal(classifyStorageError({ message: "File Not Existed: data.json", code: "ENOENT", path: "data.json" }), "NOT_FOUND");
  assert.equal(classifyStorageError(new Error("permission denied")), "PERMISSION_DENIED");
  assert.equal(classifyStorageError(new Error("invalid JSON")), "CORRUPTED");
  assert.equal(classifyStorageError(new Error("BUG: should not join with empty dir")), "IO_ERROR");
  assert.equal(classifyStorageError({ unexpected: true }), "UNKNOWN");
});

test("first-run missing FileStorage initializes a complete empty store with flat physical keys", async () => {
  const values = new Map<string, string>();
  const sdkKeys: string[] = [];
  const blobs = new LogseqFileStorageBlobStore({
    async getItem(key) { sdkKeys.push(key); if (!values.has(key)) throw new Error(`file not existed: ${key}`); return values.get(key); },
    async setItem(key, value) { sdkKeys.push(key); values.set(key, value); },
    async removeItem(key) { sdkKeys.push(key); values.delete(key); },
  });
  const initialized = await new VersionedStateRepository(blobs).initialize();
  assert.equal(initialized.initializedNewStore, true);
  assert.deepEqual(initialized.state.objects, []);
  assert.deepEqual(initialized.state.events, []);
  assert.deepEqual(initialized.state.proposals, []);
  assert.equal(initialized.state.schemaVersion, 1);
  assert.ok(sdkKeys.every((key) => key.length > 0 && !key.includes("/")), `SDK received nested or empty path: ${sdkKeys.join(", ")}`);
});

test("empty and invalid logical paths are rejected before the SDK is called", async () => {
  let calls = 0;
  const blobs = new LogseqFileStorageBlobStore({
    async getItem() { calls += 1; return null; },
    async setItem() { calls += 1; },
    async removeItem() { calls += 1; },
  });
  for (const key of ["", "/task-copilot/state.json", "task-copilot/", "task-copilot//state.json", "task-copilot/../state.json"]) {
    assert.throws(() => assertStorageKey(key), /relative path/i);
    await assert.rejects(blobs.get(key), /relative path/i);
  }
  assert.equal(calls, 0);
});
