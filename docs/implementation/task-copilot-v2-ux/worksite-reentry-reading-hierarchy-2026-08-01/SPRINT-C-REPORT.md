# Sprint C Report: Semantic Visual Hierarchy

> 2026-08-01；基于 Sprint B 提交 `2fb414e`。

## 状态

```text
WRH-P1-06: DESKTOP_BEHAVIOR_PASS（MEASURED_STYLE_FACT + 自动断言）
Visual Gate: VISUAL_GATE_READY（独立视觉 reviewer 未签发）
```

## 实现的语义角色（Goal §8.2）

| 角色 | 实现 | 实测（Desktop computed style） |
|---|---|---|
| Object Identity | `.now-card-content h3`：`var(--now-title-size)` 16px（Focus 18px）、weight 650、`--text` 色、可换行 | weight 650；Focus 18px |
| Current State | 正常 `.now-status-conclusion` weight 400 + muted；RECOVERY_REQUIRED/PENDING/不可核对 各自 `status-recovery`（danger）/`status-pending`（warning）/`status-unavailable`（warning） | 正常状态 weight 400、muted |
| Work Context | `.worksite-label` 12px/600；正文 13px `--text`、行高 1.55；marker 11px/700 warning | 12px/600 label |
| Explanation | “为什么现在显示它” 12px muted、weight 400、默认折叠 | 12px muted |
| Action | primary 唯一 accent（weight 600）；次级 quiet 全部 muted 降权 | primary weight 600 |

## 预算（Goal §8.3-8.4）

- 加粗预算：普通卡 0 个 `<strong>`（标题由 font-weight 承担）；恢复/待办卡恰好 1 个
  `<strong>`（异常状态）；worksite marker 是 CSS 权重标签，不是 `<strong>`；
- 颜色预算：每卡最多一种强状态色；颜色不承担唯一语义（文案同时表达）；
- 共享 token：新增 `--now-title-size/--now-title-weight/--now-status-weight/
  --now-aux-size/--worksite-line-height/--now-card-padding`，全部在现有 root token
  上扩展，未重构设计系统。

## 自动检查

- 新增测试：语义 token 存在性、h3 使用 token、status 类颜色、primary/quiet 权重、
  普通卡 strong=0、recovery strong=1、pending strong=1 + status-pending；
- Plugin 432/432 PASS；根级 `./scripts/check.sh` PASS（exit 0）。

## Desktop 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-c/`：
  `01-now-light-1000`、`03-now-dark-1000` bundles + `metrics-1000.json`；
- computed-style.json：h3 650 / 18px；CDP 实测 status 400 muted、primary 600、
  explanation 12px muted、worksite label 12px/600。

## 已知限制

- 独立视觉 reviewer 未执行（字重/颜色是否“足够但不过量”最终由 Visual Gate 判定）；
- 自动对比度 Gate 已补：`tests/contrast.test.ts` 对 Light/Dark 六组语义 token 组合
  断言 WCAG AA ≥ 4.5（muted/body/warning/danger/primary 按钮标签），随 Plugin 440/440
  PASS；axe 全量扫描仍不在本轮范围。
