# PILOT-2026W31-A 观察记录

## 证据口径

| 字段 | 值 |
|---|---|
| runtime commit | Day 1—3 `bc79ffd1ce6a`；Day 5 `19de8de0f47c`；Day 6—7 `1c18e9b0ff63`；Day 8 `318baab`；当前精确构建 `7fe762d` |
| Logseq | `0.10.15` |
| Graph | File Graph `logseq` |
| 主题 / 尺寸 | host Light / 约 1000×720 |
| 数据 | 当前测试 Graph 的真实 Page、Block 和正式 V2 对象 |
| Provider | 已配置的真实 DeepSeek；Key、原始响应和完整正文不落本目录 |

## Baseline

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/baseline-recovery-snapshot-current-light-bc79ffd.jpg` | 开始连续 Pilot 前建立恢复点 | 快照已创建并验证；初始 Pending/Recovery/Conflict 为 0 | 逐日输入而非一次导入 | CURRENT |

## Day 1：大量现场捕获

自然输入覆盖硬件告警、听云端口、活动稿、Zabbix、RHCSA、APM 和 Graylog 普通研究笔记。
普通输入保留自由正文；只有显式 TODO 经用户选中并发起“分析当前内容”。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-01-capture-worksite-current-light-bc79ffd.jpg` | 在 Journal 风格页面连续捕获 | 普通笔记与一个显式 TODO 共存 | 检查 Now 是否被全部纳入 | CURRENT |
| `screenshots/day-01-now-after-capture-current-light-bc79ffd.jpg` | 观察捕获后的 Now | 普通笔记没有自动成为正式事项 | 用户选择真正要治理的 TODO | CURRENT |
| `screenshots/day-01-selected-todo-provider-review-current-light-bc79ffd.jpg` | 用真实 Provider 理解选中 TODO | 生成一项可审阅 Task；零正式写入 | 审阅方案 | CURRENT |
| `screenshots/day-01-task-applied-current-light-bc79ffd.jpg` | 正式应用 | Task 已经 Service/Commit 写入 | 返回现场；可撤销文案需核对 | CURRENT |
| `screenshots/day-01-now-after-reload-current-light-bc79ffd.jpg` | reload 后验证连续性 | 正式 Task 回到 Now；普通笔记仍未灌入 | Day 2 补充与纠正 | CURRENT |

观察：

- 实际步骤数：选中来源后约 5 个用户动作，应用阶段包含三次相近确认。
- 主操作：Review 前清楚；应用阶段相近动作重复。
- 噪声：Now 没有因 7 条捕获形成列表爆炸。
- 安全：正式写入 1；Provider 失败/Validator rejection 0。

## Day 2：补充、重复与纠正

新材料明确 `83/84` 是听云服务器而非安装探针的业务机器，并区分 Graylog 与 Zabbix。
用户从“最近修改与恢复”精确 Undo 前一 Task，修改恢复的 TODO，再次使用真实 Provider
和正式链创建纠正后的 Task。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-02-corrections-worksite-current-light-bc79ffd.jpg` | 继续自然记录并纠正事实 | 原始材料保留，纠正以新证据出现 | 修正正式 Task | CURRENT |
| `screenshots/day-02-corrected-task-applied-current-light-bc79ffd.jpg` | 应用纠正后的 Task | 旧错误 Task 已 Undo；新 Task 表达源地址清单和端口权限 | reload 读回 | CURRENT |

观察：

- 数据安全通过：旧错误 Task 不再存在，恢复的来源正文可编辑，纠正 Task 重新正式提交。
- 心智负担高：需要打开历史、辨认 Commit、Undo、改来源，再走完整 Review。
- 工程词泄漏：“最近修改与恢复”默认出现 SQLite/Local Service 与长历史卡。
- 不升级 Skill：失败根因是输入事实后来被用户纠正，不是可泛化 Prompt 缺陷。

## Day 3：等待、阻塞与无日期

自然输入覆盖网络组等待、业务负责人等待、iBMC 测试机等待、Graylog 暂停、RHCSA
不确定计划、活动稿完成。本次先关闭一个代表性 Waiting 子链。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-03-waiting-now-current-light-bc79ffd.jpg` | 把端口 Task 设为等待网络组 | Task 不再出现在“继续处理” | 等待 reviewAt 或回复 | CURRENT |
| `screenshots/day-03-waiting-after-reload-current-light-bc79ffd.jpg` | reload 后验证等待连续性 | WAITING 与 reviewAt 正式读回，Now 仍不制造行动噪声 | 完成 Day 3 其他代表行为 | CURRENT |

