# P1 Project Context Recovery Desktop / Provider Gate — 2026-07-26

## 运行身份

- branch：`feature/task-copilot-mvp`
- 最终精确提交：`894d14f`
- 中间证据提交：`4e02226`、`2cf8bf2`
- 安装的 Service / Launcher 时间：`2026-07-26T22:00:46+0800`
- Logseq Desktop：`0.10.15`
- 测试 Graph：`logseq`（专用测试 Graph）
- 主题 / 窗口：Dark，约 `1000 × 720`
- 证据性质：真实 Plugin、LaunchAgent、Local Service、Keychain reference 与
  `deepseek-v4-flash`；截图不含 Key、token、路径或私人正文。

## 当前宿主结论

Logseq `0.10.15` 的 `page-head-actions-slotted` 只在 DB Graph 的 LSP 分支挂载；当前 File
Graph 不挂载该 slot。因此“继续项目” Page Head 动作在这个宿主组合中不能显示。这是
`BOUNDED_HOST_LIMIT`，不是靠 DOM 注入或猜测 Page identity 绕过的理由。Project workspace
仍是可靠入口；Page menu 继续只在拿到精确 Page identity 时工作。

真实 Project Page 还暴露了一个有价值的测试场景：正式 active Page Anchor 的 UUID 与当前
宿主 Page UUID 已漂移。Plugin 没有把 stale properties 猜成正式 Project；用户系统状态先显示
“有 1 项正文变化需要核对”，reconciliation 后恢复日常可用。精确 Rebind 产品入口仍属 P2-G
缺口，不能把自动收敛冒充 Anchor 已重新绑定。

## Context Recovery 真实链

1. 从“项目 → 项目重入”读取确定性 Project 卡；
2. 用户显式点击“帮我恢复上下文”，loading 超过 5 秒时保持可见；
3. Service 构造 server-owned Context Package、事实、只读动作和 Context fingerprint；
4. Provider 返回 JSON，Unified UX Validator 锁定 facts/action/evidence/risk/provenance；
5. 前台保留确定性基线，并把 LLM 草稿分为已确认事实、Copilot 判断、仍不知道；
6. disposition 只保留在当前 Service session；reload / Service restart 清空草稿与反馈；
7. 全链没有 Proposal、Commit、Graph 或 SQLite 正式写入。

## 真实模型结果与改进

- 首轮旧上下文没有包含最近 Commit，模型把已发生的 Closure Commit/Undo 列为未知；用户反馈
  `INACCURATE`。`4e02226` 将最近正式修改纳入机器事实，并把同一 Proposal 的 forward/inverse
  折叠成一条“已撤销”用户结论。
- `4e02226` 后事实已接地，但模型判断仍使用英文；该结果继续标为 `INACCURATE`。
- `2cf8bf2` 增加机器所有的中文前台合同后，真实输出使用中文、保留两条最近正式修改、判断只
  一条；session summary 为 `GENERATED=1 / REJECTED=0 / HELPFUL=1`，prompt `53119f24`。
- 双轴 review 发现自动二次 Provider 调用会放大预算并让一次用户交互双计数，且单汉字检查可被
  混合文本绕过。最终 `894d14f` 撤销自动修复：Validator 失败只记录一次固定
  `UX_OUTPUT_VALIDATION_FAILED`；受控产品词从语言比例中排除，剩余自然语言必须至少两个汉字、
  无日文假名且汉字占比不低于 50%；固定生成策略升级为
  `unified-ux-generator@1.2.0`。
- `894d14f` 精确构建真实调用通过语言 Validator，事实边界正确；但“真实 Provider Gate 的当前
  测试结果未知”应表达为“等待用户评价当前草稿”，因此用户反馈 `INACCURATE`。session summary
  为 `GENERATED=1 / REJECTED=0 / INACCURATE=1`，prompt `6ddf9546`。

最近两个精确构建的真实 Validator 拒绝率为 `0/2`；两个 Service session 都只出现一个
`GENERATED` 事件，未观察到 Provider retry。更早两次质量失败用于回归说明，不与最终版本指标
混算。自动测试另覆盖混合英文、短英文临界值、日文假名、中文产品词、越界 fact/action/evidence
和固定拒绝码。

## 安全与写入回查

最终调用后 `semantic_commits` 仍为 `24`，最新更新时间仍为
`2026-07-26T02:40:22.564Z`。这证明生成与反馈没有创建正式写入；它不替代未来的 stale、Provider
error 与 restricted Desktop Gate。

## 截图

- `p0-i-01-anchor-drift-user-status-current-dark.png`：真实 Anchor drift 用户状态；
- `p1-g-01-context-recovery-loading-current-dark.png`：真实 loading；
- `p1-g-02-context-recovery-provider-result-current-dark.png`：旧上下文质量失败；
- `p1-g-03-context-recovery-reload-cleared-current-dark.png`：reload 后 session 草稿清除；
- `p1-g-04-context-recovery-grounded-provider-current-dark.png`：事实接地但英文判断；
- `p1-g-05-context-recovery-language-validated-provider-current-dark.png`：`2cf8bf2` 的 HELPFUL 结果；
- `p1-g-06-context-recovery-final-provider-current-dark.png`：`894d14f` 精确构建与仍待改善的 unknown。

## 状态结论

- 已 Desktop 验证：Project workspace 入口、deterministic baseline、loading、真实 Provider、
  Validator 接受、分区渲染、反馈、reload 清除、零正式写入；
- 有界完成：File Graph 的 Page Head slot 不可用，安全隐藏；
- 仍为 Partial：Provider error、validator rejection 的用户界面、生成期间 stale、Light、窄栏、
  真实 Page Head on DB Graph，以及真实内容 helpful/noise 样本量；
- 下一关键路径：修正“当前生成本身”与“正式 Project Gate 证据”的语义边界；完成 error/stale/
  restricted 代表链；把精确 Anchor drift 进入统一 Rebind 产品入口。
