# ADR 029 — Trusted USER Channel for Formal Mutation and Ownership Decisions

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/vnext/06` Authority Matrix、`docs/adr/021`

## 1. 问题

Phase 16B 审计发现两个 USER authority 漏洞：

1. `POST /v1/ownerships` 接受 client body 自报 `actor: { type: "USER", id: "local-user" }`，任何持有普通 bearer token 的客户端（包括 External CLI Agent）都能直接改写 Formal Ownership。
2. `UPDATE_WORK_INTENT` 仍允许 MiniProject Governance 的 Agent Proposal 通过 `applyWorkIntentProposal` 直接产生 AGENT-actor Formal Commit，与权威规范「WorkIntent = USER-owned commitment」冲突。

更广泛地，`/v1/commits/prepare`、`/v1/commits/commit`、`/v1/commits/*/complete`、undo 等 USER-actor mutation route 只依赖 bearer token；CLI descriptor 与 Plugin descriptor 持有同一 bearer token，因此 External Agent 可以伪造 USER。

## 2. 决定

1. **USER-actor Formal mutation 必须携带 Plugin USER-channel capability。**
   - `KernelClient` 在拥有 `userChannelToken` 时自动为所有请求发送 `x-task-copilot-user-channel`。
   - Kernel Service 对 USER mutation routes 默认执行 `assertTrustedUserChannel`：`/v1/commits/prepare`、`/v1/commits/commit`、`/v1/commits/:id/complete`、`/v1/commits/:id/graph-failed`、`/v1/commits/:id/undo/prepare`、`/v1/commits/:id/projection/verify`、`/v1/commits/:id/projection/failed`、`/v1/proposals/:id/revisions`、`/v1/proposals/:id/dismiss`、`/v1/feedback/strong-positive`、`/v1/objects/:id/viewed`。
   - External CLI Agent 持有 kernel descriptor（无 userChannelToken），因此只能读、freeze evidence、提交 AgentRun 结果、apply 低风险 Proposal、创建 DecisionPackage；不能伪造 USER。
2. **Ownership 没有直接 mutation route。**
   - `POST /v1/ownerships` 永久移除；GET 仍可读。
   - 新增 Decision operation `ASSIGN_PARENT`：Agent/UI 创建 `DecisionPackage` → Plugin Trusted USER Channel → `TrustedUserEvent` → `UserDecision` → USER-actor Commit → `ownerships` 写入。
   - 自然笔记默认不移动。
3. **WorkIntent 收紧为 USER-owned。**
   - `UPDATE_WORK_INTENT` formal commit path只接受 authorized USER，拒绝任何 Agent actor。
   - MiniProject Governance 的 Agent WorkIntent 建议由 `ExternalAgentCoordinator` 转为 `DecisionPackage`（Proposal 状态 `PACKAGED`），等待「待我确认」授权。
   - `applyWorkIntentProposal` / `applyWorkIntentProposalFormal` 一律返回 `WORK_INTENT_USER_DECISION_REQUIRED`。

## 3. 影响

- 插件必须使用 `graph-adapter.json`（含 `userChannelToken`）连接 Kernel，才能执行 formalize、closure、undo、确认等 USER 动作。
- 测试环境可用 `startKernelServer({ requireTrustedUserChannel: false })` 关闭 channel gate；生产默认开启。
- ASSIGN_PARENT 不产生 ProjectionObligation；执行结果 `projectionObligation` 为 `null`。

## 4. 验收

- `phase16b-governance-repair.test.ts`：bare bearer 无法 prepare/commit USER operation；ownership POST 404；ownership package + trusted event 成功且 Commit actor=USER；WorkIntent Agent proposal 只能 package，plugin 确认后 Commit actor=USER。
