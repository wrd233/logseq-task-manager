# P2-G Migration 只读材料扫描自动 Gate

日期：2026-07-26
状态：`MIGRATION_READONLY_SCAN_AUTOMATED_REVIEW_AND_WRITE_OPEN`

## 用户纵向链

```text
Migration 工作区
→ 用户明确选择本地 V1 Recovery Bundle JSON
→ 客户端先检查 2 B～8 MiB 与 JSON
→ Local Service /migration/scan
→ Bundle checksum/readback、无损恢复、未完成 Commit 检查
→ SQLite Doctor 前后严格一致
→ 用户层分类摘要
→ 放弃 / reload / Graph switch 清空
```

## 当前实现

- 文件内容只进入当前插件内存和一次 Local Service 请求，不写 Graph、SQLite、FileStorage、
  设置、日志或截图；
- `MigrationScanController` 使用 generation 使 clear/Graph switch 后的迟到响应失效，并阻止
  重复扫描；
- Plugin snapshot 只暴露总数、初步可直接迁移、需要确认、保持普通内容和结构冲突计数，
  不暴露 `legacyObjectId`、evidence ref、reason code、Bundle hash 或正文；
- Service 继续作为只读校验权威：Recovery Bundle 结构/checksum、round-trip、PENDING/
  RECOVERY_REQUIRED 检查，以及 SQLite Doctor 前后零变化；
- 成功只说明“尚未创建迁移计划、正式变化 0”；失败保留可重试入口，不复用旧摘要；
- 用户可以显式“放弃这份材料”；Plugin reload 自然清空内存，Graph switch/restricted
  也显式 clear。

## 自动证据

- `migration-scan-controller.test.ts`：4/4 PASS；
- Migration workspace focused UI：3/3 PASS；
- Plugin typecheck：PASS；
- snapshot identity/privacy assertions：PASS；
- Preview、decisions、Backup、Import、Verify、Activate、Undo action：均未开放。

## 仍开放

下一步必须复用同一 session Bundle 和现有 `previewLegacyMigration`：

1. 把每条机器 Preview 翻译成有界、可阅读的逐项决定；
2. 对非直接映射和用户调整强制填写真实审阅理由；
3. 所有决定完整后才创建 server-owned migration run；
4. 恢复点、≤50 项批次、HIGH 确认、verify、activate 和 Undo 继续复用既有 Service 链；
5. invalid/stale/restart/failure/Undo 与最新 Desktop 截图仍需闭环。

因此只读 scan 从 `NOT_STARTED` 进入 `AUTOMATED_DONE`，Migration 向导、P2-G 与整体 Goal
继续 `IN_PROGRESS`。