正式读回摘要：

- `condition=WAITING`
- `waitingFor=网络组`
- `expectedResult=确认业务机器到听云服务器的端口权限`
- `reviewAt=2026-07-29T02:00:00.000Z`
- object version `3`

观察：

- 正向：Waiting 不再冒充当前可行动项；reload 后正式状态保持。
- 缺口：没有低打扰的“保持等待”分区，用户无法在 Now 中确认系统仍记得它。
- 未完成：安装账号 Waiting、Graylog Paused、724 DONE、RHCSA Focus/reviewAt。

## 轻量指标（截至 Day 3）

| 指标 | 结果 |
|---|---:|
| 自然输入 | 20 条 |
| 正式 Task | 1 个当前有效；历史错误版本已 Undo |
| 真实 Provider | 2 次 |
| Validator rejection / retry | 0 / 0 |
| Attention 前台展示 | 0 |
| disposition / cooldown | 尚未进入 Day 8，不提前宣称 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |

## Day 4：形成 MiniProject 与 Project

先把自然输入扩成听云探针部署子树和 Graylog 项目意图，没有一次导入规范化对象。
听云材料经真实 DeepSeek 5 次自适应 Grill 后形成 MiniProject；已有材料已经覆盖当前
结构时，最终预览诚实返回“无需修改”，没有为了完成流程制造 Proposal。

Graylog Page 来源因测试页超过 16 Block 的有界读取预算而在 Provider 前 fail-closed。
真实失败证明旧界面误称“讨论失败”并给出必然再次失败的 Retry。`42e6a91` 将这两类
确定性错误改为范围解释，并为非重试错误隐藏 Retry；没有放宽 Page 读取边界。

