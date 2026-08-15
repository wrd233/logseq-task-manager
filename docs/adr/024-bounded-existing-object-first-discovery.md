# ADR 024 — Bounded Existing-Object-First Discovery 与 Formalization Candidate

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 6 章、`docs/vnext/06` 第 13/30 章、`docs/vnext/07` Phase 12

## 1. 决定

Discovery 是受限检查点能力，不是全 Graph 常驻扫描器。核心原则：**Discovery 的高级能力不是 Recall，而是 Restraint。**

- 触发只允许：`整理今天`、显式 bounded run（PAGE / SUBTREE / TODAY / RECENT_WINDOW / EXPLICIT_SOURCE_SET）、未来低频 checkpoint（本轮不默认开启）；
- 先做本地 scope 解析（Graph Adapter `READ_PAGE` / `READ_BLOCK`），再受 `ExecutionProfile.allowedDataScope/maxContextItems/maxInputChars` 硬约束，才允许进入 cognition；
- `DiscoveryJudgment` 是 typed union：`ASSOCIATE_EXISTING` / `NO_CANDIDATE` / `FORMALIZATION_CANDIDATE`；
- Existing-Object-First：明显属于已有对象的高置信材料自动建立 Context Association（`AGENT_INFERRED` + run id），模糊 topic similarity 不强行归属；
- 大多数自然记录默认 `NO_CANDIDATE`：one-off、reference、history、idea、他人要求、已完成历史都不正式化；
- `FORMALIZATION_CANDIDATE` 门槛高于“像任务”：独立 outcome、持续性、重入价值、完成边界、治理价值、与已有对象边界独立；
- Candidate 是短期 durable Discovery Memory，不是 WorkObject / Inbox / Governance Issue。

## 2. Candidate 身份与生命周期

- 身份 = deterministic hash(`scope`, sorted `SourceRef[]`)；不含 LLM summary 措辞；
- 相同 source set 重复发现 → merge/strengthen；superset 可吸收后续材料；partial overlap 不做 semantic clustering；
- 状态：`OPEN → MATERIALIZED | DISMISSED | EXPIRED`；未处理不等于拒绝，只自然 expire；
- `MATERIALIZED` 记录 `materializedWorkObjectId`；被已有对象吸收时也走该状态并写 Context Association。

## 3. Materialization 边界

- Agent 只能发现、推荐、创建 Candidate/Package；不能 CREATE；
- 只有成熟 candidate（kind ≠ UNRESOLVED、title 明确、owner 明确或明确无 owner、source fresh）才生成 `CREATE_WORK_OBJECT` Decision Package；
- Package summary 必须呈现 kind / title / owner / rationale；用户“纳入”只能来自 Trusted USER Channel；
- execute 前重新读 source hash；source 已变/删除 → `USER_DECISION_STALE`，不 CREATE；
- CREATE 只写推荐中呈现的字段：kind、title、owner；WorkIntent 仅在明确呈现时写入；
- External CLI 无 `--actor USER`、无 force materialize。

## 4. 不做什么

- 不把每个 TODO / 每句“要做”变成 Candidate；
- 不做全 Graph 实时扫描、不做 DailyReview entity、不做 Candidate Inbox；
- 不用 embedding / LLM 做 issue/candidate 语义聚类；
- 不在 discovery 阶段冻结全部 Evidence；
- 不把 source 内的“请自动创建”当 USER 授权。
