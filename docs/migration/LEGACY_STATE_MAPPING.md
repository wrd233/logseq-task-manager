# Legacy Phase / Signal → V2 状态映射

> 状态：设计已冻结，实现与真实迁移尚未开始。映射输出是可审阅候选，不是自动事实。

## 1. 目标模型

- Lifecycle：`OPEN / COMPLETED / CANCELLED / ARCHIVED`
- Condition：`ACTIONABLE / WAITING / BLOCKED / PAUSED`
- Focus：临时注意力选择，可撤销、可过期，不是生命周期。

V2 不保留 Phase / Signal 当前轴。旧值仅出现在 `legacy_evidence`、迁移报告和历史事件中。

## 2. Phase 映射

| V1 证据 | 建议 V2 语义 | 自动程度 | 理由 / 信息损失 |
|---|---|---|---|
| `COMPLETED` 且 Commit/正文一致 | Lifecycle `COMPLETED` | 可建议确定映射 | 完成含义明确；保留原 Phase 与时间证据 |
| 明确取消事件/正文 | Lifecycle `CANCELLED` | 可建议确定映射 | 不从“未推进”推断取消 |
| 明确归档事件/正文 | Lifecycle `ARCHIVED` | 可建议确定映射 | 归档不能由旧阶段名推断 |
| `CLARIFY / IDEA / DEFINING / PLANNED / READY / ACTIVE / CLOSING` | Lifecycle `OPEN` + legacy narrative | 需审阅 | 这些是推进阶段，不是新生命周期；阶段细节会损失，必须显式展示 |
| Phase 与正文/Commit 冲突 | migration candidate | 禁止自动写入 | 由用户选择当前事实或保留待审 |

`ACTIVE` 不自动产生 Focus；只有仍有效、明确表达当前关注的证据才生成 Focus 候选。

## 3. Condition 映射

| V1 证据 | 建议 V2 语义 | 要求 |
|---|---|---|
| `WAITING` | Condition `WAITING` | 保留 waiting_for / review_at；缺失时标记信息损失 |
| `BLOCKED` | Condition `BLOCKED` | 保留 blocker；不能用 Signal 猜测阻碍内容 |
| `PAUSED` | Condition `PAUSED` | 保留恢复条件或原因；缺失时需审阅 |
| 明确可行动且无等待/阻塞/暂停 | Condition `ACTIONABLE` | 仅由一致事实建议，不由 READY/ACTIVE 机械推断 |
| 多个互斥 Condition 或正文冲突 | migration candidate | 禁止自动选择 |

## 4. Signal 处置

| V1 Signal | V2 处置 |
|---|---|
| `OVERDUE` | 由期限和当前时间重新计算 |
| `REVIEW_DUE` | 由 review_at 重新计算 |
| `STALE` | 由最后活动与策略重新计算 |
| `NO_NEXT_ACTION` | 由对象内容与规则重新计算 |
| `UNASSIGNED` | 作为 ownership validation issue，不存为 Signal |
| `CONFLICT` | 作为 Anchor/Commit/migration issue，不存为 Signal |
| 仅表示注意力的历史信号 | 可生成 Focus 候选，但不得直接写入 Focus |

## 5. 每条报告记录

```json
{
  "legacy_object_id": "...",
  "source_bundle_sha256": "...",
  "old_phase": "ACTIVE",
  "old_conditions": ["WAITING"],
  "old_signals": ["REVIEW_DUE"],
  "suggested_lifecycle": "OPEN",
  "suggested_condition": "WAITING",
  "suggested_focus": null,
  "reason_codes": ["PHASE_IS_PROGRESS_ONLY", "EXPLICIT_WAITING"],
  "evidence_refs": ["commit:...", "anchor:..."],
  "information_loss": ["ACTIVE progress stage retained only as legacy narrative"],
  "conflicts": [],
  "decision": "PENDING_REVIEW",
  "rollback_ref": null
}
```

报告必须允许逐项接受、调整、保持待审或从批次排除。接受后由 Application Command 写入 SQLite；报告生成器无正式写权限。

## 6. Pilot 样本的预期分类

- Pilot Task 当前 `ACTIVE`：建议 Lifecycle `OPEN`；不自动 Focus；Primary Anchor 与 inverse Commit 全量保留。
- Pilot MiniProject：建议 Lifecycle `OPEN`；主归属 Proposal 仍 OPEN，必须作为迁移候选，不能把 ACCEPTED operation 当正式归属。
- Pilot Project 当前 `IDEA`：建议 Lifecycle `OPEN`；DEFINING Proposal 仍 OPEN，保留为非事实。
- 已解决/暂缓/无需行动 Capture：保留各自处置、来源和审计，不强行转换成六类正式对象。

## 7. 验收矩阵

- 覆盖全部旧 Phase、Condition 和 Signal 枚举及其组合；
- 冲突、缺字段、未知值、重复运行和修改后重跑均确定性；
- ACCEPTED operation 未 Commit 时绝不成为正式状态；
- 映射报告逐项说明理由与信息损失；
- 撤销批次后无 V2 当前状态残留，源 bundle hash 不变。

