# ADR 033 — Conversation Reasoning Profiles (FAST / DEEP)

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/adr/019`

## 1. 决定

DeepSeek conversation 请求分两档 cognition budget，不影响 Formal authority：

| Profile | reasoning | maxOutputTokens | timeout | retry |
| --- | --- | ---: | ---: | ---: |
| `CONVERSATION_FAST_PROFILE` | low | 900 | 20s | 1 |
| `CONVERSATION_DEEP_PROFILE` | high | 4000 | 120s | 2 |

- FAST 用于“做到哪了 / 还在等吗 / 改完了吗 / 下一步是什么”。
- DEEP 用于 ProjectIntent、boundary、拆分等复杂判断。
- `ExecutionProfile.reasoningEffort` 扩展为 `low | medium | high | max`，`maxOutputTokens` 可选。
- Executor 只按 profile 调用 API；USER auth / Evidence / Skill / Formal validation 不变。

## 2. 验收

- Agent unit test 检查两档 profile 字段。
- Real DeepSeek benchmark（`/tmp/tc-phase17-ux/multiturn-eval.json`）：
  - FAST avg ~2.7s；DEEP avg ~8.4s（同简单问题）；
  - Phase 16B 统一 high reasoning 为 ~23.3s。