随后从 Blank 来源运行完整 Project 创建：6 次自适应 Grill + 1 次最终预览、HIGH Review、
正式创建、reload、进入新 Project Page、最近修改、Undo、再次 reload 与健康检查。
Blank 没有虚构来源；原测试 Page 和听云 MiniProject 都保留。Undo 后 Graylog Project
和本次拥有的空 Project Page 均消失。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-04-project-material-current-light-bc79ffd.jpg` | 在自然材料中形成两类治理意图 | 原始正文仍可读，听云子树与 Graylog 意图共存 | 先验证 MiniProject | CURRENT_AT_BC79FFD |
| `screenshots/day-04-mini-project-no-change-preview-current-light-bc79ffd.jpg` | 真实 Grill 后审阅 MiniProject | 系统认为当前结构无需正式变化，零 Proposal | 转入 Project 创建 | CURRENT_AT_BC79FFD |
| `screenshots/day-04-project-page-too-large-defect-historical-light-bc79ffd.jpg` | 从较长 Page 发起 Project 创建 | 旧 UI 把确定性来源预算误称为讨论失败 | 由 `42e6a91` 自动合同替代 | HISTORICAL_DEFECT |
| `screenshots/day-04-project-grill-ready-source-equivalent-light-runtime-fbd14eb.jpg` | 完成 Blank 自适应 Grill | readiness 达成；用户纠正了无依据量化与流程建议 | 生成最终阅读预览 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-preview-source-equivalent-light-runtime-fbd14eb.jpg` | 审阅最终阅读效果 | 影响/不影响边界存在，但理解句过长且标点重复 | 进入 HIGH Review | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-high-review-source-equivalent-light-runtime-fbd14eb.jpg` | 审阅正式影响 | 首屏明确创建 Project/Page、原文保留与尚未应用 | 确认应用 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-created-source-equivalent-light-runtime-fbd14eb.jpg` | 查看创建结果 | 正式 Project 和 Page 已创建；结果墙与 Undo 资格矛盾 | reload | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-after-reload-source-equivalent-light-runtime-fbd14eb.jpg` | reload 后重入 | Project Page 和页面内继续入口保持 | 执行 Undo | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-source-equivalent-light-runtime-fbd14eb.jpg` | 撤销 Project 创建 | Project/Page 已撤销，来源保留；成功消息泄漏工程词 | reload 核对 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-reload-absence-source-equivalent-light-runtime-fbd14eb.jpg` | reload 后检查项目列表 | Graylog Project 不再存在 | 精确构建健康复核 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-reload-health-current-light-42e6a91.jpg` | 用真正内嵌 `42e6a91309ba` 的产物重载 | 系统正常；0/0/0；explicit sync clean | 关闭 UX 矛盾后重建 Day 5 Project | CURRENT |
| `screenshots/day-04-undo-guidance-current-light-7a0b444.jpg` | 用真正内嵌 `7a0b444821b7` 的产物查看最近修改 | 存在真实撤销入口时明确“可以发起撤销；执行时重新检查”，不再与按钮矛盾 | 重建 Day 5 Project | CURRENT |
| `screenshots/day-04-undo-guidance-health-current-light-7a0b444.jpg` | 同一精确构建展开系统诊断 | Pending/Recovery/Conflict 0/0/0；explicit sync clean | 继续 Day 5 | CURRENT |
| `screenshots/day-05-project-preview-current-interface-misclassified-defect-light-plugin-7a0b444.jpg` | 重建 Graylog Project，5 轮真实 Grill 后生成 Preview | 页面显示要求被误列为业务当前推进；旧 Validator 未拒绝 | Preview 取消，零 Proposal/正式写入；用 1.6.0 重跑 | HISTORICAL_DEFECT |
| `screenshots/day-05-project-grill-actionable-ready-current-light-f7a5252.jpg` | 1.6.0 重跑到 readiness | 五类事实保留；当前推进是采集第一条真实 syslog | 生成 Preview | CURRENT_AT_F7A5252 |
| `screenshots/day-05-project-preview-actionable-grammar-defect-light-f7a5252.jpg` | 生成 1.6.0 Preview | 业务动作正确；固定句式出现“当前先从先确认” | 改为目标/当前推进两行后重跑 | HISTORICAL_UI_DEFECT |
| `screenshots/day-05-project-preview-actionable-current-light-19de8de.jpg` | 第三组 1.6.0 真实 Grill 后生成 Preview | 目标与当前推进分行；真实动作保留且无重复句式 | 进入 HIGH Review | CURRENT |
| `screenshots/day-05-project-created-current-light-19de8de.jpg` | 审阅方案并确认应用 | 正式 Project/Page 已创建；落地页立即显示状态、当前动作与成果 | 真实 plugin reload | CURRENT_WITH_UX_DEBT |
| `screenshots/day-05-project-after-reload-current-light-19de8de.jpg` | 重载 Task Copilot 后重入 | 正式 Project 保持且可恢复上下文；旧 session 草稿不持久化 | 发起 Context Recovery | CURRENT |
| `screenshots/day-05-context-recovery-loading-current-light-19de8de.jpg` | 显式发起上下文恢复 | loading 明确项目和正文不会改变 | 等待真实 DeepSeek | CURRENT |
| `screenshots/day-05-context-recovery-success-current-light-19de8de.jpg` | 展开真实恢复结果 | 没有把本次草稿/反馈误作业务未知；一个当前动作，零正式写入 | 提交“有帮助”反馈并 reload | CURRENT |
| `screenshots/day-05-project-undo-return-current-light-19de8de.jpg` | 从最近修改执行 Project Undo | 专用空白页移除并返回 Logseq；成功消息无 Project/Anchor/Audit/Commit | 真实 plugin reload | CURRENT |
| `screenshots/day-05-project-undo-health-current-light-19de8de.jpg` | Undo 后重载并展开系统诊断 | Pending/Recovery/Conflict 0/0/0；explicit sync clean | 进入 Day 6 | CURRENT |

观察：

- Grill 是自适应的，但模型推荐曾虚构 7 天/95% 量化门槛和周会/看板流程。用户纠正后
  最终材料没有保留这些建议；没有正式越权写入，也没有 Validator rejection 或 retry。
- Page 来源预算错误是确定性的 Context 边界，不是 Provider error；修复选择解释并改用
  MiniProject/Blank，而不是扩大上下文或增加第二读取器。
- HIGH 首屏比历史版本更清楚，但用户层仍有四个近义确认动作。
- 新 Project Page 能立即给出状态、当前推进和成果；当前状态/成果过长，近期结果和历史墙
  仍然压过主结论。
- Undo 安全链通过；首次普通 reload 曾因
  `EXPLICIT_SYNC_SUBTREE_READ_FAILED` 显示一次 session 级核对风险。重新构建并 reload
  当前精确产物后 clean，证明它不是 Pending/Recovery/Anchor conflict，但该有界子树读取
  失败仍作为 P0 可靠性观察保留。

