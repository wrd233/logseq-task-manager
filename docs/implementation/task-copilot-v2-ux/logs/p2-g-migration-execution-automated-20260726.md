# P2-G Migration Import / Verify / Undo 自动 Gate

日期：2026-07-26
branch：`feature/task-copilot-mvp`
实现提交：`e8044bd`、`593d14a`

## 已实现

- `GET /migration/runs/:runId` 现在返回同一 SQLite 权威中的有界 batch 列表；Plugin reload
  后可以重新发现 `IMPORTED`、`VERIFIED`、`UNDONE`，不把 batch identity 复制到 UI。
- 新的 `MigrationExecutionController` 只在当前 Plugin session 保存 Bundle、正式 run/batch/
  object/backup identity 和幂等键；UI snapshot 只得到 `migration-plan:n`、
  `migration-batch:n`、`migration-import-item:n`。
- `PREVIEWED → 重新选择同一 Bundle → 只读 hash/run/scope 核对 → 选择 1～50 项 →
  创建并校验恢复点 → HIGH 最终确认 → import → verify → HIGH undo` 使用既有
  Local Service / Application / SQLite 唯一迁移事务。
- import 响应丢失进入 `import-uncertain`，只允许保留同一 Bundle、恢复点、scope 与幂等键
  重试；verify/undo 结果不确定时要求先以 reload 后台账为准。
- 放弃批次准备会立即释放 Bundle、scope、backup ref 与幂等键；Graph/session restriction
  也会清理控制器。
- 尚未开放 Activate；这避免把批次主链完成误解为已经获得 V2 切换授权。

## 自动证据

- `MigrationExecutionController`：6/6，覆盖 identity 隐藏、错误 Bundle 零恢复点/零导入、
  有界 scope、恢复点 PASS、同键不确定重试、verify/undo 精确路由、clear 取消晚到结果；
- Plugin：312/312；
- Local Service + Persistence migration focused：64/64；
- Plugin、Local Service、Persistence、Service Client typecheck：PASS；
- 根级 `./scripts/check.sh`：PASS；145 条稳定规则覆盖，acceptance rehearsal
  `differences: []`，外层 repository boundary PASS；
- Service 集成证明 run details 在 import/verify/undo 后依次读回
  `IMPORTED → VERIFIED → UNDONE`；
- Persistence 证明 batch 列表按创建顺序从同一 SQLite ledger 重启安全读回。

## 安全结论

- UI/DOM 不包含 run ID、batch ID、Bundle hash、Backup ID、幂等键、正式 object ID 或正文；
- LLM、Provider 与 API Key 不参与本确定性 Slice；
- 正式导入前必须已有逐项 Review 计划和校验 PASS 的恢复点；
- Undo 继续复用既有后续修改/引用保护，审阅、验证和 Audit 证据不删除；
- Activation、失败注入/恢复、Service 中断续跑、Light/窄栏仍是开放 Gate。
