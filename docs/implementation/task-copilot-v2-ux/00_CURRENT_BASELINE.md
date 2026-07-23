# Task Copilot V2 交互优化：当前基线

> 基线日期：2026-07-23（Asia/Shanghai）
> 适用提交：`d6ef86e26d7cdf9c5726c2481d45cd884e00e730`
> 证据原则：当前代码和本轮命令优先；历史 Desktop 报告只登记为历史运行证据；没有当前截图时不声称本轮 GUI 已验证。

## 1. 仓库与工具

| 项目 | 当前事实 | 证据状态 |
|---|---|---|
| 仓库 | Personal Operations System / Task Copilot | VERIFIED |
| 分支 | `feature/task-copilot-mvp` | VERIFIED |
| HEAD | `d6ef86e`，`docs: mark V2 implementation complete` | VERIFIED |
| 远端 | `origin` 已配置；本 Goal 不自动 push | VERIFIED |
| 工作区 | 用户已有 `apps/task-copilot-local-service/package.json` 修改；`docs/research/` 为未跟踪调研产物 | VERIFIED |
| Node 约束 | `>=20.19 <21` | VERIFIED |
| 当前默认 Node | `v25.6.1`，不属于受支持运行时 | VERIFIED |
| 检查所用 Node/npm | `/opt/homebrew/opt/node@20/bin/node` `v20.20.2` / npm `10.8.2` | VERIFIED |
| 包管理器 | npm；根 `packageManager` 为 `npm@10.8.2` | VERIFIED |

保护边界：

- 不覆盖、暂存或提交用户已有的 Local Service `package.json` 改动；
- 不提交 `logseq/`、`tmp/`、凭据、descriptor、测试数据库、截图原始私人内容或构建产物；
- `logseq/` 是外层 Git 忽略的嵌套测试 Graph，其 dirty 状态只作信息展示。

## 2. 正式运行入口

| 组件 | 路径 / 入口 | 当前方式 |
|---|---|---|
| 正式 Logseq Plugin | `apps/task-copilot-logseq-plugin/` | Logseq Developer mode → Load unpacked plugin → 选择插件根目录，不能选择 `dist/` |
| Plugin 入口 | `apps/task-copilot-logseq-plugin/src/index.ts` | `logseq.ready()` 后注册工具栏、命令、主 UI、事件与受限模式 |
| UI renderer | `apps/task-copilot-logseq-plugin/src/ui.ts` | Vanilla TypeScript 字符串 renderer + 统一事件委派 |
| Plugin 样式 | `apps/task-copilot-logseq-plugin/src/index.css` | 单一 Light/Dark token 与窄屏适配 |
| Local Service | `apps/task-copilot-local-service/src/main.ts` | Node 20 独立进程 |
| Service runner | `apps/task-copilot-local-service/src/runner.ts` | `task-copilot-service --database ... --graph-id ... --descriptor ...` |
| CLI | `apps/task-copilot-cli/src/main.ts` | `tc --service-descriptor ...` |
| 正式 Plugin package | `@task-copilot/logseq-plugin@0.1.0` | `logseq.main = dist/index.html` |
| Local Service package | `@task-copilot/local-service@0.1.0` | 仅支持 Node 20 |

## 3. 构建和检查

根级：

```bash
PATH=/opt/homebrew/opt/node@20/bin:$PATH ./scripts/check.sh
```

本轮结果：`PASS`。

- typecheck：全部 workspace 通过；
- lint：通过；
- tests：全部通过，0 failed / 0 skipped；
- builds：Capability Lab、正式 Plugin、Local Service、CLI 通过；
- Plugin package/bootstrap/dist：通过；
- architecture/package boundaries：通过；
- stable rule coverage：145 条全部记账；
- acceptance rehearsal：`PASS`，恢复差异 `[]`；
- repository boundary：通过。

依赖审计仍报告 2 high / 1 critical。ADR-0007 已证明 `@logseq/libs` 0.3.4 仍携带受影响依赖，而移除 runtime 会破坏 Logseq 0.10.15 加载；因此当前明确保留风险，不运行破坏性的 `npm audit fix --force`。

## 4. Store、Graph 身份与数据库

- Logseq 正文是正文权威；
- SQLite schema v12 是唯一当前正式领域状态源；
- Plugin、CLI、LLM 和迁移的正式写入统一经 Local Service；
- Graph identity 在 SQLite 初始化、descriptor、Service 与 Plugin 连接时重验；
- Primary Anchor 连接正式对象与 Logseq 正文；位置不等于 Primary Ownership；
- V1 FileStorage 只作为只读迁移来源、恢复证据与历史兼容资产。

基线的进程名筛选未发现名为 `task-copilot-service` 的进程；后续精确检查实际命令行时发现一个
既有 Node 20 Service 以 `node .../dist/service.js` 形式运行，并通过 CLI 证明为 READY、schema
v12、0 object、provider disabled。它使用仓库内被忽略的隔离数据库：

- `tmp/runtime/manual-v2/task-copilot.sqlite`；
- `tmp/runtime/v2-desktop/*/*.db`。

这些路径只用于本地测试，不是产品默认数据位置，也不得提交。该既有进程和数据库未由本轮
停止、替换或写入。正式 Service 仍要求用户通过命令行显式给出数据库、Graph ID 和 descriptor。

## 5. Service 与 descriptor

当前已实现：

- 仅绑定 `127.0.0.1`；
- 高熵 session token；
- 0600 descriptor；
- Plugin/CLI 协议校验；
- Service 不可用或协议错误时进入 formal-writes-false 受限态；
- 正常退出和 Restore 后删除 descriptor；
- Restore 成功后主动停止 Service；
- Plugin 通过 Electron reader 或 Logseq 私有 FileStorage reader 发现 descriptor。