### Day 4 后续：撤销前台结论收敛

`7a0b444` 没有改变 Application 的保守资格判断或 Undo 安全检查，只在 Plugin 已经有真实
撤销动作时使用与动作一致的用户结论。最新 Logseq Desktop 已证明历史卡不再显示矛盾的
“证据不足”，且精确构建健康。Project 创建 Undo 的成功消息也已自动改为“新建空白页已
移除”或“复用来源页保持原样”，但尚未在新构建上再执行一次真实 Project Undo，因此保持
`DONE_DESKTOP_REPRESENTATIVE`。

自动证据：Plugin `352/352`、typecheck/build、根级 `./scripts/check.sh` PASS，0 skipped。
新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator：`0/0/0/0`。

### Day 5 完整代表链：Project 当前推进语义与 Context Recovery

同一 Graylog 材料重新运行 5 轮真实 DeepSeek Grill 和 1 次 Preview。用户对
`current-interface` 的回答只描述重入页希望看到的内容，模型仍把它写成正式 Project 的
当前推进，旧 Validator 也接受。用户没有进入 HIGH Review，而是在 Preview 取消：
Proposal、Commit、正式对象变化与 Recovery 均为 `0`。

这次失败促使 `project-creation-modeling@1.6.0` 将该维度统一定义为“一项可继续的真实
工作”，而非界面、布局、仪表盘或首屏字段。第二组真实 Provider 保留所有业务未知并把
当前推进正确落到采集第一条真实 syslog；固定渲染句式暴露的重复前台文字已单独修复。

`19de8de0f47c` 的第三组真实 Provider/Desktop 复验继续完成 HIGH Review、正式创建、真实
plugin reload、Context Recovery、反馈、再次 reload、Undo 和系统健康。Context Recovery
没有制造业务未知，reload 后草稿与反馈清除；对刚创建的 Project，AI 增量主要是将已确认
结构压缩为一个当前动作，准确但增量有限。创建完成卡仍显示“正式 Commit 已完整完成”并
复制长最终阅读，登记为既有结果墙发布阻断。

## Day 6：等待回复后自然恢复行动

直接复用 Day 3 的正式 Waiting Task。首次真实操作发现原 Block 入口只能再次选择等待、
被卡住或暂停，回复已经到达时没有安全回到行动的路径。`1c18e9b0ff63` 没有新增正式状态、
Runtime 或 Recovery，而是让既有 `BlockConditionController` 和 `changeCondition` 接受
既有 `ACTIONABLE` Condition。入口只在当前非 Actionable 时显示，并继续用对象版本重验、
会话 Undo 和原业务来源返回。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-06-waiting-resume-entry-current-light-1c18e9b.jpg` | 回复到达后从原 Block 恢复 | 一个明确的“恢复为可以行动”入口；等待/阻塞/暂停仍可选 | 查看正式影响 |
| `screenshots/day-06-waiting-resume-confirm-current-light-1c18e9b.jpg` | 确认本次变化边界 | 只更新能否继续；不完成、不移动正文、不改变当前关注 | 确认恢复 |
| `screenshots/day-06-waiting-resumed-return-current-light-1c18e9b.jpg` | 正式应用并返回工作现场 | 状态恢复成功；自动回到同一 Block；可以撤销本次状态变化 | 打开“现在” |
| `screenshots/day-06-now-after-waiting-resume-current-light-1c18e9b.jpg` | 检查 Now 是否响应 | 该 Task 成为“接下来值得处理”第一项；Waiting 不再残留 | 真实 plugin reload |
| `screenshots/day-06-now-after-waiting-resume-reload-current-light-1c18e9b.jpg` | reload 后检查连续性 | Task 仍是可行动项；session 成功消息已清除 | 检查系统健康 |
| `screenshots/day-06-waiting-resume-health-current-light-1c18e9b.jpg` | 检查正式状态安全 | 未发现未完成修改或正文连接冲突；无需操作 | 继续 Dynamic Now 对照 |

观察：

- 用户动作是“原 Block 右键 → 暂时做不了 → 恢复为可以行动 → 确认”，主结论和主操作
  均明确；完成后立即回到正文。
- Now 真实重排正确，但它仍同时列出较多历史测试对象。该证据支持 Dynamic Now 需要
  前台分区/上限，不支持新增 Attention 类型或默认打开 Block Marker。
- 正式 Local Service 同时刻对照为 `Focus 1 / Next 10 / Waiting 0`；现有 Dynamic Now
  Shadow 为 `Continue 1 / Review 0 / Keep waiting 0 / Suggested 0 / Suppressed 10`，
  并隐藏刚恢复 Task。当前不是“Shadow 已可发布”，而是现有 Now 偏长、Shadow 过稀；
  详细计数见 `../../logs/p1-dynamic-now-pilot-comparison-20260728.md`。
- Provider 调用 `0`；没有 Skill/Prompt/Validator 变化。正式写入只有既有 Condition，
  Focus、Lifecycle、正文、Anchor、Proposal 和 Commit 均未改变。

## Day 7：正文移动、改名与稳定身份

直接使用 Day 4 创建的真实 MiniProject。用户在 Logseq 工作现场把整棵子树 Cut/Paste 到
`模拟使用/2026-W31/PILOT-2026W31-A/Day 7 移动目标`，再把根 Block 改为
`[MiniProject] Tingyun deployment and validation`。这不是 Task Copilot 的批量正文迁移
命令，而是普通 Logseq 编辑；Task Copilot 只通过既有 explicit sync 和 Anchor 观察核对
正式对象，没有绕过 Service 写正式语义。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-07-miniproject-moved-renamed-current-light-1c18e9b.jpg` | 在新 Page 查看移动并改名后的完整子树 | 根 Block 与 8 个子项保持层级；正文可继续正常编辑 | explicit sync 并 reload |
| `screenshots/day-07-miniproject-after-reload-now-current-light-1c18e9b.jpg` | reload 后检查事务连续性 | 新标题出现在“接下来值得处理”第一项；当前仍可行动 | 打开正文 |
| `screenshots/day-07-miniproject-anchor-open-current-light-1c18e9b.jpg` | 从 Now 返回移动后的业务现场 | 精确进入新 Page 的同一根 Block；URL anchor 仍是原 UUID | 检查系统健康 |
| `screenshots/day-07-miniproject-move-health-current-light-1c18e9b.jpg` | 核对移动后是否产生连接或恢复风险 | 未发现未完成修改或正文连接冲突；无需操作 | 继续 duplicate/missing 变体 |

