# DeepSeek v4 真实在线测试报告

> 更新：2026-07-22
> 结果：`L4_DESKTOP_PASS`。E2E-21 的认证、实际模型、中文与 Schema 正向 Gate 已通过；严格无答案黄金套件已在 Flash 与 Pro 各完成 22/22，E2E-13 外部 Agent 跨入口和 Provider 当前块 L4/Review/Diagnostics 均已通过。

## 安全配置与边界

- Provider：`https://api.deepseek.com`；实际模型：`deepseek-v4-flash`；凭据只通过 macOS Keychain 的 `keychain:task-copilot/deepseek-v4` 引用解析；
- Key 未进入代码、Git、Graph、命令参数、普通环境值、模型输出、报告或截图；运行后对工作区与忽略 Graph 做原文 canary 扫描，无匹配；
- 在线 runner 默认关闭，在解析凭据前以 `LLM_GOLDEN_GATE_DISABLED` 停止；显式开启后固定最多 22 次，串行、失败即停；
- 所有在线案例只调用 `LocalLlmProposalGenerator.generate()`，不调用 submit/commit；报告固定记录 `graphWrites=0`、`formalStoreWrites=0`。

## L2 冒烟

单次中文 Structured Output 真实通过：

- `structuredJsonValid=true`；
- `actualModel=deepseek-v4-flash`；
- 1 次请求、1 次 attempt、141 tokens、约 2.1 秒；
- Graph 与正式 Store 写入均为 0。

这替代了 2026-07-21 仅 HTTP 200 且 `finish_reason=length` 的旧失败探测；旧结果保留为真实失败依据，不再作为当前状态。

UC-28 的专用 MiniProject Closure 草拟端点也以合成内容真实通过：`deepseek-v4-flash`、1 attempt、3859 tokens、约 28.3 秒，同 proposal_id 返回完整三问并保持 `READY`；Object 仍 `OPEN`，SemanticCommit 为 0。首轮真实调用暴露了 Service Client 通用 3 秒超时会早于 Provider 自身边界断开；现只将两个 Provider 生成端点的 Client 上限调整为 125 秒，其他命令仍保持 3 秒。

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

- `deepseek-v4-flash`：固定 DS-01..12 与核心 5 例各三次，22/22 `PIPELINE_PASS`；
- `deepseek-v4-pro`：同一无答案 Prompt 与 22-run schedule，22/22 `PIPELINE_PASS`；Pro 延迟明显高于 Flash，仍保留 120 秒单请求上限；
- 两个模型均通过 MiniProject 边界、已确认 Decision、Output 产出者未决、候选 Ownership、证据不足 `NO_PROPOSAL` 和稳定重复案例；
- 所有运行只调用 `LocalLlmProposalGenerator.generate()`，均为零 Proposal 持久化、零 Graph/正式 Store 写入。

本轮 L3 已达到 Provider/Prompt/Validator 层的通过条件；以下跨持久化语义继续由各自 Service Gate 证明，不让黄金 runner 复制状态机：

- DS-08 的跨持久化同一 Proposal 版本递增仍由 Review/Service Gate 证明；
- DS-09 的跨持久化 Candidate/Proposal 相邻去重仍由 Candidate Gate 证明；
- L4 的直接接受、部分接受、调整后接受、拒绝与 Desktop Review 已由后述真实运行完成。

E2E-13 已补充一条不同于 Plugin 当前块 Provider 的真实外部 Agent Desktop 证据：DeepSeek v4 Flash 从实时 Page Context Package 生成候选，首轮虽是 Structured JSON，仍因 operation group shape 不完整被 Domain Validator 零写入拒绝；改为完整逐字段模板后，第二轮 1 attempt / 2997 tokens 通过。该 Proposal 经 CLI validate/submit 后在 Logseq Review Center 显示原文、最终预览、Diff 与模型来源，接受语义组后 Object/Commit 仍为 0。它独立证明 Context/CLI/Review 边界；原始成功候选和首轮失败分类见 `docs/testing/deepseek-v4-e2e13-desktop-2026-07-22.json`。

P0 仍为 0：无凭据泄露、无模型直写、无非法输出进入审阅、无高影响降级、无静默覆盖。

## L4 Logseq Desktop

隔离 schema v11 Service 与 Logseq Desktop 0.10.15 连续完成：

