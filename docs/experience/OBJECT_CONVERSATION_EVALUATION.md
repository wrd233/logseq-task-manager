# Object Conversation Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-16，Phase 16B 第一轮 DeepSeek-V4-Flash 实测。

## 设置

- 对象：真实 `/tmp/tc-demo` Kernel + repo `logseq/` 测试 Graph。
- Context：`GET /v1/objects/:id/context`。
- 模型：`deepseek-v4-flash`，Responses API，max_output_tokens=4000。
- 场景：MiniProject 14 组 + Project 4 组，独立单轮，无 transcript（评估 intent，不存 CoT）。
- 证据：`/tmp/tc-phase16b-ux/conversation-eval.json`。

## 指标

| 指标 | 值 |
| --- | ---: |
| total scenarios | 18 |
| parse failures（reasoning 截断） | 3 |
| lowRiskAction 建议 | 1 |
| boundaryDecision 建议 | 1 |
| 提问场景 | 13 |
| 重复提问 | 0（单轮无法观测） |
| 主动停止 | 7 |
| 平均延迟 | ~23.3s |

## 观察

1. **「聊聊这个 / 做到哪了 / 有点乱 / 下一步」都会问同一个核心问题**（“这次法务探针验证要验证什么”）。单轮合理，但多轮会产生 interview-bot 感；guide 已加入“同一瓶颈只问一次”规则。
2. **M08 “重点换成 X”**：模型没有把占位符 X 直接写入 current_focus，而是问 X 具体指什么。正确，避免把空话写成 Formal 状态。
3. **M10 “放到 Project B”**：正确生成 OWNERSHIP boundaryDecision，没有自行执行。
4. **M11 “只是聊不要改”**：正确不落地 mutation。
5. **M13 “先别改”**：正确 stop。
6. **P03 “我觉得现在最重要的是采购规格书”**：正确给出低风险 `SET_CURRENT_FOCUS` 建议。
7. **P01/P04 显示 Project 缺少 Objective 导致 agent 需要问项目目标**；本轮未实现 ProjectIntent，记录为 DEFERRED_BY_DESIGN，作为 Phase 17 窄闭环的输入信号。

## 结论

- Conversation bootstrap 足够恢复对象现实；低风险 / 边界路径符合权限模型。
- 最大风险是“重复问同一核心缺口”，已写入 `docs/agent/object-conversation-guide.md`。
- 不保存完整 transcript / CoT；只有聚合评估结果。
