# P0-F 工具栏介入摘要 Desktop 证据

## 元数据

- 日期：2026-07-24（Asia/Shanghai）
- 宿主：Logseq Desktop 0.10.15
- Graph：隔离测试 Graph `logseq`
- Plugin：本地 `apps/task-copilot-logseq-plugin/dist`
- Local Service：Node 20.20.2；同一 schema-v12 测试库
- 测试内容：仅使用虚构 P0 样本
- 证据边界：未记录 descriptor、session token、filesystem path、真实业务正文、API Key 或
  完整内部 Commit ID

## 设计语义

工具栏摘要只从既有投影派生，不持久化第二份状态：

- 数字计入到期 WAITING/PAUSED review、到期 DEFERRED Proposal、待确认 Proposal、
  HIGH 已接受未应用 Proposal、PENDING SemanticCommit 和一次正式连接风险；
- OPEN、Focus、未来 review、普通 WAITING、Project 与 Candidate 总数不计入；
- `RECOVERY_REQUIRED` 优先于数字，显示 `↻` 并进入既有恢复入口；
- 点击优先级为 Recovery → 正式连接诊断 → PENDING Commit → Proposal Review → Now；
- UI 更新复用同一 toolbar key，没有创建第二个工具栏入口。

## 自动化

- 先添加纯派生测试，在实现不存在时见到 `ERR_MODULE_NOT_FOUND`；
- Plugin tests 161/161、0 failed、0 skipped、0 todo；
- Plugin typecheck PASS；
- Plugin build PASS；
- 测试覆盖安静态、全部五类数字来源、排除噪声、`RECOVERY_REQUIRED ↻` 覆盖数字及点击
  优先级；
- Bootstrap 测试证明初始工具栏与后续同 key 更新、单一 click handler 和无 Service 配置时
  的受限注册路径；
- 运行时只读取 `nowWork/listProposals/listSemanticCommits`；读取失败或 transport/
  connection 不可用只形成一个正式连接风险，不产生领域写入或重试队列。

## Desktop 操作与结果

1. 在 Service READY、Pending=0、Recovery=0 时 reload 最新 build；工具栏只显示稳定 `TC`，
   accessibility name 为“Task Copilot”，点击回到“现在”。
2. 安全停止本 Goal 启动的独立测试 Service，再 reload Plugin；正式能力进入受限态，正文仍
   可读写。
3. 工具栏动态更新为 `TC ①`，accessibility name 为
   “Task Copilot：1 项需要介入；正式连接需要检查”。
4. 点击该工具栏入口进入既有 Diagnostics，而不是错误地打开“现在”或发起正式写入。
   Diagnostics 含内部 Commit 标识与本地路径，因此只记录操作结果，不保存该页截图。
5. 用同一测试库重启 Service；新 descriptor 先经既有 Validator 校验，再写入固定 Plugin
   私有 FileStorage key，文件权限保持 0600，内容未输出、未进入设置或证据文件。
6. reload 后 Runtime READY / Store READY，Local Service 读回 Pending=0、Recovery=0；
   工具栏恢复稳定 `TC`，点击再次进入“现在”。
7. 此次 Service 重启要求人工更新私有 descriptor，继续证明 P0-H 的进程生命周期/descriptor
   刷新仍未产品化；P0-F 不把它误报为已解决。

## 截图

| 文件 | 证明 |
|---|---|
| `screenshots/original/p0-f-01-formal-connection-risk-badge.png` | Service 不可用时只计一个正式连接风险，工具栏显示 `TC ①` |
| `screenshots/original/p0-f-02-recovered-quiet-toolbar.png` | 同库 Service 与私有 descriptor 恢复后回到无噪声 `TC` |

两张文件均已转为真实 PNG 并逐张目视检查，仅包含隔离测试内容。

## 未扩大声明

- 当前测试库没有 `RECOVERY_REQUIRED` Commit；为避免不安全的数据库直写或人为制造未完成
  正式修改，本轮没有执行该故障的真实 Desktop 注入。`↻`、覆盖数字、tooltip 与 audit
  路由由纯派生和 Bootstrap 自动测试证明，不能写成 Desktop PASS。
- 数字 Desktop 证据是受控 Service outage 产生的单一正式连接风险 `①`。到期 review、
  待确认、HIGH 已接受未应用和 PENDING Commit 的各自组合由自动测试覆盖，本轮不为截图
  污染正式测试数据。
- P0-F 没有改变 Domain、SQLite、Proposal、SemanticCommit 或恢复状态机。
