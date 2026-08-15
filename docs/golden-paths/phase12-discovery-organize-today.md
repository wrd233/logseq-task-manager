# Golden Path：Phase 12 Discovery / Formalization Candidate / 整理今天

> 状态：2026-08-15。自动化链与 fault injection 全绿；真实 Logseq Desktop 联合链见后续 evidence。

## 链 A：Natural Journal → Existing Object

1. `整理今天` 或 `discovery run --today/--page`；
2. Graph Adapter 本地解析 bounded scope；
3. Discovery executor 输出 `ASSOCIATE_EXISTING`；
4. Host 校验 target WorkObject 真实存在；
5. `ContextAssociation(AGENT_INFERRED, basisRunId)` 建立，Graph 不改写。

## 链 B：Natural Journal → Candidate → Trusted 纳入 → CREATE

1. Discovery executor 输出 `FORMALIZATION_CANDIDATE`（kind/title/owner 保守）；
2. Candidate 按 sorted SourceRefs 确定性身份持久化；
3. 重复 run merge，不重复 candidate；
4. 成熟 candidate → `CREATE_WORK_OBJECT` Decision Package（summary 呈现 kind/owner/title/rationale）；
5. 用户在当前 Plugin surface 输入“纳入”；
6. `TrustedUserEvent → UserDecision → executeUserDecision`；
7. execute 前 source fresh check；stale → 不 CREATE；
8. Kernel `commitFormal(CREATE)` + Projection Obligation + owner boundary（如呈现）；
9. Graph 最终收敛；candidate → MATERIALIZED。

## 自动化证明

`packages/test-support/tests/phase12-discovery.test.ts`：

- Existing-Object-First + 默认 restraint（one-off/reference/普通想法 no candidate）；
- 重复 discovery 只 merge 一个 candidate，mature 只产生一个 CREATE package；
- organize-today → trusted 纳入 → CREATE → projection VERIFIED → candidate MATERIALIZED；
- 非法 target、prompt-injection source、Graph offline 不产生任何 Formal/Graph 写入；
- stale candidate source 使旧“纳入”返回 `USER_DECISION_STALE`；
- global pause 下 organize-today 可 one-off 运行且 pause 保持；
- owner boundary 被 USER 授权后实际写入 ownership；candidate 可被已有对象吸收；
- discovery run / candidate 跨 Kernel restart 持久化。

`packages/agent/tests/agent.test.ts`：

- `parseDiscoveryJudgments` 对 kind/reason/target/handles 严格校验；
- `DeepSeekDiscoveryExecutor` profile gate / typed array 解析本地 HTTP 验证。

## Real Graph restraint 口径

测试 Graph `logseq/` 包含大量真实 Journal / 项目 / 学习材料，用于观察 False Positive，不把原文提交进 repo。
