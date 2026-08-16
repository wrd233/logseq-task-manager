# ADR 035 — Execution Profile / Budget / Pause

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/adr/019/033`

## 1. 决定

ExecutionProfile 是 runtime policy，不是 UI 设置大表。已 enforce：

- `executor` / `remoteEnabled` / `modelAlias`
- `allowedDataScope`（只允许 formal_state / current_workobject_context；不扫描 Graph）
- `maxContextItems` / `maxInputChars`
- `reasoningEffort`（low/medium/high/max）
- `maxOutputTokens`
- `timeoutMs` / `retryBudget`
- `credentialRef`（只通过 `DEEPSEEK_API_KEY` runtime 读取）
- `maxRemoteCallsPerRun` / `maxRemoteCallsPerHour`

默认后台 profile：`deepseek-unattended-fast`（low reasoning、maxOutput 900、maxRemoteCallsPerRun 1、maxRemoteCallsPerHour 12、timeout 20s、retry 1）。

## 2. Budget 语义

- budget 是 persistent SQLite window（schema v19 `runtime_budgets`），Kernel restart 不会重置 hourly budget。
- exhausted 时 job `DEFERRED_BY_BUDGET`，attempt 不增加，下个窗口继续。
- 不做 provider marketplace / 多 provider routing / silent fallback；DeepSeek 失败就失败。
- `remoteEnabled=false` 时不调用 remote；不静默开启。

## 3. Pause 语义

- global/object pause 已持久化；pause 时 source changes 继续记录，queue 不清空。
- resume 后按既有 priority + notBefore 继续追赶。
- pause 不影响 Logseq 自然写作。
