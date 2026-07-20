# Task Copilot V2 — Codex Working Agreement

## Persistent Goal

持续开发个人事务运行系统 V2，直到 V2 v1.1 的 Slice A～F、E2E-01～24、Desktop、迁移、恢复和真实 DeepSeek Gate 全部满足。

V1 已进入受控交接期：它只作为 Pilot 对象、只读迁移来源、恢复证据和历史兼容入口保留。禁止为 V1 增加长期产品能力，禁止维护 V1/V2 双写或双语义运行模式。

每次运行开始时，依次阅读：

1. `docs/implementation/current-status.md`
2. `docs/implementation/v2-traceability-matrix.md`
3. `docs/implementation/open-decisions.md`
4. `docs/runtime/V1_MVP_PILOT_REPORT.md`（若已存在）
5. `docs/goal/MVP_STATUS.md`
6. 当前 Slice、迁移和 Provider 相关 ADR
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
- `V2_IMPLEMENTATION_COMPLETE`；
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
- Lifecycle、Condition、Focus 分离并封顶；
- FileStorage 只读，SQLite 是迁移切换后的唯一领域状态源；
- Plugin、CLI、LLM 和迁移的正式写入统一经过 Local Service；
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
