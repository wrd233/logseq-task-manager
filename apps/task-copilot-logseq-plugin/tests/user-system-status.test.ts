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
  assert.deepEqual(result.keyEvidence, ["正式状态与当前知识库已连接"]);
  assert.equal(result.narrationRuleId, "system-ready");
  assert.match(result.whatHappened, /正式状态与当前知识库已连接/);
  assert.match(result.affected, /Agent 分析未启用/);
  assert.match(result.stillAvailable, /正文编辑、当前关注、暂时做不了、项目、审阅、撤销、备份与迁移/);
  assert.match(result.dataSafety, /Logseq 正文仍是工作现场/);
  assert.doesNotMatch(
    `${result.whatHappened} ${result.affected} ${result.stillAvailable} ${result.dataSafety} ${result.actionRequired}`,
    /SQLite|Primary Anchor|\bAnchor\b|\bFocus\b|\bCondition\b|\bProject\b|\bAudit\b|\bRebind\b|UUID|Doctor|Graph|Service|Plugin|descriptor|protocol|Restore|Commit|Undo/,
  );
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
  assert.equal(result.headline, "正式能力暂时不可用");
  assert.equal(result.narrationRuleId, "system-service-restricted");
  assert.match(result.affected, /应用正式修改、审阅提交、撤销、备份、恢复与迁移已暂停/);
  assert.match(result.stillAvailable, /Logseq 正文仍可编辑/);
  assert.match(result.dataSafety, /没有把连接失败当成空状态/);
  assert.match(result.actionRequired, /重新连接当前知识库/);
  assert.doesNotMatch(`${result.headline} ${result.whatHappened} ${result.affected} ${result.actionRequired}`, /Graph|Service|Plugin|descriptor|protocol|Restore|Commit|Undo|SQLite/);
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
  assert.equal(protocol.headline, "Task Copilot 版本不兼容");
  assert.match(protocol.actionRequired, /同一版本/);

  const graph = deriveUserSystemStatus(snapshot({
    service_connection: {
      status: "RESTRICTED",
      reason_code: "SERVICE_GRAPH_MISMATCH",
      formal_writes_available: false,
      graph_editing_available: true,
    },
  }));
  assert.equal(graph.headline, "当前知识库与正式状态不匹配");
  assert.match(graph.actionRequired, /不要复用其他知识库的数据/);
});

test("Restore rollback failure keeps formal writes stopped and points to the retained recovery point", () => {
  for (const reason_code of ["V2_RESTORE_ROLLBACK_FAILED", "LAUNCHER_RESTORE_RECOVERY_REQUIRED"]) {
    const result = deriveUserSystemStatus(snapshot({
      runtime_status: "DEGRADED",
      store_status: "READ_ONLY_SAFE_MODE",
      service_connection: {
        status: "RESTRICTED",
        reason_code,
        formal_writes_available: false,
        graph_editing_available: true,
      },
    }));
    assert.equal(result.level, "BLOCKED");
    assert.equal(result.headline, "需要人工恢复");
    assert.match(result.whatHappened, /未能自动回滚/);
    assert.match(result.stillAvailable, /切换前恢复点/);
    assert.match(result.dataSafety, /没有继续启用未确认的正式状态/);
    assert.match(result.actionRequired, /不要重复尝试恢复/);
    assert.match(result.actionRequired, /下方核验后继续恢复/);
    assert.doesNotMatch(
      `${result.whatHappened} ${result.affected} ${result.stillAvailable} ${result.dataSafety} ${result.actionRequired}`,
      /SQLite|数据库路径|内部快照标识|Doctor|Graph|Service|Plugin|descriptor|protocol|Restore|Commit|Undo/,
    );
  }
});

test("an armed Restore interlock keeps writes stopped without inventing a recovery point", () => {
  const result = deriveUserSystemStatus(snapshot({
    runtime_status: "DEGRADED",
    store_status: "READ_ONLY_SAFE_MODE",
    service_connection: {
      status: "RESTRICTED",
      reason_code: "LAUNCHER_RESTORE_RECOVERY_ARMED",
      formal_writes_available: false,
      graph_editing_available: true,
    },
  }));
  assert.equal(result.level, "BLOCKED");
  assert.equal(result.headline, "上次恢复中断，需要核验");
  assert.match(result.whatHappened, /确认.*切换前状态已保存.*之前中断/);
  assert.match(result.dataSafety, /未经核验的内容/);
  assert.doesNotMatch(`${result.whatHappened} ${result.stillAvailable}`, /恢复点.*保留/);
});

test("invalid Restore recovery metadata keeps every recovery fact unknown", () => {
  const result = deriveUserSystemStatus(snapshot({
    runtime_status: "DEGRADED",
    store_status: "READ_ONLY_SAFE_MODE",
    service_connection: {
      status: "RESTRICTED",
      reason_code: "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID",
      formal_writes_available: false,
      graph_editing_available: true,
    },
  }));
  assert.equal(result.headline, "恢复记录无法安全确认");
  assert.match(result.whatHappened, /无法确认当前恢复记录是否可信/);
  assert.match(result.dataSafety, /没有猜测回滚结果/);
  assert.doesNotMatch(`${result.whatHappened} ${result.stillAvailable}`, /恢复点.*保留/);
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
  assert.equal(recovery.narrationRuleId, "system-commit-recovery-required");
  assert.match(recovery.dataSafety, /已完成步骤保存在原操作记录/);
  assert.match(recovery.actionRequired, /同一恢复记录/);
});

test("Anchor conflicts and explicit-sync reconciliation state never claim everything is healthy", () => {
  const anchor = deriveUserSystemStatus(snapshot({ source_anchor_conflicts: 2 }));
  assert.equal(anchor.level, "ATTENTION");
  assert.equal(anchor.headline, "有 2 项正式事项与正文失去连接");
  assert.match(anchor.actionRequired, /逐项检查正文连接/);
  assert.doesNotMatch(
    `${anchor.whatHappened} ${anchor.affected} ${anchor.stillAvailable} ${anchor.dataSafety} ${anchor.actionRequired}`,
    /SQLite|Primary Anchor|\bAnchor\b|\bFocus\b|\bCondition\b|\bAudit\b|\bRebind\b|UUID|Doctor/,
  );

  const sync = deriveUserSystemStatus(snapshot({
    explicit_sync: { pending: 3, transportReady: true, reconciliationRequired: true },
  }));
  assert.equal(sync.level, "ATTENTION");
  assert.equal(sync.headline, "有 3 项正文变化需要核对");
  assert.match(sync.dataSafety, /没有建立第二个正式状态源/);
});
