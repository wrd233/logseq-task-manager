# 独立 Logseq Desktop 测试环境

在已有生产 Logseq 的 macOS 上运行插件回归。应用副本、Electron profile、全局 `.logseq`、Graph、SQLite 和测试证据均位于被 Git 忽略的 `tmp/logseq-sandbox/`。不复制生产配置、Graph 或凭据。

## 使用

仓库要求 Node 20.19–20.x。先用 Node 20 执行 `npm ci` 和 `npm run build`，然后在仓库根目录执行：

```sh
# 只需准备一次；参数必须指向本机已安装、Resources/app/electron.js 未打包的应用。
npm run sandbox:prepare -- "/Applications/Logseq 2.app"
npm run sandbox:start
npm run sandbox:status
npm run sandbox:stop
```

`TASK_COPILOT_NODE=/absolute/path/to/node20` 可指定 Kernel 的 Node 20。未设置时优先使用本仓库已有的 `tmp/toolchains/node-v20.20.2-darwin-x64/bin/node`，否则检查当前 Node；脚本不会下载或更改系统 Node。

首次在**测试应用副本**中选择添加本地 Graph；文件夹选择器只返回 `tmp/logseq-sandbox/graph`。打开 `Task Copilot Lab` 页面，工具栏 TC 打开插件侧栏。插件从仓库的 `apps/logseq-plugin/dist` 加载，修改后先构建，再重载测试插件/窗口。

`sandbox:start` 复用已运行的测试进程，Kernel 重启时同步更新测试 settings 与私有 descriptor 缓存。`sandbox:stop` 检查记录 PID 的完整应用/runner 路径及隔离 profile，仅对匹配的进程发送 SIGTERM，并等待退出。应用副本已存在时 `prepare` 会拒绝覆盖；保留测试 Graph 与 SQLite 以便持续调试。

## 隔离边界

- 使用 APFS copy-on-write 应用副本，独立 bundle identifier，修改副本入口并对副本进行本地 ad-hoc 签名；原安装应用不修改。
- 在加载原入口前隔离 `electron.app.getPath('home')`、`os.homedir()`、`appData`、`userData` 和常用用户目录。仅传 `--user-data-dir` 不足以隔离全局 `.logseq`。
- 禁止副本注册默认协议、打开外部链接和触发自动更新安装；原生文件夹选择器仅允许测试 Graph。
- Kernel 使用独立 SQLite、descriptor 和随机 localhost 端口。移除继承的 `DEEPSEEK_*` 配置并禁用远程 executor，使用默认 Fake cognition；测试不会调用生产 DeepSeek。
- CDP 只监听 `127.0.0.1:19333`。端口占用时拒绝启动新 Desktop；诊断只连接应用副本的目标页。
- PID、descriptor、配置和证据留在忽略目录。不要将目录复制进提交或公开 descriptor。

这是进程与数据路径隔离，未建立操作系统容器。回归操作必须始终验证当前 Graph 路径位于测试目录。

## 2026-10-01 实机验证

环境：macOS x86_64、Logseq 0.10.9、SDK 0.3.4、插件 0.2.0、Node 20.20.2；分支从 `origin/vnext` 的 `4f9b826` 开始。

| 检查 | 结果 |
| --- | --- |
| home / osHome / profile / appData | 运行时全部指向测试目录 |
| 生产实例 | 原 PID 持续运行；45 个生产配置和原应用文件 SHA-256 未变化 |
| Task 正式化 | 真实注册命令 → Kernel COMMITTED → 正文带稳定 id 与任务标签 |
| 完成 / 撤销 | DONE / COMPLETED → TODO / OPEN；Undo 保留补偿关系 |
| Desktop 重载与服务重启 | SQLite 与 Graph 状态保留；轮换 descriptor 后侧栏重新读取成功 |
| Kernel 离线 | 自然正文仍可编辑并保存；恢复后新增正文保留 |
| MiniProject 正式化与项目侧栏 | CREATE_WORK_OBJECT COMMITTED；项目视图可见 |
| 投影与数据库 | 两个 ProjectionObligation VERIFIED；无失败提交；数据库完整性检查通过 |
| 首次私有缓存不存在 | 修复 0.10.9 的 `file not existed` 拒绝语义；自动回退设置，其他 IO 错误继续抛出 |
| 根级检查 | `npm run check` 通过；286 tests、0 failed、0 skipped；类型、lint、build、依赖边界和 taste eval 通过 |

详细本地证据位于 `tmp/logseq-sandbox/evidence/`：`isolation-runtime.json`、`task-completed-db.json`、`task-undone-db.json`、`task-reload.json`、`offline-edit.json`、`first-run-fallback.json`、`final-db.json`、`production-after.json`、截图和 `check.log`。这些证据包含测试环境本地路径，均不提交。

本轮只验证上述 Desktop 基础链路，未重新执行真实 DeepSeek Gate、长期 soak、迁移或恢复发布 Gate。此前代码审查发现的 Console bootstrap/CORS、future-schema 拒绝前写入及恢复 WAL 风险仍需独立处理。
