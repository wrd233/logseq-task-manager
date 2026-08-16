# Phase 14 — Closure Readiness and Governed Parent Closure Golden Path

> 状态：2026-08-19 测试门禁 + real DeepSeek 验证
> 环境：`packages/test-support/tests/phase14-closure.test.ts` + DeepSeek Responses API runtime key

## GP14-1：MiniProject Readiness Derives Deterministically

1. MiniProject 无 WorkIntent → `UNKNOWN`（blockers 说明缺意图依据）。
2. 存在 OPEN formal child → `NOT_READY`，blocker 为开放子对象。
3. child 关闭 + 每个 completion check 有 frozen evidence → `READY`。
4. 全程没有 percentage / Objective achieved flag / score；assessment 绑定 `objectVersion:projectIntentRevision` 语义修订。

证据：`phase14-closure.test.ts` "MiniProject closure readiness is UNKNOWN without intent, NOT_READY with open child, READY with evidence"。

## GP14-2：Project READY → USER-only Complete

1. ProjectIntent 存在、KR 有 frozen evidence、无 OPEN descendant → deterministic `READY`。
2. USER 通过 trusted Plugin channel 创建 `COMPLETE_WORK_OBJECT` Decision Package 并确认。
3. Kernel 执行 Complete Formal Commit；裸 bearer / External Agent 直接 Complete 被拒绝。
4. parent 仍有 OPEN child 时 Complete 失败：`PARENT_HAS_OPEN_CHILDREN`，无 silent cascade。

证据：`phase14-closure.test.ts` "Project readiness requires intent, evidence and closed children; completion stays USER-only"；`phase5-task-closure.test.ts` "governed parent closure succeeds without children and rejects while a child is OPEN"。

## GP14-3：Stale Closure Package Fails Closed

1. 依据 READY 生成 closure package 后，某 child 被 Reopen。
2. USER 再确认旧 package → 执行前重查 descendants / 语义修订，package 变为 stale 并拒绝。
3. Reopen 不 cascade 到任何其他对象；closure history 保留。

证据：`phase14-closure.test.ts` "stale closure package fails closed when a child reopens before execution"。

## GP14-4：External Agent Closure Handoff Is Package-only

- External Agent 只能创建 `COMPLETE_WORK_OBJECT` Decision Package。
- trusted USER channel 确认后才执行 Formal Closure；Agent 自身永远没有 Complete/Cancel/Reopen/Amend 权限。

证据：`phase14-closure.test.ts` 与 `phase12-user-authorization` 系列测试。

## GP14-5：DeepSeek Closure Eval — False READY 为 0

- 13 个注入场景（缺意图、缺证据、child OPEN、矛盾焦点、scope mismatch、stale KR、objective-only 等）。
- Primary metric `falseReadyCount = 0`；任何不能确定 READY 的输出都保守为 UNKNOWN/NOT_READY/CONFLICT。
- eval 记录：`/tmp/tc-phase14-closure/closure-eval.json`（13 scenarios, falseReadyCount 0）。
