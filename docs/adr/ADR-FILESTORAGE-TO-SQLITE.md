# ADR：FileStorage 只读迁移至 SQLite

- 状态：accepted
- 日期：2026-07-20
- 关闭决定：OD-002
- 影响规则：D-189..204；V2 §33-35、§51、§53-56

## 背景

V1 使用 checksummed A/B FileStorage JSON 并已验证恢复；V2 要求 SQLite 是唯一当前领域状态源，Plugin、CLI 和 Agent 共用 Local Service。长期双写无法证明提交顺序、一致性、Undo 和恢复权威。

## 决定

采用以下单向交接：

```text
FileStorage / A-B Slot
→ 冻结字节与只读恢复包
→ 用户显式启动迁移
→ 扫描、预览和语义校验
→ 小批次事务写入 SQLite
→ object_id / Anchor / Commit / checksum 一致性验证
→ 用户显式切换
→ SQLite 成为唯一当前状态源
```

FileStorage 迁移适配器只读。安装和升级不自动迁移；迁移前必须创建恢复点；每批有稳定 idempotency key、事务/保存点、状态、报告和逆操作；允许中断、继续、重试、跳过异常和撤销单批。切换后禁止 FileStorage/SQLite 双写，旧数据只作为历史证据和回滚输入。

## 失败与回滚

- 扫描/预览失败：零 SQLite 正式写入；
- 单批失败：回滚该事务并保留诊断；
- 校验失败：不得切换；
- 切换后发现 P0/P1：停用 V2 写入，恢复迁移前快照，不回退到双写；
- 未知 Schema 或 checksum 错误：只读隔离，绝不以空库覆盖。

## 验收

- 重复迁移不创建重复 object_id、Anchor、Commit 或事件；
- 中断后可从最后完成批次继续；
- 单批 Undo 后 Doctor 通过；
- 切换前后均能证明唯一当前状态源；
- 恢复包字节、校验和及映射报告可追溯。
