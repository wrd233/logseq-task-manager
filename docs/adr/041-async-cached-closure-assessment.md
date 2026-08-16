# ADR 041 — Async Cached Closure Assessment

- 状态：accepted
- 日期：2026-08-19

## 1. 决定

- Object read（`/v1/objects/:id/context`、`/v1/objects/:id/closure-assessment`）永远只返回 cached `ClosureAssessment`，不等待 DeepSeek。
- `closure_assessments`（schema v22）新增 `evidence_watermark`、`gate_json`、`readiness_changed_at`。
- 新 `closure_assessment_jobs` 窄队列：每对象只保留最新 QUEUED obligation；RUNNING 遇到新 revision/watermark 结束为 `STALE + SUPERSEDED`，结果不得成为 current。
- 后台 `ClosureAssessmentCoordinator`：
  - 独立 timer，默认 2s 一个 tick，一次至多处理一个 job；不与 FAST reconcile 同链，FAST 不被 Closure DEEP 阻塞
  - 独立 remote budget scope `remote:closure-assessment`（默认 6/hour，1/run；`DEFERRED_BY_BUDGET` 不消耗 attempt）
  - deterministic blocker 直接更新 cached assessment，不调模型
- 触发点：source change、Evidence freeze、formal mutation（WorkIntent / ProjectIntent / child closure / reopen 等经 `afterFormalChange` 级联 owner）、stale read/scan
- Freshness：`semanticRevision + evidenceWatermark + gate snapshot` 全等且 provenance=AGENT 才 FRESH；否则 stale，Object Surface 显示“完成情况正在重新评估”，不显示结束按钮。

## 2. DecisionPackage 提前 stale

- 每 5s sweep OPEN closure package：target version 变化、COMPLETE 时 gate 不 pass / assessment 非 FRESH READY、REOPEN 时对象非 closed、AMEND 时 targetClosureRecordId 非当前、evidence id 失效 → STALE
- Kernel 最终 fail-closed 不变（`PARENT_HAS_OPEN_CHILDREN` / version stale）

## 3. READY resurfacing

- 仅 `非READY → READY` 的 `readinessChangedAt` 成为 Now meaningful change；用户打开对象后不再重复；持续 READY 不轰炸

## 4. 验收

- `phase15-closure-semantic.test.ts`：GET 不调用 assessor；RUNNING supersession；budget deferral；package early stale；Now 只 resur face 一次
