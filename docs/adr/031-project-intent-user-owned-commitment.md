# ADR 031 — ProjectIntent as a USER-owned Project Commitment

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/vnext/06` §4、`docs/adr/029`

## 1. 决定

ProjectIntent 是 Project 的长期正式承诺，不是项目说明文档、进度百分比或 AI 自动摘要。

最小模型（`packages/domain`）：

```ts
ProjectIntent {
  workObjectId
  objective: string | null
  keyResults: ProjectKeyResult[]   // 1..5
  scope: string | null
  currentPhase: string | null
  revision: number
  createdAt / updatedAt
}
ProjectKeyResult { id: string; text: string }
```

- KR 不是 WorkObject，无 lifecycle/engagement/ownership/progress/score。
- Objective / KR / currentPhase 宁缺毋滥；证据不足时只建议 Objective，不自动生成漂亮 KR。
- ProjectIntent 存独立 SQLite 表（schema v18），不膨胀 WorkObject。
- `UPDATE_PROJECT_INTENT` 是 Decision-only operation：Agent 只能创建 DecisionPackage，正式变化必须经过 Plugin Trusted USER Channel → UserDecision → USER Commit。
- Package 绑定 Project formal version + `expectedIntentRevision`；任一变化后执行会 STALE。
- ProjectIntent 不产生 Graph projection；Graph offline 不影响 Kernel 展示。

## 2. 影响

- `ObjectContextPack.projectIntent` 为 Project 提供稳定方向语义。
- Now Project card 的 `currentReality` 优先使用 `objective + currentPhase`，不再只显示“N 个子项在推进”。
- WorkMap Project 行 secondary line 显示 `currentPhase`。
- External Agent 读取 context 即可获得 Objective/KR/Phase，不需要用户重复解释。

## 3. 验收

- `phase17-project-intent.test.ts`：trusted package path PASS、revision stale PASS、project version stale PASS、bare bearer 无法伪造。
- Domain test：≤5 KR、revision monotonic、unchanged reject。
