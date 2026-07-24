# P0-H Launcher / owned lifecycle 真实进程证据

日期：2026-07-24

环境：macOS arm64；Node 20.20.2；Logseq Desktop 0.10.15；测试 Graph / 隔离 V2 SQLite

## 架构结论

Logseq Plugin iframe 没有受支持的 Node child-process API，因此采用 ADR 0008 的独立
Launcher + LaunchAgent。Plugin 不尝试从 iframe shell-out，也不伪装 Plugin-owned process。

## 自动证据

- Service Client：12/12；
- Launcher：13/13；
- Local Service：93/93；
- Logseq Plugin：180/180；
- Launcher、Service、Plugin typecheck PASS；
- Launcher/Service/Plugin build 与 Plugin dist integrity PASS；
- architecture boundary、ESLint 与 `git diff --check` PASS（根级最终检查另见状态文档）。

覆盖：

- descriptor exact-loopback、认证、协议、错误脱敏；
- Graph path → 不可逆稳定键；
- unknown Graph fail closed；
- 单 Service 多租约复用、heartbeat、最后租约释放、TTL expiry；
- shell-free exact child ownership；
- Service owner PID 自停；
- installer 0600/0700、LaunchAgent argument-only、稳定 token/port 更新和多 Graph 映射；
- Plugin heartbeat、unload release、自动重新发现；
- 显式结束前的 unfinished Commit / Graph reconciliation policy；
- Graph switch 释放旧租约后重新绑定。

## 真实独立进程 Gate

手动进程 Gate 使用隔离数据库，未输出 descriptor token：

```json
{"launcherStatus":"READY","configuredGraphs":1,"sharedPid":true,"serviceStatus":"READY","objectCount":2,"aliveAfterFirst":true,"aliveAfterLast":false}
{"exactChildCrashInjected":true,"staleLeaseCode":"LAUNCHER_HTTP_ERROR","pidChanged":true,"recoveredStatus":"READY","objectCount":2}
{"aliveAfterExpiry":false,"expiredLeaseCode":"LAUNCHER_HTTP_ERROR","restartedWithNewPid":true}
```

结论：

- 两个插件租约共享同一 Service；
- 释放第一个租约不误停 Service；
- 释放最后租约后精确 child 已退出；
- 精确杀死 owned Service 后新租约取得新 PID；
- 租约过期后 Service 自动退出并可重新启动；
- 每轮重启后同一 SQLite 仍读回 2 个对象。

## 真实 LaunchAgent Gate

安装前确认专用 Application Support、plist 与 label 均不存在。安装后：

- label：`com.task-copilot.launcher`；
- state：`running`；
- program：`/opt/homebrew/opt/node@20/bin/node`；
- config / pairing descriptor / plist mode：`0600 / 0600 / 0600`；
- Launcher health：READY；
- Launcher ensure → Local Service status：READY；
- object count：2；
- 最后租约释放后 Service 不再存活；
- installer 原位更新成功，token/port 保持，未新建第二 launcher。

Launcher crash Gate 在存在真实 owned Service 时向精确 Launcher PID 注入 `SIGKILL`：

```json
{"launcherCrashInjected":true,"launcherRestarted":true,"orphanAlive":false,"newServicePid":true,"recoveredStatus":"READY","objectCount":2}
```

这证明 launchd 拉起了新 Launcher，旧 Service 通过 owner PID monitor 自停，新 Service 使用
新 PID 恢复，同一数据库仍保持 2 个对象。

## 私有 Plugin 配对

Launcher pairing descriptor 已以 0600 安装到插件私有 FileStorage 的独立 key：

`task-copilot-v2-launcher-descriptor.json`

Logseq 插件设置只保存该 key，不含 token 或 filesystem path。旧 Service descriptor 私有文件
保留为可恢复兼容证据，没有覆盖或删除。

## 尚未宣称

当前 Computer Use 控制端与桌面安全询问接口版本不匹配，不能在不绕过安全机制的前提下执行
本轮 Logseq reload。因此以下仍保持 Desktop OPEN：

- reload 后 Plugin 自动 ensure Service 并显示 READY；
- “结束本次 Task Copilot”未完成事项拦截、成功结束和重新启动；
- 真实 Logseq 退出后的 owned Service 退出；
- 真实 Graph switch 的旧 Service 释放、未配置受限和配置后恢复；
- 对应用户层状态、Light/Dark/窄栏截图。

代码、LaunchAgent 和私有配对已经就位，但没有用自动测试或进程 Gate冒充上述 Desktop 证据。
