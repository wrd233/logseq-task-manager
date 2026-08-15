# ADR 022 — Strict Structured Cognition：Syntax Repair Only，No Semantic Repair

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/06` 第 17/18 章、`docs/vnext/07` Phase 11.5、ADR-018 / ADR-019

## 1. 决定

DeepSeek-V4-Flash executor 的输出处理只允许**语法级提取**，禁止任何语义级修复、补字段、默认 handles 或改写 judgment 内容。

- Responses API 文本从 `payload.output` 的 message parts 提取（跳过 reasoning），也兼容旧 `output_text`；
- JSON 提取为语法-only：从第一个 `{` 开始做平衡括号扫描，遇到 trailing prose 丢弃；不补 `}`、不 trim trailing 字段、不 auto-fill；
- `parseSemanticJudgment` 严格校验 typed shape：缺失 `supportingContextHandles` / `conflictingContextHandles` / `relevantContextHandles` / `summary` / `rationaleSummary` 等必填字段直接抛错，无任何默认值；
- `ExecutionProfile` 字段全部可执行：
  - `executor` / `remoteEnabled` / `credentialRef`：remote executor 必须匹配且显式授权；
  - `modelAlias` / `reasoningEffort` / `timeoutMs`：进入请求体和 AbortController；
  - `retryBudget`：只对 429 / 5xx / 网络 / 超时做有界重试；malformed JSON 不重试；
  - `allowedDataScope` / `maxContextItems` / `maxInputChars`：在 MaintenanceCoordinator 构造 Context Pack 时硬性 gate、cap、truncate。

## 2. 失败策略

- malformed / incomplete / 字段缺失 / kind 不支持：executor 抛错，maintenance job 失败，无 Formal Mutation；
- 不 silent fallback、不 provider routing、不二次调用模型“解释自己的 JSON”；
- 语义修复曾用 LLM 措辞或 `S0` 默认 handles 掩盖模型错误，本 ADR 明确禁止。

## 3. 实现

- `packages/agent/src/deepseek-executor.ts`：`extractStructuredJudgmentText` / `parseDeepSeekJudgmentText` 纯函数；judge 拆分为 bounded retry + 单次远程调用；
- `packages/agent/src/fake-context-cognition.ts`：fixture executor 同样校验 profile executor/remoteEnabled；
- `apps/kernel-service/src/maintenance-coordinator.ts`：`#buildContextPack` 按 `allowedDataScope` gate，按 `maxContextItems` cap 总 item 数，按 `maxInputChars` 顺序 truncate。

## 4. 不做什么

- 不做 retry malformed semantic output；
- 不做字段级 diff 修复；
- 不根据 `kind` 猜测缺失字段；
- 不在 executor 内扩大 data scope。
