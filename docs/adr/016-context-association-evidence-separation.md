# ADR 016 — Context Association 与 Frozen Evidence 分层

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 8 章、`docs/vnext/06` 第 7/8 章、`docs/vnext/07` Phase 10
- 实现基线：schema v10 `context_associations` / `association_corrections`

## 1. 决定

- **Context Association** 表达“自然材料目前被认为与某个 Formal WorkObject 的理解有关”。
  它不是 ownership、Evidence、Graph 写回或 Formal Relation。
- Agent 可以对 high-confidence、non-destructive、reversible 的 existing-object association 自动落地；
  origin 至少区分 `USER_EXPLICIT` / `AGENT_INFERRED` / `SYSTEM_STRUCTURAL`。
- 自动 Association 默认只写 Kernel/SQLite，不向 Logseq 添加 property/page-ref/tag。
- **Frozen Evidence** 只由真正支撑 Formal Judgment 的最小材料组成；
  Context 读得宽，Evidence 冻结得窄。

## 2. 具体实现

- `Kernel.associateContext`：
  - 要求 target OPEN；
  - active correction 命中时以 `ASSOCIATION_CORRECTION_BLOCKS` fail closed；
  - active (workObject, graphId, blockUuid) 去重。
- `Kernel.recordAssociationCorrection`：
  - 持久化 sourceRef / scopeSnapshot / rejected / affirmed / userDecisionRef；
  - 同时 invalidate 该 source 下对被纠错对象的 active associations；
  - 不建立关键词黑名单，只做 scoped、source-aware、boundary-aware 记忆。
- `MaintenanceCoordinator`：
  - 只对 job 绑定的 sourceBlockUuid freeze 一条 `maintenance-evidence:<jobId>`；
  - active context associations 通过 `READ_BLOCK` 读入理解范围，但不 freeze；
  - 跨 restart 的 job 现在持久化 `source_block_uuid`。
- Plugin Source Observer 扩展 L1：changed block 通过 page-tree ancestry 找到已知 Primary Anchor 时，
  先建立/确认 `SYSTEM_STRUCTURAL` association，再上报 source change。
- API：`/v1/context`、`/v1/context/associate`、`/v1/context/:id/invalidate`、
  `/v1/context/corrections`、`/v1/evidence?object=`；CLI `context list/add/remove/correct`、`evidence list`。

## 3. 为什么

- 现实工作材料大多不在 Primary Anchor，只有 Context 层能稳定回答“为什么属于这个对象”；
- 读多少与证明多少必须分开，否则 Evidence Store 会变成 Workspace 镜像；
- 用户纠错必须长期生效但不升级为永久规则；scoped correction 是两者之间的最小模型。

## 4. 不做什么

- 不自动 CREATE WorkObject；
- 不改 Graph 自然内容；
- 不把 association 当 Formal evidence；
- 不做通用 relation graph；
- 不做 keyword blacklist / per-object hidden Taste。

## 5. 验收

`packages/test-support/tests/phase10-context-governance.test.ts` 覆盖 association 去重、correction 阻断、
Graph 无污染、conflict reconcile 下仅 1 条 Evidence frozen；真实 Logseq 场景在
`tmp/phase10-real-background.mts`（gitignored）中验证 anchor 编辑 → observer → queue → focus formal commit。
