# Accessibility Report（Goal §16.1 交付物）

## 已实现并自动验证

| 项 | 实现 | 验证 |
|---|---|---|
| 按钮 accessible name | primary/quiet 文本；⋯ summary `aria-label="更多操作"` | DOM/Desktop bundle |
| Disclosure expanded | `aria-expanded` 初始 false，toggle 事件同步 true/false | Desktop 真实鼠标/键盘 |
| 菜单键盘 | Enter/Space 打开；Esc 关闭并聚焦回 summary | Desktop 真实 key event |
| 外部点击关闭 | pointerdown 在菜单外关闭 | Desktop 真实鼠标 |
| DOM/AX 顺序 | 内容列（eyebrow→标题→状态→工作记录→解释）先于操作列 | AX tree bundle + DOM 顺序测试 |
| 焦点恢复 | Esc 关闭后焦点回到触发 summary；重绘后 restoreUiFocus 复用既有机制 | Desktop |
| 无重复 ID | 渲染断言（Now/Objects/对话框） | `tests/ui.test.ts` |
| 对比度 | Light/Dark 六组 token 组合 WCAG AA ≥ 4.5 | `tests/contrast.test.ts` |
| 背景 inert | active surface 时主导航不在 DOM + veil | Desktop bundle `sprint-f/19` |

## 未执行的人工 Gate

```text
Status: NOT_RUN_OWNER_DECISION_REQUIRED
真实鼠标/键盘/VoiceOver 人工操作未执行；产品负责人可按上一 Goal 惯例知情接受，
或单独安排无障碍兼容性人工 Gate。
```

## 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/` 各 bundle 的
  `accessibility-tree.txt` 与 `interactive-elements.json`；
- Sprint A/F 报告中的真实输入链（open/Esc/outside/focus）。
