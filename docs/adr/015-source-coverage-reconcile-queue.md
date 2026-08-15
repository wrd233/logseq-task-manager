# ADR 015 — Source Coverage 与 Persistent Reconcile Queue

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 11 章、`docs/vnext/06` 第 14/15 章、`docs/vnext/07` Phase 9
- 替代：无正式旧结构（此前后台维护依赖用户主动 command / 外部 Agent session）

## 1. 决定

普通 Logseq 内容不会因为“像任务”进入 Formal maintenance queue。

只有 Formal WorkObject 的 Primary Anchor source 发生变化，才机械记录 source coverage 并进入持久校准队列：

```text
user natural edit
→ plugin mechanical classification
→ system-write suppression
→ quiet-period coalescing
→ recordSourceChange
→ persistent ReconcileJob
→ bounded built-in maintenance loop
→ semantic reconcile (Evidence-bound, fresh snapshot)
→ formal apply / no-change / retry
```

## 2. 具体实现

- `packages/sqlite` schema v8 新增：
  - `source_coverage`：last observed/reconciled source snapshot、`hasUncoveredChanges`；
  - `reconcile_jobs`：trigger、snapshot、formal version、priority class、attempt、notBefore、status、lastOutcome；
  - `maintenance_pause`：global / per-object pause。
- `apps/kernel-service/src/maintenance-coordinator.ts`：
  - `recordSourceChange` 去重/合并成最新 job；
  - tick 按 INTERACTIVE > SYSTEM_RECOVERY > NORMAL 认领；
  - pause 只阻止后台 job，不阻止显式 `MANUAL_RECONCILE`；
  - Graph offline / executor failure 按 backoff requeue，达到 maxAttempts 后 FAILED；
  - 一个 job 依次执行 engagement 与 current-focus 窄义维护，共享同一 Evidence 与 snapshot。
- Plugin `source-change-observer.ts`：
  - `DB.onChanged` 机械聚合 + 1200ms quiet period；
  - 只报告 Kernel anchor index 中命中的 block；
  - system self-written source UUID 短期抑制，避免 self-trigger。

## 3. 为什么

- Work Burst 聚合避免每个 block edit 调 Agent；
- dirty/coverage 与 semantic certainty/governance issues 分离：Agent 读过最新 delta 即 clear coverage，即便结果是 UNKNOWN；
- queue 持久、可重启、可去重、有硬重试上限；
- 后台故障不阻塞确定性的 USER Operation，自然工作 fail open。

## 4. 不做什么

- 不把普通 Logseq 内容当 queue 输入；
- 不做连续全 Graph discovery；
- 不做 generic workflow engine；
- 不在第一版做真实 LLM provider routing；当前 built-in executor 使用可替换的确定性 Agent，
  外部 CLI Agent 仍可通过既有治理契约承接 cognition。

## 5. 验收

`packages/test-support/tests/phase9-maintenance-queue.test.ts` 覆盖：

- one burst → one persistent job → CONFIRMED_CHANGE → coverage cleared；
- global pause 记录变化但不执行；显式 one-shot reconcile 执行且 pause 保持；
- 新 source change 将 active job 置为 STALE，旧结果不 wins；
- queue 跨 Kernel 重启继续收敛；
- Plugin observer 单测覆盖 burst coalesce、anchor-only reporting、system-write suppression。
