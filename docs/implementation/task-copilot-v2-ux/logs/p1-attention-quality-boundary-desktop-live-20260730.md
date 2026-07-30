# P1 Attention 质量边界与 session-only 结论（2026-07-30）

## 当前构建与环境

- branch：`feature/task-copilot-mvp`
- exact build：`c9919f2`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`（测试环境）
- 主题 / 尺寸：host Light、Plugin Dark、1000×720
- Plugin：真实 unpacked build，iframe 指向当前仓库
  `apps/task-copilot-logseq-plugin/dist/index.html`
- Service：`READY`；Doctor `PASS`；schema `12`
- Skill catalog：安装态与当前 Service payload 一致；本 Slice 没有修改或调用 Skill/Provider

## 修复的问题

`3b6816e` 已让现有 Attention session 记录 `shown / acted / later / notRelevant /
unresolved`，但真实 Desktop 暴露了一个通用语义错误：点击“更新当前状态”只打开
Condition 对话框时就计入 `acted`，即使用户随后取消。`c9919f2` 将计数点移到
`changeCondition` 正式成功之后：

- 打开对话框：不计 `acted`；
- 取消：提醒和唯一主操作保留；
- 正式保存成功：才计 `acted`；
- 打开正文类主操作：只有宿主导航成功后才计 `acted`。

该修复没有改变 `AttentionSignal`、正式对象、Condition、Focus、正文、Commit 或
Recovery 合同，也没有增加提醒存储。

## 真实 session 样本

同一可识别测试 Task 先经既有 Local Service 设置为到期 Waiting；每个 disposition 样本
之间都执行真实 Plugin Manager reload，使 session 边界可观察。

| session | shown | acted | later | notRelevant | unresolved | 观察 |
|---|---:|---:|---:|---:|---:|---|
| 取消主操作 | 1 | 0 | 0 | 0 | 1 | Condition 对话框取消；提醒和主操作保持 |
| 本次先不提醒 | 1 | 0 | 1 | 0 | 0 | 只隐藏本 session 的标记；正式 Waiting 卡仍在 |
| 本次不相关 | 1 | 0 | 0 | 1 | 0 | 只隐藏本 session 的标记；正式事实仍在 |
| 完成唯一主操作 | 1 | 1 | 0 | 0 | 0 | 正式保存为 `ACTIONABLE v9`；提醒随事实解除自然消失 |

再次真实 reload 后，Task 仍为 `ACTIONABLE v9`，不再生成提醒。最终 Service
`READY`、Doctor `PASS`、`PENDING=0`、`RECOVERY_REQUIRED=0`。

## 质量解释

- `acted` 只表示用户完成了本 Signal 推荐的主操作，是 engagement，不直接等于 helpful；
- `later / notRelevant` 表示本 session 的处置，不写入 SQLite，也不创建跨会话提醒权威；
- reload 清除 disposition 并从正式事实重算；事实仍有效才重新出现，事实解除后自然失效；
- 一对象始终只有一个主问题；Signal 只装饰既有 Now 卡，不创建第二张提醒卡；
- 本组是少量受控代表样本，足以关闭计数语义和跨会话策略决策，不足以宣称生产 helpful
  rate，也不支持开放更多 Signal。

发布结论：

- `REVIEW_DUE / DUE`：`BOUNDED_PILOT`；
- disposition：保持 `session-only`；
- 跨会话 disposition store：不建立；
- Waiting 过久、Project 静默、跨对象 LLM 观察：继续 `SHADOW`；
- Block Marker：继续 `OFF`；
- 建议关注：证据不足，默认关闭；
- `acted` 不作为 helpful 的替代指标。

## 自动与 Desktop 证据

- TDD 红灯先证明“打开但未完成不应计 acted”；修复后 Plugin `378/378`、typecheck、build
  PASS；
- 根级 `./scripts/check.sh` PASS；stable rules `145`；recovery rehearsal differences `[]`；
- 当前截图：
  - `p1-attention-quality-primary-current-c9919f2.jpeg`
  - `p1-attention-quality-cancel-kept-current-c9919f2.jpeg`
  - `p1-attention-quality-later-current-c9919f2.jpeg`
  - `p1-attention-quality-reload-recompute-current-c9919f2.jpeg`
  - `p1-attention-quality-not-relevant-current-c9919f2.jpeg`
  - `p1-attention-quality-fact-resolved-current-c9919f2.jpeg`
  - `p1-attention-quality-fact-resolved-reload-current-c9919f2.jpeg`
- `3b6816e` 的三张截图保留为 `HISTORICAL_DEFECT / SUPERSEDED`，不得代表当前语义。

## 复杂度变化

- 新增正式状态：`0`
- 新增 Runtime：`0`
- 新增 Recovery 分支：`0`
- 新增 Skill / Prompt / Validator：`0`
- 新增持久化权威：`0`
- 关闭既有 Partial：主操作计数语义 `1`；跨会话 disposition 决策 `1`
- 新增长期 Partial：`0`
- Partial 净变化：`-2`

P1 Attention 由“缺少质量边界”推进为有界 Pilot，但 P1 整体和完整 Goal 仍为
`IN_PROGRESS`；自然日用 helpful/noise 只能在后续 Pilot 中继续观察，不阻断首发，也不应
被伪装成已经获得生产统计。
