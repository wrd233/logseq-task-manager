# ADR 018 — Context Pack、Typed Cognition 与 Evidence Selection

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 8/14 章、`docs/vnext/06` 第 9/15 章、`docs/vnext/07` Phase 10.5

## 1. 决定

MaintenanceCoordinator 不再自己理解中文自然语言。

- 每次 reconciliation 构造临时 Context Pack：Formal State、source delta、active Context Associations、open Governance Issues；
- Cognition Executor 输入 Context Pack，输出 typed `SemanticJudgment`；
- 模型只能引用 host 提供的 opaque handles（S0/C1/C2...），不得伪造 UUID；
- Host 校验 handles 后，仅把 judgment 真正引用的 source refs freeze 为 Evidence；
- CONFIRMED_CHANGE 通过既有 narrow proposal path 落地；UNKNOWN/CONFLICT/BOUNDARY_CANDIDATE 持久为 Governance Issue，coverage 仍可完成。

## 2. 实现

- `packages/contracts`：`ContextPackItem` / `SemanticJudgment` / `CognitionExecutor` / `ExecutionProfile`。
- `packages/agent`：`FakeContextAwareExecutor`（测试 scaffold）、`DeepSeekV4FlashExecutor`。
- `MaintenanceCoordinator`：
  - `buildContextPack`（L0 + L2，bounded）；
  - `judge` → handle 校验 → `freezeSelected` → issue/commit；
  - 生产语义 regex 已从 Coordinator 移除（仅存在于 fake executor fixture）。
- `AgentRunReceipt` 继续使用既有 external-run 契约：executor id 记录 cognition executor，不新增领域特权。

## 3. 不做什么

- 不把 ContextPack 做成永久 Domain Object；
- 不把整份 prompt/Workspace 持久化；
- 不做 provider framework / model routing / fallback；
- 不把模型 chain-of-thought 存 Kernel。

## 4. 验收

- Fake executor 回归：`phase9-*`、`phase10-context-governance`。
- DeepSeek 真模型：DS1 current_focus、DS2 engagement conflict、DS4 prompt injection 已在 Harness 中验证。
