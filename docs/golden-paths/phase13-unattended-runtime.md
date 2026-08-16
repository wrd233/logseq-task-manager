# Phase 13 — Unattended Runtime Golden Path

> 状态：2026-08-18 实机 + real DeepSeek 验证
> 环境：repo `logseq/` + `/tmp/tc-demo` Kernel + Logseq Desktop 0.10.15

## GP13-1：Natural Work Burst → Unattended Reconcile

1. 用户不打开 DSH；连续编辑 3 个 Formal 对象（12 raw source changes）。
2. Source observer / Work Burst 记录 source coverage。
3. Persistent queue 由 worker 顺序处理，burst coalesce 为 5 个 reconcile jobs。
4. Fake executor 全部 `NO_CHANGE`；无错误 Formal commit。
5. Now 只显示 Project（有 ProjectIntent reality），More 显示 HEALTHY。

证据：`/tmp/tc-phase13-runtime/soak-fake.json`、`soak-resume.json`。

## GP13-2：Pause → User Writes → Resume Catch-up

1. global pause：source changes 仍被记录，queue 不清空。
2. resume：worker 按 notBefore / priority 继续 claim，backlog 消化。
3. 实机：旧失败 job 在 graph 恢复 + worker 重载后新 job 成功 DONE。

## GP13-3：Provider Failure → Degraded → Recovery

1. invalid `DEEPSEEK_API_KEY`：job 失败为 `DEEPSEEK_HTTP_401`，bounded retry，无 silent fallback。
2. More 显示“后台理解暂时不可用；你的笔记不受影响，恢复后会继续追上”。
3. 换回有效 runtime key：新 job DONE（CONFLICT），health 自动恢复 HEALTHY。

证据：`/tmp/tc-phase13-runtime/` 与 service log；`ui-health-degraded.png`、`normal-more.png`。

## GP13-4：Unattended Low-risk Change → Now Since-last-seen

- 后台 CONFIRMED_CHANGE 仍走现有 External Proposal → Formal Commit → Projection Obligation。
- USER-only 操作边界不变；unattended worker 永远没有 USER channel。
- 用户下次打开 Object/Now 看到 `上次以后：当前推进已更新`，不需要知道 AgentRun。

## GP13-5：Boundary Change → DecisionPackage Only

- 后台 BOUNDARY_CANDIDATE / UNKNOWN / CONFLICT 只创建 Governance Issue 或 DecisionPackage。
- 不自动 confirm；不扩大权限。
