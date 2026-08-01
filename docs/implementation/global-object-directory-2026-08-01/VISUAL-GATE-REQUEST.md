# Visual Gate Request — Task Copilot Global Object Directory

> 状态：DRAFT（等待 Sprint A–E 完成后填充证据包并升级为 READY）
> 签发人：独立视觉 reviewer（未参与本轮实现结论）
> Codex 无视觉代签能力；DOM/CSS/AX 证据只用于辅助 reviewer。

## 必审场景（Goal §17.1）

1. 默认全局列表（全部事项）
2. 50+ 对象列表
3. “当前关注”筛选
4. “在 Now”筛选
5. 类型 + Lifecycle 组合筛选
6. 搜索（中文/英文/特殊字符/空结果）
7. OPEN 状态组合（ACTIONABLE/WAITING/BLOCKED/PAUSED）
8. 已完成 / 已取消 / 已归档
9. 长标题
10. 来源不可用 fallback
11. overflow 菜单展开
12. 1000 Light / Dark
13. 760 Light / Dark
14. 空结果
15. 筛选展开/收起

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
