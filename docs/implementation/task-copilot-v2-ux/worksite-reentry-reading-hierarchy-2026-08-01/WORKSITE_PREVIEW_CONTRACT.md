# Worksite Preview Contract（Goal §16.1 交付物）

## 定义

Worksite Preview 是来源 Logseq Block 子树的**只读 UI projection**。它不是领域对象、
SQLite 记录、AI 摘要、第二编辑器或第二恢复系统。

## 状态机

```ts
type WorksitePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded-empty"; sourceVersion?: string }
  | { status: "loaded"; sourceVersion?: string; blocks: PreviewBlock[];
      totalVisibleCount: number; truncated: boolean; remainingCount: number; readAt: string }
  | { status: "unavailable"; reason: string }
  | { status: "stale"; previousVersion?: string; currentVersion?: string }
  | { status: "error"; diagnosticId?: string; safeMessage: string };
```

## 读取边界

| 模式 | Block 上限 | 深度 | 字符/字节 |
|---|---|---|---|
| short（默认/Focus） | 3 | 2 | 280 字符 |
| full（展开完整记录） | 12 | 2 | 4096 字节 |

- 保留顺序与缩进；TODO/DOING/WAITING/DONE/NOW/LATER marker 可辨；
- 隐藏空 Block 与 `id:: <uuid>` 身份行；不重排、不改写、不生成 AI 摘要；
- 截断明确：内容末尾 `…` + “还有 N 条”；来源不存在 → “来源位置不可用”；
- 读取失败只影响本卡片并保留唯一主动作。

## 读取策略（复用唯一 Graph Read Bridge）

- `executeGraphReadRequest` BLOCK + `includeChildren` + parents 0；
- Focus 项预取；其他卡片展开时读取；并发上限 2；按 `anchor@v{objectVersion}` 缓存；
- 版本变化自动失效重读；卡片“重新读取”可手动刷新（loaded-empty / loaded /
  stale / error / unavailable 均有入口）；
- 子 Block 变化自动失效：复用 Explicit Sync 的同一 `DB.onChanged` 监听器，
  经 Worksite Change Router 对变化 Block 做有限父链读取（上限 8 层，单批 64，
  并发 2）或命中已加载预览的反向索引，只失效对应对象的预览缓存；
- 每个受影响对象 350ms 防抖合并；Now 打开且卡片可见（Focus 或展开）→ 自动重读；
  折叠卡片只标记 stale，展开时读取；Now 关闭时不后台读取，下次进入按需读取；
- 竞态保护：控制器 generation 递增，旧请求结果不能覆盖新结果；
- 不轮询、不写 Graph/SQLite、不改正式对象 version；
- 展开状态与 overflow 展开状态 session-only，不写入正式状态；
- 无 update/insert/remove/move/delete/FileStorage.setItem/SQL 写入路径（测试断言）。

## 状态语义

- loading 不阻塞基础卡片（base-first，50ms coalesce 合并刷新）；
- loaded-empty 是中性结果（“暂无工作记录”）；
- error/unavailable 不污染其他卡片或全局工作区。

## 证据

- `tests/worksite-preview-controller.test.ts`（23 项：投影/缓存/并发/版本/错误/只读/
  invalidate/stale/generation/dispose/metrics）；
- `tests/worksite-change-router.test.ts`（15 项：锚点/子级/孙级/删除/移入移出/
  无关树/父链上限/防抖/批次/清理）；
- Desktop：`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-b/`
  （focus-empty、secondary short、nested full、TODO marker、truncated、760/dark）；
- WRH-P1-09 Desktop：`tmp/runtime/worksite-reentry-reading-hierarchy/
  wrh-p1-09-worksite-graph-refresh/`（before 缺陷复现 + after A–D 流程 +
  graph-change-events / preview-load-events / performance / desktop-gate）；
- `performance.json`：short ~107ms、full ~105ms、每展开 1 次 Graph read；
  自动刷新 34–110ms，手动刷新 15–40ms，最大并发 2（单测）。
