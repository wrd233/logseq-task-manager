# ADR：Audit 历史与当前 Object 投影解耦

## 状态

Accepted — 2026-07-20

## 决定

`audit_events.object_id` 保留不可变对象身份，但不再以外键要求该对象必须仍存在于当前 `objects` 投影。`objects`、`anchors`、Ownership 和 Focus 表示当前正式状态；Audit 和 command receipt 表示不可删除的历史证据。

Proposal 正式化的严格 Undo 仅在 Object、版本、Primary Anchor、Graph hash 均仍等于原 Commit 回执，且不存在 Ownership、Focus 或额外 Anchor 时，删除当前 Object/Anchor 投影。Undo 自身写入新的 Audit 和 inverse SemanticCommit，原 Commit 标记 `UNDONE`；任何后续变化都零写入拒绝。

## 理由

E2E-10 要求同时恢复正文与 Store，并且不覆盖后续编辑。把新建对象改成 `ARCHIVED` 不等于恢复提交前的“对象不存在”，还会阻止同一 Block 重新正式化；级联删除 Audit 又会破坏恢复和问责证据。解耦历史与当前投影能满足精确恢复，同时不增加第二状态源、平行恢复表或长期双写。

## 后果

- schema v5 受控迁移重建 `audit_events`，复制所有历史行并保留 object_id；
- 当前投影的引用完整性仍由 Application Command、事务校验和 Doctor 负责；
- Audit 查询必须允许对象已不存在，并将其解释为历史身份，不得伪造当前对象；
- Desktop Gate 必须覆盖 Commit→Undo、reload、后续正文编辑拒绝和中断续跑。
