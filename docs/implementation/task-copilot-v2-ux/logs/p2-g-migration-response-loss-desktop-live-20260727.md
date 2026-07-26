# P2-G Migration 写后响应丢失 Desktop Gate（2026-07-27）

## 结论

状态：`MIGRATION_POST_WRITE_RESPONSE_LOSS_RELOAD_VERIFY_UNDO_DESKTOP_DONE`

本 Gate 使用专用 SQLite 克隆和一次性故障 Launcher，真实证明：

1. Import 已在 SQLite 单事务完成、但 HTTP 响应随后丢失时，Plugin 不把结果猜成失败或成功；
2. 用户层主结论要求“先以台账为准”，持久 Migration ledger 同屏显示 `已导入，等待验证` 和唯一 `验证本批` 动作；
3. Plugin reload 后 session-only 的 `import-uncertain` 消失，正式 ledger 仍重建同一 `IMPORTED` batch 和 Verify 动作；
4. Verify 后 run/batch 均为 `VERIFIED`，再经既有 HIGH Undo 回到 `PREVIEWED/UNDONE`；
5. 对象数真实 `4→5→4`，SemanticCommit `PENDING/RECOVERY_REQUIRED` 始终 `0/0`；
6. 故障 Launcher、私有 descriptor 和测试 Service 全部退出后，正常 LaunchAgent、原 database authority 与 7 对象正式测试库恢复，用户系统状态为 READY。

这关闭的是 Migration “导入已提交但响应丢失／Service 中断不确定”代表子 Gate；Verify failure、
Activate failure、Light 和窄栏仍 OPEN，因此 P2-G 与完整 Goal 继续 `IN_PROGRESS`。

## 精确运行上下文

- branch：`feature/task-copilot-mvp`
- repo commit：`f17f46a`
- Plugin artifact commit：`757fac87d511`
- Logseq：`0.10.15`
- Graph：仓库内合成 File Graph `logseq`
- 主题 / 窗口：Dark / 约 `1001×720`
- 正常 authority：`tmp/runtime/manual-v2/task-copilot.sqlite`
- 隔离测试 authority：`tmp/runtime/migration-response-loss/task-copilot.sqlite`
- 测试材料：脱敏 Recovery Bundle；正文、内部 identity、token 和 API Key 均未进入截图或本报告

`f17f46a` 只给 Local Service 既有 fault port 增加 test-only `afterMigrationImport` 回调，并加入
自动回归；生产调用者不传该回调。Desktop 使用当前源码打包的一次性 wrapper，Plugin
artifact 未因该测试钩子改动，因此诊断仍显示 `757fac87d511`。

## 自动证据

- Local Service：`166/166` PASS；
- 新回归证明第一次请求先原子 Import，再在响应前抛错；ledger 为 `IMPORTED`、对象存在；
- 同一 idempotency replay 返回同一 batch 且 `replayed=true`；
- batch 可继续验证为 `VERIFIED`，无 PENDING/RECOVERY SemanticCommit；
- 根级 `./scripts/check.sh` PASS；
- stable rules：`145`；
- recovery rehearsal：`differences=[]`。

## Desktop 操作链

1. 安全结束正常 Plugin 会话并停用正常 LaunchAgent；
2. 从已验证 `PREVIEWED` 备份克隆 4 对象测试库；
3. 启动仅监听 loopback `19674` 的故障 Launcher，并让 Plugin reload 连接该克隆；
4. `更多 → 迁移`，重新选择同一脱敏 Bundle，只读核对 1 个未迁移项目；
5. 创建并校验计划原恢复基线，进入独立 HIGH Import 确认；
6. 勾选确认并导入；SQLite Import 完成后 fault hook 丢失 HTTP 响应；
7. UI 显示 `结果待确认 · 相同批次重试`，主结论 `先以台账为准`；同屏 ledger 已是
   `导入后待验证`，并给出 `验证本批`；
8. Plugin reload；不再保留 session fault 结论，只由 ledger 重建
   `已导入，等待验证` 和 `验证本批`；
9. 点击 Verify；用户层显示 `本批验证通过 · 尚未启用`；
10. 走既有 HIGH Undo；用户层显示 `本批已安全撤销`，正式对象回到导入前范围；
11. 安全结束故障会话，停止故障 Launcher，恢复原 descriptor 与 LaunchAgent，reload
    Plugin；正常 authority、7 对象、`0/0` 与用户系统状态 READY。

## 结构化读回

| 时点 | objects | migration run | batch | SemanticCommit PENDING / RECOVERY_REQUIRED |
|---|---:|---|---|---:|
| 导入前 | 4 | PREVIEWED | — | 0 / 0 |
| 响应丢失后 | 5 | IMPORTING | IMPORTED | 0 / 0 |
| Plugin reload 后 | 5 | IMPORTING | IMPORTED | 0 / 0 |
| Verify 后 | 5 | VERIFIED | VERIFIED | 0 / 0 |
| Undo 后 | 4 | PREVIEWED | UNDONE | 0 / 0 |
| 正常环境恢复 | 7 | 原 authority 不变 | 不适用 | 0 / 0 |

## 当前截图

- `p2-g-60-migration-high-confirmation-current-f17f46a.jpeg`
- `p2-g-61-migration-response-lost-ledger-authority-current-f17f46a.jpeg`
- `p2-g-62-migration-reload-ledger-rebuilt-current-f17f46a.jpeg`
- `p2-g-63-migration-verified-current-f17f46a.jpeg`
- `p2-g-64-migration-safe-undo-current-f17f46a.jpeg`
- `p2-g-65-migration-normal-runtime-restored-current-f17f46a.jpeg`

## 复杂度判断

- 新正式状态：`0`
- 新顶层导航：`0`
- 新 Recovery Kernel / 写入权威：`0`
- 新 Skill / Prompt / Validator：`0`
- 新生产恢复分支：`0`
- 删除的重复机制：不需要 Plugin 持久保存 `import-uncertain`；reload 后完全回到正式 ledger
- Provider 调用：`0`；Validator 拒绝率和模型重试不适用
- Partial 变化：Migration post-write response-loss / Service-interruption 代表子 Gate
  `PARTIAL → DONE`，P2-G 整体仍为 `PARTIAL`
