# Task Copilot 连续使用 Pilot：PILOT-2026W31-A

> 状态：`IN_PROGRESS_DAY_5_CURRENT_INTERFACE_FIX_AUTOMATED`
> 当前精确构建：`7a0b444821b7`
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
| Day 4 | DONE_REPRESENTATIVE_WITH_UX_BLOCKERS | 自然材料形成 MiniProject；真实 DeepSeek 自适应 Grill；Page 来源超限 fail-closed；Blank Project 经 Preview/HIGH/Create/reload/Undo；精确构建健康复核 | 正式链安全，但确认重复、推荐越界、结果墙和工程词仍阻断发布 |
| Day 5 | PARTIAL_PROVIDER_DEFECT_FIXED_AUTOMATED | 5 轮真实 Grill + 1 次 Preview；在 Preview 取消，零 Proposal/正式写入 | 页面显示要求曾被误作业务当前推进；1.6.0 自动修复完成，待新构建 Provider/Desktop 复验 |
| Day 6—10 | OPEN | 尚未运行 | 不用历史截图或单点 Golden Flow 代替 |

## Provider 与安全计数

- 真实 Provider 调用：`20`（Day 1—2 为 2；Day 4 MiniProject 为 5；Blank Project
  Grill/Preview 为 7；Day 5 重建 Project Grill/Preview 为 6；Page 来源超限在 Provider 前拒绝）
- Validator rejection：`0`
- 自动 retry：`0`
- abstention：`0`
- 新 active Skill 数量：`0`；`project-creation-modeling` 从 1.5.0 升至 1.6.0，
  1.5.0 退休
- 正式写入：Day 1 创建 Task；Day 2 先精确 Undo 再以纠正来源创建 Task；Day 3 仅修改
  该 Task 的 Condition；Day 4 创建 MiniProject，并创建后完整 Undo Graylog Project
- Key 泄漏、正文进入普通日志、绕过 Service、手改 SQLite：`0`

Day 1 的误解来自原始输入把 `83/84` 写成“要部署到”的业务歧义；Day 2 补充说明后，
同一 Provider 正确生成“业务机器源地址 → 听云服务器端口权限”的 Task。这不计为模型
随机语义错误，也不据此补丁化 Skill。

## 当前 UX 结论

已经观察到的发布相关问题：

1. 单一 Task 的正式化在普通用户层经历“审阅方案 → 确认应用 → 勾选 → 再次确认应用”，
   实际为三次确认；安全记录有价值，但用户判断重复。
2. 成功卡曾同时显示“不能确认是否可撤销”和可点击“撤销”；`7a0b444` 已让存在真实
   撤销入口的卡片明确说明“可以发起撤销，执行时会重新检查”，最新 Desktop 已复验。
3. “最近修改与恢复”首屏泄漏 `SQLITE / LOCAL SERVICE` 等工程概念，并让历史卡淹没
   当前问题。
4. 修正一个事实需要 Undo → 修改来源 → 再次 Provider / Review / Confirm，安全但日常
   心智负担过高。
5. WAITING 从“继续处理”消失是正确降噪；当前没有“保持等待”区或一条安静确认，用户
   难以知道系统是否仍记得它。
6. File Graph reload 后约 5 秒出现空 Page，随后正文恢复；当前证据指向宿主索引延迟，
   不是数据丢失。
7. 原生 `datetime-local` 键盘输入在 Desktop 自动化中负担高；不新增状态，先作为可用性债。
8. Page 来源超过有界读取预算时，旧界面把确定性范围错误翻译成 Provider 失败并提供无效
   重试；`42e6a91` 已改为解释“当前页面内容太多、请选 MiniProject 或 Blank”，且不显示重试。
9. Blank Project 的自适应 Grill 能利用用户纠正，但模型两次给出没有证据的量化门槛或
   周会/看板建议；它们没有成为正式事实，本轮不据单样本升级 Skill。
10. Project 创建链仍有“审阅方案 → 勾选确认方案 → 确认创建 → 勾选确认应用”的重复
    判断；创建结果和历史页仍形成长墙。撤销资格矛盾已由 `7a0b444` 关闭。
11. Project Undo 本身通过：专用空 Page 和正式 Project 消失，来源与 MiniProject 保留；
    `7a0b444` 已自动收敛成功消息，不再泄漏 `Project / Anchor / Audit / Commit`；该新
    成功消息尚未重新执行一次真实 Project Undo，不能借历史截图升级为 Desktop DONE。
    精确 `7a0b444` reload 后 Pending/Recovery/Conflict `0/0/0`、explicit sync clean。
12. Day 5 真实 Preview 将“重入页显示一句状态、一个推进和材料入口”误作业务当前推进。
    这不是一条文案缺陷，而是 `CURRENT_INTERFACE` 混合了产品界面和业务动作。用户在
    Preview 取消，零 Proposal/正式写入；1.6.0 已统一 Grill、Prompt 和 Validator，
    仍须真实 Provider/Desktop 复验。

上述发现不会自动变成新的正式状态或独立恢复分支。修复优先复用现有 Review、Undo、
Dynamic Now 和用户状态翻译内核。

## CURRENT 截图

Day 1—3 和 Day 4 自然材料来自 `bc79ffd`；Day 4 创建主链是在与 `42e6a91` 源码等价的
working-tree build 上运行，但产物内嵌 commit 仍为 `fbd14eb`，因此只登记为
`HISTORICAL_SOURCE_EQUIVALENT`，不冒充 exact-build CURRENT。Undo 后健康画面已用真正
内嵌 `42e6a91309ba` 的当前产物重载复核；撤销资格卡又由真正内嵌
`7a0b444821b7` 的产物重载复验并登记为 `CURRENT`。共同宿主为 Logseq 0.10.15、
File Graph `logseq`、host Light、约 1000×720。详细结论见 `OBSERVATION_LOG.md`。

## 下一段

1. 安装 `project-creation-modeling@1.6.0` 的最新构建，重新建立 Graylog Project，
   证明当前推进是可行动工作，再进入 Day 5 Context Recovery；在后续真实 Project Undo
   时复验新的成功消息；
2. 用 Day 1—5 的真实使用证据决定 Dynamic Now 的“继续处理 / 需要回看 / 保持等待”
   前台分区，不先增加新的 Attention 类型或 Block Marker。
