# Agent Decision Governance Goal

## Product outcome

在既有 Task Copilot V2 安全内核之上增加内部 Agent 决策治理层：Agent 根据有界 Logseq 证据提出结构化 Decision，Skill 定义合法边界，确定性 Risk Router 决定路由；首阶段完成可日用的 Shadow 闭环，随后仅对满足证据门槛且经用户显式授权的低风险规则开放 Guarded 自动处理。

本 Goal 不重开已完成的 MVP Goal，不修改 `docs/goal/MVP_STATUS.md` 的 `MVP_SUCCESS`，不建设第二套 Candidate、Proposal、Commit、Audit、Undo、Recovery、Provider 或 SQLite authority。

## Authority order

1. 用户提供的《Task-Copilot-Agent-Decision-Governance-详细设计文档》：产品意图与模块边界；
2. 既有 Domain、ADR 与 Safety Contract：正式事实与写入边界；
3. 当前代码、运行进程与 Desktop 证据：实现事实；
4. 本目录：实施阶段、追踪与验收状态。

## Frozen baseline — 2026-08-02

| 项目 | 执行事实 |
|---|---|
| branch | `feature/task-copilot-mvp`，tracking `origin/feature/task-copilot-mvp` |
| base commit | `7f23564131dbaf5bdcb04c21b80ddb7abd9d48e0` |
| last commit | `7f23564 docs(task-copilot): record real WAITING/BLOCKED desktop states for directory gate` |
| commit count | 497 |
| remote | `origin https://github.com/wrd233/logseq-task-manager.git`；本 Goal 不 push |
| default shell runtime | Node `25.6.1` / npm `11.9.0`，不符合仓库 engine |
| accepted build/runtime | Node `20.20.2` / npm `10.8.2` |
| Logseq | Desktop `0.10.15`，当前正在运行 |
| formal Plugin load path | `tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin` |
| SQLite authority | `tmp/runtime/manual-v2/task-copilot.sqlite` |
| Service | `READY`，formal writes / migration / Provider / backup / Graph bridge capabilities 可用 |
| SQLite | schema `12`，59 objects，integrity ok，foreign-key violations 0 |
| Doctor | `PASS`：11 pass / 1 warn / 0 fail / 2 info；警告为 1 条历史 stale Proposal |
| Provider | Key reference out-of-band；配置存在，本轮尚未 live probe |
| Skill catalog | 5 个内置 Skill，Doctor 校验通过 |

外层工作区基线已有用户改动：`apps/task-copilot-local-service/package.json` 被 Logseq 写入 `logseq.id`。该文件不属于本 Goal 的计划改动，不恢复、不暂存、不提交。`logseq/` 是 ignored 本地测试 Graph，只作运行证据。

## Existing capability map

### Reuse directly

- Graph event source: `DB.onChanged` 已通过 `registerExplicitSyncEvents` 接入；32-root latest-value queue、300 ms debounce、256-Block bounded subtree/frontier 与 overflow/reconciliation 合同已存在。
- Source/identity: Explicit Sync、Candidate discovery、Primary Anchor observation/rebind、Durable Origin 与 Graph read bridge 已有稳定边界。
- Context: Local Service `context-package.ts` 已分离 SQLite formal facts、Graph excerpt、versions、hash、scope、Anchor、relations 与嵌套 Skill；Graph bridge 上限为 256 Blocks / 1 MiB / parents 0..8 / page depth 0..5。
- LLM: Provider 在 Local Service 内；Prompt 分层、Structured Output、Validator、timeout/cancel/retry/error mapping 与 Keychain/out-of-band secret reference 已存在。
- Formal chain: Candidate → Proposal/group → Review/accepted-not-applied → revalidation → Semantic Commit → Audit → inverse Commit/Undo → Pending/Recovery 已完成并有 Desktop 证据。
- Persistence: SQLite 是唯一正式领域权威；schema v12 与显式 preflight snapshot + append-only migration ledger 已存在。
- Frontstage: “现在 / 待我确认 / 项目 / 更多”、系统状态、Recent Changes、Attention shadow、Worksite Preview 与高密度卡片/渐进披露模式可复用。
- Permission vocabulary: `project-operation-router.ts` 已有 direct/review/external-agent 的发布分类；外部 Agent 始终只能 submit review-only Proposal。

