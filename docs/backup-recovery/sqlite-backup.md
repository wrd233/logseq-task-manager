# SQLite Backup 与 Restore 安全边界

## 当前已实现

- Backup 只能经过已认证的 Local Service 创建；
- 客户端不能提供目标路径、文件名或覆盖选项；
- 默认目录为 SQLite 主库同级的 `backups/`，目录权限 0700，快照权限 0600；
- 文件先写入同目录随机临时名，再通过硬链接原子占用最终名，已有目标不会被覆盖；
- 创建后立即以 readonly + fileMustExist 打开，校验 schema、Graph identity、integrity、foreign keys 和 object count；
- Restore Validate 只接受服务端生成的 `backup_id`，不修改快照字节；
- 错误响应只包含结构化 code/message，不返回本机路径、SQLite cause、stack 或 session token。
- schema v3 建立 SemanticCommit step ledger，schema v4 增加 Proposal/Group 审阅表，schema v5 解耦 immutable Audit 与当前 Object 投影以支持严格 Undo，schema v6 增加 nullable Task `due_at`，schema v7 增加有界 V1 迁移 run/batch/evidence 账本；migration ledger 只追加，旧 schema 的显式升级在 DDL 前另建经校验的不覆盖快照。

Service 维护二进制提供独立显式模式，不启动 HTTP、Provider 或 descriptor：

```bash
task-copilot-service migrate-schema --database <db> --graph-id <graph> --backup <new-backup-path>
```

Backup 路径必须不存在；快照必须先通过来源 schema/Graph/integrity/foreign-key 校验，之后 DDL、ledger、metadata 和 `user_version` 才在一个事务中切换。
- persistence Node 边界已实现未对外开放的 `restoreOffline` 原语：要求主库、候选快照、恢复点路径互不相同，先验证候选快照，再为当前主库创建并验证恢复点，通过同目录 rename 激活快照，重开 Doctor 失败时回滚原库；
- fault injection 已证明激活后失败会恢复原主库，且恢复前快照保留。

## Restore Apply 已实现的边界

`POST /backup/restore/validate` 不是 Restore。它不会：

- 停止当前 Service；
- 替换、删除或重命名当前 SQLite；
- 自动从 FileStorage 迁移；
- 切换 Graph 主权；
- 绕过用户确认。

实际 Apply 路由要求固定确认短语，不接受客户端路径，且会关闭 live Store 后调用 `restoreOffline`。成功或失败后 Service 都停止并删除 descriptor，禁止在未重启验证时继续写入。

## 实际 Restore 的后续 Gate

自动 Service Gate 已覆盖：

1. 显式高影响确认，无确认零变化；
2. Restore 开始后拒绝新请求并关闭 live Store；
3. 通过已测试的离线 Restore 原语创建当前库恢复点、校验候选 Backup、原子切换并执行 Doctor；
4. 任一检查失败即回滚原库，且保留恢复前快照和诊断证据；
5. 返回恢复前 Backup ID 和 Doctor，删除 descriptor 并停止 Service。

CLI 显式命令与真实进程 create→restore→stop→restart→Doctor 冒烟已通过。Desktop 集中验收仍未完成，因此 E2E-17 仍不标记 DONE。
