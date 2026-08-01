# Visual Gate Request — Task Copilot Global Object Directory

> 状态：READY（2026-08-01；Sprint A–E 证据已落盘）
> 签发人：独立视觉 reviewer（未参与本轮实现结论）
> Codex 无视觉代签能力；DOM/CSS/AX 证据只用于辅助 reviewer。

## 必审场景（Goal §17.1）

1. 默认全局列表（全部事项）
2. 50+ 对象列表（57 行）
3. “当前关注”筛选（2/57 场景与 unit fixture）
4. “在 Now”筛选（14/57 实测）
5. 类型 + Lifecycle 组合筛选
6. 搜索（中文/英文/特殊字符/空结果）
7. OPEN 状态组合（ACTIONABLE/WAITING/BLOCKED/PAUSED 由 unit fixture 覆盖；
   真实数据当前 ACTIONABLE）
8. 已完成 / 已取消 / 已归档（真实 Desktop 三行）
9. 长标题（现有长标题行）
10. 来源不可用 fallback（“来源需重新连接”）
11. overflow 菜单展开（更多）
12. 1000 Light / Dark
13. 760 Light / Dark
14. 空结果
15. 筛选展开/收起

## 证据包

```text
tmp/runtime/global-object-directory/
  baseline/                    # before：Light/Dark × 1000/760 + 原生 1440
  sprint-a/                    # 目录投影 + 打开原文（anchor-resolution.json）
  sprint-b/01-default … 08-empty
  sprint-c/01-focus-markers … 04-now-markers + focus-loop.json
  sprint-d/01-cancelled-row / 02-archive-review / 03-archived-row / 04-lifecycle-archived-filter
  sprint-e/01-light-1000 / 02-dark-1000 / 03-light-760 / 04-dark-760 / 05-search-27
  sprint-e/performance.json / anchor-resolution.json
  desktop-gate.md
```

每目录含 `screenshot.png / visible-text.txt / accessibility-tree.txt /
interactive-elements.json / ui-state.json / route-and-data.json / computed-style.json`
及对应 `filter-state.json / sort-state.json`；插件子树 AX 快照见
`plugin-accessibility-tree.txt`（宿主页 AX 为 `accessibility-tree.txt`）。

## Reviewer 必须回答（Goal §17.2）

- 页面是否容易连续浏览？
- 是否仍像后台管理器？
- 标题、Lifecycle、Condition 是否容易区分？
- Focus 与 Now 是否容易区分？
- 标记是否过多？颜色和边框是否过度？
- 打开原文是否容易发现？
- 操作是否被合理后置？
- 筛选是否容易理解？当前筛选条件是否明显？
- 760px 是否自然？
- 50+ 对象是否产生明显疲劳？
- 是否出现截断、重叠、溢出？
- 最小修改建议是什么？

## Verdict

```text
PASS / FAIL / IMPROVEMENTS_REQUIRED
```

## 证据包

```text
tmp/runtime/global-object-directory/
  sprint-a/ sprint-b/ sprint-c/ sprint-d/ sprint-e/ desktop-gate/
  （每个目录：screenshot.png、visible-text.txt、accessibility-tree.txt、
   interactive-elements.json、ui-state.json、route-and-data.json、
   computed-style.json、directory-query.json、filter-state.json、sort-state.json）
```
