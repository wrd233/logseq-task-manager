# Evidence Index — Global Object Directory

> 所有运行时证据位于外层 Git 忽略的 `tmp/runtime/global-object-directory/`；文档只登记路径与事实。

## Phase 0（before）

| 证据 | 路径 | 说明 |
|---|---|---|
| 对象目录查询快照 | `baseline/directory-query.json` | SQLite objects：22 条，类型/Lifecycle/Condition/dueAt/updatedAt |
| Focus 快照 | `baseline/focus-selections.json` | focus_selections：2 条 |
| Anchor 快照 | `baseline/anchors.json` | anchors：27 条（角色/状态/externalId/hash） |
| Ownership 快照 | `baseline/ownerships.json` | primary_ownerships：0 条 |
| 截图 + 机器证据（Light 1000） | `baseline/objects-light-1000/` | screenshot/visible-text/AX/interactive/computed/route/ui-state |
| 截图 + 机器证据（Dark 1000） | `baseline/objects-dark-1000/` | 同上 |
| 截图 + 机器证据（Light 760） | `baseline/objects-light-760/` | 同上 |
| 截图 + 机器证据（Dark 760） | `baseline/objects-dark-760/` | 同上 |
| 截图 + 机器证据（原生 1440） | `baseline/objects-light-native-1440/` | 同上（附加） |
| 采集工具 | `tools/capture-evidence.mjs` | CDP 证据采集脚本（不提交） |

## 计划证据布局（每 Sprint 落盘）

```text
tmp/runtime/global-object-directory/
  sprint-a/    # 目录投影 + 打开原文 + 生命周期显示合同
  sprint-b/    # 搜索/筛选/排序
  sprint-c/    # Focus/Now 闭环
  sprint-d/    # 次级维护/详情/归档核验
  sprint-e/    # Light/Dark × 1000/760、50+ 对象、AX/对比度
  desktop-gate/ # 场景 A–E（desktop-gate.md + 机器可读证据 + 性能报告）
```

每场景至少保存 Goal §16 要求的机器可读文件：`screenshot.png`、`visible-text.txt`、
`accessibility-tree.txt`、`interactive-elements.json`、`ui-state.json`、
`route-and-data.json`、`computed-style.json`、`directory-query.json`、
`filter-state.json`、`sort-state.json`、`anchor-resolution.json`、`desktop-gate.md`。

## 证据分类（沿用 Goal §1）

- `STRUCTURAL_FACT`：代码/DOM/AX 直接可证；
- `DATA_FACT`：SQLite/Service 只读查询可证；
- `DESKTOP_BEHAVIOR_FACT`：真实 Logseq Desktop 操作可证；
- `MEASURED_STYLE_FACT`：computed style / 布局测量可证；
- `CURRENT_VISUAL_JUDGMENT`：视觉判断，Codex 不代签；
- `OPEN_MANUAL_GATE`：键盘/VoiceOver/视觉 reviewer 专属。
