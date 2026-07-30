# P2-D 外部 Agent 受控结构治理 Desktop 记录

## 结论

- 状态：`DONE_BOUNDED_EXTERNAL_AGENT_REPRESENTATIVE`
- 分支：`feature/task-copilot-mvp`
- 修复提交：`8d24569`
- Logseq：Desktop `0.10.15`，File Graph `logseq`
- 外观：host Light / Plugin Dark，1000×720
- database authority：安装前后均为
  `tmp/runtime/manual-v2/task-copilot.sqlite`；graph key 与 descriptor 映射未变化

本次用“将 MiniProject 下两条现有材料移入一个新整理分区”作为 C 类代表场景。外部
Agent 只读取 Task Copilot 导出的有界 Context Package，并形成 Proposal；事实、判断和未知
在草稿中分开，未知保持为“不改写内容和归属”。CLI `validate` 零写入，`submit` 只新增一条
Proposal。用户在插件中先审阅精简 Preview，再确认应用；正式 Graph 写入仍由现有 Local
Service、SemanticCommit step ledger、Graph bridge 和 Recovery Kernel 执行。

没有调用新的 Provider，没有把 API Key、正文或 Context Package 写进仓库；临时导出位于
系统临时目录。没有新增 Agent Runtime、正式状态、Recovery 分支或 Skill 版本。

## 真实链

1. Service 从正式 MiniProject、active Anchor 和实时 Block 子树导出有界 Context Package；
2. 外部 Agent 生成一个 HIGH 结构 Proposal，Task Copilot validator 重验 scope、UUID、hash、
   Object version 和 operation 白名单；
3. CLI `validate` 保持 Object/Commit 为零，`submit` 只进入共用 Review；
4. 首次“审阅方案”后仍未写入，第二次“确认应用”才执行正式 Commit；
5. Logseq 创建一个整理分区，并把两条原 Block 保持 UUID、正文与顺序地移入；
6. Plugin Manager reload 后结构保持；
7. 历史记录提供同一 inverse Undo；确认后新分区删除，两条材料回到原父 Block 与原顺序；
8. 再次 reload 后 Undo 结果保持，Doctor `PASS`，PENDING/RECOVERY 为 `0/0`。

## 失败驱动的通用修复

第一次真实 Undo 暴露了多 Block 相邻位置验证缺陷：第一条材料先回到来源后，第二条材料在
目标分区中的 `previousSibling` 自然改变，旧 planner 却仍要求它跟在已经移走的第一条后面。
系统没有假报成功，而是进入已有 `RECOVERY_REQUIRED`。恢复动作把已经完成的逆向步骤补偿
回安全的正向结构，原 Commit 仍保持已应用。

`8d24569` 通过 TDD 做了两项通用修复：inverse planner 根据已先归位的兄弟动态折叠目标相邻
位置；既有 inverse recovery 在“前序 VERIFIED、当前 verify-time divergence”时从正确步骤
初始化补偿。随后用新 Proposal 重新完成 apply→reload→Undo→reload。失败链和成功链都复用
同一 ledger，没有增加第二恢复入口。

自动证据：Application 与 Local Service 聚焦回归 PASS；Application、Local Service、Plugin
typecheck/build PASS；根级 `./scripts/check.sh` PASS；145 条稳定规则、恢复演练和仓库边界
均 PASS。

## Release 边界

| 类别 | 首发处理 | 代表能力 |
|---|---|---|
| A | 内置直接操作，使用既有长期 Undo | Focus、Condition、reviewAt |
| B | 内置 Review／Grill，复用既有安全链 | 当前摘要、当前推进、目标/成果/阶段、Ownership、Closure |
| C | 外部 Agent 调查与准备 Proposal，Task Copilot 负责 Review/Commit/Undo/Recovery | 批量子对象、正文移动、拆分/合并、多对象重组 |
| D | 保持关闭或讨论模式 | 无可靠 inverse 的 Association、语义和长期 Undo 未统一的 Project due |

C 类只需一条共享纵向链，不按每个 intent 建立独立 Runtime 或状态机。没有安全 inverse 的
动作不会因本次代表场景通过而开放。

## 当前截图

`8d24569` 的四张 CURRENT 图记录正式应用、reload、Undo 和 Undo 后 reload：

- `p2-d-external-agent-retry-applied-current-8d24569.jpeg`
- `p2-d-external-agent-retry-reload-current-8d24569.jpeg`
- `p2-d-external-agent-retry-undone-current-8d24569.jpeg`
- `p2-d-external-agent-retry-undone-reload-current-8d24569.jpeg`

`e407799` 的六张图只保留为 `HISTORICAL_DEFECT`：它们证明 Review/确认/应用/reload 以及首次
Undo 缺陷的发现过程，不代表当前 Undo 实现。

## 复杂度变化

- 新增正式状态：`0`
- 新增 Runtime：`0`
- 新增 Recovery 分支：`0`
- 新增 Skill/Prompt/Validator 版本：`0`
- 删除或合并机制：C 类从“每种操作待建设”收敛为一条共享外部 Agent 受控链
- 长期 Partial：关闭 P2-D external Agent product-chain `1`，新增 `0`，净变化 `-1`

