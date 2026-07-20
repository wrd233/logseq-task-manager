# SQLite Backup 与 Restore 安全边界

## 当前已实现

- Backup 只能经过已认证的 Local Service 创建；
- 客户端不能提供目标路径、文件名或覆盖选项；
- 默认目录为 SQLite 主库同级的 `backups/`，目录权限 0700，快照权限 0600；
- 文件先写入同目录随机临时名，再通过硬链接原子占用最终名，已有目标不会被覆盖；
- 创建后立即以 readonly + fileMustExist 打开，校验 schema、Graph identity、integrity、foreign keys 和 object count；
- Restore Validate 只接受服务端生成的 `backup_id`，不修改快照字节；
- 错误响应只包含结构化 code/message，不返回本机路径、SQLite cause、stack 或 session token。

## 当前明确未实现

`POST /backup/restore/validate` 不是 Restore。它不会：

- 停止当前 Service；
- 替换、删除或重命名当前 SQLite；
- 自动从 FileStorage 迁移；
- 切换 Graph 主权；
- 绕过用户确认。

因此当前证据只能支持“Backup 创建与 Restore 前只读校验”，不能宣称 SQLite Restore Gate 已通过。

## 实际 Restore 的后续 Gate

后续 Restore 必须在同一 Local Service 运行控制下完成：

1. 显式高影响确认；
2. 拒绝新的正式写入并排空进行中事务；
3. 为当前主库创建并校验恢复前快照；
4. 只读校验候选 Backup；
5. 在受控停机窗口原子切换；
6. 重开后运行 Doctor 与 Graph identity 校验；
7. 任一检查失败即回滚到恢复前快照，且保留诊断证据；
8. 再通过 CLI 集成测试和 Desktop 集中验收。

未满足上述 Gate 前，不开放 Restore Apply 路由。
