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

## WRH-P1-09 自动刷新增量（2026-08-01 Desktop）

| 指标 | 值 |
|---|---|
| 变化事件数量 | 72（一次 A–D 全流程） |
| 防抖后失效次数 | 25（`worksite_invalidation`） |
| 自动重读次数 | 46（`worksite_auto_reload`，含 50ms 合并批） |
| 手动重读次数 | 4（空态/有记录/error 重试） |
| Graph read 调用 | 146（controller readsStarted，最后指标快照） |
| 最大并发 | 1（本场景序列）；上限 2 由单测证明 |
| 自动刷新耗时 | 34–110ms（46 次） |
| 手动刷新耗时 | 15–40ms（4 次） |
| 被忽略的无关变化 | 64（页面 file/content 同步事件） |
| 取消/丢弃的旧请求 | 0（本流程无竞态触发；generation 保护由单测证明） |
| 父链识别读取 | 197 次（上限 8 层/块，单批 64，并发 2） |

## 设计保证

- 基础 Now 卡片先渲染，worksite 异步加载后合并刷新（50ms coalesce，无刷新风暴）；
- 多卡片不会同步递归读取全部子树：只有 Focus 预取、展开时读取；
- 缓存失效：对象版本变化自动失效；子 Block 变化经共享 `DB.onChanged` →
  有限父链/反向索引 → 350ms 防抖 → 仅失效对应对象；“重新读取”手动刷新
  （空态也有入口）；
- 可见卡（Focus/展开）自动重读；折叠卡只标记 stale，展开时读取；
  Now 关闭时不后台读取；
- generation 竞态保护：旧请求结果不能覆盖新结果；
- 不轮询、不写 Graph/SQLite、不改正式对象 version；
- 未复制正文到 SQLite/FileStorage/日志。

## 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-b/performance.json`；
- `tmp/runtime/worksite-reentry-reading-hierarchy/wrh-p1-09-worksite-graph-refresh/
  after/performance.json` 与 `after/preview-load-events.json`；
- 并发上限测试：`tests/worksite-preview-controller.test.ts`。
