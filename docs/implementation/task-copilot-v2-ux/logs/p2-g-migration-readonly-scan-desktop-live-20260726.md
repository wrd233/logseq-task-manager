# P2-G Migration 只读材料扫描 Desktop Gate

日期：2026-07-26
状态：`READONLY_SCAN_DESKTOP_DONE_ITEM_REVIEW_AND_WRITE_OPEN`

## 当前构建

- branch：`feature/task-copilot-mvp`
- commit：`15b976d28ec3e99579fcc15782071fb78108be3f`
- Plugin build：2026-07-26 13:05:01 +0800
- Plugin / Local Service / Launcher：`0.1.0`
- Logseq Desktop：`0.10.15`
- 测试 Graph：`logseq`
- 宿主主题 / viewport：Dark / `994×700`
- 运行性质：真实 Plugin、Launcher、Local Service 与 SQLite；输入是忽略目录中的专用脱敏
  Recovery Bundle，不含个人正文。

## 真实操作链

1. reload 前诊断仍显示旧 build，因此不计证据；重新构建后 reload，展开诊断确认 exact
   commit `15b976d28ec3`；
2. 进入“更多 → 迁移”，入口明确只读、不会扫描 Graph、不会创建迁移计划；
3. 通过原生 macOS 文件选择器明确选择 2 KB 脱敏 Recovery Bundle；
4. 点击“只读检查”，真实 `/migration/scan` 返回 2 项：1 项初步可直接迁移、1 项建议
   保持普通内容、0 项需要确认、0 项结构冲突；
5. 用户层结果明确“正式变化 0”“尚未创建迁移计划”，不显示正文、object ID、evidence、
   checksum、Bundle hash、run ID 或恢复点；
6. 点击“放弃这份材料”，文件选择和扫描摘要立即清空；
7. 再次扫描同一材料后直接 reload，重新进入迁移时仍为“未选择任何文件 / 还没有迁移
   计划”，证明 session 数据未跨生命周期保留；
8. 选择非法 JSON，前台只显示“不是合法 Recovery Bundle JSON；没有发起扫描”，可重新
   选择，不残留上一次摘要；
9. 最后展开系统状态：Runtime / Store / Service READY、commit `15b976d28ec3`、
   Pending / Recovery / Source Conflict `0/0/0`。SQLite 只读回查为 migration runs `0`、
   batches `0`、PENDING `0`、RECOVERY_REQUIRED `0`，`PRAGMA integrity_check=ok`。

## CURRENT 截图

- `p2-g-20-migration-readonly-scan-entry-current-15b976d.jpeg`
- `p2-g-21-migration-readonly-scan-result-current-15b976d.jpeg`
- `p2-g-22-migration-readonly-scan-abandoned-current-15b976d.jpeg`
- `p2-g-23-migration-readonly-scan-reload-cleared-current-15b976d.jpeg`
- `p2-g-24-migration-readonly-scan-invalid-current-15b976d.jpeg`
- `p2-g-25-migration-readonly-scan-build-health-current-15b976d.jpeg`

所有截图均来自同一真实 build；此前没有 Migration 新入口的当前截图，因此没有用旧图替代
本 Gate。

## 交互评估

- 主结论清楚：用户先看到“正式变化 0”，再看到分类计数；
- 操作保持在 Task Copilot 内，仅文件选择使用宿主原生窗口；不要求终端、路径、UUID 或
  CLI；
- 用户可理解“放弃”和 reload 清空，不需要理解 session/controller；
- 失败没有工程错误或内部 Bundle 文件名；可靠内容不会被旧摘要覆盖；
- 当前 Dark Logseq 上 Plugin 仍是浅色表面，不能据此关闭 Light/Dark 视觉 Gate；
- 逐项审阅入口尚未开放，所以这不是完整 Migration 向导，也没有 Preview、Recovery point、
  Import、Verify、Activate、failure resume 或 Undo 的 Desktop 证据。

## 结论

Migration ledger 翻译与 session-only 只读扫描从 `AUTOMATED_DONE_DESKTOP_OPEN` 进入
`READONLY_SCAN_DESKTOP_DONE`。P2-G 继续 `IN_PROGRESS`；下一关键路径是把同一内存材料
翻译成逐项用户决定，并复用既有 Preview → Recovery point → Import → Verify → Activate /
Undo 安全状态机。
