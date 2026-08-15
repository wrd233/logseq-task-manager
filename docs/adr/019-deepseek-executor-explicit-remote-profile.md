# ADR 019 — DeepSeek-V4-Flash Executor 与显式 Remote Execution Profile

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/06` 第 16/17 章、`docs/vnext/07` Phase 13

## 1. 决定

Task Copilot 的第一条真实 built-in cognition executor 是 DeepSeek-V4-Flash，但架构保持 executor-neutral。

- Transport：DeepSeek Responses API（`https://api.deepseek.com/v1/responses`），stateless；
- Model alias：`deepseek-v4-flash`（不 pin date snapshot）；
- Secret：只通过 `DEEPSEEK_API_KEY` 环境变量读取，Execution Profile 只存 `credentialRef`；
- Opt-in：未设置 `DEEPSEEK_EXECUTOR_ENABLED=true` 时使用 `FakeContextAwareExecutor`，绝不静默外发数据。

## 2. 默认 profile

```text
executor=DEEPSEEK
modelAlias=deepseek-v4-flash
remoteEnabled=true
allowedDataScope=formal_state,current_workobject_context
maxContextItems=8
maxInputChars=24000
reasoningEffort=high
timeoutMs=30000
retryBudget=2
credentialRef=DEEPSEEK_API_KEY
```

## 3. Failure policy

- 401/invalid key / malformed output / timeout / 5xx：AgentRun 失败，无 Formal Mutation；
- 不 silent fallback，不 provider routing；
- 确定性 USER operation 不受 DeepSeek 状态影响；
- API key 绝不进入 SQLite、Graph、Receipt、日志或 repo。

## 4. 验收

Harness 已真实调用 DeepSeek-V4-Flash：

- DS1 multi-context current_focus → CONFIRMED_CHANGE，select `S0,C1`，未全 freeze；
- conflict → CONFLICT with `C1,C2`；
- prompt injection source → NO_CHANGE/no formal mutation。