当前产品化缺口：

- Plugin 不能自动启动 Local Service；
- Service runner 只写 filesystem descriptor，当前代码没有直接写 Logseq Plugin 私有 FileStorage 的产品入口；
- Plugin 设置仍暴露“descriptor 私有存储 key”；
- Logseq `beforeunload` 只清理 Plugin controller/UI，没有向 Local Service 发出安全结束命令；
- 正常使用仍需要终端、路径、Graph ID 与 descriptor 知识。

因此 P0-10 不是重写 Service，而是为既有 Service 增加一个受控生命周期与发现编排层。

## 6. LLM Provider

当前 Provider 机制：

- 只有显式选择 `TASK_COPILOT_LLM_PROVIDER=deepseek` 才启用；
- Base URL、实际 Model ID 和 secret reference 均来自运行配置，不硬编码；
- secret reference 只允许 `env:<VARIABLE>` 或 `keychain:<service>/<account>`；
- Key 不进入代码、Git、Graph、SQLite、descriptor、日志、Diagnostics 或报告；
- 真实 DeepSeek Flash/Pro L3、Logseq Desktop L4、UC-28 与错误分类历史 Gate 已通过；
- 模型输出必须经过结构化 Schema、机器覆盖的 provenance/hash、Domain Validator；
- LLM 只生成 Proposal，不能直接写 Graph/SQLite、改变 Focus/Ownership 或 Commit。

本 Goal 提供的 Key 只允许进入受控本机 secret reference，绝不写入本目录或任何证据。

## 7. 当前主 UI

当前一级工作区为：

1. `Now Work / 现在工作`
2. `Projects / 对象`
3. `Proposal Review`
4. `Project 重入`
5. `迁移`
6. `Audit / Recovery / 审计与恢复`

全局还常驻：

- `整理当前页`
- `Diagnostics`
- Runtime / Store / Graph strip
- Agent 状态条

当前工具栏只是固定 `TC`，不显示需要介入的数量或恢复优先级。当前命令面板使用英文工程标签；斜杠命令只有 `Task Copilot: Open`。没有注册 Block 右键菜单、Page 菜单、三个用户级快捷动作或 Block 轻标记。

这与新设计的“现在 / 待我确认 / 项目 / 更多”以及现场就近入口存在明确差距。

## 8. 当前可直接复用的能力

| 能力 | 当前入口 / 代码 | 复用判断 |
|---|---|---|
| Focus 加入、移出、排序 | Now Work → Local Service → Application | 可直接复用 Handler；缺现场入口与轻反馈 |
| Condition | Now Work dialog → `changeCondition` | 可直接复用；缺“暂时做不了”路由 |
| due | Now Work dialog → `changeDeadline` | 可直接复用 |
| 打开正文 | Primary Anchor → Logseq scroll | 可直接复用 |
| Candidate 当前页发现 | Review / `v2-explicit-candidate-discovery.ts` | 可直接复用；缺 Block/Page 就近路由 |
| Proposal Review | `ui.ts` + Proposal routes | 底层复用；前台需状态翻译和连续流程 |
| Commit/Undo/Recovery | `v2-proposal-commit.ts` + Service ledger | 不得绕过；需要用户层结果投影 |
| Project 当前接口/重入 | schema v12 aggregate + UI | 正式事实可复用；需动态重入条和中文压缩 |
| Audit | Service audit/commit projection | 可复用为“最近修改” |
| Diagnostics/Doctor | 结构化 component report | 可复用为“系统状态 → 技术诊断”两层 |
| Backup/Restore/Migration | Service/CLI 完整安全链 | 需产品化向导，不能复制恢复机制 |
| Provider | 真实 DeepSeek Structured Output | 可复用；需统一 UX 输出契约与 Skill |

## 9. 已知问题和不确定性

1. `current-status.md` 顶部与最终 clean audit 已确认 V2 complete，但其“下一步”仍残留旧的 Project Gate 文案；后续更新状态时需要收口。
2. 现有 UI 继续暴露 Proposal、Commit、Runtime、Store、Graph、Diagnostics 等内部概念。
3. 正常主面板为全屏 overlay，现场入口会先离开 Block/Page 上下文。
4. Block context menu / Page menu API 在当前 `@logseq/libs` 类型中存在，但正式 Plugin 尚未注册，真实排序与 payload 仍需 Desktop Gate。
5. `registerBlockContextMenuItem` 的 typed callback 只保证 Block UUID；“动态菜单”不能仅靠注册时状态，需要采用稳定四项入口后在动作执行时解析正式对象身份，或以用户可理解的二级路由补足。
6. Service 自动启动、私有 descriptor 投放和随 Logseq 安全结束当前尚未产品化。
7. 现有本地 `docs/research/current-ux-evidence/` 已有 3 张本轮真实 Desktop 截图；更多 GUI 流程尚未在本 Goal 当前提交上重新截图。
8. 当前 `@logseq/libs` 上游依赖风险继续按 ADR-0007 公开保留。

## 10. 基线结论

当前不是“缺少底层能力”的仓库，而是“可信能力已经完成，但交互仍按工程模块和状态机组织”的仓库。新 Goal 的首要实现面应是：

1. 交互路由；
2. 用户语言状态翻译；
3. 现场低摩擦操作；
4. Service 生命周期产品化；
5. 派生注意力信号与影子模式；
6. LLM Skill 与复杂对象协作。

任何实现都必须继续复用 SQLite 单一权威、Application Command、Proposal、SemanticCommit、Audit、Undo、Recovery 和 Backup。
