# DeepSeek v4 Provider L4 Desktop Runtime Report

日期：2026-07-22  
结论：`PASS`

## 验收范围

在隔离 SQLite schema v11、专用 Logseq Desktop 0.10.15 测试页和真实 `deepseek-v4-flash` 上，连续验证：当前块入口、loading/防重复、Validator 失败、READY Proposal、`NO_PROPOSAL`、直接接受、拒绝、调整后接受、两组部分接受、默认结构化日志、Diagnostics 导出和零正式写入边界。

机器可读的脱敏交互结果见 `docs/testing/deepseek-v4-l4-desktop-2026-07-22.json`。它保留实际输入、耗时、完整 Validator 后 Proposal、Review 结果和零写入证据；不保留凭据、Service token、Provider request id、原始响应 header 或未经 Validator 的失败响应正文。

## 真实交互结果

| 案例 | Desktop 结果 | 耗时 | 持久化边界 |
|---|---|---:|---|
| 明确 Task，首轮旧 Prompt | Validator 拒绝顶层 shape，UI 显示失败并恢复按钮 | 9.300 s | Proposal 0，Object 0，Commit 0 |
| 同一 Task，收紧 Prompt 后 | READY，显示原文/最终正文/语义 Diff；接受后仍未生效 | 9.775 s | Proposal ACCEPTED，Object 0，Commit 0 |
| 纯天气与环境描述 | `NO_PROPOSAL` 并给出理由 | 3.712 s | 不创建 Proposal，Object 0，Commit 0 |
| 明确 Task 后拒绝 | READY 后在 Review Center 拒绝 | 9.629 s | Proposal REJECTED，Object 0，Commit 0 |
| 明确 Task 后调整标题 | 同一 proposal_id 原位修订，标题缩短且期限、事实、正文、Block scope、group/operation identity 不变；随后接受 | 11.167 s + 8.786 s | Proposal ACCEPTED，Object 0，Commit 0 |
| 两个独立语义组 | 第一组接受、第二组拒绝，卡片显示 `PARTIALLY_ACCEPTED` | 确定性 fixture | Proposal-only；未执行最终确认 |

部分接受案例明确标为 `external_agent` 确定性 fixture，只验证 Review Center 的多组交互，不冒充 DeepSeek 输出。模型质量证据只来自表中真实 DeepSeek 案例。

## 首轮失败与修复

首轮 Desktop 请求证明原 `analyze-selected-block` Prompt 对提交 shape 的约束弱于严格黄金 Prompt；真实模型返回被现有 Domain Validator 安全拒绝。修复将同一正式化意图收紧为精确 scope、单 Patch、单 `CREATE_OBJECT`、相等 `finalPreview`、风险和标识字段约束，没有放宽 Validator，也没有让模型获得写权限。

Review Center 原有接受与拒绝，但缺少 V2 的“调整后接受”。新增的 revise 路由仍调用同一个 Provider、Validator 和 Proposal Store，并强制：

- 只允许当前 `local_llm` Proposal；
- 复用同一 proposal_id、createdAt、Block scope、group、operation 和 target；
- 模型不能扩大 scope 或改变机器意图；
- 只原位替换唯一 Proposal 机器表示，不新增表、状态机或可编辑副本；
- 调整后回到 READY，仍需 Review 和独立最终 Commit。

恶意 target 漂移已由 Service 集成测试证明零写入拒绝。

## 零写入与安全证据

- 真实运行结束前 `status` 为 READY、schema 11、Object 0；四份持久 Proposal 状态为 ACCEPTED 2、REJECTED 1、PARTIALLY_ACCEPTED 1；SemanticCommit 0、Pending 0。
- 两个部分审阅 Block 经 Logseq API 重读，正文和 properties 均未变化。
- `doctor` 为 PASS：SQLite integrity `ok`、foreign key violation 0、Proposal/Commit healthy、Graph bridge connected；唯一 WARN 是隔离库尚无 Backup。
- 两次真实 Diagnostics JSONL 导出分别包含 ready/no-proposal 和 ready/revised 事件；credential-looking pattern scan 为 0。
- Plugin reload 的隐藏 iframe 阶段出现短暂 `graph_read_bridge_transport_failed`，打开主 UI 后 bridge 恢复并由 Doctor PASS 复核；未增加补漏器或第二 bridge。

## Gate 结论

- `V2-LLM-001`：`DONE`
- `E2E-22`：`DONE`
- `E2E-18`：`DONE`
- `E2E-24`：`DONE`
- `E2E-23`：保持 `AUTOMATED_PLUS_LIVE_PARTIAL`。真实 invalid shape、timeout、truncation、空 Structured Content 已有零写入证据；取消、认证失败和限流继续由非破坏性自动测试证明，不为追求在线标签制造异常凭据或流量。

本报告不代表最终 Commit 已执行；本轮刻意停在 Proposal 审阅层，证明模型不能直接改变 Graph 或 SQLite 正式状态。
