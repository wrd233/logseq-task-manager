# P0-H Hidden Plugin Reload 自动恢复 Desktop Gate

日期：2026-07-25

环境：Logseq Desktop 0.10.15、已安装 LaunchAgent、隔离测试 Graph

结论：`RELOAD_AUTO_RECOVERY_DONE`

## 发现

真实 Plugin reload 暴露了一个宿主调度边界：Logseq 隐藏 Plugin iframe 在启动早期调用
`App.getCurrentGraph()` 时可能永久不返回，同时 iframe timer 也不推进。因此
`Promise.race + setTimeout` 不能作为 bootstrap 的可靠逃生门；旧实现会把初始化停在
`BOOTSTRAPPING`，直到用户主动打开 Task Copilot 面板。

这不是 Service 不可用，也不是允许使用 Graph name 猜数据库身份的理由。安全要求仍是：
取得宿主提供的精确 Graph path/url，派生稳定 Graph key 后，才可向 Launcher 请求该 Graph 的
Service lease。

## 修正

- bootstrap 不再等待 `getCurrentGraph()`；
- Settings、命令、主 UI、事件、只读安全状态立即完成初始化；
- `onGraphAfterIndexed`、`onRouteChanged` 和 `onCurrentGraphChanged` 触发同一有界恢复；
- 启动和 Graph switch 都先恢复精确 Graph identity，再发现对应 Launcher/Service；
- identity 仍不可用时保持 `READ_ONLY_SAFE_MODE`，不复用上一 Graph、不猜 identity、不写入；
- Service 恢复继续复用 generation、lease release、heartbeat 和正式写入开关。

## 自动证据

- TDD source contract 先因缺少 non-blocking/host-ready recovery 失败，修正后 PASS；
- Plugin typecheck PASS；
- Plugin tests 255/255、0 skipped；
- build 与 dist integrity PASS。

## Desktop 证据

1. 通过 Logseq 宿主的真实 Plugin `reload()` 卸载并重新加载 Task Copilot；
2. reload 后不打开 Task Copilot 面板；
3. 等待 25 秒，超过旧 lease 的停止窗口；
4. owned Service 仍在运行且 PID 已更新，证明隐藏状态下已获得新的 Graph-bound lease；
5. 第一次点击工具栏 `TC` 时直接显示：
   - Runtime `READY`；
   - Store `READY`；
   - Graph `logseq`；
   - “Task Copilot 已自动连接当前 Graph；正式能力可以使用。”

截图：`../screenshots/task-copilot-hidden-reload-auto-ready-light.png`

## 有界结论

隐藏 reload 自动恢复从 OPEN 变为 DONE。真实切换到另一个 Graph 的视觉 Gate 仍 OPEN；代码已
保证切换时先释放旧 lease、清空 session-only 状态、恢复新 identity，并只发现新 Graph 的
Service。未配置 Graph 必须继续只读，不能为了形式上的“支持切换”回落到旧数据库。
