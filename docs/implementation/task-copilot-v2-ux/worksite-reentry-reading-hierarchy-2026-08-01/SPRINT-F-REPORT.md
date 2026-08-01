# Sprint F Report: Active Surface Polish & Microcopy

> 2026-08-01；基于 Sprint E 提交 `62ed0dd`。

## 状态

```text
WRH-P2-04: DESKTOP_BEHAVIOR_PASS（视觉待 reviewer）
WRH-P3-01: PARTIAL（“为什么现在显示它”“可继续”已完成；剩余文案随日常使用继续观察）
```

## 实现

- 宿主背景隔离：action dialog 打开时新增全视口 `.surface-veil`（58% 主题背景色遮罩，
  `aria-hidden`），active-surface-shell 提升到 z-index 1；主导航仍不进入 DOM；
- 微文案：
  - `当前可以继续推进` → `可继续`（`packages/application/src/status-narration.ts`）；
  - Now/Reentry 的 `查看依据` → `为什么现在显示它`；
  - MiniProject Grill eyebrow 的“本次讨论结束后清除”后置为说明行
    “本次讨论内容在结束后清除”；
- 时间：新增 `userFacingRelativeDateTime`，Now 期限、Review eyebrow、Project
  reentry eyebrow 使用“今天/昨天/明天/7月31日 20:35”格式；技术详情保留完整时间。

## 自动检查

- 新增测试：相对时间（今天/昨天/跨月/无效）、surface-veil 存在且主导航不在 DOM、
  微文案后置（源码断言）、CSS veil/z-index；
- Plugin 438/438 PASS；application 174/174 PASS；根级 `./scripts/check.sh` PASS（exit 0）。

## Desktop 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-f/
  19-confirmation-host-isolation-dark-760/`：760×720 Dark 条件表单 + veil
  （computed background `color(srgb 0.09 0.125 0.11 / 0.58)`）+ 无主导航；
- Now 结论已显示“可继续”。

## 已知限制

- Grill 的独立宿主截图未单独生成（与 Confirmation 共用同一 active-surface-shell）；
- VoiceOver 手工 Gate 仍为 owner-accepted risk；视觉 reviewer 未执行。
