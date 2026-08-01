# Performance Report（Goal §16.1 交付物）

## 实测（Logseq 0.10.15 Desktop，1000×720 Light）

| 指标 | 值 |
|---|---|
| 短预览展开（点击 → loaded） | ~107ms |
| 完整预览展开（点击 → >3 blocks） | ~105ms |
| 每次展开 Graph read | 1（BLOCK + children） |
| 并发上限 | 2 |
| 缓存 | 按 `anchor@v{objectVersion}`；命中时 0 次读 |
| 最大测试树 | k8s 探针：8 子级 + 嵌套 + TODO marker |
| 截断 | short 3 条 + 还有 7 条；full 10 条含 marker |

## 设计保证

- 基础 Now 卡片先渲染，worksite 异步加载后合并刷新（50ms coalesce，无刷新风暴）；
- 多卡片不会同步递归读取全部子树：只有 Focus 预取、展开时读取；
- 缓存失效：对象版本变化自动失效；“重新读取”手动刷新；
- 未复制正文到 SQLite/FileStorage/日志。

## 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-b/performance.json`；
- 并发上限测试：`tests/worksite-preview-controller.test.ts`。
