import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeDiagnosticsSnapshot } from "../src/runtime-diagnostics.ts";
import { deriveUserSystemStatus } from "../src/user-system-status.ts";

function snapshot(overrides: Partial<RuntimeDiagnosticsSnapshot> = {}): RuntimeDiagnosticsSnapshot {
  return {
    plugin_id: "task-copilot-personal-mvp",
    plugin_version: "0.1.0",
    runtime_status: "READY",
    store_status: "READY",
    store_schema: "v12",
    current_graph: "logseq",
    logseq_version: "0.10.15",
    feature_flags: {},
    service_connection: {
      status: "READY",
      formal_writes_available: true,
      graph_editing_available: true,
      capabilities: { formalWrites: true, migration: true, provider: false, backup: true },
    },
    recovery_state: "clean",
    stages: [],
    pending_semantic_commits: 0,
    recovery_required_commits: 0,
    source_anchor_conflicts: 0,
    explicit_sync: { pending: 0, transportReady: true, reconciliationRequired: false },
    ...overrides,
  };
}

test("healthy status answers the five user questions without treating an optional Provider as failure", () => {
  const result = deriveUserSystemStatus(snapshot());
  assert.equal(result.level, "READY");
  assert.equal(result.headline, "Task Copilot 可以正常使用");
  assert.match(result.whatHappened, /正式状态与当前 Graph 已连接/);
  assert.match(result.affected, /Agent 分析未启用/);
  assert.match(result.stillAvailable, /正文编辑、Focus、Condition、Project、审阅、Undo、备份与迁移/);
  assert.match(result.dataSafety, /SQLite 仍是唯一正式状态源/);
  assert.equal(result.actionRequired, "无需操作；需要 Agent 分析时再配置 Provider。");
});

test("unavailable Service pauses formal writes while keeping Graph editing and history safe", () => {
  const result = deriveUserSystemStatus(snapshot({
    runtime_status: "DEGRADED",
    store_status: "READ_ONLY_SAFE_MODE",
    service_connection: {
      status: "RESTRICTED",
      reason_code: "SERVICE_UNAVAILABLE",
      formal_writes_available: false,
      graph_editing_available: true,
    },
    pending_semantic_commits: "unavailable",
    recovery_required_commits: "unavailable",
    source_anchor_conflicts: "unavailable",
    explicit_sync: { pending: 0, transportReady: false, reconciliationRequired: true },
  }));
  assert.equal(result.level, "BLOCKED");
  assert.equal(result.headline, "正式服务暂时不可用");
  assert.match(result.affected, /正式写入、审阅提交、Undo、备份、恢复与迁移已暂停/);
  assert.match(result.stillAvailable, /Logseq 正文仍可编辑/);
  assert.match(result.dataSafety, /没有把连接失败当成空状态/);
  assert.match(result.actionRequired, /重新连接同一 Graph 的 Service/);
});

test("protocol and Graph mismatches have distinct user actions", () => {
  const protocol = deriveUserSystemStatus(snapshot({
    service_connection: {
      status: "RESTRICTED",
      reason_code: "SERVICE_PROTOCOL_MISMATCH",
      formal_writes_available: false,
      graph_editing_available: true,
    },
  }));
  assert.equal(protocol.headline, "Plugin 与正式服务版本不兼容");
  assert.match(protocol.actionRequired, /匹配版本/);

  const graph = deriveUserSystemStatus(snapshot({
    service_connection: {
      status: "RESTRICTED",
      reason_code: "SERVICE_GRAPH_MISMATCH",
      formal_writes_available: false,
      graph_editing_available: true,
    },
  }));
  assert.equal(graph.headline, "当前 Graph 与正式状态不匹配");
  assert.match(graph.actionRequired, /不要切换数据库/);
});

test("unfinished and recovery-required commits take priority over ordinary readiness", () => {
  const pending = deriveUserSystemStatus(snapshot({ pending_semantic_commits: 2 }));
  assert.equal(pending.level, "ATTENTION");
  assert.equal(pending.headline, "有 2 项修改尚未完成");
  assert.match(pending.actionRequired, /继续原操作/);

  const recovery = deriveUserSystemStatus(snapshot({
    pending_semantic_commits: 1,
    recovery_required_commits: 1,
  }));
  assert.equal(recovery.level, "BLOCKED");
  assert.equal(recovery.headline, "有 1 项修改需要恢复");
  assert.match(recovery.dataSafety, /已完成步骤保存在原 Commit/);
  assert.match(recovery.actionRequired, /同一恢复记录/);
});

test("Anchor conflicts and explicit-sync reconciliation state never claim everything is healthy", () => {
  const anchor = deriveUserSystemStatus(snapshot({ source_anchor_conflicts: 2 }));
  assert.equal(anchor.level, "ATTENTION");
  assert.equal(anchor.headline, "有 2 项正式事项与正文失去连接");
  assert.match(anchor.actionRequired, /逐项检查正文连接/);

  const sync = deriveUserSystemStatus(snapshot({
    explicit_sync: { pending: 3, transportReady: true, reconciliationRequired: true },
  }));
  assert.equal(sync.level, "ATTENTION");
  assert.equal(sync.headline, "有 3 项正文变化需要核对");
  assert.match(sync.dataSafety, /没有建立第二个正式状态源/);
});