- 首轮旧 selected-block Prompt 返回非法顶层 shape，Validator 拒绝、UI 显示错误并恢复操作，Proposal/Object/Commit 均为 0；
- 收紧为与黄金 Prompt 一致的逐字段机器契约后，真实 Flash 生成 READY Proposal，Review Center 展示原文、最终正文、语义 Diff 和来源；直接接受后仍未正式生效；
- 普通天气记录返回可读 `NO_PROPOSAL` 且不持久化；另一 READY Proposal 被用户拒绝；
- 新增“调整建议”后，真实 Flash 按自然语言缩短标题；Service 强制复用同 proposal_id、createdAt、Block scope、group、operation 和 target，正文中的期限与事实未变，再次接受后仍未正式生效；
- 两个独立组用明确标记的 external Agent 确定性 fixture 完成一接受一拒绝，状态为 `PARTIALLY_ACCEPTED`；该项只验证 Review 交互，不冒充模型输出；
- 两次实际 Diagnostics JSONL 导出覆盖 ready/no-proposal/revised，脱敏 pattern scan 为 0；Doctor PASS，Object 0、SemanticCommit 0、Pending 0、源 Block 原文未变。

完整耗时、输入和 Validator 后 Proposal 见 `docs/testing/deepseek-v4-l4-desktop-2026-07-22.json`，运行解释见 `docs/runtime/V2_DEEPSEEK_PROVIDER_L4_DESKTOP_REPORT.md`。

## 真实失败与调整证据

在线调优未放宽 Validator，也未增加第二表示或自动纠错：

1. 2048 token 截断：保留默认 2048，只新增 256–8192 的受限运行时输出上限；黄金 Gate 显式使用 8192；
2. `textPatch` / `semanticOperations` 层级错误、正向 wrapper、scope 字符串简写：补入唯一精确机器模板并禁止 `decision=PROPOSAL` wrapper；
3. `unresolvedQuestions: "无"`：公共 Prompt 明确列表字段必须为 JSON 数组，空值只能是 `[]`；
4. DS-04 丢 Project 名称：把必须保留的事实词变成显式质量约束；
5. 20 秒真实超时：保留生产默认 20 秒，只新增 100ms–120s 的受限运行时超时；黄金 Gate 按模型使用 Flash 60 秒、Pro 120 秒，仍不增加重试次数。
6. 真实 Pro 运行发现一次空 Structured Content；复用既有 bounded retry，将 `LLM_RESPONSE_EMPTY` 标为可重试并保持原有上限，随后由 Provider 单元测试证明只重试一次，不增加新的状态或写入路径。

每次失败都在第一个失败案例停止，Validator 前后 Proposal/Graph/Store 写入均为 0。失败诊断只保存键名、类型和长度，不保存原始 Provider 响应。

## 当前 Gate

- `E2E-21`: `DONE`；真实认证、Flash/Pro 实际模型、中文 Structured Output 与 Schema 正向路径均通过；
- `E2E-22`: `DONE`；Flash/Pro 严格无答案黄金套件各 22/22 通过，L4 当前块、loading/error、Proposal/NO_PROPOSAL、直接/调整后/部分接受与拒绝均已真实验收；
- `E2E-23`: `DONE`；在既有真实截断、timeout 和空内容证据外，单次真实 endpoint 无效临时 token 正确分类 401，真实 Keychain 配置请求被主动取消并快速收口；429 使用真实 loopback HTTP 有界模拟，避免向 Provider 制造洪峰。完整脱敏证据见 `docs/testing/deepseek-v4-e2e23-error-classification-2026-07-22.json`；
- `E2E-24`: `DONE`；真实 Keychain 引用、repo/Graph canary、Desktop 默认日志和两次最终 Diagnostics 导出均通过脱敏扫描。

完整脱敏黄金矩阵见 `docs/testing/deepseek-v4-golden-live-2026-07-22.json`；E2E-13 外部 Agent 跨入口证据见 `docs/testing/deepseek-v4-e2e13-desktop-2026-07-22.json`；L4 输入、耗时、完整 Proposal 与审阅结果见 `docs/testing/deepseek-v4-l4-desktop-2026-07-22.json`；错误分类见 `docs/testing/deepseek-v4-e2e23-error-classification-2026-07-22.json`。这些资产都不包含凭据值或请求认证材料。
