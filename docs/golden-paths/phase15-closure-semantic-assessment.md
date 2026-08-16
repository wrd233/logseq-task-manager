# Phase 15 — Evidence-grounded Closure Assessment Golden Path

> 状态：2026-08-19 测试门禁 + fake gold-set eval（real DeepSeek eval 待 runtime key 复跑）
> 证据：`packages/test-support/tests/phase14-closure.test.ts`、`phase15-closure-semantic.test.ts`、`packages/test-support/src/closure-gold-set.ts`

## GP15-1：Deterministic Gate First（0 模型调用）

1. MiniProject 无 WorkIntent → GET 立即 UNKNOWN，assessor calls = 0。
2. 有 OPEN child → NOT_READY；有 OPEN CONFLICT Issue → CONFLICT；gate pass 前无任何 remote call。
3. 这些路径直接持久化 DETERMINISTIC，Object GET 不等待。

## GP15-2：Evidence → Semantic → READY

1. WorkIntent + Frozen Evidence 就绪后，GET 立即返回 cached/stale，并把 coalesced assessment job 交给后台。
2. Assessor 逐 Check 输出 SATISFIED + 明确 `supportingEvidenceIds`。
3. Host 汇总：全部 checks SATISFIED 且 desiredOutcome SATISFIED → READY；每项归因可回答“哪条 Evidence 支持”。

## GP15-3：Irrelevant Evidence → UNKNOWN / NOT_READY

- 2 checks + 2 Evidence（采购会议、预算审批）→ 旧逻辑可能 READY；新系统必须 UNKNOWN/NOT_READY。
- 过程证据（部署、配置）不能证明“稳定上线”；child closed 不能证明 Project outcome。

## GP15-4：Contradiction → CONFLICT

- 最新运行记录“持续严重故障”与旧“稳定上线”证据同时存在 → KR CONTRADICTED + objectiveContradiction → CONFLICT。
- Host 禁止任何 CONTRADICTED 路径通往 READY。

## GP15-5：Stale Assessment → Reassessment

- 新 Evidence / WorkIntent / ProjectIntent / child reopen 后，旧 cached assessment 标记 stale；旧 RUNNING assessment job 结束为 STALE/SUPERSEDED，latest 继续。
- UI 显示“完成情况正在重新评估”，结束按钮只在 FRESH READY 出现。

## GP15-6：READY → Trusted USER Complete

- FRESH READY 的 MiniProject/Project 由 Plugin 生成 COMPLETE_WORK_OBJECT DecisionPackage，经 trusted USER channel 确认后由 Kernel 执行。
- OPEN closure package 在 reality 变化时提前 STALE；Kernel 执行时仍最终 fail closed。

## GP15-7：Long-running READY does not nag

- 只有 非READY→READY 进入 Now；用户打开后 suppression；持续 READY 不重复提醒。
