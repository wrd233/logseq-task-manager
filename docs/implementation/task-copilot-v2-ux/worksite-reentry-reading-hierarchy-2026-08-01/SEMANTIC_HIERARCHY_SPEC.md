# Semantic Hierarchy Spec（Goal §16.1 交付物）

## 五层语义角色

| 层级 | 内容 | Token/规则 |
|---|---|---|
| Object Identity | 事项/项目标题 | `--now-title-size:16px`（Focus 18px）、`--now-title-weight:650`、`--text` 色 |
| Current State | 正常“可继续” | `--now-status-weight:400`、muted；异常（RECOVERY/PENDING/不可核对）1 个 strong + 一种状态色 |
| Work Context | 工作记录正文 | 13px `--text`、行高 1.55；label 12px/600；marker 11px/700 warning |
| Explanation | 为什么现在显示它 | 12px muted、weight 400、默认折叠 |
| Action | 唯一主动作 / 次级 | accent 只给 primary（weight 600）；quiet 全部 muted |

## 预算

- 加粗：普通卡 0 个 `<strong>`；异常卡恰好 1 个；worksite marker 为 CSS 权重标签；
- 颜色：每卡最多一种强状态色；颜色不承担唯一语义（文案同时表达）；
- 状态色映射：`status-pending → warning`、`status-recovery → danger-text`、
  `status-unavailable → warning`；
- 对比度：`tests/contrast.test.ts` 对 Light/Dark 六组 token 组合断言 WCAG AA ≥ 4.5，
  全部通过。

## 布局与空间

- 卡片 padding `--now-card-padding:14px 16px`（Focus 17/18）；内容列 gap 6px；
- 操作列固定 `--now-action-column:156px`，按钮不随文字宽度抖动；
- 标题可换行（`overflow-wrap:anywhere`），长标题实测 705px 内容宽度内完整换行
  （`sprint-g/07`）；
- focus ring：按钮与 summary 统一 `2px --accent-soft`。

## 证据

- `tests/ui.test.ts`（strong 预算、status 类、token 存在性）+ `tests/contrast.test.ts`；
- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-c/`（computed styles）。
