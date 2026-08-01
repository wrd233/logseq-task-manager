# Agent Decision Governance Status

```yaml
goal_state: CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT
base_commit: 7f23564131dbaf5bdcb04c21b80ddb7abd9d48e0
implementation_commit: 2df6597
current_phase: CP_5_SHADOW_EVIDENCE_ACCUMULATION
automation_complete: true
desktop_runtime_checkpoint: partial_pass
real_deepseek_gate: pass
visual_gate: VISUAL_GATE_READY
production_authority_expansion: barred
```

## Outcome

Agent Decision Governance 的可自动完成实现已穷尽，并已在真实 Logseq Desktop、正式 Local Service、正式 schema v13 SQLite 与真实 DeepSeek 上建立 Shadow 纵向证据。生产仍保持 `EXPERIMENT + SHADOW + 自动写入关闭`；本轮没有 Agent 正式业务写入，也没有开放规则升级或直接 apply API。

这不是 `AGENT_GOVERNANCE_V1_COMPLETE`。CP-5 的真实 14 天 / 200 Decision 证据尚未自然积累，CP-6 还需要用户显式授权；不得用 fixture、自动测试或本轮 2 条 Decision 代替。

## Completed implementation

- schema v13 四表、Decision Thread/Revision/Event、Review Signal、Rule Authorization、Feedback Event、备份与显式迁移；
- 唯一 `DB.onChanged` 分流的 3 秒 latest-value Shadow 观察链，Provider/Service 失败隔离与离线 waterline；
- LOCAL/EXPANDED Context、hash-addressed 内部 Skill、严格 Structured Decision Output、确定性 Risk Router；
- EXPERIMENT 零正式写入、Guarded explicit-Task 默认关闭接线、提交前完整 revalidation；
- 现有 Plugin shell 内的 Agent 治理台、单条/批量反馈、Skill Feedback 与 Review Evidence 导出；
- 导出使用单个 JSON package，真实 SHA-256、字节清单、凭据脱敏与延迟 URL 回收；
- Structured Provider prompt 给出合法枚举与精确模板，nullable alternative 兼容真实 DeepSeek 输出而不放宽未知字段；
- 根级 `./scripts/check.sh` 全通过：Plugin 499 tests、Local Service 180 tests、typecheck、lint、build、package/bootstrap、边界、145 条规则覆盖、acceptance rehearsal、repository boundary。

## Live checkpoint — 2026-08-02

| Evidence | Result |
|---|---|
| Runtime | Logseq 0.10.15；正式 Plugin build；Service `READY`；schema v13；Graph bridge connected |
| Doctor | `PASS`，11 PASS / 1 WARN / 0 FAIL / 2 INFO；WARN 仅为既有 1 条 stale Proposal |
| Formal projections | Objects 59、Candidates 3、Proposals 49、Semantic Commits 75；与 Shadow 场景前一致 |
| Recovery | Pending/Recovery Commit 0；integrity `ok`；foreign-key violations 0 |
| Governance | 2 Decisions、1 Review Signal、6 Events，其中 3 条 `USER_FEEDBACK_ADDED` |
| Authority | 6 条规则全部 `SHADOW`、全部未暂停；自动应用 0 |
| Explicit Task | 同一 thread 从 Provider rejection 的 r1 安全失败修订为真实 DeepSeek r2 `CREATE_OBJECT / SHADOW / NOT_EXECUTED` |
| Weak signal | `REVIEW_SIGNAL / SHADOW / NOT_EXECUTED`，60 天 NORMAL retention；Objects/Candidates 不变 |
| Feedback | 单条反馈通过；选择 2 条不兼容 Decision 后自动拆成 2 组并记录 2 条反馈；Undo 保持独立 |
| Exports | 30 天 Skill package 含 2 Decisions、5 Events/3 Feedback；60 天 Review package 含 1 条 live Evidence；所有 manifest hash/bytes 匹配，credential hits 0 |
| Backup/restore | live v12→v13 prebackup、schema v13 validated backup、独立临时路径离线恢复均通过；治理行保持 |

完整证据见 `CP4_RUNTIME_REPORT.md`。

## Honest remaining gates

1. 自然积累至少 14 天且至少 200 条真实 Decision，按规则评审误判、漏判、失败与反馈；当前仅 2 条真实 Decision，elapsed day 仍为 0。
2. 集中补测尚未真实覆盖的 Desktop 组合：multi-target EXPANDED、ordinary→action→explicit 的完整同 thread 序列、760 物理窗口、live empty/failure/pause/degrade、timeout/cancel/auth 和 source-missing/truncation Review export。它们已有自动合同，但不能冒充 Desktop 证据。
3. 视觉截图已提供 Light、Dark、详情和批量反馈状态，等待独立人类视觉验收；本 Agent 不自授 `VISUAL_GATE_PASS`。
4. 只有 CP-5 达标且用户显式授权后，才可执行 CP-6 Guarded apply → reload → Undo → reload；结束后仍需恢复 Shadow。

## Preserved boundaries

- 用户已有 `apps/task-copilot-local-service/package.json` 修改未恢复、未暂存、未提交。
- `logseq/` 仍是 ignored 本地测试 Graph；没有提交 Graph、凭据、依赖、构建产物或运行数据。
- 没有 push、没有配置 remote、没有破坏性 Git 清理。
- 本轮错误导出的 3 个精确文件已移入 macOS 废纸篓，可恢复；已验证的最终导出保留在 Downloads。

## Resume instruction

从 `CP4_RUNTIME_REPORT.md` 与 `PENDING_RUNTIME_TESTS.md` 开始。日常只在 Shadow 中收集真实 Decision；达到 14 天 / 200 条前禁止提升 authority。若执行剩余 Desktop 矩阵，应使用同一正式 SQLite 和一个不超过 30 分钟的集中会话，并继续保持 Objects/Candidates/Proposals/Commits 的 before/after 证据。
