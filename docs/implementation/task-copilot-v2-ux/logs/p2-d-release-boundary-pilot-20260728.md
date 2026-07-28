# P2-D Release 边界 — 连续使用 Pilot 结论

> 状态：`BOUNDARY_ACCEPTED_IMPLEMENTATION_PARTIAL`
> 依据：`PILOT-2026W31-A` Day 1—6、现有 Desktop/Undo/Recovery 证据与当前代码
> 日期：2026-07-28

## 结论

`PROJECT_OPERATION_INTENTS` 的 16 类是后台穷举与安全路由，不是 16 个一级用户操作。
当前 Project 前台保持四个用户意图：

1. 更新当前状态；
2. 整理项目摘要；
3. 调整目标、成果和推进结构；
4. 结束这个项目。

Focus、期限等通用动作留在既有就近入口；归属或关联只有在专用 inverse 和用户恢复说明
齐全后才开放。正文移动、批量子对象、拆分合并等复杂工作由外部 Agent 准备有界 Context
和 Proposal，最终仍回到 Task Copilot 的 Preview / Review / Commit / Undo / Recovery。

## A. Release 内置完成边界

| 内部 intent | 用户语言 / 合并方式 | 证据与边界 |
|---|---|---|
| `FOCUS_VISIBILITY` | 加入或移出当前关注 | 高频且已有版本重验、排序和撤销；不作为“调整项目”首屏字段 |
| `CONDITION` | 更新当前状态 | Day 3 Waiting、Day 6 恢复行动真实使用；同一 Condition/Undo |
| `REVIEW_AT` | 合并进“更新当前状态” | Waiting/Paused 的复查时间，不建立独立入口或状态 |

这些能力不改变 Project 结构、正文或 Ownership。

## B. Release 内置但需 Review / Grill

| 内部 intent | 用户语言 / 合并方式 | 正式边界 |
|---|---|---|
| `CURRENT_SUMMARY` | 整理项目摘要 | MEDIUM Review；只改叙述层 |
| `CURRENT_FOCUSES` | 与“整理项目摘要”合并 | 同一 `UPDATE_PROJECT_NARRATION`，不再单独暴露字段系统 |
| `CURRENT_INTERFACE` | 调整目标、成果和推进结构 | HIGH Preview/Review/Commit/Undo |
| `OBJECTIVES_DELIVERABLES` | 同上 | 与完整当前接口原子审阅 |
| `STAGE_MAPPING` | 同上，进入完整结构详情 | 不建独立工作台 |
| `OWNERSHIP` | 处理归属 | 独立 HIGH；专用 inverse / Recovery，不和 Association 混用 |
| `CLOSURE` | 结束这个项目 | P2-E 独立阶段向导；不得降级为通用结构表单 |

`CURRENT_SUMMARY` 和完整结构各已有代表性 Desktop 往返；Ownership/Closure 继续按各自剩余
Gate 验收，不能因被列入 B 就冒充全部 Done。

## C. 路由到外部 Agent

| 内部 intent | 原因 | Task Copilot 保留的权威 |
|---|---|---|
| `BULK_CHILDREN` | 多对象高上下文与批量 inverse 成本 | Context 范围、Preview、Proposal、Commit、Recovery |
| `MOVE_CONTENT` | Logseq 正文位置、来源保留与 Anchor 风险 | 有界读、最终阅读、原子应用、Undo/Rebind |
| `SPLIT_MERGE` | 多 Project 语义与跨对象治理 | 用户确认边界和每个正式变化 |
| `EXTERNAL_AGENT` | 复杂讨论不是固定表单 | Agent 只提议；Task Copilot 控制正式写入 |

这些能力仍属于完整 Goal，不是 Out of Scope；Release 不为每类建立独立大型前台工作台。

## D. 暂不开放

| 内部 intent | 当前结论 | 重新开放条件 |
|---|---|---|
| `ASSOCIATION` | UI 保持禁用 | 必须先有正式 remove/inverse、reload 后 Undo 和用户恢复说明 |
| `DUE_AT` | 不从 Project 结构路由开放 | Project 级期限语义、跨 reload inverse 和真实使用价值同时明确；Task 期限继续用既有入口 |

## Pilot 使用事实

- Day 1—6 真正频繁使用的是 Condition、Focus/Now、Project 创建/摘要/结构、Context
  Recovery 和 Undo；没有证据支持把 16 类全部做成用户按钮。
- Day 6 Dynamic Now 对照又说明前台复杂度不能靠隐藏连续性相关事项解决；P2-D 同理，
  应减少入口但保留安全权威。
- Day 7 moved/renamed/Rebind、Day 9 Closure 和 Day 10 回顾会继续验证 B/C 边界；
  发现新证据时修改分类，不新增平行 Router。

## 复杂度变化

- 新增正式状态：0
- 新增 Runtime：0
- 新增 Recovery 分支：0
- 新增 Skill / Prompt / Validator：0 / 0 / 0
- 新增用户一级操作：0
- 合并用户语义：`REVIEW_AT→CONDITION`、`CURRENT_FOCUSES→CURRENT_SUMMARY`、
  `STAGE_MAPPING→完整结构`
