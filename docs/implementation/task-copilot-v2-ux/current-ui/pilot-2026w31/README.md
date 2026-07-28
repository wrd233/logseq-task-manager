# Task Copilot 连续使用 Pilot：PILOT-2026W31-A

> 状态：`IN_PROGRESS_DAY_7_MOVE_RENAME_DONE`
> 当前精确构建：`1c18e9b0ff63`
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
| Day 5 | DONE_REPRESENTATIVE_WITH_UX_DEBT | 三组各 5 轮真实 Grill + 1 次 Preview；最终组完成 HIGH/Create/reload/Context Recovery/反馈清除/Undo/健康复核 | 1.6.0 保留业务未知并生成真实当前推进；AI 增量准确但对新 Project 价值有限；结果墙和重复确认仍阻断发布 |
| Day 6 | PARTIAL_WAITING_RESUME_DONE | 使用 Day 3 的真实 Waiting Task；原 Block 恢复为可行动→返回现场→Now 重排→真实 plugin reload→健康复核 | Waiting 可以自然回到行动；现有 Now 会把它排到“接下来值得处理”第一项，但整体列表仍偏长，Dynamic Now 对照继续开放 |
| Day 7 | PARTIAL_MOVE_RENAME_DONE | 在 Logseq 中把真实 MiniProject 整棵子树 Cut/Paste 到新 Page，并改名；explicit sync→真实 plugin reload→Now→打开正文→健康复核 | 同一 UUID 移动和改名后 Primary Anchor 保持 active，Now 能打开到新位置；不应误触发 Rebind |
| Day 8—10 | OPEN | 尚未运行 | 不用历史截图或单点 Golden Flow 代替 |

## Provider 与安全计数

- 真实 Provider 调用：`32`（Day 1—2 为 2；Day 4 MiniProject 为 5；Blank Project
  Grill/Preview 为 7；Day 5 三组重建 Project Grill/Preview 各 6；Page 来源超限在 Provider 前拒绝）
- Validator rejection：`0`
- 自动 retry：`0`
- abstention：`0`
- 新 active Skill 数量：`0`；`project-creation-modeling` 从 1.5.0 升至 1.6.0，
  1.5.0 退休
- 正式写入：Day 1 创建 Task；Day 2 先精确 Undo 再以纠正来源创建 Task；Day 3 仅修改
  该 Task 的 Condition；Day 4 创建 MiniProject，并创建后完整 Undo Graylog Project；
  Day 5 创建 Project 后完成真实 reload、Context Recovery 零写入和完整 Undo；Day 6
  复用同一 `changeCondition` 权威把该 Task 从 Waiting 恢复为 Actionable；Day 7 的移动
  和改名是用户在 Logseq 工作现场的普通正文编辑，随后由既有 explicit sync 核对正式对象，
  没有 Proposal、Commit 或 Recovery
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
    `19de8de` 已真实验证新成功消息不再泄漏 `Project / Anchor / Audit / Commit`。再次真实
    plugin reload 后 Project 不回现，Pending/Recovery/Conflict `0/0/0`、explicit sync clean。
12. Day 5 真实 Preview 将“重入页显示一句状态、一个推进和材料入口”误作业务当前推进。
    这不是一条文案缺陷，而是 `CURRENT_INTERFACE` 混合了产品界面和业务动作。用户在
    Preview 取消，零 Proposal/正式写入；1.6.0 已统一 Grill、Prompt 和 Validator，
    第二组真实 Provider/Desktop 已证明真实未知和行动均保留。
13. 第二组 Preview 的业务语义正确，但固定渲染产生“当前先从先确认……继续”。这不是
    Skill 问题；`19de8de` 已用第三组真实 Provider 证明独立“目标 / 当前推进”两行正确。
14. 新 Project 的 Context Recovery 没有伪造未知或正式写入；因项目刚创建、历史证据很少，
    AI 增量准确但有限。该结果仍可减少一次全文重读，但不能据此声称所有重入场景高价值。
15. 创建完成卡仍泄漏“正式 Commit 已完整完成”，并复制较长最终阅读；该既有结果墙问题
    继续阻断 Final Release，不新增第二结果模型。
16. Day 6 首次真实验证发现 Waiting 只有“等待 / 被卡住 / 暂停”入口，回复到达后无法在
    原 Block 回到行动。`1c18e9b` 在同一入口增加“恢复为可以行动”，只更新既有
    Condition，并在确认页明确不完成事项、不移动正文、不改变当前关注。应用后返回同一
    Block，Task 立即成为“接下来值得处理”第一项，真实 plugin reload 后保持，系统健康。
17. 同一时刻的正式 Service 对照显示 Now 为 `Focus 1 / Next 10 / Waiting 0`，Dynamic
    Now Shadow 为 `Continue 1 / Review 0 / Keep waiting 0 / Suggested 0 / Suppressed 10`。
    Shadow 会隐藏刚恢复但未加入 Focus 的 Task，故继续保持 Shadow；不能用“更少卡片”
    交换事务连续性。
18. Day 7 将 MiniProject 移动到新 Page 并改名后，同一 Logseq UUID 和 external identity
    保持，Primary Anchor 仍为 active；真实 reload 后 Now 能定位新标题，点击“打开正文”
    精确进入新 Page 的同一 Block。系统没有把稳定移动误报成失联，也没有要求用户理解
    UUID、hash 或 Anchor。复制相似 Block、真正 missing/conflict 与 Rebind 纠错仍待后续。

上述发现不会自动变成新的正式状态或独立恢复分支。修复优先复用现有 Review、Undo、
Dynamic Now 和用户状态翻译内核。

## CURRENT 截图

Day 1—3 和 Day 4 自然材料来自 `bc79ffd`；Day 4 创建主链是在与 `42e6a91` 源码等价的
working-tree build 上运行，但产物内嵌 commit 仍为 `fbd14eb`，因此只登记为
`HISTORICAL_SOURCE_EQUIVALENT`，不冒充 exact-build CURRENT。Undo 后健康画面已用真正
内嵌 `42e6a91309ba` 的当前产物重载复核；撤销资格卡又由真正内嵌
`7a0b444821b7` 的产物重载复验并登记为 `CURRENT`。Day 5 最终链使用真正内嵌
`19de8de0f47c` 的产物完成 Preview、Create、reload、Context Recovery 与 Undo。共同宿主为 Logseq 0.10.15、
File Graph `logseq`、host Light、约 1000×720。Day 6 使用真正内嵌
`1c18e9b0ff63` 的产物完成 Waiting 恢复、返回现场、Now 重排、reload 和健康复核。
Day 7 继续使用同一精确 Plugin 构建完成 MiniProject 移动、改名、explicit sync、
reload、从 Now 打开新位置和健康复核；仓库文档 HEAD 在取证前为 `793cc46a5001`，
没有用后续文档提交冒充 Plugin 构建。
详细结论见 `OBSERVATION_LOG.md`。

## 下一段

1. 继续 Day 7 的 duplicate/missing 变体，只在真实 identity 丢失时进入既有 Rebind；
2. 推进 Day 8 “待我确认”的已处理/暂缓/不相关/不再提醒与 cooldown，取得
   helpful/noise，而不新增 Attention 类型；
3. 推进 Day 9 Closure 的完成、Undo 与 `RECOVERY_REQUIRED` 用户语义代表链。
