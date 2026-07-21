# V2 普通 Association 合同

## 用户问题

用户需要表达两个正式对象“相关”，但这种联系既不是页面位置，也不是 Primary Ownership。用 Ownership 代替会改变唯一主归属语义；因此 schema v9 增加一个最小、单一含义的 `associations` 投影。

## 封闭语义

- 权威 V2 §34.4 固定了 kind/status/created/updated 列；本阶段将 kind 封闭为 `RELATED`、status 封闭为 `ACTIVE`。它们不是用户可编辑分类或新状态机；方向由 `source_object_id → target_object_id` 明示。
- Association 不改变 Primary Ownership、Anchor、Lifecycle、Condition、Focus 或 Logseq 正文/位置。
- 同方向同 kind 唯一；禁止自关联；来源对象以 expected version 并发保护并递增版本。
- 机器权威仅为 SQLite `associations`；Context Package 的 `relations.json` 和 Plugin 列表都是只读派生，不是可编辑副本。

## 写入与失败边界

Plugin 先显示来源/目标和“不改变归属”的影响说明，要求显式勾选；提交期间按钮进入 busy 并阻止重复提交。提交前再次读取来源对象并核对用户选择时的版本。正式写入只走 Local Service → Application Command → 单个 SQLite 事务；对象版本、Association、Audit、Receipt 同成同败并支持幂等重放。

缺确认、对象不存在、自关联、stale version、重复 Association 或 SQLite 约束失败均为零写入。Materialization Undo 和 V1 Migration Undo 的当前投影校验包含入向与出向 Association，避免删除仍被引用的对象。

## 查询范围

- Service `GET /associations` 返回同一 SQLite 投影。
- Context Package 只包含 source 与 target 都已在本包 object scope 内的 Association，避免扩大上下文读取范围。
- 当前不增加关系类型编辑、自动推断、双向镜像、扫描器、补漏器、通用图工作流或 CLI 写命令。

## Gate

Domain、Application、SQLite v8→v9 备份迁移、事务/幂等/Undo、Service/Client、Context scope 与 Plugin UI 均有自动测试。仍需在集中 Desktop Gate 验证选择、确认、busy/success/error、reload 后读回以及 Primary Ownership/位置保持不变。
