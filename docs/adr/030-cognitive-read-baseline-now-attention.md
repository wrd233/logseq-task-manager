# ADR 030 — Cognitive Read Baseline and Now Attention Semantics

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/vnext/06` Now Projection / User Attention

## 1. 问题

Phase 16A 的 Now Projection 是「有 signal → 排序 → cap N」，导致：

- 所有刚 formalize 的对象都带着同一条「最近有正式变化」进入 Now；
- quiet WAITING 一直占注意力；
- `currentFocus` 被误当成注意力优先级；
- Pending Decision 在 Now 与「待我确认」重复轰炸；
- 「上次以后」没有相对用户真正看过的时刻，而是 last N commits。

## 2. 决定

### 2.1 UserReadBaseline（schema v17）

新增 `user_read_baselines`：

```text
workObjectId PK
lastViewedFormalVersion
lastViewedAt
lastSeenCommitId
```

- 只有 Plugin USER-channel 的 `POST /v1/objects/:id/viewed` 才能推进 baseline。
- Agent read、background render、API prefetch 不推进 baseline。
- `lastSeenCommitId` 只用于辅助诊断；「上次以后」的计算以 `commit.after.version > lastViewedFormalVersion` 为准，避免同秒时间戳/ID 排序歧义。

### 2.2 Now Attention Semantics

Now 只纳入具备以下 attention signal 的对象：

- **WAITING resurfacing**：刚进入等待、等待条件变化、reviewAt 到期、source coverage 有新未对齐变化；
- **actionable reality signal**：上次看过以后有 semantic commit，或有未对齐 source change；
- **pending decision + reality signal**：有待确认决定且同时具备上述 reality signal。

明确排除：

- quiet WAITING（没有新事实、没有复查节点）；
- 仅有 `currentFocus`；
- 仅有 pending decision（该信号由「待我确认」负责）；
- internal retry / projection refresh / 无 semantic 变化。

### 2.3 输出

`NowProjectionItem` 增加 `lastSeenAt` 与 `changesSinceLastSeen`；`meaningfulChanges` 只包含 semantic commits。排序使用内部 attention weight（不暴露给用户），结果 cap 为 3。

## 3. 验收

- `phase16b-cognitive-baseline.test.ts`：baseline 后新 semantic commit 才 resurface；quiet WAITING / bare currentFocus / package-only object 不出现；mark viewed 后消失。
