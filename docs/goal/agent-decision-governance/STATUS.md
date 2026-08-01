# Agent Decision Governance Status

```yaml
goal_state: CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT
base_commit: 7f23564131dbaf5bdcb04c21b80ddb7abd9d48e0
current_commit: 9458670
current_phase: CP_5_SHADOW_EVIDENCE_ACCUMULATION
completed:
  - phases_0_through_6
  - guarded_explicit_task_foundation_default_off
  - automated_and_desktop_representative_gates
remaining_automatable_work: []
runtime_checks_pending:
  - natural_14_days
  - at_least_200_real_decisions
  - independent_visual_review
  - explicitly_authorized_guarded_apply_reload_undo_reload
shadow_metrics:
  decisions: 4
  review_signals: 2
  formal_objects: 59
  automatic_applies: 0
visual_gates: VISUAL_GATE_READY
active_risks:
  - accuracy_sample_too_small
  - guarded_authority_not_authorized
user_actions_required:
  - continue_normal_shadow_use
  - review_small_daily_samples
resume_instruction: Review CP4_RUNTIME_REPORT.md and accumulate honest CP-5 evidence; do not promote authority before both long-run gates and explicit authorization.
```

## Outcome

Agent Decision Governance 的首阶段实现、自动测试、代表性 Desktop 验证、故障演练、状态追踪和本地 Commit 已完成。正式运行保持 `EXPERIMENT + SHADOW + 自动写入关闭`；规则暂停与全局暂停已恢复为未暂停，但这不会开放任何自动正式写入。没有新增 Agent apply/promotion API，也没有 Agent 正式业务写入。

这不是 `AGENT_GOVERNANCE_V1_COMPLETE`。CP-5 的自然 14 天和至少 200 条真实 Decision 尚未发生，CP-6 Guarded apply 仍同时受长期证据与用户显式授权约束。

## Completed implementation

- schema v13 保存 Decision/Event/Review Signal/Rule Authorization；schema v14 只新增单例全局写入暂停设置，仍要求显式 preflight backup 与 migration ledger；
- 唯一 `DB.onChanged` 入口、3 秒 latest-value queue、Source Root、LOCAL/EXPANDED Context、真实 Provider、严格 Structured Output 与确定性 Risk Router；
- Candidate defer/duplicate、ordinary、Worksite、explicit Task、weak signal、multi-target 和 Provider invented-target 拒绝路径；
- EXPERIMENT 零正式写入；默认关闭的 Guarded explicit-Task 基础继续复用 Proposal/Semantic Commit/Undo；
- 治理台的 24h/7d、异常优先、最小 filter/search、详情、打开来源、规则暂停/恢复、全局暂停/恢复、单条/批量反馈；
- 30 天 Skill Feedback 与 60/180 天 Review Evidence UI，完整 manifest/hash/bytes 与凭据脱敏；
- Provider/Service failure、Plugin reload、全局暂停下继续 Shadow、恢复后 Doctor/backup 验证。

## Live checkpoint — 2026-08-02

| Evidence | Result |
|---|---|
| Runtime | Logseq 0.10.15；正式 Plugin build；Service `READY`；schema v14；Graph bridge connected |
| Doctor | `PASS`；唯一 WARN 为既有 1 条 stale Proposal；最新 schema v14 backup PASS |
| Formal authority | Objects 59；integrity `ok`；foreign-key violations 0；Pending/Recovery Commit 0 |
| Governance | 4 Decisions、2 Review Signals；6 条规则全部 `SHADOW` 且最终未暂停；自动应用 0 |
| Multi-target | exact Chinese target names drove EXPANDED Context; invalid Provider output failed closed with zero formal writes |
| Revision | one Source Root moved from weak review r1 to explicit Task r2 without changing formal Objects |
| Pause | global pause survived Plugin reload; explicit rule pause/resume worked; weak signal observation continued while paused |
| Paused Shadow | Review Signal occurrence count 3→4, captured text/hash updated, Decision stayed `SHADOW / NOT_EXECUTED`, Objects stayed 59 |
| UI | filter/search empty result, source-open Block anchor, rule/global pause, 60/180 export controls verified live |
| Failure/recovery | LaunchAgent/Service stop showed safe degraded UI while Logseq text remained readable/editable; reinstall + Plugin reload restored runtime |
| Visual | Light, Dark, detail, bulk, 720×520 narrow empty-result and failure screenshots committed; independent human verdict remains pending |
| Migration/backup | live v13→v14 prebackup retained 59 Objects/4 Decisions/2 Signals; current Service backup validated schema 14 |

完整证据见 `CP4_RUNTIME_REPORT.md`。

## Honest remaining gates

1. 自然积累至少 14 天且至少 200 条真实 Decision；当前 4 条，elapsed natural day 仍为 0。
2. 用户日常抽样后才能按规则评估误判、漏判、失败、反馈和是否具备晋升候选资格。
3. 实现 Agent 不能自授独立 `VISUAL_GATE_PASS`。
4. 只有长期门槛和用户显式授权同时满足，才可做 CP-6 apply → reload → Undo → reload；完成后仍恢复 Shadow。

## Preserved boundaries

- 用户已有 `apps/task-copilot-local-service/package.json` 修改未恢复、未暂存、未提交。
- `logseq/` 是 ignored 本地测试 Graph；没有提交 Graph、凭据、依赖、构建产物或运行数据。
- 没有 push、没有配置 remote、没有破坏性 Git 清理。

## Resume instruction

从 `CP4_RUNTIME_REPORT.md` 与 `PENDING_RUNTIME_TESTS.md` 开始；日常仅收集 Shadow 数据。达到 14 天 / 200 条前禁止提升 authority，达到后仍须先取得用户对精确 Guarded representative 操作的显式授权。
