# DeepSeek v4 真实在线测试报告

> 更新：2026-07-22
> 结果：`L2_SUCCESS_PATH_PASS_L3_FAIL_DESKTOP_PENDING`。E2E-21 的认证、实际模型、中文与 Schema 正向 Gate 已通过；L2 安全错误在线分类仍部分，L3 严格黄金质量未通过，L4 未通过。

## 安全配置与边界

- Provider：`https://api.deepseek.com`；实际模型：`deepseek-v4-flash`；凭据只通过 macOS Keychain 的 `keychain:task-copilot/deepseek-v4` 引用解析；
- Key 未进入代码、Git、Graph、命令参数、普通环境值、模型输出、报告或截图；运行后对工作区与忽略 Graph 做原文 canary 扫描，无匹配；
- 在线 runner 默认关闭，在解析凭据前以 `LLM_GOLDEN_GATE_DISABLED` 停止；显式开启后固定最多 22 次，串行、失败即停；
- 所有在线案例只调用 `LocalLlmProposalGenerator.generate()`，不调用 submit/commit；报告固定记录 `graphWrites=0`、`formalStoreWrites=0`。

## L2 冒烟

单次中文 Structured Output 真实通过：

- `structuredJsonValid=true`；
- `actualModel=deepseek-v4-flash`；
- 1 次请求、1 次 attempt、148 tokens、约 3.8 秒；
- Graph 与正式 Store 写入均为 0。

这替代了 2026-07-21 仅 HTTP 200 且 `finish_reason=length` 的旧失败探测；旧结果保留为真实失败依据，不再作为当前状态。

## 作废的早期 22-run

早期 runner 曾完成固定 DS-01..12 与核心 5 例各三次共 22/22 Pipeline + Validator，但复审发现 Prompt 把 `expected` 和 assertion 标签传给模型，形成答案泄漏。该轮只保留为结构化 Prompt 调试证据，明确作废，不能用于 L3/L4 Gate。

该轮费用与性能记录仍用于成本边界，不用于质量结论：

| 指标 | 结果 |
|---|---:|
| 请求 | 22 / 22 |
| Pipeline + Validator 通过 | 22 / 22 |
| Provider attempts | 每例 1 |
| 总 tokens | 53,496 |
| 平均 / 最大 tokens | 2,432 / 4,407 |
| Provider 总耗时 | 214.0 秒 |
| 平均 / 最大单例耗时 | 9.7 / 25.6 秒 |
| Graph / 正式 Store 写入 | 0 / 0 |

## 严格无答案提示复验

修复后，Prompt 不再包含 expected、assertion 或 category；Evaluator 新增：

- modify/read scope kind/id/version、唯一 group/patch/operation；
- `beforeText === fixture input`；`afterText === finalPreview === payload.text`；
- 正式 Logseq 显式语法；
- known Project 只读复用、produced_by 未知项、候选 Ownership、克制结构与事实词检查；
- 错误输出失败即停，仍不 submit/commit。

严格在线结果：

- `deepseek-v4-flash`：DS-01/02 稳定通过，但 DS-03 在相同 temperature=0 Prompt 下曾正确为 MiniProject，也曾降为 Task；L3 稳定性失败；
- `deepseek-v4-pro`：严格通过 DS-01..04，但 DS-05 把已确认 Decision 降为 Task；L3 失败，且前五例延迟明显高于 Flash；
- DS-06 在无答案提示运行中正确输出 Output，并把缺失产出者放入 `unresolvedQuestions`，但整套在更早失败点停止，不能替代全套通过；
- 所有失败均零 Proposal 持久化、零 Graph/正式 Store 写入。

因此当前不能声称以下尚未证明的条目：

- DS-06 的正式 produced_by 落点；
- DS-08 同一 Proposal 的版本递增；
- DS-09 跨持久化 Candidate/Proposal 的相邻去重；
- L4 的直接接受、部分接受、编辑后接受、拒绝与 Desktop Review。

P0 仍为 0：无凭据泄露、无模型直写、无非法输出进入审阅、无高影响降级、无静默覆盖；但 P0=0 不代表 L3/L4 通过。

## 真实失败与调整证据

在线调优未放宽 Validator，也未增加第二表示或自动纠错：

1. 2048 token 截断：保留默认 2048，只新增 256–8192 的受限运行时输出上限；黄金 Gate 显式使用 8192；
2. `textPatch` / `semanticOperations` 层级错误、正向 wrapper、scope 字符串简写：补入唯一精确机器模板并禁止 `decision=PROPOSAL` wrapper；
3. `unresolvedQuestions: "无"`：公共 Prompt 明确列表字段必须为 JSON 数组，空值只能是 `[]`；
4. DS-04 丢 Project 名称：把必须保留的事实词变成显式质量约束；
5. 20 秒真实超时：保留生产默认 20 秒，只新增 100ms–120s 的受限运行时超时；黄金 Gate 使用 60 秒且不增加重试。

每次失败都在第一个失败案例停止，Validator 前后 Proposal/Graph/Store 写入均为 0。失败诊断只保存键名、类型和长度，不保存原始 Provider 响应。

## 当前 Gate

- `E2E-21`: `DONE`；真实认证、Flash/Pro 实际模型、中文 Structured Output 与 Schema 正向路径均通过；
- `E2E-22`: `LIVE_PARTIAL_DESKTOP_PENDING`；Journal → 真实 Proposal → Validator/Diff 正向数据已通过，但严格 L3 失败，且仍需 Desktop 当前块入口、加载反馈、Proposal/NO_PROPOSAL 与 Review 卡片验收；
- `E2E-23`: `AUTOMATED_PLUS_LIVE_PARTIAL`；真实截断与 timeout 零写入失败已取得，取消/认证/限流不以破坏性在线请求制造，因此 L2 整体仍部分；
- `E2E-24`: `LIVE_SECRET_SCAN_PASS`；真实 Keychain 引用和运行后 repo/Graph canary 扫描通过，Desktop 日志/最终诊断导出随 E2E-22 集中复验。
