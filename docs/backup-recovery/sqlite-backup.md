# SQLite Backup 与 Restore 安全边界

## 当前已实现

- Backup 只能经过已认证的 Local Service 创建；
- 客户端不能提供目标路径、文件名或覆盖选项；
- 默认目录为 SQLite 主库同级的 `backups/`，目录权限 0700，快照权限 0600；
- 文件先写入同目录随机临时名，再通过硬链接原子占用最终名，已有目标不会被覆盖；
- 创建后立即以 readonly + fileMustExist 打开，校验 schema、Graph identity、integrity、foreign keys 和 object count；
- Restore Validate 只接受服务端生成的 `backup_id`，不修改快照字节；
- 错误响应只包含结构化 code/message，不返回本机路径、SQLite cause、stack 或 session token。
- schema v2 记录只追加 migration ledger；旧 schema 的显式升级在 DDL 前另建经校验的不覆盖快照。
- persistence Node 边界已实现未对外开放的 `restoreOffline` 原语：要求主库、候选快照、恢复点路径互不相同，先验证候选快照，再为当前主库创建并验证恢复点，通过同目录 rename 激活快照，重开 Doctor 失败时回滚原库；
- fault injection 已证明激活后失败会恢复原主库，且恢复前快照保留。

## 当前明确未实现

`POST /backup/restore/validate` 不是 Restore。它不会：

- 停止当前 Service；
- 替换、删除或重命名当前 SQLite；
- 自动从 FileStorage 迁移；
- 切换 Graph 主权；
- 绕过用户确认。

因此当前证据只能支持“Backup 创建与 Restore 前只读校验”，不能宣称 SQLite Restore Gate 已通过。

`restoreOffline` 是底层已验证原语，不是用户入口。它明确要求调用者先停止 Service 接收请求并关闭 live Store；当前没有 HTTP/CLI/Plugin 路由能调用它。

## 实际 Restore 的后续 Gate

后续 Restore 必须在同一 Local Service 运行控制下完成：

1. 显式高影响确认；
2. 拒绝新的正式写入并排空进行中事务；
3. 通过已测试的离线 Restore 原语创建当前库恢复点、校验候选 Backup、原子切换并执行 Doctor；
4. 任一检查失败即回滚原库，且保留恢复前快照和诊断证据；
5. Service 进程退出，由用户显式重启后再对新主库执行一次 status/Doctor；
6. 再通过 CLI 集成测试和 Desktop 集中验收。

未满足上述 Gate 前，不开放 Restore Apply 路由。
