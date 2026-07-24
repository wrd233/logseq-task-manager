# P1-D Operational Status Narration 自动证据（2026-07-24）

结论：`PARTIAL_AUTOMATED_PASS / DETERMINISTIC_CONTRACT_ONLY / VIEWMODEL_UI_DESKTOP_OPEN`

## 覆盖范围

- Proposal：READY/Review/accepted-not-applied/stale/applied 等用户层结论；
- SemanticCommit：PENDING/RECOVERY_REQUIRED/FAILED/COMPLETED/UNDONE；
- Primary Anchor：active/missing/conflict/replaced；
- System：Recovery、Pending、Service/Graph、Anchor、Explicit Sync、Ready；
- 原有 Object Condition/Lifecycle/Project current interface 叙述保持不变。

## 安全边界

- accepted-not-applied 先读取同 Proposal 的 Commit 证据；完成 Commit 存在时不再声称尚未应用；
- PENDING/RECOVERY_REQUIRED 只生成 `OPEN_RECOVERY_DETAILS` 路由意图，对应既有
  “最近修改与恢复”表面，不执行恢复、不建立第二个 Commit；
- Anchor missing/conflict 只生成 `OPEN_ANCHOR_REPAIR` 路由意图，对应既有受控
  Rebind 预览；不输出 external Block identity；
- `COMPLETED` 不等于当前一定可 Undo，契约明确保留未知；
- Commit error code 不进入用户层 facts、conclusion 或 key evidence；
- 确定性模板 `inferences` 恒为空；
- 证据 identity 不匹配、时间无效、系统计数非法时 fail closed。

## 自动证据

- `packages/application/tests/status-narration.test.ts`：15/15；
- Application 全量：104/104、0 skipped；
- Application typecheck：PASS；
- 根级 `./scripts/check.sh`：PASS；
- rule coverage：145；
- acceptance rehearsal：PASS（恢复投影 differences 为空）。

## 尚未声明

- 未接 Plugin ViewModel/UI；
- 未替换现有 `user-system-status.ts` 或 `recent-changes.ts`；
- 未实现 LLM draft/压缩协议；
- 未完成 Desktop 信息密度、操作距离、Light/Dark/窄栏验收。
