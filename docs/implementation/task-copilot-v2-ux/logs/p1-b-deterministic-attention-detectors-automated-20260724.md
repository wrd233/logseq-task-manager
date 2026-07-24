# P1-B 确定性 Attention Detector 自动证据（2026-07-24）

结论：`PARTIAL_AUTOMATED_PASS / RUNTIME_SHADOW_OPEN / USER_VISIBLE_FORBIDDEN`

## 第一波确定性事实

- Condition `reviewAt <= observedAt`；
- Object `dueAt <= observedAt`；
- Proposal 有已接受组但没有对应 COMPLETED Commit；
- SemanticCommit `PENDING / RECOVERY_REQUIRED`；
- Primary Anchor `missing / conflict`；
- Graph binding `MISMATCH`。

未来时间、非 OPEN 对象、已应用 Proposal、active/replaced Anchor 和 Graph match 不产生候选。
本 Slice 不判断 blocker 变化、WAITING 多久算过久、Project 静默或 LLM 跨对象关系。

## 合并与优先级

```text
Graph mismatch
> Commit Recovery Required
> Anchor conflict
> Anchor missing
> Commit Pending
> accepted-not-applied
> reviewAt due
> due
```

同一对象只保留一个 primary issue，其余只进入 suppressed type telemetry。Graph mismatch 是
单一 system-level issue，不为每个正式对象复制。

## 冷却与失效

- eligible signal 的未来 cooldown 会从当轮 primary merge 排除；
- source scope checksum 改变时，P1-A repository 清除旧 cooldown；
- PENDING、RECOVERY_REQUIRED、Anchor 风险、Graph mismatch 均为 `NEVER`；
- 正式事实消失时由 P1-A reconciliation 自动 invalidated；
- 所有候选仍为 `SHADOW / NONE`。

## 自动 Gate

- future/closed exclusion；
- reviewAt 与 due 合并；
- accepted-not-applied 在 COMPLETED Commit 后消失；
- Recovery/Anchor/accepted 同对象优先级；
- Graph mismatch 不按对象放大；
- cooldown 与新事实解除；
- no full-text keys / structured refs；
- Application tests 81/81、0 skipped；
- Application typecheck/lint PASS。

## 未完成

- 尚未把真实 Service projections 适配成 detector snapshot；
- 尚未运行 session shadow telemetry；
- P1-A 跨 reload 存储位置仍 OPEN；
- P0 Desktop Gate 未完成前不得进入 Now/Toolbar/Block。
