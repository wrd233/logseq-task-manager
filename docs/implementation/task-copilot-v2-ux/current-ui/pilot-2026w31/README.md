# Task Copilot 连续使用 Pilot：PILOT-2026W31-A

> 状态：`IN_PROGRESS_DAY_3_WAITING_SUBCHAIN_DONE`
> 当前构建：`bc79ffd1ce6a091186cc54ee0a32bcb6a1c8b24b`
> 分支：`feature/task-copilot-mvp`
> Logseq：`0.10.15`
> Graph：File Graph `logseq`（专用测试 Graph）
> 开始时间：2026-07-28

本目录记录 7—10 个模拟日的连续真实使用，不建立新的 Pilot Runtime、正式状态或日志权威。
模拟正文直接写入当前测试 Graph，正式语义变化继续经过 Local Service、
Proposal / Commit / Undo / Recovery。

## 批次与基线

- 批次：`PILOT-2026W31-A`
- 入口 Page：`模拟使用/2026-W31/PILOT-2026W31-A`
- 正文标记：`#TaskCopilotPilot`
- 产品恢复快照：2026-07-28 18:24:38 创建，9 个正式事项，完整性已验证
- 初始正式状态：Pending `0`、Recovery `0`、Anchor conflict `0`
- 初始计数：objects `9`、proposals `17`、semantic commits `28`、anchors `11`
- authority 仅保存脱敏摘要：Graph `logseq`；database path 与 graph key 只记录 digest，
  Provider 已配置；本目录不记录 Key、正文包、完整路径或模型原始响应

`screenshots/baseline-recovery-snapshot-current-light-bc79ffd.jpg` 是 Pilot 开始前的
`CURRENT` 产品恢复点画面。

## 当前进度

| 模拟日 | 状态 | 已完成的真实行为 | 当前结论 |
|---|---|---|---|
| Day 1 | DONE_REPRESENTATIVE | 7 条自然捕获；明确 TODO 经真实 DeepSeek → Review → Commit；reload | 普通笔记没有被自动正式化；Now 未被全部捕获淹没 |
| Day 2 | DONE_REPRESENTATIVE | 7 条纠正/补充；Undo 错误 Task；改原文；真实 DeepSeek 重新正式化；reload | 正式写入可恢复，但纠正路径过长 |
| Day 3 | PARTIAL_WAITING_SUBCHAIN_DONE | 6 条自然输入；一个正式 Task 设为等待网络组并设置 reviewAt；reload/DB 读回 | Waiting 不再占用“继续处理”，但前台缺少安静的“保持等待”确认 |
| Day 4—10 | OPEN | 尚未运行 | 不用历史截图或单点 Golden Flow代替 |

## Provider 与安全计数

- 真实 Provider 调用：`2`
- Validator rejection：`0`
- 自动 retry：`0`
- abstention：`0`
- 新 Skill / Prompt / Validator 版本：`0`
- 正式写入：Day 1 创建 Task；Day 2 先精确 Undo 再以纠正来源创建 Task；Day 3 仅修改
  该 Task 的 Condition
- Key 泄漏、正文进入普通日志、绕过 Service、手改 SQLite：`0`

Day 1 的误解来自原始输入把 `83/84` 写成“要部署到”的业务歧义；Day 2 补充说明后，
同一 Provider 正确生成“业务机器源地址 → 听云服务器端口权限”的 Task。这不计为模型
随机语义错误，也不据此补丁化 Skill。

## 当前 UX 结论

已经观察到的发布相关问题：

1. 单一 Task 的正式化在普通用户层经历“审阅方案 → 确认应用 → 勾选 → 再次确认应用”，
   实际为三次确认；安全记录有价值，但用户判断重复。
2. 成功卡同时显示“不能确认是否可撤销”和可点击“撤销”，结论与能力冲突。
3. “最近修改与恢复”首屏泄漏 `SQLITE / LOCAL SERVICE` 等工程概念，并让历史卡淹没
   当前问题。
4. 修正一个事实需要 Undo → 修改来源 → 再次 Provider / Review / Confirm，安全但日常
   心智负担过高。
5. WAITING 从“继续处理”消失是正确降噪；当前没有“保持等待”区或一条安静确认，用户
   难以知道系统是否仍记得它。
6. File Graph reload 后约 5 秒出现空 Page，随后正文恢复；当前证据指向宿主索引延迟，
   不是数据丢失。
7. 原生 `datetime-local` 键盘输入在 Desktop 自动化中负担高；不新增状态，先作为可用性债。

上述发现不会自动变成新的正式状态或独立恢复分支。修复优先复用现有 Review、Undo、
Dynamic Now 和用户状态翻译内核。

## CURRENT 截图

全部截图来自 `bc79ffd`、Logseq 0.10.15、File Graph `logseq`、host Light、约
1000×720；文件名含模拟日与用户目标。详细结论见 `OBSERVATION_LOG.md`。

## 下一段

1. 完成 Day 3 其余代表行为：第二个 Waiting、Paused、DONE 与用户 Focus/reviewAt；
2. 进入 Day 4，在真实杂乱材料上形成听云 MiniProject 与 Graylog Project；
3. 用 Day 1—4 的真实使用证据决定 Dynamic Now 的“继续处理 / 需要回看 / 保持等待”
   前台分区，不先增加新的 Attention 类型或 Block Marker。
