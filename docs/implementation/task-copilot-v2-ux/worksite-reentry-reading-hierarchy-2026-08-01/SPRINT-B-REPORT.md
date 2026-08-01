# Sprint B Report: Logseq Worksite Preview

> 2026-08-01；基于 Sprint A 提交 `e10123c`。

## 状态

```text
WRH-P1-03 / WRH-P1-04 / WRH-P1-05: DESKTOP_BEHAVIOR_PASS
Visual Gate: VISUAL_GATE_READY（独立视觉 reviewer 未签发）
```

## 解决的问题

- WRH-P1-03：Now 不呈现来源 Block 子级工作记录；
- WRH-P1-04：预览可能复制到 SQLite 或形成第二编辑器（约束落实为只读 UI projection）；
- WRH-P1-05：多卡片 N+1 子树读取（落实 base-first、lazy、并发上限、缓存）。

## 实现（只读 UI projection，非领域对象）

新增 `apps/task-copilot-logseq-plugin/src/worksite-preview-controller.ts`：

- `WorksitePreviewState`：idle / loading / loaded-empty / loaded / unavailable / stale / error；
- `WorksitePreviewController`：按 `anchor@v{objectVersion}` 缓存；Focus 预取；
  其他卡片展开时读取；并发上限 2；source version 变化自动失效并重读；
  展开状态与 overflow 展开状态为 session-only，不写入正式状态；
- 复用 `executeGraphReadRequest`（Graph Read Bridge）：BLOCK + includeChildren +
  parents 0，只读 Logseq API；
- 投影边界：短预览 ≤3 条 / 深度 ≤2 / ≤280 字符；完整预览 ≤12 条 / 深度 ≤2 /
  ≤4096 字节；保留顺序、缩进、TODO/DOING/WAITING 等 marker；隐藏空 Block 与
  `id::` 身份行；明确截断与“还有 N 条”；不重排、不自动改写、不生成 AI 摘要；
- UI（`ui.ts`/`index.css`/`index.ts`）：Focus 卡默认短预览；其他卡“工作记录（N）”
  折叠；展开/完整/收起/重新读取按钮；错误与不可用只影响本卡片并保留唯一主动作；
  基础卡片先渲染，预览异步加载后合并刷新（50ms coalesce，无刷新风暴）；
  overflow 展开状态跨刷新保持。

## 数据与安全合同

- 正文仍由 Logseq 持有；预览不进入 SQLite/FileStorage/日志/Doctor；
- 无第二编辑器、无第二恢复系统、无正式写入路径（测试断言控制器源码无
  update/insert/remove/move/delete/FileStorage.setItem/SQL 写入）；
- 来源删除/移动 → `NOT_FOUND` → 卡片级“来源位置不可用” + 主操作保留；
- 读取失败 → 卡片级错误 + 重新读取；不影响其他卡片。

## 自动检查

- Plugin 测试：430/430 PASS（新增 16 项：投影顺序/层级/marker、空块与 id:: 过滤、
  大型子树截断、长中文截断、缓存、版本失效、并发上限、状态通知、来源缺失/桥接错误、
  UI 各状态、overflow 保持、只读断言）；
- 根级 `./scripts/check.sh`：PASS（exit 0：typecheck/lint/tests/build、边界、145 rules、
  rehearsal、仓库边界）。

## Desktop 行为证据（真实 Logseq 0.10.15）

证据目录：`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-b/`

| 场景 | 证据 | 结果 |
|---|---|---|
| Focus 卡空子级 | `01` / `05-now-focus-preview` | “暂无工作记录”，主操作保持 |
| 次级卡展开（短预览） | `06-now-secondary-expanded` | 梅北 MiniProject：3 条 + 还有 4 条 + 展开完整记录 |
| 完整预览（嵌套） | `08-now-nested-worksite` | 梅北全量 7 Block（含两层缩进） |
| 完整预览 + TODO marker | `08b-now-nested-marker` | k8s 探针全量 10 Block，TODO marker 可辨 |
| 截断 | `12-now-truncated` | k8s 短预览 3 条 + 还有 7 条 |
| 760px | `02-now-light-760` / `04-now-dark-760` | footer 主操作 + 工作记录正文无溢出 |
| Dark 1000 | `03-now-dark-1000` | 语义一致 |

性能（`performance.json`）：短预览展开 ~107ms，完整展开 ~105ms；每展开 1 次 Graph read；
并发上限 2；缓存命中；最大测试树 8 子级 + 嵌套 + TODO。

## 已知限制

- 正文纯文本编辑（不改变对象版本）不会自动失效缓存；卡片提供“重新读取”；
- VoiceOver 手工 Gate 仍为 owner-accepted risk；
- 独立视觉 reviewer 未执行。
