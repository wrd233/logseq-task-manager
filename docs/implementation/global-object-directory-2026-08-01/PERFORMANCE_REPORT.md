# Performance Report — Global Object Directory

## 真实 Desktop（Logseq 0.10.15）

| 指标 | 实测 | 说明 |
|---|---|---|
| 首次渲染（导航→57 行可见） | 18ms | 57 DOM 行 |
| 搜索（含 250ms 防抖） | 353ms | 净渲染约 103ms；唯一结果 1/57 |
| 类型筛选 | 5ms | 57→结果集重渲染 |
| 排序切换 | ~3ms | 六种排序同构 |
| 最大 DOM 行数 | 57 | 等于结果数，无冗余嵌套 |
| 插件侧横向溢出 | 0 | iframe scrollWidth == clientWidth（1000/760） |

说明：核心测量在 57 对象时点完成；其后新增 2 个条件 fixture
（OPEN+WAITING / OPEN+BLOCKED），当前测试库共 59 个对象，
行数仍等于结果数（`sprint-e/07-conditions/` 拍摄 59 行）。

## 自动 fixture（500 对象）

- `projectGlobalObjectDirectory` + 搜索/类型/生命周期/标题排序：6.4ms（阈值 <2000ms）；
- 60 行 UI 渲染测试：行数=60、无重复 DOM id（`ui.test.ts`）。

证据：`tmp/runtime/global-object-directory/sprint-e/performance.json`。
