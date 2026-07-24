# 0008：独立 Launcher 持有 Graph-bound Local Service 生命周期

状态：ACCEPTED
日期：2026-07-24

## 背景

真实 Logseq Desktop 0.10.15 的 Plugin iframe 不提供 `globalThis.require` / `window.require`，
`@logseq/libs` 也没有受支持的 spawn/exec/process 生命周期 API。让插件直接创建 Node 20
子进程会依赖未公开宿主能力；继续要求用户在终端手工启动 Service，又不满足日常产品体验。

同时必须保持以下边界：

- SQLite 是每个 Graph 唯一领域状态源；
- Plugin、CLI 与 Agent 的正式写入仍只经过 Local Service；
- 不得杀死非 Task Copilot Launcher 启动的进程；
- token、Graph 路径和 API Key 不进入设置、Graph、普通日志或 Git；
- Logseq/Plugin 崩溃后不得遗留长期 orphan Service；
- 未配置的新 Graph 必须 fail closed，不能复用上一 Graph 数据库。

## 决定

采用独立、认证、仅绑定 `127.0.0.1` 的 Task Copilot Launcher，由 macOS LaunchAgent
`com.task-copilot.launcher` 在登录会话中保持可用。

1. 一次性 installer 将版本化 Launcher、Service bundle、Skills 与 SQLite native runtime
   安装到用户私有 Application Support；日常打开 Logseq 不再需要终端。
2. Launcher 配对 descriptor 与配置均为非链接 0600 文件；LaunchAgent plist 不含 token、
   Graph 路径、数据库路径或 shell command。
3. Plugin 只向 Launcher 发送当前 Graph path 的 SHA-256 稳定键和本次插件实例 ID，不发送
   原始路径。Launcher 只接受显式配置的 `graph_key → graph_id → database_path` 映射。
4. 每个 Plugin 实例取得独立租约并持续 heartbeat；多个租约复用同一 Graph Service，最后
   一个租约释放或过期后才停止该 Service。
5. Launcher 只保存并停止自己 `spawn(..., { shell:false, detached:false })` 返回的精确
   ChildProcess；未知 live descriptor 等待自停后仍存活则拒绝接管。
6. Launcher 启动 Service 时传入精确 owner PID。Service 监视该 PID；Launcher 被强杀时，
   orphan Service 自行安全关闭。launchd 拉起新 Launcher 后可创建新租约和新 Service。
7. Plugin unload 释放自己的租约。显式“结束本次 Task Copilot”先检查
   `PENDING/RECOVERY_REQUIRED` Commit 与正文 reconciliation；有未完成事项时转到恢复视图，
   不结束。折叠 UI 不释放租约。
8. Graph switch 先进入受限态并释放旧租约，再计算新 Graph key 并重新发现；未配置 Graph
   显示独立受限原因，正式写入保持关闭。
9. 旧的直接 Service descriptor 只作为兼容连接保留；它没有 Launcher ownership，也不会
   获得“结束 owned Service”的产品按钮。

## 后果

- 日常启动路径不依赖 Logseq iframe 的未公开 Node 能力；
- Launcher 常驻但 Service 按 Graph 使用期存在，关闭边界可证明；
- crash、租约过期、最后租约释放和 launcher restart 均有真实进程证据；
- 一次性安装目前仍依赖本机受支持 Node 20；installer 优先写入 Homebrew `opt` 稳定路径，
  后续发行包可内置 runtime 而不改变协议；
- P0-H 仍需补真实 Desktop 的 reload、显式结束/重启、Logseq 退出和 Graph switch 截图证据，
  在这些 Gate 完成前不得标记整体 DONE。
