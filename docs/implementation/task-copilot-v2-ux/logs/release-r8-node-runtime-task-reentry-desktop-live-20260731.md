# Release r8 Node runtime、Task 重入与生命周期 Gate（2026-07-31）

## 范围

- branch：`feature/task-copilot-mvp`
- exact build commit：`89288614258c`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`
- host / Plugin：Light / Dark
- viewport：1000×720
- release：`tmp/releases/task-copilot-v2-0.1.0-8928861-r8.zip`
- zip SHA-256：`1d36258a21827554b41dede1deaf1b63d4f68875d85762769b6faf4781627f07`

本 Gate 只关闭 Freeze 中“当前源码、安装运行时、稳定 Plugin 路径和 Desktop 证据不一致”的
Release blocker。没有新增能力面、正式状态、Agent Runtime、Recovery 分支或 Skill。

## 真实缺陷与修复

上一候选 r7 把 Node 20 ABI 115 的 `better-sqlite3` payload 交给本机默认 Node 25 ABI 141
启动。Launcher 本身可以 READY，但 owned Service 在打开 SQLite 前以
`ERR_DLOPEN_FAILED` / `V2_DATABASE_OPEN_FAILED` 停止。数据库 immutable integrity 检查仍为
`ok`；该失败不是 Graph、authority、Provider 或数据损坏。

`cc53e33` 增加安装器前置运行时 Gate：只接受 Node `>=20.19 <21`，且在修改配置、
LaunchAgent 或 authority 前失败。`8928861` 将同一约束写入 Release Runbook。实际验证：

| 场景 | 结果 | 状态变化 |
|---|---|---|
| Node 25 执行 install | exit 2 / `LAUNCHER_INSTALL_NODE_VERSION_UNSUPPORTED` | config hash、Launcher PID 不变 |
| Node 20 无 Graph identity | exit 2 / `LAUNCHER_INSTALL_ARGUMENTS_INVALID` | 未安装、未换 authority |
| Node 20 显式 Graph、不传 database | exit 0 | 保留既有映射与 Provider reference |

## 包与安装态一致性

- `unzip -t`：PASS；zip 无 `__MACOSX`、`.DS_Store`；
- 凭据特征、SQLite/database、日志、`.env`、key/pem 扫描：命中 `0`；
- 包内 Plugin JS/CSS、Launcher、Service 和 Runbook 与 exact build 字节一致；
- Node 20 从包内 native module 真实打开 `:memory:` SQLite：PASS，ABI `115`；
- graph key 前后保持
  `graph-a00da3a2f9b4c5a53b393c03a0c234d0562be1905965dd11e50b96f10514ce46`；
- database authority 前后保持
  `tmp/runtime/manual-v2/task-copilot.sqlite`；
- LaunchAgent program 为 `/opt/homebrew/opt/node@20/bin/node`；
- 安装态 Launcher/Service 与 r8 payload SHA-256 精确一致；
- 五个 Skill 的源码、payload、安装态和 Service catalog hash 精确一致，运行态只有一个活跃版本。

## Desktop 操作链

通过 Computer Use 在最新 Logseq 中完成：

1. 从插件管理移除 r7 注册；
2. 从稳定目录 `tmp/releases/...8928861-r8/task-copilot-plugin` 手动载入 r8；
3. 命令面板打开“Task Copilot：打开‘现在’”；iframe URL 明确来自 r8；
4. Service 使用 Node 20 启动；CLI `objects 14`，Doctor PASS；只有既有 stale Proposal
   warning `1`；
5. “任务”筛选验证普通 Task 的唯一主操作：用户 Focus 为“继续处理”；无可靠正文入口为
   “更新当前状态”；有可靠 Primary Anchor 为“打开正文”。卡片不暴露 Commit、Anchor、
   Object ID 或 recovery code；
6. 完整退出 Logseq：owned Service PID 退出、descriptor 移除，Launcher 保持；
7. 重新打开 Logseq：同一 descriptor 自动恢复，Doctor 再次 PASS；命令面板打开的 iframe
   仍来自 r8，同一 Now/Task 投影恢复，无需终端维护。

CURRENT 截图：

- `current-ui/screenshots/release-r8-now-task-current-8928861.jpg`
- `current-ui/screenshots/release-r8-now-restart-current-8928861.jpg`

r6 的截图保留为 `SUPERSEDED_PACKAGE`，不再代表当前安装构建。

## Provider 与零写入

使用安装配置中的 Keychain reference 运行一次当前结构化 DeepSeek smoke：

- actual model：`deepseek-v4-flash`
- duration：2584 ms
- attempts：1
- structured JSON：PASS
- graph writes：0
- formal store writes：0
- 终态 objects：14；Doctor PASS

没有把 API Key、正文或 Provider response 写入仓库、截图或普通日志。Skill、Prompt 与
Validator 本轮均未修改；既有 `recover-context@1.3.0` 和 P2-D 外部 Agent 证据继续有效。

## 结论

- Freeze 中“当前 Task consumer 只有 automated evidence”由
  `AUTOMATED_ONLY_DESKTOP_AND_PACKAGE_REVALIDATION_REQUIRED` 关闭为
  `DONE_CURRENT_PACKAGE_DESKTOP`；
- r8 取代 r6 为当前 Release Candidate；
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator `0`；
- 关闭 Release blocker `2`：Node ABI 未前置拒绝、当前源码/安装包/Desktop 漂移；新增长期
  Partial `0`，净变化 `-2`；
- P0/P1/P2 release boundary 保持 DONE；Attention 保持 bounded Pilot，P2-F/高噪声 Signal/
  Block Marker 继续 Shadow/OFF；完整长期 Goal 仍为 `IN_PROGRESS`。