只读 Service 前后核对：

- Object version `3→5`（移动和改名各经一次既有 explicit sync）；
- external identity/Block UUID `6a688951-0545-4c44-b350-df53c204ae21` 不变；
- 正文标题已更新，Primary Anchor 保持 `active`；
- Proposal、Commit、Recovery、正式 Condition/Focus/Lifecycle 变化均为 `0`；
- 真实 plugin reload 后定位正确；没有错误提供 Rebind。

该链关闭“同一 UUID moved + renamed 后仍可重入”的代表性 Anchor 子 Gate。复制出的相似
Block、真正 missing/conflict、候选解释、Rebind 成功与纠错指引仍开放，不能把本次稳定
移动写成 P2-G Rebind 完成。Computer Use 无法提交中文输入法候选，故本次用 ASCII 标题；
这不替代 P0-J 原生中文 IME Gate。

## 轻量指标（截至 Day 7 moved/renamed 链）

| 指标 | 结果 |
|---|---:|
| 自然输入 | 20+ 条与 Day 4 两组自然子树 |
| 正式对象净变化 | MiniProject +1；Graylog Project 创建后已 Undo，净 0 |
| 真实 Provider | 32 次累计 |
| Validator rejection / retry | 0 / 0 |
| 模型无依据建议 | 2 类（量化门槛、周会/看板） |
| Attention 前台展示 | 0 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 active Skill / Runtime / Recovery | 0 / 0 / 0；既有 Skill 1.5.0→1.6.0，旧版退休 |
| Day 6 Partial 净变化 | -1（Waiting→行动原地恢复链） |
| Day 7 Partial 净变化 | -1（同 UUID moved/renamed→reload→重入代表链） |

## Day 8：待我确认、disposition 与 cooldown

用户在真实测试 Page `Pilot Day 8 Review Backlog` 保留三条自然候选：听云性能对比、
RHCSA 重启验证清单和 Zabbix 重复告警核对。候选使用既有显式标识和当前页有界扫描，
不是全 Graph 自动发现，也不是 Attention Signal。测试依次执行：

