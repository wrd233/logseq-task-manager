# P2-G Migration 只读材料扫描自动 Gate

日期：2026-07-26
状态：`MIGRATION_READONLY_SCAN_AUTOMATED_AND_DESKTOP_DONE_REVIEW_AND_WRITE_OPEN`

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
- 成功只说明“尚未创建迁移计划、正式变化 0”；失败只按受控 transport 类别显示少量
  用户层说明，不复用旧摘要，也不透传 Service message、内部 Bundle 文件名、hash 或 identity；
- 用户可以显式“放弃这份材料”；Plugin reload 自然清空内存，Graph switch/restricted
  也显式 clear。

## 自动证据

- `migration-scan-controller.test.ts`：6/6 PASS；
- Migration workspace focused UI：4/4 PASS；
- Plugin typecheck：PASS；
- snapshot identity/privacy assertions：PASS；
- 恶意远端 message（内部文件名、checksum、identity、hash）到 controller snapshot 与最终 HTML
  均为 0 泄漏；
- Preview、decisions、Backup、Import、Verify、Activate、Undo action：均未开放。

## 双轴审查

- Standards：PASS。只读 Service 权威、session 生命周期、Graph switch/受限模式清空、
  identity-free projection 与不双写边界均保持；
- Spec：首次审查指出失败态透传远端 `error.message` 会泄漏内部恢复包结构；
- 修复：按 `SERVICE_TIMEOUT`、`SERVICE_UNAVAILABLE`、`SERVICE_UNAUTHORIZED`、
  protocol/response incompatibility 与 generic failure 映射受控文案；原始远端 message 不进入
  snapshot 或 HTML；
- 修复后 focused tests 与 typecheck：PASS。

## 仍开放

下一步必须复用同一 session Bundle 和现有 `previewLegacyMigration`：

1. 把每条机器 Preview 翻译成有界、可阅读的逐项决定；
2. 对非直接映射和用户调整强制填写真实审阅理由；
3. 所有决定完整后才创建 server-owned migration run；
4. 恢复点、≤50 项批次、HIGH 确认、verify、activate 和 Undo 继续复用既有 Service 链；
5. invalid/stale/restart/failure/Undo 与最新 Desktop 截图仍需闭环。

因此只读 scan 从 `NOT_STARTED` 进入 `AUTOMATED_DONE`，Migration 向导、P2-G 与整体 Goal
继续 `IN_PROGRESS`。

后续 current build Desktop Gate 已完成，见
`p2-g-migration-readonly-scan-desktop-live-20260726.md`；本文件继续作为自动证据，不用
Desktop 结果覆盖其边界。
