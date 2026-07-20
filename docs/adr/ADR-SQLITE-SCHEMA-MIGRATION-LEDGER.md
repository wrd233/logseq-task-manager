# ADR：SQLite Schema 迁移必须显式快照并记入 Ledger

- 状态：accepted
- 日期：2026-07-20
- 关联：OD-009，V2 §34、§51、§53-56

## 决定

SQLite 同时使用 `PRAGMA user_version`、`schema_meta.schema_version` 和只追加的 `schema_migrations` ledger。三者必须一致；任一缺失或不一致时拒绝当前写入。

`initialize()` 只创建当前 schema 或验证已是当前版本的数据库。它不自动升级旧 schema；检测到可支持的旧版本时返回 `V2_SCHEMA_MIGRATION_REQUIRED`。

显式 schema 升级必须：

1. 确认 Graph identity 与版本元数据；
2. 在调用者指定的受控目录创建不覆盖的 0600 快照；
3. 以只读方式校验快照的 schema、Graph、integrity 和 foreign keys；
4. 在单一 SQLite 事务中执行 DDL、ledger 追加、metadata 和 `user_version` 切换；
5. 失败时整笔回滚，保留迁移前快照，允许显式重试。

## 当前路径

schema v2 引入 `schema_migrations`，schema v3 引入受约束的 `semantic_commits` / `semantic_commit_steps`，schema v4 引入 `proposals` / `proposal_groups`，schema v5 解耦 immutable `audit_events.object_id` 与当前 `objects` 投影。已实现 v1/v2/v3/v4 → v5：

- v1 `initial_core_schema` 以原 `schema_meta.created_at` 作为应用时间；
- v2 `add_schema_migration_ledger` 记录显式升级时间；
- v3 `add_semantic_commit_step_ledger` 以 Commit 状态、序号、step kind/status、before/after hash 和 error code 作为 Saga 恢复基础；
- Commit 必须先以 PENDING 和连续 PREPARED steps 原子落盘；step 只能按受控路径推进，COMPLETED 要求全部 VERIFIED，FAILED 不得保留 APPLIED/RECOVERY_REQUIRED；
- RECOVERY_REQUIRED 可在重启后查询，只有未恢复 step 转为 COMPENSATED 后才能收口为 FAILED；prepare 重放只对不变 identity/payload 幂等。
- v1 的 ledger 补建与 v3 DDL 在同一事务，v2 必须先验证现有两条 ledger 再追加 v3；
- v4→v5 在同一事务重建 Audit 表并完整复制历史行；迁移后 Undo 可删除当前 Object/Anchor，但历史 object_id 不丢失；
- 重复调用对当前 v5 返回 `migrated=false`，不重复快照或 ledger 记录；
- 高于当前程序的 schema 不自动降级。

## 边界

这是 V2 SQLite 内部 schema 进化，不是 V1 FileStorage → V2 SQLite 的产品数据迁移。两者都需显式、可恢复，但不共用批次状态机，也不引入双写。