1. 小项目候选选择“7 天后再看”；
2. 任务候选选择“保持普通内容”；
3. 成果候选选择“以后不再提示”；
4. 真实 reload；
5. 给“不再提示”的成果来源增加普通编辑，再次检查当前页；
6. 打开系统状态核对正式安全。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-08-review-material-current-light-793cc46.jpg` | 在真实 Page 准备少量混合候选 | 三条材料保持自然可读，可由批次定位 | 主动检查当前页 | CURRENT_AT_793CC46 |
| `screenshots/day-08-candidate-preview-identity-leak-defect-light-793cc46.jpg` | 首次预览候选 | 旧界面泄漏 `MINI_PROJECT` 和 UUID | 由 `f5ce698` 替代 | HISTORICAL_DEFECT |
| `screenshots/day-08-candidate-preview-current-light-f5ce698.jpg` | 复验预览压缩 | 显示“小项目”与自然标题，不显示 UUID | 加入待整理 | CURRENT_AT_F5CE698 |
| `screenshots/day-08-candidate-card-pipeline-language-defect-light-f5ce698.jpg` | 查看候选卡 | 旧卡仍泄漏 Candidate/Proposal 管线词 | 由 `6135820` 替代 | HISTORICAL_DEFECT |
| `screenshots/day-08-candidate-card-current-light-6135820.jpg` | 复验候选首屏 | 一句来源结论、一个主动作、一个暂缓动作；更多处置折叠 | 分别处置三项 | CURRENT_AT_6135820 |
| `screenshots/day-08-candidate-deferred-current-light-6135820.jpg` | 暂缓一项 | 队列立即归零，明确 7 天后复查 | reload | CURRENT_AT_6135820 |
| `screenshots/day-08-candidate-deferred-reload-current-light-6135820.jpg` | reload 后核对暂缓 | 到期前保持安静 | 处理其余候选 | CURRENT_AT_6135820 |
| `screenshots/day-08-review-history-folded-current-light-6135820.jpg` | 查看审阅积压 | 当前 Proposal 为 0；21 条历史默认折叠 | 返回待整理 | CURRENT_AT_6135820 |
| `screenshots/day-08-candidates-disposed-current-light-6135820.jpg` | 分别保留普通内容与不再提示 | 当前队列为 0；两种处置均有用户层反馈 | 修改来源并重算 | CURRENT_AT_6135820 |
| `screenshots/day-08-disposition-rescan-current-light-6135820.jpg` | 修改被抑制来源后重算 | Service 实际保持 0，但旧 Preview 错称 3 项已加入 | 由 `318baab` 修复 | HISTORICAL_DEFECT |
| `screenshots/day-08-disposition-rescan-current-light-318baab.jpg` | 精确构建再次重算 | 直接显示“没有新增需要整理的内容”；无误导提交按钮 | 检查系统状态 | CURRENT |
| `screenshots/day-08-candidate-disposition-health-current-light-318baab.jpg` | 核对正式安全 | 无未完成修改或正文连接冲突；正式链均可用 | 进入 Day 9 | CURRENT |

观察：

- 实际候选 `3`，处置为 `LATER / DISMISSED / NO_MORE_LIKE_THIS = 1 / 1 / 1`；
  处置后、reload 后和来源普通编辑后的当前队列均为 `0`。
- 当前 Proposal `0`；历史 `21` 条默认折叠，没有淹没当前问题。Day 8 正式对象、
  Proposal、SemanticCommit、Recovery 和正文自动写入均为 `0`。
- `f5ce698`、`6135820`、`318baab` 没有新增状态机或 Runtime：分别只压缩候选类型/身份、
  翻译既有 reason/suggestion、让 Preview 复用同一 Candidate disposition。
- `NO_MORE_LIKE_THIS` 跨普通来源编辑保持；`LATER` 和 `DISMISSED` 在同一正文版本保持，
  真正内容变化可按既有规则重开，避免把真实变化永久吞掉。
- 本日没有 Provider 调用，Validator rejection/retry/abstention 均为 `0/0/0`，没有新增
  Skill/Prompt/Validator 版本。
- helpful/noise：三种处置均帮助用户在一个入口清空当前队列；真实暴露的前台噪声为
  identity/type、按钮墙、管线术语和错误重算结论，均已在现有内核内修复。Attention
  前台展示仍为 `0`，不能把主动 Candidate 处置数据冒充 Attention 噪声门。

## 轻量指标（截至 Day 8）

| 指标 | 结果 |
|---|---:|
| 真实 Provider | 32 次累计；Day 8 为 0 |
| Validator rejection / retry / abstention | 0 / 0 / 0 |
| Candidate disposition | LATER 1 / DISMISSED 1 / NO_MORE 1 |
| 当前 Candidate / Proposal | 0 / 0 |
| Attention 前台展示 | 0 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |
| Day 8 Partial 净变化 | -2（候选前台压缩；disposition/cooldown 代表 Gate） |

## Day 9：Project Closure、reload 与专用 Undo

直接使用已有正式 Project `P0 Page Route Gate 20260723`，它的当前工作明确要求完成
Closure 的真实 Provider、HIGH Review、正式应用、reload 和撤销。用户补充了已完成结果、
逐 Objective disposition、遗留事项、关键 Decision 与未来重入摘要，再调用真实 DeepSeek。

Provider 一次返回通过 Validator 的 HIGH 方案，没有把“暂未完成正式性能对比”改写成性能
已达标，也没有制造正式事实。审阅方案阶段 Project 与正文均未变化；确认应用后 Project
进入完成态，reload 保持。专用 Undo 随后恢复 `OPEN`、移除本次 Closure，并恢复原当前
接口；再次 reload 后系统状态显示正式能力和当前 Graph 已连接，没有未完成修改或正文
连接冲突。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-09-closure-review-current-light-aad478c.jpg` | 审阅真实 Provider 关闭方案 | 先显示变化、不变与撤销边界；完整依据折叠 | 审阅方案 | CURRENT_AT_AAD478C |
| `screenshots/day-09-closure-accepted-current-light-f80fda4.jpg` | 区分审阅与正式应用 | 明确“方案已审阅，尚未应用”；退出不修改正式内容 | 确认应用 | CURRENT_AT_F80FDA4 |
| `screenshots/day-09-closure-applied-engineering-terms-historical-f80fda4.jpg` | 记录应用后旧表达缺陷 | 旧结果泄漏 Commit/Lifecycle 等工程词 | 由 `f18cc72` 替代 | HISTORICAL_DEFECT |
| `screenshots/day-09-closure-applied-reload-current-light-f18cc72.jpg` | reload 后核对正式完成 | 项目已结束；结果、遗留和后续说明已保存；页面与正文保持不变 | 查看最近修改或撤销 | CURRENT_AT_F18CC72 |
| `screenshots/day-09-closure-undo-reload-current-light-7fe762d.jpg` | 专用 Undo 后核对项目恢复 | 项目已恢复为进行中；本次完成回顾已移除 | 检查系统健康 | CURRENT |
| `screenshots/day-09-closure-final-health-current-light-7fe762d.jpg` | 核对最终安全状态 | 正式能力与当前 Graph 已连接；无未完成修改或正文连接冲突 | 进入 Day 10 | CURRENT |

