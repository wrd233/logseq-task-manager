# P2-G Migration Activation 真实 Desktop Gate（2026-07-26）

结论：`DESKTOP_PASS / ACTIVATION_MAIN_CHAIN_DONE / OVERALL_GOAL_IN_PROGRESS`

## 运行基线

- branch：`feature/task-copilot-mvp`
- commit：`f42b62d`
- Plugin build：`2026-07-26T15:22:42+0800`
- Logseq：`0.10.15`
- Graph：隔离测试 Graph `logseq`
- 主题 / 窗口：Dark / `994×700`
- Runtime：安装态 Launcher + owned Local Service，SQLite
  `tmp/runtime/manual-v2/task-copilot.sqlite`
- 材料：专用脱敏 Recovery Bundle；不含真实个人正文

截图、报告、命令输出都没有保存 descriptor token、Provider Key、内部 snapshot identity
或未脱敏正文。

## 操作链与结果

1. 从 `PREVIEWED` 且已有一条 `UNDONE` batch 的计划点击“准备下一批”；
2. 重新选择同一脱敏 Bundle，系统只读核对出唯一待导入项；
3. UI 明确显示“校验本计划恢复基线”，没有创建第二个恢复点；
4. 原恢复基线重新校验 PASS 后进入独立 HIGH Import Review；
5. 导入 1 项，SQLite run=`IMPORTING`、新 batch=`IMPORTED`、objects `4→5`；
6. Verify 后 run=`VERIFIED`、新 batch=`VERIFIED`、validation PASS；
7. 点击“准备启用 V2”，进入独立 HIGH 交接 Review；
8. 未勾选确认直接提交时，UI 明确拒绝，SQLite 仍为 `VERIFIED`；
9. 勾选后启用，run=`ACTIVATED`，objects=5，待导入=0；旧 batch=`UNDONE`、
   新 batch=`VERIFIED`，审阅与验证历史都保留；
10. 完整退出并重启 Logseq 后重新进入迁移页，计划仍显示“V2 已启用；V1 只保留为
    只读历史与恢复证据”，不再出现 Import、Undo 或 Activate 主动作。

## 真实发现与修复

首次重做导入时，旧构建创建了新快照，Service 返回
`MIGRATION_SNAPSHOT_CHANGED`，run 仍为 `PREVIEWED`、objects=4、正式状态零变化。
这证明 Service 的单恢复基线规则真实生效。`f42b62d` 修复 Plugin 后重跑完整链成功；
没有通过删除台账、改数据库或放宽安全校验绕过问题。

## CURRENT 截图

- `p2-g-38-migration-baseline-reuse-current-dark.png`
- `p2-g-39-migration-activation-review-current-dark.png`
- `p2-g-40-migration-activation-confirmation-required-current-dark.png`
- `p2-g-41-migration-activated-current-dark.png`
- `p2-g-42-migration-activated-reload-current-dark.png`

这些截图替代“Migration Activate 尚无当前 Desktop 证据”的旧结论，但不替代
Migration failure/interruption、Light/窄栏或 P2-G 其他维护向导的未完成 Gate。

## 交互评估

- 主结论和唯一主动作清楚；用户不需要理解 run、batch、snapshot 或幂等键；
- V1 只读交接与“禁止双写”在最终确认前可见；
- 缺确认时明确说明零变化，原正式状态安全；
- 完成后没有继续显示危险操作，reload 后仍能读懂迁移已结束；
- 当前 Dark 宿主内 Plugin 表面仍偏亮，视觉 Gate 保持 OPEN。
