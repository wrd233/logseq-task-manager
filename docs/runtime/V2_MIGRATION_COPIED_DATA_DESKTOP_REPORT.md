# V2 copied-data 迁移 Desktop Report

日期：2026-07-22
状态：`E2E14_COPIED_DATA_DESKTOP_PASS`

## 结论

在 Logseq Desktop 0.10.15、V1 Pilot 后只读 Recovery Bundle 与隔离 SQLite schema v11 中，真实完成：

```text
Scan（零正式写）
→ 完整人工 Decisions
→ Preview
→ Backup create/validate
→ 小批 Import
→ 重复 Import 幂等
→ Service 中断/重启后 show 续作
→ Verify
→ 单批 Undo
→ 新幂等键重试 Import/Verify
→ 显式 Activate
→ Plugin 只读迁移工作区与对象读回
```

源 Recovery Bundle 的文件 SHA-256 仍为 `4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`；迁移校验器的 canonical bundle hash 为 `1e386f832cf662c30b660f152213bf858117185db019293c3733b69c45f826d8`。源文件、V1 FileStorage 与 Graph 正文均未被修改。

## 真实 copied-data 与安全失败

1. Scan 读取 8 个 V1 正式对象，返回 4 个 `DIRECT_BIND`、4 个 `STRUCTURAL_ERROR`、0 个正式写入。四个源内冲突对象保持 `EXCLUDE` 并保留审阅说明。
2. 首轮测试把四个 `DIRECT_BIND` 一批导入，重复请求返回 `replayed=true`。Service 在 `IMPORTING` 时真实中断并以同一数据库重启，`migration show` 和 Plugin 迁移卡片仍显示 Run、8/4/4 计数与恢复点。
3. 重启后的既有 Anchor reconciliation 发现 Pilot Task 与 MiniProject 的源 Primary Anchor 已无法在当前 Test Graph 解析，分别执行已有 `observe_primary_anchor`，对象版本从 1 变为 2、Anchor 变为 `missing`。Migration Verify 因当前投影已经变化而明确拒绝；Run 没有 Activate，SQLite integrity 仍为 `ok`，Doctor 只有 2 个 Anchor warning。这不是假成功，也没有新增补漏路径。
4. 同轮 Logseq API 只读检查还确认 Pilot Project 的旧 page UUID 已无法解析。因此最终人工 Decisions 只导入当前 Block UUID 仍可读且正文 hash 一致的 Task，其余 7 项均保留为迁移证据或等待显式 Anchor 修复。

## 最终通过路径

1. CLI 缺少 `IMPORT_REVIEWED_V1_BATCH`、`UNDO_MIGRATION_BATCH` 或 `ACTIVATE_V2_SQLITE` 时均以退出码 2 在发送请求前停止；对象数不变。
2. 新隔离库 Preview 为 8 项已审阅、1 项导入、7 项排除；Backup `backup_20260722091614656_3b489bae797b4d049f643fd19689d24d` 创建与只读校验均 PASS，schema 11、integrity `ok`、foreign-key violations 0、对象 0。
3. 第一批 `migration-batch:desktop-copied-data-clean-batch-1` 导入 1 个真实 V1 Task；同请求重放不重复写入。Service 中断/重启并等待 Desktop Anchor reconciliation 后，对象仍 `v1 / OPEN / ACTIONABLE`，Anchor 仍 `active`，随后 Verify checksum `f0f3fb6c` PASS。
4. 单批 Undo 将对象数恢复为 0，批次为 `UNDONE`，Audit 保留 `migrate_v1_object 0→1` 与 `undo_v1_migration 1→0`。
5. 第二批使用新幂等键重新导入同一对象，Verify PASS 后才显式 Activate。最终 Run 为 `ACTIVATED`；第一批 `UNDONE`、第二批 `VERIFIED`，当前对象 1、active Primary Anchor 1、Focus/Proposal/SemanticCommit 0。
6. Plugin 迁移工作区真实显示 `PREVIEWED → IMPORTING → VERIFIED → ACTIVATED`、Run ID、审阅计数、截断 source hash、恢复点和明确下一步；页面没有 input/textarea/select，也不接收 Bundle 或执行写入。激活后对象工作区能读取同一 SQLite Task。
7. 最终 Backup validate PASS；Doctor 为 12 PASS / 0 WARN / 0 FAIL / 2 INFO，SQLite integrity `ok`、foreign-key violations 0、Pending/Recovery Commit 0。

## 边界与后续

- 本 Gate 证明设计要求的“手动、小范围、可审阅、幂等、可撤销、可中断继续、单一激活”路径，不把源 Bundle 中已失效的 Anchor 冒充可迁移成功。
- 当前 Preview 基于 Recovery Bundle 内证据；当前 Graph Anchor 的变化由导入后的既有 reconciliation 与 Verify 保护发现。以后若优化低摩擦预检，应复用现有 Graph broker/Anchor 检查，不新增扫描器、第二权威或平行迁移状态。
- 本轮使用专用 Test Graph 和隔离数据库，未批量修改用户正式 Graph。

## 复杂度结论

没有新增表、状态、协议、扫描器、恢复器、双写或 SemanticCommit 类型。迁移继续只使用既有 Recovery Bundle 校验、`migration_runs`/`migration_batches`/`legacy_evidence`、Application Command、SQLite 事务、Backup、Doctor、Anchor reconciliation 与 CLI 精确确认。
