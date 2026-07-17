# Task Copilot MVP — Codex Working Agreement

## Persistent Goal

持续开发 Task Copilot Logseq Plugin，直到 `docs/goal/MVP_GOAL.md` 中的个人可用 MVP 验收门槛全部满足。

每次运行开始时，依次阅读：

1. `docs/goal/MVP_GOAL.md`
2. `docs/goal/MVP_STATUS.md`
3. `docs/goal/MVP_CHECKPOINTS.md`
4. `docs/goal/PENDING_RUNTIME_TESTS.md`
5. `docs/mvp/REQUIREMENTS_TRACEABILITY.md`
6. 当前 Slice 相关 ADR
7. 相关目录中的局部 `AGENTS.md`

## Deep Run Rule

不要因为完成一份文档、一个 Slice、一次 Commit 或一轮测试而返回用户。

完成后：

1. 更新状态与追踪；
2. 运行检查；
3. 创建本地 Commit；
4. 立即继续下一项安全且独立的实质工作。

只有以下情况允许返回：

- `AUTOMATION_COMPLETE`：所有可自动完成的实质工作已经穷尽；
- `CONSOLIDATED_RUNTIME_CHECKPOINT`：所有剩余实质工作都依赖一次集中的用户运行时操作；
- `MVP_SUCCESS`；
- 符合 Goal 严格定义的真实 `BLOCKED`。

测试 Graph dirty 永远不是阻塞。

## Runtime Uncertainty

Logseq Desktop 行为尚未验证时：

1. 记录假设；
2. 使用防御性 Adapter、结构化错误或 Feature Flag；
3. 添加 Runtime Test；
4. 继续所有不依赖该结果的工作。

不要在中间 Slice 设置人工检查点。将验证项合并成尽可能少、总时长不超过 30 分钟的集中检查。

## Architecture

- Domain 不依赖 `@logseq/libs`；
- UI 不直接写 Store；
- Adapter 不复制领域状态机；
- Agent Proposal 不是事实；
- 所有正式变化通过 Application Command；
- 高影响操作必须显式确认；
- 正文、Domain State、Audit、View 各有单一权威；
- 位置不等于归属；
- Phase、Condition、Signal 分离；
- 插件关闭后正文仍可读。

## Git and Safety

- 外层开发仓库管理源码；
- `logseq/` 是被忽略的本地测试 Graph；
- 内层 Graph dirty 只作信息展示；
- 不 push；
- 不配置 remote；
- 不执行破坏性 Git 清理；
- 不提交 Graph、凭据、依赖、构建产物或测试数据；
- 每个本地 Commit 必须可构建并通过相应检查。

## Quality

每个有意义 Slice 后运行根级：

```bash
./scripts/check.sh
```

宣布 `AUTOMATION_COMPLETE` 前必须执行：

- TODO/FIXME/stub 搜索；
- skipped 测试搜索；
- MUST 规则覆盖检查；
- 导出恢复演练；
- Pending Commit Recovery 检查；
- Silent Overwrite 风险检查；
- 根级完整检查；
- 外层 Git 状态检查。

若仍有可独立完成的工作，继续，不得返回。
