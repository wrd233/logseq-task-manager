# P0 PENDING 同 Commit 续跑 Desktop Live Gate（2026-07-30）

## 环境

- Branch：`feature/task-copilot-mvp`
- Plugin UI commit：`78528f74d807`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`（测试环境）
- Theme / viewport：host Light / Plugin Dark，`1000×720`
- Service：Launcher owned，schema `12`
- Project：`P0 Page Route Gate 20260723`
- Proposal：`proposal_p0_pending_frontstage_retry_20260730`

没有调用 Provider；API Key、Service token 和普通正文未进入截图、仓库或报告。

## 故障边界

正式变化仍全部经过 Plugin → Local Service → Application Command →
SemanticCommit。只在当前测试 Graph 的既有 SQLite authority 上安装一个一次性、
精确绑定 Proposal ID 的触发器：领域命令收据已持久后，拒绝将唯一
`DOMAIN_WRITE` step 从 `PREPARED` 收口，以模拟请求中断。它不伪造业务成功、
不修改 Proposal/Commit 状态，也不引入产品故障开关。

首次演练错将触发器写入 `$HOME/Library/Application Support/Task Copilot/data/`
下的非权威历史库，因此未命中；正式 Closure 完整成功并被立即 Undo。
读取安装器现有 Graph mapping 确认真正 authority 仍是显式保留的
`tmp/runtime/manual-v2/task-copilot.sqlite`，说明 P0-H 修复后没有静默替换 database。
错库触发器已删除，不计入故障 Gate。

## 真实操作链

1. 外部 Proposal 通过正式 Validator 并只进入 Review：
   `proposalStored=true / formalWritesExecuted=false`。
2. 在 Logseq 审阅 HIGH Closure；审阅只记录用户判断，Project 保持
   `OPEN v27`。
3. 在正确 authority 上安装精确一次性触发器，确认应用后 Desktop 收到
   有界失败；Project 已为 `COMPLETED v28`，原 Commit 保持 `PENDING`，step 0
   为 `DOMAIN_WRITE/PREPARED`。
4. 立即删除触发器并读回 `controlled_trigger_count=0`。前台只显示
   “修改尚未完成，可以继续”和一个“继续原修改”；说明正式修改已开始，
   不得重复提交。
5. 使用 Logseq Plugin Manager 真实“重载”。短暂连接检查自动消失；工具栏从
   持久账本重建为“1 项修改尚未完成”，最近修改只给一个“继续”。
6. 从最近修改返回原 Review，确认“沿用原记录”。收据重放跳过已完成的
   领域变化；同一 Commit 成为 `COMPLETED`、step 0 成为 `VERIFIED`，Project
   仍是 `v28`，没有重复递增。
7. 从结果卡执行专用 inverse Undo：原 Commit `UNDONE`，inverse Commit
   `COMPLETED`，Project 恢复 `OPEN v29`，Closure 移除，Page/正文未改变。
8. 再次真实 Plugin Manager reload。用户系统状态显示“Task Copilot 可以正常使用”，
   没有未完成修改或正文连接冲突。

## 最终读回

- Service：`READY`，schema `12`，Object `13`；
- Doctor：`PASS`，`0 FAIL / 1 WARN`；唯一 WARN 是前一个零写入 stale Proposal 历史；
- Project：`OPEN v29`，Closure absent；
- 原 Commit：`UNDONE`；专用 inverse Commit：`COMPLETED`；
- `PENDING=0 / RECOVERY_REQUIRED=0 / controlled trigger=0`。

## 当前截图

| 文件 | 场景 | 主结论 |
|---|---|---|
| `p0-pending-continue-current-78528f7.jpg` | 中断后的 Review | 修改尚未完成；只继续原修改 |
| `p0-pending-after-reload-current-78528f7.jpg` | Plugin Manager reload 后最近修改 | 持久账本重建一个尚未完成问题 |
| `p0-pending-resumed-current-78528f7.jpg` | 同 Commit 续跑 | 已完成，可撤销 |
| `p0-pending-undone-current-78528f7.jpg` | inverse Undo | Project 恢复 OPEN，历史保留 |
| `p0-pending-final-health-current-78528f7.jpg` | Undo 后 reload 系统状态 | 可以正常使用，无当前冲突 |

## Gate 结论

- PENDING 前台、reload、same-Commit resume、Undo 与最终健康：
  `DONE_DESKTOP_REPRESENTATIVE`；
- RECOVERY_REQUIRED 统一用户语义：`AUTOMATED_ONLY`，仍待代表性 Desktop Gate；
- P0：仍为 `IN_PROGRESS_DESKTOP_GATES`，不宣布阶段或整体 Goal 完成。

复杂度变化：新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、
Skill/Prompt/Validator `0`、Provider 调用 `0`、写入权威 `0`。PENDING 子 Gate 关闭；
因 RECOVERY_REQUIRED 仍开放，该组长期 Partial 总数净变化 `0`。

## `dbc5243` 用户语言缺陷修复与当前构建复验

首轮中断卡片正确，但全局失败条仍原样显示 “Local Service 请求失败”。这会让用户
误以为整个 Service 不可用，并把 transport 实现泄漏到普通路径。`dbc5243` 不新增
错误状态：当已有持久 `PENDING` 或 `RECOVERY_REQUIRED` 账本时，用户结论优先于
瞬时 transport 字符串；PENDING 固定表达为“这次修改没有完成 / 已完成步骤已经
安全保存 / 继续原修改”。组件回归由 `371` 增至 `372`，typecheck/build PASS。

在 exact build `dbc5243` 上提交新 Proposal
`proposal_p0_pending_frontstage_user_language_20260730`，从 `OPEN v29` 重跑相同链：

1. 中断后 Project `COMPLETED v30`，原 Commit `PENDING`，step `PREPARED`；
   顶栏和卡片均不再出现 Local Service/Commit/PENDING，唯一主操作是“继续原修改”；
2. 触发器立即删除，count 为 `0`；
3. same-Commit resume 后 Commit `COMPLETED`、step `VERIFIED`，Project 保持 `v30`；
4. inverse Undo 后原 Commit `UNDONE`、inverse `COMPLETED`，Project `OPEN v31`，
   Closure absent；
5. Plugin Manager reload 后短暂连接检查自愈，用户系统状态为“可以正常使用 / 无需操作”；
   PENDING/RECOVERY_REQUIRED/测试触发器均为 `0`。

新增 CURRENT 截图：

- `p0-pending-continue-user-language-current-dbc5243.jpg`；
- `p0-pending-final-health-current-dbc5243.jpg`。

旧 `p0-pending-continue-current-78528f7.jpg` 标记为 `SUPERSEDED_DEFECT`。当前测试
Project 的理解文本本身包含 Closure/Provider/Review 等工程测试词；它不是全局错误文案，
也不作为日常业务内容语言已经通过的证据。