本日推动四项共享前台规则，而没有创建 Closure 专用第二套结果模型：

- 已审阅只表示方案通过，明确“尚未应用”；
- 完成/失败/撤销结果卡使用用户结论，Commit、Lifecycle 等进入技术详情；
- “最近修改”首屏只说明正式修改与恢复，SQLite/Local Service/Audit 等折叠；
- Closure Undo 使用“项目恢复为进行中、完成回顾已移除”的业务结论。

P2-E 恢复语义同时固定为最小合同：receipt-backed `PENDING` 可继续同一正式修改；
`RECOVERY_REQUIRED` 只允许恢复安全一致性，恢复后重新发起 Closure。Day 9 未注入真正
`RECOVERY_REQUIRED`，所以它关闭正常连续使用与前台表达代表 Partial，不关闭该高风险
故障 Gate。

## 轻量指标（截至 Day 9）

| 指标 | 结果 |
|---|---:|
| 真实 Provider | 33 次累计；Day 9 为 1 |
| Validator rejection / retry / abstention | 0 / 0 / 0 |
| Day 9 最终 Lifecycle / Closure | OPEN / absent（专用 Undo 后） |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |
| Day 9 Partial 净变化 | -1（Closure 最新连续使用与前台表达代表 Gate） |
| 仍开放 | 真正 RECOVERY_REQUIRED；Day 10；duplicate/missing/Rebind 变体 |

## Day 10：跨日回顾、reload 与 Graph switch

