# Golden Path：Formal Commit Offline + Background Maintenance Convergence

> 状态：2026-08-15 自动化集成验证通过（`packages/test-support/tests/phase8-*`、`phase9-*`）。
> 真实 Logseq Desktop 0.10.15 实机复验是下一轮 Phase 10 启动前的验收项。

## 1. Kernel commit while Graph unavailable

1. 已有 Formal WorkObject（Task / MiniProject）。
2. Graph Adapter 不上报心跳（模拟 Logseq 关闭）。
3. 使用 `POST /v1/commits/commit` 提交 `CHANGE_ENGAGEMENT` 等 low-risk operation：
   - Kernel current state + Commit Ledger 原子 `COMMITTED`；
   - `projection_obligations` 插入 `PENDING`。
4. 恢复 Graph Adapter，重放该 commit 的 `graphEffect`：
   - `POST /v1/commits/:id/projection/verify` 校验 result/projection hash；
   - obligation `VERIFIED`。
5. 重启 Kernel 后 obligation 仍在，可继续收敛。

## 2. Background semantic maintenance

1. Plugin 观测 Primary Anchor block 变化，quiet-period 聚合后
   `POST /v1/maintenance/source-change`。
2. Kernel Service 持久化 source coverage + `WORK_BURST_ENDED` ReconcileJob。
3. 内置 maintenance loop 认领 job：
   - Graph online 时读取 bounded target snapshot；
   - freeze 最小 Evidence；
   - engagement 与 current-focus 窄义 Agent 按顺序执行；
   - 有 Proposal 时经既有 narrow path apply + Graph effect。
4. job `DONE` + `CONFIRMED_CHANGE`，source coverage 的 `hasUncoveredChanges=false`。
5. pause / Graph offline / stale job 分别保持 coverage 未覆盖并 fail-closed / requeue，
   不产生错误 Formal mutation。
