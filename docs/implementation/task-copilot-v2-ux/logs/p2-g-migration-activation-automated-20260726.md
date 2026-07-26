# P2-G Migration Activation 自动 Gate（2026-07-26）

结论：`AUTOMATED_PASS / ACTIVATION_MAIN_CHAIN_READY / OVERALL_GOAL_IN_PROGRESS`

## 本轮实现

- `dfb24eb` 把既有 `activateLegacyMigration` 正式命令接入 Plugin：
  `VERIFIED` 计划只能先进入独立 HIGH Review，再以固定确认
  `ACTIVATE_V2_SQLITE` 交给 Local Service；
- 未勾选 V1 只读交接边界时零请求；启用中的重复提交被禁用；
- 响应丢失进入 `activation-uncertain`，只允许对同一计划做幂等重试；
- `ACTIVATED` 只接受 Service 返回的同一 run 身份和正式状态，不能由前台推断；
- 激活后明确表达 V1 只保留为只读历史与恢复证据，不建立 V1/V2 双写。

真实 Desktop 继续执行时发现，Undo 后再次导入会被 Service 以
`MIGRATION_SNAPSHOT_CHANGED` 安全拒绝。根因不是 Activation，而是 Plugin 为同一
Migration Run 错误新建了第二个导入前快照。`f42b62d` 保留既有“整项计划唯一恢复基线”
安全规则：首批创建并校验，后续批次或 Undo 后重做只复用并重新校验 run 已记录的原始
快照；没有放宽 Service 或 SQLite 的单基线约束。

## 自动证据

- Migration controller + UI focused：`8/8` PASS；
- Plugin typecheck：PASS；
- Plugin 全套：`315/315` PASS，0 skipped；
- 根级 `./scripts/check.sh`：PASS；
- package、bootstrap、dist、边界检查：PASS；
- stable rules：`145`；
- acceptance rehearsal：`differences=[]`。

新增自动覆盖：

- 已有 run snapshot 时调用 `validateBackup`，不调用 `createBackup`；
- snapshot identity 仅留在私有控制器，不进入 Plugin state/DOM；
- HIGH Activation、V1 只读交接和 no-dual-write 文案；
- Activation 响应不确定时同 run、同固定确认幂等重试。

## 仍未关闭

`2beb1b5` 进一步关闭完成后退出日常迁移操作：ACTIVATED run 存在时，scan、session
Review、execution state 和所有 batch/run 写动作都不渲染；只保留交接说明、只读 batch
历史和 Backup/Restore 路由。Plugin 全套升至 `316/316`，根级检查再次 PASS。

Service 停止时的导入/验证/启用恢复、正式失败注入以及 Light/窄栏仍需 Gate；P2-G 与
整体 Goal 继续 `IN_PROGRESS`。