### Extend minimally

- 新增内部治理 Decision aggregate、重要 Event、Review Signal、Rule Authorization；Feedback 作为结构化重要 Event 保存，避免独立重型子系统。
- schema v13 新增治理事实表，schema v14 新增单例全局暂停设置，schema v15 在同一设置行加入 Agent 观察与扩展联想开关；三次迁移都沿用显式快照、ledger、Graph identity、Doctor 和 backup 合同。
- 从既有 `DB.onChanged` 分叉一个独立、失败隔离、latest-value 的治理观察消费者；不得改变 Explicit Sync 的正式同步语义。
- 扩展 Context builder，复用 Graph Snapshot/正式对象/Skill，而不是建立第二套全文检索或 Graph 缓存。
- 新增内部 hash-addressed governance Skill；外部 `task-copilot-core` 的 review-only 权限不变。
- 新增确定性 Risk Router；首阶段 EXPERIMENT 模式只允许 R0 持久化治理记录，正式业务写入恒为 0。
- 在现有 Plugin shell 增加“决策治理”二级工作区，并沿用现有 token、card、focus restoration、loading/error/disabled 模式。

### Must remain unchanged

- 六类正式对象、Lifecycle / Condition / Focus、Primary Ownership、正文权威与 SQLite authority。
- Plugin/CLI/LLM/迁移的正式写入统一经 Local Service/Application。
- 外部 Agent 只读有界 Context Package、只生成 review-only Proposal；`submit` 不是 `commit`。
- 高影响操作人工确认；Graph/Domain 部分失败进入现有补偿与 Recovery，不新增平行机制。
- Provider 不进入 Plugin；凭据不进入代码、Git、Graph、日志、截图、导出或错误消息。
- 启动时禁止静默 schema upgrade；Agent/Provider/Skill/Service 不可用时现有 Task Copilot 与 Logseq 正文仍可用。

### Design-to-reality differences

- 设计文档把 Source Root、LOCAL/EXPANDED 和 Decision 描述为新链路；代码已经有稳定 Graph read、Explicit Sync 与 Context Package，因此实现应适配这些能力而非复制。
- 设计示例中的 `AUTO_APPLY` 不能直接映射为 LLM 写入；内部治理即使获权也只能调用现有 Application/Proposal/Semantic Commit 内核。
- 设计建议多个逻辑实体；当前实现采用四张最小表和 JSON aggregate，Feedback 合入 Event payload，避免每个概念一表。
- 设计允许 R1 显式 Task 最终自动化；真实 14 天/200 Decision 门槛尚未发生，因此首阶段只实现默认关闭的 Guarded 接线和可验证的 Shadow 零写入合同。
- 设计建议完整来源快照默认保留 180 天；当前实现不建立完整正文副本，只保留 Decision/Review Signal 中已经受限的 captured evidence。Retention 合同明确报告 `sourceSnapshots=NOT_STORED`，并只允许把到期 Review Signal 退出活跃索引，既不删行也不删 Logseq 原文。

## Delivery phases

0. Baseline Freeze 与 Goal 建档。
1. schema v13/v14/v15、Decision/Event/Review Signal/Authorization、三个显式治理开关、retention preview/job、Application query/command、Service API。
2. Source Root、gate、LOCAL/EXPANDED、token/context metrics、latest-value/revision。
3. governance Skill、Structured Output Validator、Risk Router、pause/downgrade/revalidation。
4. EXPERIMENT Shadow runtime 与 failure isolation。
5. 决策治理台、Agent 观察/扩展联想/全局写入开关及真实 Desktop 视觉/键盘 Gate。
6. 单条/批量反馈、Skill Feedback 与 Review Evidence 导出。
7. 默认关闭的 Guarded explicit-task representative path；只有在长期 Shadow 门槛和显式授权后才可真实 Auto Apply。

## Terminal states

- `AUTOMATION_COMPLETE`
- `CONSOLIDATED_RUNTIME_CHECKPOINT`
- `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT`
- `AGENT_GOVERNANCE_V1_COMPLETE`
- 严格定义的 `BLOCKED`
