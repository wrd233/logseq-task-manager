# P0-I 用户层系统状态 Desktop 证据

日期：2026-07-24
环境：Logseq Desktop 0.10.15、Node 20.20.2、被忽略的本地测试 Graph、既有 V2 SQLite

## 用户问题

旧 Diagnostics 首屏先显示 Runtime、Store、Service、Graph、协议、版本、Pending、日志与
原因码。普通用户无法先判断正式能力是否仍可用、正文是否安全、是否需要做什么。

P0-I 固定先回答：

1. 发生了什么；
2. 哪些能力受影响；
3. 哪些仍可用；
4. 数据是否安全；
5. 是否需要我操作。

工程组件、协议、原因码、版本、ID、结构化日志、导出和 Anchor repair 仍完整保留，但只在
“展开技术诊断”后出现。

## 自动证据

- `deriveUserSystemStatus` 是纯投影，不写 Graph/SQLite，也不建立第二份状态；
- 安全优先级为 Recovery → Pending → Service/Store restricted → Anchor conflict →
  explicit-sync reconciliation → READY；
- `PENDING` 与 `RECOVERY_REQUIRED` 从同一 SemanticCommit 列表分别计数；
- Provider 未配置只说明 Agent 分析不可用，不降低确定性基础事务系统；
- 协议不匹配和 Graph identity 不匹配给出不同的用户动作；
- Plugin tests 174/174、0 skipped；
- typecheck、build 与 dist integrity PASS。

## 真实 Desktop

### Service READY + 正文待核对

重载最新构建后，Local Service 和 Store 均 READY；真实 explicit-sync 投影存在一项待核对
正文变化。系统没有显示虚假的健康摘要，而是显示“有 1 项正文变化需要核对”，并说明依赖
Anchor 的正式修改暂不继续、正文和其他事项仍可用、Logseq 仍是正文权威，以及连接中断时
不得重复编辑。

技术诊断默认折叠；展开后原 Copy diagnostics、JSONL 导出、Runtime/Store/Service、
Pending/Recovery/Source Conflict、stages、flags、recovery 和结构化日志均可达。

证据：`screenshots/original/p0-i-01-attention-user-status.png`。

### Service unavailable

安全停止测试 Local Service 后 reload，工具栏只显示一次正式连接风险并直接路由系统状态。
首屏显示“正式服务暂时不可用”：

- 正式写入、审阅提交、Undo、备份、恢复与迁移暂停；
- Logseq 正文仍可编辑，已保存页面、正式历史和只读说明不受影响；
- 系统保持只读安全模式，不把连接失败当成空状态，不自动重试正式写入；
- 用户应重新连接同一 Graph 的 Service，恢复前不要重复提交。

证据：`screenshots/original/p0-i-02-service-unavailable-user-status.png`。

测试 Service 随后已用同一 Graph ID 和同一 SQLite 安全重启；本轮没有注入数据库故障、
伪造 Recovery、清空队列、修改正式对象或调用 Provider。当前旧 handshake 仍要求刷新私有
descriptor 才能让已加载 Plugin 恢复，这一事实继续归 P0-H Service 生命周期产品化解决。

## 结论与边界

P0-I 的用户状态与技术诊断分层通过自动和真实 Desktop Gate。真实库中的注意状态被如实展示，
没有为了健康截图清空或覆盖它。Service 自动启动、descriptor 会话刷新、owned shutdown、
Graph 切换与 crash/orphan 仍属于 P0-H，P0-I 不以界面文案伪装这些生命周期能力已完成。
