# P2-G Migration 账本状态翻译自动 Gate

日期：2026-07-26
状态：`MIGRATION_LEDGER_TRANSLATION_AUTOMATED_WIZARD_OPEN`

## 发现

底层 Migration 已有 scan、review preview、backup、import、verify、undo、activate 和重启
续作能力，但插件只读卡片仍直接显示：

- Migration Run ID；
- Recovery Bundle SHA-256 前缀；
- Backup ID；
- `PREVIEWED / IMPORTING / VERIFIED / ACTIVATED` 原始状态；
- `tc migration show` 等开发者式下一步。

这些值属于 Audit/诊断证据，不是用户完成迁移时应理解的概念。

## 本轮修改

- 状态翻译为“等待确认导入 / 导入后待验证 / 验证通过，等待启用 / 迁移已完成 /
  需要检查”；
- 卡片只显示迁移计划序号、更新时间和导入/暂缓/排除数量；
- 下一步说明使用恢复点、本批范围、验证、启用和安全停止等用户概念；
- Run ID、Bundle hash 与 Backup ID 不再出现在日常 UI；
- 安全边界折叠说明 Recovery Bundle 只读、Local Service 单一写入口、恢复点前置和可撤销
  条件；
- 没有 Run 时明确“插件内新迁移材料审阅入口尚未开放”，不伪装已产品化；
- 不新增 file input、bundle persistence、import/activate/undo 按钮或正式写入口。

## Gate

本轮只关闭 `MIGRATION_LEDGER_TRANSLATION_AUTOMATED`。完整产品化向导仍需：

1. 本地 Recovery Bundle 的受控选择、大小/Schema/Graph 边界与内存生命周期；
2. 逐项审阅决定而不是 decisions JSON；
3. 恢复点、批次范围和 HIGH 影响确认；
4. import → verify → activate 的显式状态机；
5. failure、restart、Undo 与当前 Graph Desktop 证据。

因此 P2-G 与整体 Goal 继续 `IN_PROGRESS`。
