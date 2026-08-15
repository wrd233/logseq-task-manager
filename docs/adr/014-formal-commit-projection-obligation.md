# ADR 014 — Formal Commit 与 Graph Projection 最终一致解耦

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 12 章、`docs/vnext/06` 第 24/25 章、`docs/vnext/07` Phase 14
- 替代：早期跨介质事务模型 `VALIDATE → PREPARE → KERNEL_APPLY → GRAPH_APPLY → VERIFY → COMMIT`

## 1. 决定

一个合法的 Formal Kernel Commit 不再等待 Graph Adapter 在线或 Graph 写入成功。

新序列：

```text
VALIDATE
→ PREPARE
→ KERNEL APPLY
→ FORMAL COMMIT
→ durable Projection Obligation
→ asynchronous / retryable GRAPH APPLY
→ VERIFY
→ converged
```

Kernel `COMMITTED` 即最新 Formal Truth；Managed Graph Projection 是派生物。

## 2. 具体实现

- `packages/kernel` 新增 `commitFormal(operation, snapshot?)`：
  - 现有对象 operational semantics（`SET_CURRENT_FOCUS` / `CHANGE_ENGAGEMENT` 等）允许 `snapshot=null`；
  - `CREATE_WORK_OBJECT` 仍要求 fresh source snapshot，因为 Primary Anchor 的 source content hash 是外部现实；
  - Closure 类操作仍要求 snapshot，用于 marker-aware projection；
  - 提供 snapshot 时若与 Kernel canonical projection 不符，commit 以 `STALE_GRAPH_SNAPSHOT` fail closed。
- `packages/sqlite` schema v7 新增 append-only `projection_obligations`：
  `PENDING → (APPLY) → VERIFIED`，失败为 `FAILED`，保留 attempt/lastError。
- 新增 verify/failed API：`verifyFormalProjection` / `graphProjectionFailed` /
  `GET /v1/projection-obligations`。
- 旧 `prepare → complete` 同步路径保留为兼容路径；所有新后台/异步路径使用 `commitFormal`。

## 3. 为什么

- Graph Adapter 离线、Logseq 关闭不能使已经合法成立的 Formal Truth 回滚；
- Graph 失败不能被遗忘：Projection Obligation 持久化、可重试、可重启恢复；
- 旧 Graph projection 不得被解释成新 USER intent，也不得反向覆盖更新版本的 Kernel state。

## 4. 不做什么

- 不建设通用 projection framework / event bus / Event Sourcing 平台；
- 不把 `RECOVERY_REQUIRED` 语义复制进 projection obligation；
- 不让 projection lag 成为用户待办，只作为系统健康状态。

## 5. 验收

`packages/test-support/tests/phase8-projection-obligation.test.ts` 覆盖：

- Graph online commit → obligation → verify → converged；
- Graph 未触碰时 Formal State 已 COMMITTED、Projection PENDING；
- 用户编辑 pending projection 时 stale effect 失败，不覆盖；
- pending obligation 跨 Kernel 重启继续收敛；
- 提供 stale snapshot 时 commit fail closed，不写 Formal State。