在没有新增模拟对象的前提下，依次查看“现在”“待整理”“待审阅”“项目”“更多”，随后
通过 Logseq 插件管理执行真实 Task Copilot reload，再切到此前用于 Graph switch Gate、
但目录已经被清理的隔离 File Graph，最后切回原测试 Graph并恢复原 Pilot Page。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-10-now-current-light-plugin-7fe762d-docs-f738f59.jpg` | 回顾跨日当前事项 | 1 个当前关注；10 个“接下来值得处理”形成主要噪声 | 检查 Review 是否积压 | CURRENT |
| `screenshots/day-10-review-empty-history-folded-current-light-plugin-7fe762d-docs-f738f59.jpg` | 检查待确认积压 | 待整理 0、待审阅 0；历史 22 条折叠 | 查看项目 | CURRENT |
| `screenshots/day-10-projects-current-light-plugin-7fe762d-docs-f738f59.jpg` | 检查 Project 重入面 | 只有 2 个可继续 Project；各自一个主操作和一个上下文恢复入口 | 查看维护入口 | CURRENT |
| `screenshots/day-10-more-current-light-plugin-7fe762d-docs-f738f59.jpg` | 检查低频能力是否干扰日常 | 最近修改、系统状态、备份恢复和迁移留在二级 | 真实 reload | CURRENT |
| `screenshots/day-10-now-after-plugin-reload-current-light-plugin-7fe762d-docs-f738f59.jpg` | 验证 reload 连续性 | reload 后 Now 数量、顺序和用户 Focus 保持 | Graph switch | CURRENT |
| `screenshots/day-10-graph-switch-restricted-current-light-plugin-7fe762d-docs-f738f59.jpg` | 切到无可用 authority 的隔离 Graph | 正式修改暂停；正文安全；未复用原 Graph 数据 | 切回原 Graph | CURRENT |
| `screenshots/day-10-graph-switch-return-now-current-light-plugin-7fe762d-docs-f738f59.jpg` | 切回并检查恢复 | 正式能力恢复，同一 Now 投影返回 | 恢复原工作现场 | CURRENT |

### 十日产品结论

- 用户不必每天打开“待我确认”：主动候选处置后队列保持空，历史不会淹没当前问题。
- “项目”与 Context Recovery 是高价值入口；对刚创建 Project，AI 增量有限，但对离开数日
  的 Project 能把当前推进压缩成一个入口。真实 Provider 没有获得写入权。
- 用户确实需要一个日常 Now，但当前 `1 Focus + 10 Next` 仍偏长；测试 Gate 对象长期
  混入普通 Next，说明“所有可行动项”不是可交付的注意力合同。
- 不能直接用现有 Dynamic Now Shadow 替代：Day 6 已证明它会把刚从 Waiting 恢复、但未
  加入 Focus 的真实事项一起抑制。下一步应在既有投影中加入会话派生的连续性保护和普通
  Next 上限，不新增正式状态或第二 Now Runtime。
- 第一批 Attention 本轮不扩大。Graph mismatch、Pending、Recovery 与 accepted-not-applied
  已有工具栏/系统状态/Review 持续入口；没有必要再复制成卡片。到期 reviewAt 可在获得
  真实样本后有界前台化；Waiting 过久、Project 静默和跨对象观察继续 Shadow。
- Block Marker 继续默认关闭：Now 已经偏长，正文再铺治理标记只会把复杂度泄漏到工作现场。
- P2-D 实际使用集中在 Focus、Condition、当前接口、创建、Closure 和 Rebind 边界；
  Association、Project due、批量拆分合并没有真实日用价值或安全 inverse 证据，维持既定
  外部 Agent/禁用边界。
- P2-E 保持简单语义：PENDING 续跑同一修改；RECOVERY_REQUIRED 只恢复一致性，恢复后
  重新发起业务操作。Day 10 没有把 Graph mismatch 冒充 Commit Recovery。

## 轻量指标（十日代表性 Pilot）

| 指标 | 结果 |
|---|---:|
| 真实 Provider | 33 次 |
| Validator rejection / retry / abstention | 0 / 0 / 0 |
| Day 10 Now | Focus 1 / Next 10 |
| Day 10 Candidate / current Proposal / history | 0 / 0 / 22 folded |
| Day 10 Project cards | 2 |
| Attention 前台展示 | 0；不据此开放新类型 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |
| Day 10 Partial 净变化 | -1（十日连续使用代表 Pilot） |
| 开放变体 | duplicate/missing/Rebind；真正 RECOVERY_REQUIRED；P0 中文 IME |
