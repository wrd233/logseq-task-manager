# Accessibility Report — Global Object Directory

## 结构事实（DOM/AX，真实 Desktop）

- 搜索输入：`aria-label="搜索标题"`，`data-field="v2DirectorySearch"`；
- 注意力 chips：`aria-pressed` 表达选中态（全部/当前关注/在 Now）；
- 筛选下拉：`aria-label` = 类型/状态/当前情况/排序；
- 结果计数：`aria-live="polite"`；
- 行：`<article>` + `<h3>` 标题；操作按钮有可见文本；
- 打开原文按钮：可见文本“打开原文”；来源不可用显示“来源需重新连接”文本；
- 更多菜单：原生 `<details>/<summary>`，键盘可展开/收起；focus-visible 环与全局一致；
- 目录输入/下拉补齐 border + focus-visible 环（Sprint E）；
- 无重复 DOM id（自动测试断言 + AX 树复核）；
- WCAG AA 对比度：token 对（text/surface、muted/surface-2、primary/accent 等）
  Light/Dark 通过（`contrast.test.ts`）。

## 证据标注（重要）

- `accessibility-tree.txt`：Logseq 宿主页的浏览器 AX 树（CDP 跨源 iframe 不展开
  Plugin 子树，属宿主证据）；
- `plugin-accessibility-tree.txt`：Plugin iframe 的 DOM 推导 AX 快照
  （role/name/aria-pressed/aria-expanded/disabled 等），由真实 Desktop DOM 生成，
  与 `interactive-elements.json` 交叉印证。代表快照：
  `tmp/runtime/global-object-directory/plugin-accessibility-tree.txt`
  与 `sprint-e/06-plugin-ax/`、`sprint-e/01-light-1000/`。

## 未执行的专项

- 真实 VoiceOver 人工走查、物理键盘逐键顺序：`OPEN_MANUAL_GATE`，
  与既有 CUX-P2-03 一致，不伪装为已执行；AX 树证据已随截图包提供。

## 证据

- `tmp/runtime/global-object-directory/sprint-e/01..04/accessibility-tree.txt`
- `tmp/runtime/global-object-directory/sprint-e/01-light-1000/plugin-accessibility-tree.txt`
- `tmp/runtime/global-object-directory/sprint-e/01..04/interactive-elements.json`
