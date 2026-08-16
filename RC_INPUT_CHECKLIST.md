# RC Input Checklist

> 状态：2026-08-19 Round 12 首轮；非正式 Release。下一轮才是 Reliability / Release Candidate。

## Frozen capability list

- Natural Workspace + Formal WorkObject（TASK / MINI_PROJECT / PROJECT）
- Context Association / Evidence / Governance Issue
- Discovery / Candidate（显式 bounded，无 continuous）
- Trusted USER Decision + Plugin USER channel
- ProjectIntent / WorkIntent
- Now / Confirmation / WorkMap / More
- Object re-entry + Stateful Agent conversation（FAST / DEEP）
- Unattended runtime：persistent queue / burst / budget / pause / health / single instance / RUNNING supersession
- Closure：Task marker closure；MiniProject/Project USER-only Complete/Cancel/Reopen/Amend
- ClosureReadiness：deterministic gate → async semantic assessment → host aggregation（ADR 040/041）
- Feature Freeze（ADR 042）

## Release Blockers

- [ ] DeepSeek closure gold-set eval（40 cases）在真实 runtime key 下复跑，且 false READY = 0（当前 key 未注入 shell；fake pipeline 已跑，false READY = 0）
- [ ] 10+ MiniProject / 10+ Project 多轮 Agent conversation replay（DSH 剧本）尚未做
- [x] 真实 Logseq Desktop 上以新 async closure UI 完整走一次：Evidence → READY → USER 结束 → closed re-entry（2026-08-19 已完成；closed re-entry 残留已修复）
- [x] Day1–Day5 long-horizon dogfood 首轮（FakeGraph + 真实 Kernel，36 objects）已完成；真实 Graph/Desktop 长周期仍建议 RC 前复跑

## Known Issues

- Logseq Electron 页面 target 的 `Page.captureScreenshot` 永久挂起；用 `screencapture -l <windowId>` 替代（helper：`/tmp/winlist_all`，不入 Git）
- 历史 FAILED reconcile jobs 会留在 `runtimeFailedJobs` 计数中，但 health 按“最近连续失败/最近成功”表达，DEGRADED 后只有真正成功才回 HEALTHY（有意设计）
- `/tmp/tc-demo/service.pid` 可能指向已退出实例；health/lease 以 SQLite runtime_leases 为准

## Non-blocking polish

- Project Surface 的目标/阶段文案可进一步按真实 diff 收敛
- WorkMap 在 50+ 对象时考虑折叠 / active-only / 简单搜索（仅在 dogfood 证明需要时）
- CDP screenshot harness 可固化 OS-window 方案

## Migration status

- schema v22：`closure_assessments` 增加 `evidence_watermark / gate_json / readiness_changed_at`；新增 `closure_assessment_jobs`
- v22 由 SqliteStore 自动迁移；旧 cached assessment 视为 stale 并异步重评估

## Startup / shutdown

- 单实例 SQLite lease（ttl 30s / heartbeat 10s）；第二实例 `KERNEL_INSTANCE_ALREADY_RUNNING`
- clean shutdown：lease release + descriptor remove；stale lease 可接管
- closure coordinator timer 独立于 maintenance worker；close 时一并停止

## Backup / restore

- Formal truth = SQLite（WAL）；Graph 只是投影。备份 SQLite + 保留 Graph 可恢复
- 尚未提供内置 backup/restore 命令（RC 阶段评估）

## Secret handling

- `DEEPSEEK_API_KEY` 仅运行时 env；不入 repo / Graph / SQLite / fixture / docs / logs
- descriptor/token 0600 写入 state dir，Graph test-open 但 Git-ignored

## Graph safety

- Natural Work Fail Open，Formal Governance Fail Closed
- user-edited projection 永不被覆盖；marker 冲突 fail closed
- `logseq/` 完全测试开放，永远不入 Git

## Failure matrix（已有测试/实机证据）

| failure | natural write | formal corruption | catch-up |
| --- | --- | --- | --- |
| single-instance conflict | YES | NO | 第二实例 fail fast |
| stale lease | YES | NO | 接管 |
| source-during-run | YES | NO | STALE/SUPERSEDED → latest |
| Kernel restart | YES | NO | persistent queue 继续 |
| Plugin reload | YES | NO | broker redelivery |
| Graph offline | YES | NO | fail fast + 恢复后 drain |
| DeepSeek 401 / timeout / 5xx | YES | NO | bounded retry；closure cached stale 不猜 |
| budget exhaustion | YES | NO | defer 下窗口 |
| closure assessment stale | YES | NO | 重评估；UI 显示正在重新评估 |
| closure superseded | YES | NO | old result 不成为 current |
| child reopen | YES | NO | package STALE + execution fail closed |
| WorkIntent/ProjectIntent change | YES | NO | semanticRevision stale |
| Evidence hash change | YES | NO | assessment watermark stale |
| DecisionPackage stale | YES | NO | confirmations sweep + Kernel final check |
| projection backlog | YES | NO | bounded retry + DEGRADED 后恢复 |
| user correction | YES | NO | correction 各回各层 |

## Performance baseline（本地实测）

- now / workmap / system / object-context(open+closed) / closure-assessment cached：7 次采样 min/p50 全部 **1–2ms**（`/tmp/tc-phase16-ux/perf.json`）
- 36-object Day1–Day5 dogfood：maintenance 16 cognition calls；Day5 Now 3 / Confirmation 0 / WorkMap 36 / system HEALTHY
- 真实 DeepSeek closure latency 待 runtime key 复跑

## Dogfood findings（首轮 harness + real Desktop）

- final Now = 3（都是真正值得恢复的对象），无重复/READY 堆积
- Confirmation = 0，无陈旧 package；OPEN packages/candidates/issues 全部为 0
- 失败日 DEGRADED 只描述真相；Day5 真实成功后回 HEALTHY，旧 FAILED 计数保留
- quiet WAITING 4 个中仅 1 个因真实回复变化 resurface；无 waiting 噪音
- 真实 Desktop：READY Object Surface → 点击结束 → trusted USER commit 成功；closed re-entry “目前可推进/和 Agent 讨论”残留已修复
