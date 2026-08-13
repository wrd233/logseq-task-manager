# Task Copilot vNext Logseq Writing Language v1

Status: frozen candidate for Phase 5.5 acceptance  
Date: 2026-08-13

Writing Language v1 translates existing Task formal semantics into sparse,
native-looking Logseq text. The natural source is always primary. Managed text
appears only when it adds information that the source marker/title do not
already express.

## Grammar

All visible managed fields are direct children of the natural Task. A semantic
label begins at the start of the child and is bold.

```text
managed-field := **[label]** value
```

`value` must be non-empty. Labels are standard renderer-owned presentation;
UUID identity, not label text, determines the semantic field.

## Task rules

| Formal state/value | Visible form |
| --- | --- |
| `OPEN + ACTIONABLE`, no focus | no managed child |
| non-empty `currentFocus` | `**[当前推进]** value` |
| `WAITING` description | `**[等待]** value` |
| non-empty `reviewAt` | `**[复查]** value` |
| `COMPLETED`, outcome equals title | no managed child; `DONE` is sufficient |
| `COMPLETED`, outcome adds information | `**[完成]** value` |
| `CANCELLED` | `**[取消]** reason` |

The completion omission rule is deterministic: after trimming surrounding
whitespace, an outcome equal to the formal title is omitted. It is not an Agent
judgment.

## Ordering

Visible managed children use this order:

1. current focus;
2. waiting;
3. review date/time;
4. completion or cancellation.

Lifecycle rules normally make focus/waiting and closure mutually exclusive.
The fixed order still makes rendering and recovery deterministic.

Natural children are never reordered. Managed fields form a contiguous managed
segment before existing natural children when first inserted; subsequent
rendering changes only registered managed UUIDs.

## Complete synthetic examples

Ordinary actionable Task:

```text
TODO 配置测试服务器管理口
```

Task with current focus:

```text
TODO 完成测试服务器上架
  **[当前推进]** 配置管理口并验证网络访问
```

Waiting with review:

```text
TODO 完成测试服务器上架
  **[等待]** 网络组确认测试 VLAN
  **[复查]** 2026-08-15
```

Completion with no extra information:

```text
DONE 完成测试服务器上架
```

Completion with a useful outcome:

```text
DONE 完成测试服务器上架
  **[完成]** 管理口、业务口和跨网段访问均已验证
```

Cancellation:

```text
TODO 完成测试服务器上架
  **[取消]** 演练环境已由替代方案覆盖
```

## Omission and density

Never render an empty labelled block. Never expose `OPEN`, `ACTIONABLE`, `null`,
hashes, UUIDs, record IDs, Evidence IDs, waiting subject/since, or property
ownership metadata as default user-facing text. Full records remain available
through Kernel API/CLI/audit surfaces.

Waiting is visually prominent through a direct labelled child, not a quote.
This keeps indentation and journal rhythm compact while remaining readable if
plugin CSS is absent. Writing Language v1 does not require semantic CSS.

## Editing ownership

- Renderer owns label and layout.
- User-visible value is semantic content governed by the existing command
  boundary.
- Changing only `[当前推进]` to another label does not change the formal fact and
  does not create `SET_CURRENT_FOCUS`.
- Changing the focus value is a formal-command candidate and must still pass
  through `SET_CURRENT_FOCUS`.
- Direct waiting edits remain high-risk and cannot bypass Phase 4 controlled
  reconciliation.

## Machine metadata

Machine identity lives in the SQLite `PrimaryAnchor` UUID registry. Writing
Language v1 does not render a metadata container or UUID properties. The Reader
locates managed blocks by UUID and validates topology/value independently of
the visible label string.

## Future MiniProject and Project convention

These are language guidance only; Phase 5.5 does not implement new domain
semantics.

```text
**[MiniProject]** 完成测试环境验收 #MiniProject
  **[背景]** 为什么这组工作值得聚合
  **[目标]** 可验证的结束状态
  **[当前阶段]** 当前阶段或推进重点
  **[成果]** 可重入的结果摘要
```

A future Project may use the same selective bold-label grammar for established
sections such as background, goal, current stage, and result. Task Copilot must
not impose empty sections or infer formal identity from labels/tags.

## Non-goals

No customizable labels, theme settings, template editor, formatting DSL,
whole-Graph formatter, Project expansion, PARKED workflow, or legacy V1
compatibility is part of Writing Language v1.
