# V2 SQLite Restore Desktop Report

日期：2026-07-22
状态：`E2E17_SQLITE_RESTORE_DESKTOP_PASS`

## 结论

在 Logseq Desktop 0.10.15、隔离 SQLite schema v11 与真实 Local Service 进程中完成：

```text
Task v2 建立快照
→ 快照后修改为 v3
→ 缺少固定确认时零请求
→ Restore 原子激活 v2 快照并创建 v3 恢复点
→ descriptor 删除、Service 进程退出
→ Plugin 自动进入 READ_ONLY_SAFE_MODE
→ 同一 SQLite 重启 Service
→ Plugin 恢复 READY 并读回 Task v2
→ Backup validate 与 Doctor PASS
```

最终活动库中的 Task 为 `v2 / OPEN / ACTIONABLE / due_at null`；Restore 前自动建立的恢复点保留 `v3 / due_at 2026-07-30T09:00:00.000Z`。这同时证明恢复动作没有覆盖可回退的当前状态。

## 真实路径

1. 使用当前 Test Graph 中仍可解析的一个 Task Block，在专用隔离库建立一个正式 Task；快照 `backup_20260722092957621_ae9be002e2ef438ebd23685e47acb2be` 校验为 schema 11、integrity `ok`、foreign-key violations 0、对象 1。
2. 快照后只通过已有 Application Command 设置期限，使同一对象从 v2 变为 v3。Plugin 对象工作区真实显示 `TASK · OPEN · ACTIONABLE · v3`。
3. CLI 缺少 `--confirm RESTORE_AND_STOP_SERVICE` 时以退出码 2 在加载 descriptor 和发送请求前停止。
4. 正确确认后 Service 返回 `RESTORED_SERVICE_STOPPING`，创建恢复点 `backup_20260722094222841_510b46b80fd743a8991e25e0c7537cf6`，删除 0600 descriptor，并在 Desktop bridge 断开后退出真实进程。
5. Restore 激活后的活动库保留同一 object_id，但恢复为 v2 且 `due_at` 为空；恢复点只读检查保留 v3 与期限。两个 Backup 均通过 Service 端 validate。
6. 同一 SQLite 文件重启后，Plugin 无需接触 Graph 正文即可恢复 `Runtime READY / Store READY`，对象工作区读回 v2。最终 Doctor 为 12 PASS / 0 WARN / 0 FAIL / 2 INFO，Graph bridge、SQLite、schema、Anchor、Identity、Proposal、Commit、Backup、Key reference、Skill 与协议均 PASS。

## Desktop 发现与修复

第一次真实 Restore 发现：Service 已删除 descriptor 且 CLI 无法再连接，但 Plugin 仍显示 READY，并每秒重复记录 `GRAPH_READ_BRIDGE_TRANSPORT_FAILED`；长轮询连接还延迟了 Service 进程退出。

修复没有增加恢复器或状态源：

- Graph read bridge 首次传输失败后立即停止，不再对已停止的 Service 无限轮询；
- 复用现有 `ServiceConnectionState`、`ExplicitSyncController.pause()` 与 Diagnostics restricted 表示；
- Plugin 自动切换为 `READ_ONLY_SAFE_MODE / RESTRICTED / formal writes false`，Graph 正文仍由 Logseq 正常持有；
- Service 重启后仍通过同一个私有 descriptor key 和现有 settings refresh 恢复，没有第二连接协议或后台补漏器。

修复后的第二轮 Restore 中，结构化日志只出现一次 `graph_read_bridge_transport_failed`，结果为 `restricted`；bridge 与 explicit sync 都停止，Service 进程在 Logseq 仍运行时退出。随后同库重启与 descriptor 刷新恢复 READY。

## 安全与边界

- 测试只使用专用 Test Graph 的只读 Block 身份和隔离数据库，没有修改正式 Graph 正文。
- Backup/数据库/descriptor 权限分别保持 0600，运行目录为 0700。
- 没有记录 Provider Key、descriptor token、原始请求头或用户正式 Graph 数据。
- Restore 继续只接受服务端 Backup ID 和固定确认短语；Plugin 不接收路径、不直接打开 SQLite，也不执行 Restore。

## 复杂度结论

没有新增表、状态、协议、扫描器、恢复器、兼容路径、SemanticCommit 类型或写入口。唯一代码变化是把既有 transient Graph bridge 的失败出口接入既有受限状态，并停止无价值的重试循环；它直接修复了本 Gate 的陈旧 READY、日志风暴与停服延迟。
