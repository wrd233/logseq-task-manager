# 交互优化实施进度

> 更新时间：2026-07-30
> 当前结论：`IN_PROGRESS` — `base_v2_status=IMPLEMENTATION_COMPLETE` 只表示底层 V2 完成；
> `ux_productization_goal=IN_PROGRESS`、`overall_goal=IN_PROGRESS`。P0-A Focus、
> P0-B“暂时做不了”、P0-C 低风险“接受并应用”、
> P0-D Page 现场路由、P0-E 四项主导航、P0-F 工具栏介入摘要、P0-G 最近修改和 P0-H
> descriptor 私有 handshake 已完成自动与适用 Desktop 验收；P0-H 独立 Launcher、
> LaunchAgent、owned shutdown 与 crash/orphan recovery 已完成自动和真实进程 Gate，reload
> 与真实 Logseq quit 已补 Desktop 证据；隐藏 iframe reload 也已通过 non-blocking bootstrap
> 与宿主 ready 事件自动恢复；`ca50304` 又关闭 Graph switch 旧 authority 隐藏、受限保持与
> 切回原 Graph Gate，P0-H 已为 DONE；P0-J 中文命令已补齐 slash/palette/custom binding
> 代表性 Desktop；P0-K session origin route 与 P0-A 普通 Block“处理这条内容”自动 Gate
> 已完成，main Page 返回、来源移动/删除和 Query/reference/right-sidebar 有界结论已有真实
> Desktop；`73dc1e2` 又关闭正式 Block 的失败、成功、Undo 与 reload 返回链，P0-K 已为
> DONE_DESKTOP_REPRESENTATIVE；`bc79ffd` 已关闭 P0-J 结束运行后的正式动作边界，原生
> 中文 IME 又由 `a65da34` 通过原生拼音组合、候选、光标插入、保存与 reload 关闭，
> P0-J 已为 DONE_DESKTOP_REPRESENTATIVE。连续使用 Pilot `PILOT-2026W31-A` 已完成 Day 1—2、Day 3 Waiting
> 代表子链、Day 4 MiniProject/Project create→reload→Undo 与 Day 5
> Project→Context Recovery→reload→Undo 代表链；`19de8de0f47c` 已用第三组真实 Provider
> 复验 current-interface 通用合同与最终 UI；`1c18e9b0ff63` 又关闭 Day 6
> Waiting→Actionable→返回现场→Now 重排→reload 代表链；同一精确 Plugin 构建又关闭
> Day 7 MiniProject moved/renamed→explicit sync→reload→Now→原 UUID 返回代表链；
> `318baab` 又关闭 Day 8 候选前台压缩与 disposition/cooldown 代表 Gate；
> `7fe762d` 又关闭 Day 9 Closure 正常链、reload、专用 Undo 与共享前台表达代表 Gate；
> 同一精确 Plugin 构建完成 Day 10 四页回顾、reload 与 Graph switch，十日代表 Pilot
> 已关闭。`7e72075` 又以最新 Now、待审阅空态、更多、系统健康页和既有窄栏/宿主/失败链
> 完成 P0 分层代表视觉总 Gate，P0 收口为 `DONE_DESKTOP_REPRESENTATIVE`。完整
> Day 7 duplicate/missing、P1
> 前台和整体 Goal 仍未完成。

## 总体状态

| 阶段 | 状态 | 证据 |
|---|---|---|
| 设计文档完整阅读 | DONE | README、00–13 全部读取 |
| 仓库权威状态/ADR 阅读 | DONE | current-status、traceability、open decisions、Pilot、MVP_STATUS、全部 ADR |
| 当前真实基线 | DONE | branch/commit/worktree/Node/package/paths/process/UI/API |
| 根级自动检查 | DONE | Node 20.20.2；`./scripts/check.sh` PASS |
| 设计到代码映射 | DONE | `01_DESIGN_TO_CODE_MAP.md` |
| P0/P1/P2 路线图 | DONE | `02`–`05` |
| 测试/风险/缺口计划 | DONE | `06`–`08` |
| P0 代码实现 | DONE_DESKTOP_REPRESENTATIVE | P0-A～K 的自动与代表 Desktop Gate 完成；P0-H reload/quit/no-arg reinstall authority/Graph switch，P0-J palette/Slash/custom binding/原生中文 IME，P0-K Block/Page/来源移动删除/Query-reference-sidebar bounded，accepted-not-applied/PENDING/RECOVERY_REQUIRED/Undo/reload/restart 均有真实证据。`7e72075` 以最新 Now、待审阅空态、更多和系统健康页合并既有 733px、主题与宿主证据，关闭最终分层代表视觉总 Gate；File Graph Page Head/identity/真实 Light 保持 bounded host limitation，不扩成笛卡尔积 |
| P1 | IN_PROGRESS_P1G_DONE_ATTENTION_BOUNDED_PILOT_OTHER_P1_PARTIAL | P1-A/B runtime shadow；P1-C 正式 Now 已完成三段纯派生与代表 Desktop；`REVIEW_DUE/DUE` 在同一卡片完成有界显示、session disposition、reload/recompute、取消不误记 acted 和事实解除自动失效。Dynamic Shadow 不替换 authority；session-only 为首发合同，不建立跨会话提醒权威；自然 helpful/noise 继续 Pilot 而不阻断首发。P1-E 为 `DONE_BOUNDED_HOST_REJECTION`，Block Marker OFF；P1-F File Graph Page Head bounded；P1-G 真实 Provider/error/rejection/stale/feedback/reload/Dark/Light/窄栏代表链 DONE；建议关注、Waiting 过久、Project 静默和跨对象观察保持 Shadow |
| P2 | IN_PROGRESS_P2_AB_DONE_P2C_ALL_SOURCES_DONE_P2D_DONE_BOUNDED_EXTERNAL_AGENT_REPRESENTATIVE_P2E_DONE_BOUNDED_RECOVERY_CONCLUSION_P2F_SHADOW_NON_BLOCKING_P2G_REBIND_GUIDANCE_MIGRATION_RESTORE_HIGH_RISK_DESKTOP_DONE | P2-A+B DONE；P2-C 主链有 Desktop；P2-D A/B/C/D 发布边界与代码一致，`8d24569` 又以多 Block 移动完成一条共享 external Agent Context→Review→Commit→reload→Undo→reload 代表链，真实 Undo 缺陷经同一 Recovery Kernel 安全补偿并修复；P2-E 有界恢复合同 DONE；P2-F 明确为 Shadow、默认关闭且不阻断首发；P2-G 高风险代表链有 Desktop。File Graph 自身 Light host Gate 为 bounded limitation |
| 最终验收 | IN_PROGRESS_RELEASE_FREEZE | `10_ACCEPTANCE_REPORT.md`、`12_RELEASE_FREEZE_CHECKLIST.md` |

### 2026-07-30 P0 最终代表视觉总 Gate

- 在 HEAD `7e72075`、Logseq 0.10.15 File Graph、host Light / Plugin Dark、1000×720
  重新操作 Now、待我确认、更多和系统状态；最新截图与当前代码一致；
- Now 一对象一张卡、一个主动作；待审阅当前为 0，29 条历史默认折叠；维护能力只在二级
  “更多”；健康页只回答影响、仍可用、数据安全和是否需要操作，技术诊断折叠；
- 汇总 Gate 复用既有 733px Now、723px Dark、Block/Page、来源移动/删除、Query/reference/
  sidebar bounded、reload/quit/Graph switch 和三类未完成修改证据，不制作完全笛卡尔积；
- File Graph Page Head/identity/真实 Light 保持明确宿主限制；未来宿主能力变化时重开对应项，
  当前不使用 DOM hack、不猜目标、不把 Plugin Dark 冒充 host Light；
- P0 `IN_PROGRESS_DESKTOP_GATES→DONE_DESKTOP_REPRESENTATIVE`，长期 Partial 净变化 `-1`；
  新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator、Provider 调用、写入权威和
  长期 Partial 均为 `0`。完整 Goal 仍为 `IN_PROGRESS`；证据见
  `logs/p0-final-representative-visual-gate-desktop-live-20260730.md`。

### 2026-07-30 P0 未完成修改前台闭环

- `3883848` 统一 accepted-not-applied、receipt-backed PENDING 和 RECOVERY_REQUIRED 的
  用户语义；工具栏对同一 Proposal/Commit ledger 只计一个问题。自动先红后绿，Plugin
  `371/371`、typecheck/build PASS。
- 真实 Logseq 0.10.15 File Graph、host Light / Plugin Dark、1000×720 完成：审阅方案但
  不应用→真实 Plugin Manager reload→确认应用→inverse Undo→再次 reload。正文
  `TODO→[任务]→TODO`，Object `13→14→13`，最终系统状态无未完成修改或正文连接冲突。
- 第一次外部测试 Proposal 因错误猜测宿主 `version: 1` 被预检判 stale，零正式写入；
  按真实 UUID/hash 重验后才成功。该真实失败暴露 stale 占据当前“待审阅”的积压问题，
  `78528f7` 将终态 stale 归入默认折叠历史；当前待审阅归零。
- accepted-not-applied `PARTIAL→DONE_DESKTOP_REPRESENTATIVE`；PENDING/RECOVERY_REQUIRED
  新语言在该时点为 `AUTOMATED_ONLY`。长期 Partial 净变化
  `-1`；新增正式状态、Runtime、Recovery、Skill/Prompt/Validator、Provider 调用与写入
  权威均为 `0`。证据见
  `logs/p0-unfinished-modification-frontstage-desktop-live-20260730.md`。
- 同一 `78528f7` 构建随后在测试 Graph 以精确 Proposal-bound fault 完成
  PENDING 真实 Desktop：中断后一个“继续原修改”、Plugin Manager reload、
  same-Commit receipt replay、Project 版本不重复递增、inverse Undo、再 reload 与
  最终健康均 PASS。测试触发器为 `0`；原 Commit `UNDONE`，inverse
  `COMPLETED`，Project `OPEN v29`。PENDING 子 Gate 升为
  `DONE_DESKTOP_REPRESENTATIVE`；RECOVERY_REQUIRED 仍为 `AUTOMATED_ONLY`。证据见
  `logs/p0-pending-frontstage-desktop-live-20260730.md`。
- `dbc5243` 继续修复真实链暴露的顶栏泄漏：receipt-backed PENDING 不再显示
  “Local Service 请求失败”，只显示未完成、已安全保存和继续原修改。回归为
  `372/372`；新一轮真实 Desktop 从 `OPEN v29` 中断至 `COMPLETED v30`，
  same-Commit resume 不重复递增，Undo 后为 `OPEN v31`，reload 最终健康。
  该修复没有新增状态、Runtime、Recovery 分支、Skill/Prompt/Validator 或写入权威。
- `872d2d4` / `684491f` 随后完成真实 RECOVERY_REQUIRED：两个 MOVE step 中第一步通过
  Logseq Desktop 应用和 Graph bridge 验证，第二步断开后进入统一补偿；Plugin Manager reload
  后从同一记录恢复，补偿把两个原 UUID、内容和顺序恢复，对象版本不变。完整 quit/reopen 后
  Service READY、待审阅为 0。终态 FAILED 只在折叠历史/最近修改保留，摘要不再重复完整
  Markdown。该子 Gate `AUTOMATED_ONLY→DONE_DESKTOP_REPRESENTATIVE`，长期 Partial 净
  `-1`；新增状态/Runtime/Recovery/Skill 0。证据见
  `logs/p0-recovery-required-frontstage-desktop-live-20260730.md`。

### 2026-07-30 P1 Attention 质量边界与 session-only 决策

- `c9919f2` 修复真实 Desktop 暴露的计数错误：只打开 Condition 对话框不再计
  `acted`；取消后提醒保持，只有正式保存成功或正文导航成功才记录完成的主操作。
- 4 个独立 reload session 覆盖 `取消 / later / notRelevant / acted`：取消为
  `shown=1, acted=0, unresolved=1`；两个处置只在本 session 收起；完成主操作后测试
  Task 正式变为 `ACTIONABLE v9`，提醒随事实解除并在再次 reload 后保持消失。
- `acted` 定义为 engagement，不等于 helpful；现有少量受控样本不提供生产 helpful
  rate，但已足以确认无需跨会话 disposition store。时间 Signal 保持有界 Pilot；建议关注、
  Waiting 过久、Project 静默、跨对象观察继续 Shadow，Block Marker 继续关闭。
- 自动证据：Plugin `378/378`、typecheck/build、根级检查、stable rules `145`、recovery
  rehearsal PASS；最终 Service READY、Doctor PASS、PENDING/RECOVERY `0/0`。
- 新增正式状态、Runtime、Recovery、Skill/Prompt/Validator、持久权威均为 `0`；关闭
  既有 Partial `2`，新增长期 Partial `0`，净变化 `-2`。证据见
  `logs/p1-attention-quality-boundary-desktop-live-20260730.md`。

### 2026-07-30 P1 Attention Now 有界 Pilot

- `3097c39` 没有新增提醒页面，而把首批确定性时间信号装饰到既有“需要回看”正式卡片；
  一对象仍只有一个主问题，工具栏只汇总 `1 项到期复查`。
- 真实 Logseq 0.10.15 File Graph、host Light / Plugin Dark、约 1000×754 中完成：正式
  Condition 制造到期样本→显示试用标记→本次先不提醒→真实 Plugin Manager reload 后
  从同一事实重算→本次不相关→恢复 Actionable→系统健康。
- 两种 disposition 均为 session-only、零正式写入；正式 Waiting 卡和主操作始终保留。
  accepted-not-applied、PENDING、RECOVERY_REQUIRED、Anchor/Graph 风险不在 Now 重复。
- 自动证据：聚焦 `83/83`、Plugin `370/370`、typecheck/build、根级检查 PASS；Provider、
  Validator、Skill/Prompt 变化与调用均为 `0`。
- 该人工样本只证明合同和 Desktop 可用性，不提供真实 helpful/noise 比率。跨会话
  disposition、建议关注、Waiting 过久、Project 静默、跨对象观察和 Block Marker 继续
  开放。新增长期 Partial `0`、关闭既有子 Partial `1`、净变化 `-1`。证据见
  `logs/p1-attention-now-pilot-desktop-live-20260730.md`。

### 2026-07-29 P0-J 原生中文 IME

- 在 Logseq 0.10.15 File Graph、host Light、754×720 中，使用 Computer Use
  `press_key` 和 macOS 简体拼音逐键输入；没有用会丢失中文的 `type_text`，也没有注入
  Unicode。
- 真实观察到 `zhong'wen` / `yan'zheng` / `guang'biao` 组合态，候选提交后得到
  `中文输入光标验证`；`guang'biao` 是把光标移入已提交中文中间后插入，覆盖光标合同。
- 首次临时 UUID Page reload 显示 `Page no longer exists!!`，未计为通过；通过 Logseq
  搜索 `Create` 建立正式 Page 后再次 reload，Page 与中文 Block 均读回。测试后恢复 ABC。
- P0-J `PARTIAL→DONE_DESKTOP_REPRESENTATIVE`，长期 Partial 净变化 `-1`。新增正式
  状态、Runtime、Recovery 分支、Skill/Prompt/Validator、Attention 类型、Provider 调用
  与写入权威均为 `0`。
- P0-J 关闭时 P0 仍由 RECOVERY_REQUIRED、代表视觉总 Gate 和 Final Release 保持进行中；
  RECOVERY_REQUIRED 后续已由 `872d2d4` / `684491f` 关闭，代表视觉总 Gate 又由
  `7e72075` 关闭；当前只剩 P1/P2 与 Final Release。证据见
  `logs/p0-j-native-chinese-ime-desktop-live-20260729.md`。

### 2026-07-28 连续使用 Pilot Day 6 Waiting 恢复

- 真实起点是 Day 3 的正式 Waiting Task，而不是新造的干净样本。首次 Desktop 操作发现
  原 Block 的“暂时做不了”只有等待、被卡住和暂停，回复到达后没有自然恢复行动的入口。
- `1c18e9b0ff63` 让既有 Condition 控制器接受既有 `ACTIONABLE`，入口仅在当前
  Condition 非 Actionable 时显示；确认页说明只更新能否继续，不完成事项、不移动正文、
  不改变当前关注。正式命令仍经过 Local Service、对象版本重验和会话 Undo。
- Desktop：Logseq 0.10.15 File Graph，host Light，约 1000×720。真实链为原 Block
  →恢复入口→确认→正式更新→返回同一 Block→打开 Now。该 Task 立即成为“接下来值得处理”
  第一项；真实 plugin reload 后保持，session 成功消息清除；系统状态无未完成修改或正文
  连接冲突。
- 自动：Plugin `353/353`、typecheck/build PASS；新增的 controller/UI 回归覆盖
  ACTIONABLE 构造、Waiting→Actionable 和 Actionable 时隐藏重复恢复入口。
- Provider `0`；新增 Skill/Prompt/Validator `0`。新增正式状态、Runtime、Recovery 分支、
  写入权威和长期 Partial 均为 `0`；关闭代表性 Partial `1`，净变化 `-1`。
- P1 结论：现有 Now 的状态响应正确，但仍显示较多历史对象。该证据进入既有 Dynamic Now
  “继续处理 / 需要回看 / 保持等待”前台收敛，不据此新增 Attention 类型或默认 Block Marker。
- 正式 Service 同时刻只读对照：Now `Focus 1 / Next 10 / Waiting 0`；Dynamic Shadow
  `Continue 1 / Review 0 / Keep waiting 0 / Suggested 0 / Suppressed 10`，并隐藏刚恢复
  Task。P1-C 继续 `PARTIAL_RUNTIME_SHADOW`，前台 Gate 未通过；没有为了减少卡片静默
  牺牲事务连续性。证据见 `logs/p1-dynamic-now-pilot-comparison-20260728.md`。

### 2026-07-28 P2-D Release 边界

- 结合 Day 1—6 实际使用和现有 inverse/Recovery 证据，明确 16 类 Project intent 是后台
  安全穷举，不是 16 个用户菜单；当前四个前台意图保持不变。
- A 内置日常：Focus、Condition，reviewAt 合并进 Condition。B 内置审阅：
  current summary/focuses 共用 MEDIUM，interface/objectives/deliverables/stages 共用 HIGH，
  Ownership/Closure 保持专用高影响链。
- C 外部 Agent：bulk children、move content、split/merge、external Agent；Agent 只准备
  Context/Proposal，正式写入仍归 Task Copilot。D 暂不开放：Association 缺 inverse，
  Project due 缺稳定语义和跨 reload inverse。
- 没有新增 intent、用户入口、正式状态、Runtime、Recovery、Skill/Prompt/Validator；
  没有把待外部 Agent 的能力改成 Out of Scope。P2-D 仍 Partial，Day 7/9 继续验证边界。
- 详细矩阵：`logs/p2-d-release-boundary-pilot-20260728.md`。

`3c83856` 已把上述 A/B/C/D 边界提升为唯一 Application 代码合同，修复先前 router 仍把
Association/Project due 标作 `DIRECT_WITH_UNDO`、把批量/移动/拆分合并都指向内置结构
Review 的漂移。16 类 intent 现在分别为 `BUILT_IN_DIRECT / BUILT_IN_REVIEW /
EXTERNAL_AGENT / NOT_AVAILABLE`；C 类仍保持“Agent 只准备 Context/Proposal，Task Copilot
掌握 Preview/Commit/Undo/Recovery”，D 类明确零正式路由。focused `6/6`、Application
`172/172`、根级检查 PASS；新增正式状态/Runtime/Recovery/Skill/入口均为 `0`。关闭既有
release-boundary drift Partial `1`，但外部 Agent 完整产品链仍 OPEN，P2-D 不提前写成 DONE。

### 2026-07-30 P2-D 外部 Agent 共享链与 Release Freeze

- `8d24569` 使用多 Block 整理作为唯一 C 类代表场景，完整走过有界 Context Package、外部
  Agent Proposal、CLI 零写 validate / Proposal-only submit、精简 Review、正式 Commit、
  reload、Undo 与再次 reload；
- 首次 Undo 的 sibling-position divergence 没有假报成功，而是进入既有 Recovery Kernel
  并补偿回安全正向结构。TDD 通用修复后新 Proposal 成功恢复原 UUID、正文与顺序；
- 自动聚焦、Application/Service/Plugin typecheck/build、根级检查、145 条稳定规则和恢复演练
  PASS；当前无参数重装保留原 database authority；
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator 均为 `0`；P2-D 长期
  Partial `-1`，新增长期 Partial `0`；
- P2-D 收口为 `DONE_BOUNDED_EXTERNAL_AGENT_REPRESENTATIVE`。P2-F 固定 Shadow/non-blocking，
  系统从此进入 Release Freeze；后续只处理 blocker、明确回归和安装/证据漂移。

### 2026-07-28 连续使用 Pilot Day 7 稳定移动

- 在当前测试 Graph 中把 Day 4 真实 MiniProject 子树 Cut/Paste 到新 Page 并改名；这是
  Logseq 工作现场的普通正文编辑，不是绕过 Proposal/Commit 的正式语义写入。
- 既有 explicit sync 将 Object version `3→5`；原 Block UUID/external identity 不变，
  Primary Anchor 保持 `active`。真实 Plugin reload 后新标题出现在 Now 第一项，并可精确
  打开到新 Page 的同一 Block。
- 系统状态为“未发现未完成修改或正文连接冲突”；Rebind 正确地没有出现。该证据关闭同一
  UUID moved/renamed 代表子 Gate，不覆盖复制相似项、真正 missing/conflict 或 Rebind 指引。
- Provider/Skill/Prompt/Validator 调用或变化 `0`；新增正式状态、Runtime、Recovery 分支、
  正式写入和长期 Partial `0`；关闭代表子 Partial `1`，净变化 `-1`。

### 2026-07-28 连续使用 Pilot Day 8 disposition/cooldown

- 真实 Page 中的任务、成果、小项目候选依次使用“7 天后再看 / 保持普通内容 /
  以后不再提示”；队列立即归零，真实 Plugin reload 后保持，当前 Proposal 仍为 0，
  21 条历史默认折叠。
- 真实 Desktop 发现并在同一 Candidate 内核关闭四类噪声：UUID/type 泄漏、五按钮墙、
  Candidate/Proposal 管线词、处置后 Preview 虚报新增数量。最终 `318baab` 重算直接显示
  “没有新增需要整理的内容”，不再提供误导提交按钮。
- 自动：Plugin `354/354`、typecheck/build PASS；根级检查见本轮最终 Gate。Desktop：
  Logseq 0.10.15 File Graph、host Light、约 1000×720，精确构建 reload 与系统健康通过。
- Provider `0`；Validator rejection/retry/abstention `0/0/0`；新增 Skill/Prompt/
  Validator、正式状态、Runtime、Recovery 分支、Proposal/Commit/正式对象写入均为 `0`。
- 关闭代表性 Partial `2`：候选普通前台压缩、disposition/cooldown reload/recompute；
  新增长期 Partial `0`，净变化 `-2`。Attention 仍未前台展示，不能用主动 Candidate 数据
  代替 Signal helpful/noise Gate。

### 2026-07-28 连续使用 Pilot Day 9 Closure

- 使用已有正式 Project 完成用户判断→真实 DeepSeek→HIGH Review→审阅方案→确认应用→
  reload→专用 inverse Undo→再次 reload→系统健康；不是新造的 isolated demo。
- Day 9 Provider `1` 次、累计 `33`；Validator rejection/retry/abstention `0/0/0`。模型
  保留“正式性能对比报告未完成”的真实未知，没有杜撰性能结论，也没有新增 Skill/Prompt/
  Validator 版本。
- `f80fda4` 明确“方案已审阅，尚未应用”；`8a6e37a` 把 Commit/Lifecycle 从普通结果卡
  移出，并为 Closure 给出业务完成结论；`f18cc72` 把 SQLite/Local Service/Audit 等从
  最近修改首屏折叠；`7fe762d` 把专用 Undo 结论翻译为项目恢复进行中、完成回顾已移除。
- 自动证据：Application `170/170`、Plugin `354/354`、UI targeted `69/69` 与 recent
  changes targeted `10/10` 已通过，typecheck/build PASS；本轮文档提交前继续运行根级检查。
- Desktop 证据：Logseq 0.10.15 File Graph、host Light、约 1000×720；各步骤按精确
  `aad478c` / `f80fda4` / `f18cc72` / `7fe762d` 登记。应用后旧工程词图为
  `HISTORICAL_DEFECT`，不代表当前界面。
- Partial 净变化 `-1`：关闭最新连续使用 Closure 正常链与前台表达代表 Gate；真正
  `RECOVERY_REQUIRED` 未注入，继续阻断 P2-E DONE。安全语义固定为 PENDING 续跑原修改、
  RECOVERY_REQUIRED 只恢复一致性、恢复后重新发起业务操作。
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和新长期
  Partial：均为 `0`。

### 2026-07-28 连续使用 Pilot Day 10 回顾与 Graph switch

- 完成 Now→待整理→待审阅→项目→更多→真实 Plugin reload→隔离 Graph 安全受限→切回
  原 Graph→恢复原 Pilot Page 的真实 Desktop 链。
- Review 没有积压：Candidate/current Proposal `0/0`，22 条历史默认折叠；Project 区只有
  2 个可继续 Project；恢复、迁移和系统状态保持二级。
- 跨日噪声集中在 Now：`Focus 1 / Next 10`。现有 Dynamic Now Shadow 虽更少，但会抑制
  刚从 Waiting 恢复且未 Focus 的真实 Task，所以不能直接前台替换。
- Attention 前台 `0`；本轮不开放新类型。Graph mismatch、Pending、Recovery、
  accepted-not-applied 继续由已有持续入口承接；reviewAt 等真实到期样本后再评估。
  Waiting 过久、Project 静默和跨对象观察继续 Shadow；Block Marker 保持默认关闭。
- P2-D 日用边界得到连续使用支持：Focus/Condition/current interface/create/Closure/
  Rebind 是实际使用面；Association、Project due 和批量拆分合并继续使用既定禁用或
  external Agent 边界，不扩成内置工作台。
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和长期
  Partial `0`。十日代表性 Pilot Partial `OPEN→DONE`，净变化 `-1`；开放变体仍留在原
  P1/P2/P0 Partial，不拆成新体系。

### 2026-07-28 P1 “现在”首屏有界收敛

- `df6469f` 直接修复 Day 10 的 `Focus 1 / Next 10` 前台过载：不采用会遗漏刚恢复事项的
  Dynamic Now Shadow，不改变 Service 排序，也不删除或重新分类正式对象。
- 当前关注仍全部展示；“接下来值得处理”只在首屏展示原排序前 4 项，其余 6 项进入一个
  原生折叠。用户展开后仍可读取和操作全部 10 项；筛选与分组仍是纯视图行为。
- 自动证据：Plugin `356/356`、0 skipped，针对性 Now 用例、typecheck 和 build PASS。
- Desktop：Logseq 0.10.15、File Graph、host Light / Plugin Dark、约 1000×720；精确构建完成真实插件
  reload→首屏折叠→展开全部→再次真实 reload→恢复折叠。Focus 和前 4 项保持，零正式
  写入。
- 新增正式状态、Runtime、Attention 类型、Recovery 分支、Skill/Prompt/Validator、
  写入权威和长期 Partial均为 `0`；关闭 Now 前台过载子 Partial `1`，净变化 `-1`。
  P1-C 仍为 `PARTIAL_RUNTIME_SHADOW`，Attention 和 Block Marker 仍未开放。

### 2026-07-29 P1 “现在”三段前台与 Focus 权威

- `3d63d5aee0a7` 没有启用会遗漏 Day 6 刚恢复事项的 Dynamic Now Shadow，而是在既有
  Service `/now-work` 上做单一纯派生：继续处理、需要回看、保持等待。
- Focus/next/waitingReview 按 object identity 去重；focused Waiting 不再重复占两个区域。
  Focus 明确显示“来自当前关注”且永不被普通 4 项上限折叠，普通 next 保留原顺序和折叠。
- 自动证据：纯投影 `5/5`、Plugin `366/366`、0 skipped、typecheck/build 与根级
  `./scripts/check.sh` PASS。没有新增正式状态、Runtime、Recovery、Attention 类型、
  Skill/Prompt/Validator、Provider 调用或写入权威。
- Desktop：Logseq 0.10.15 File Graph，精确构建 plugin reload；Plugin Dark
  1001×720 与 733×720 均保持一个主动作、折叠依据/低频操作和 Focus 来源。系统状态为
  “可以正常使用”，无需操作。
- 追加 Desktop 代表链通过同一正式 Task 执行 Focus→Blocked→恢复→Paused（未来
  reviewAt）→恢复→移出 Focus；“需要回看”只显示 Focus Blocked，“保持等待”只显示
  Focus Paused，普通非 Focus Blocked 不被抬到前台。所有改变都走现有正式 Condition/Focus
  命令，完成后恢复基线并再次确认系统健康。
- 累计关闭来源分区重复、Focus 容量风险、“需要回看”与“保持等待”Desktop 子
  Partial `3`，新增长期 Partial `0`。P1-C 仍因
  Attention helpful/noise、disposition/cooldown 前台 Pilot、建议关注为空和 Block Marker
  决策保持 Partial。

### 2026-07-28 连续使用 Pilot Day 1—3 与 P0-J 正式边界

- Pilot 基线：`PILOT-2026W31-A` 直接使用 File Graph `logseq`，建立产品恢复快照并验证
  Pending/Recovery/Anchor conflict `0/0/0`；测试入口为
  `模拟使用/2026-W31/PILOT-2026W31-A`，正文用 `#TaskCopilotPilot` 可追踪。
- Day 1：输入 7 条自然捕获；普通笔记未被自动正式化，只有显式 TODO 由用户发起真实
  DeepSeek → Review → Commit。reload 后 Task 进入 Now，普通研究笔记没有制造列表洪水。
- Day 2：输入 7 条补充与事实纠正；精确 Undo 错误 Task、修改恢复来源、再次真实
  DeepSeek 和正式 Commit。旧错误事项消失，纠正后的端口权限 Task 存在。
- Day 3：输入 6 条 Waiting/Paused/DONE/Focus 混合材料；先完成一个正式 Task 的
  WAITING→reviewAt→reload 代表子链。该 Task 正确退出“继续处理”，但前台尚无安静的
  “保持等待”确认；其余 Day 3 行为仍 OPEN，不冒充整日完成。
- Provider：真实调用 `2`，Validator rejection `0`，retry `0`，abstention `0`；没有新增
  Skill/Prompt/Validator。Day 1 的错误理解由原文业务歧义造成，Day 2 证据纠正后模型正常，
  不据单样本补丁化 Skill。
- UX 发现：单 Task 应用存在三次近义确认；成功卡的 Undo 资格文字与可点击按钮矛盾；
  “最近修改与恢复”泄漏 SQLite/Local Service 且历史墙过重；事实纠正需
  Undo→改来源→再次完整 Review；WAITING 降噪正确但缺少低打扰可见性；File Graph reload
  约 5 秒索引空白后恢复。
- P0-J：`bc79ffd` 的 350/350、typecheck/build/dist PASS；真实 Desktop 证明显式结束后
  路由不会重启，Focus/Condition/Undo fail closed，Slash 只写本地显式正文，显式重启后
  正式能力恢复且受限期间零写入。该子 Gate `OPEN→DONE_DESKTOP_REPRESENTATIVE`；原生
  中文 IME 在该阶段仍 OPEN，后由 `a65da34` 关闭。
- 复杂度：新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator 均为 `0`；
  P0-J 子 Gate 净关闭 `1`，Pilot 发现按 release blocker / UX debt / bounded host issue
  分类，不创建新的平行状态机。
- 当前证据见 `current-ui/pilot-2026w31/`、
  `logs/p0-j-ended-formal-boundary-desktop-live-20260728.md`。

### 2026-07-28 连续使用 Pilot Day 4

- 自然材料直接存在测试 Graph；听云子树经 5 次真实 DeepSeek 形成 MiniProject，并在当前
  结构已满足时诚实返回 no-change Preview，零 Proposal。
- 长 Page 来源先真实触发 Provider 前 `PROJECT_CREATION_SOURCE_TOO_LARGE`。`42e6a91`
  保持有界读取，改为可行动的用户解释并隐藏无效 Retry；Plugin 351/351、typecheck/build
  通过。
- Blank Graylog Project 经 6 轮自适应 Grill + 1 次 Preview、HIGH Review、正式 Create、
  reload、Project Page 重入和 Undo。专用 Page 与正式 Project 均撤销，来源 Page 和
  MiniProject 保留；精确构建 reload 后 0/0/0、explicit sync clean。
- 真实 Provider 累计 `14`，Validator rejection/retry `0/0`。模型曾建议无证据的量化门槛
  及周会/看板，用户纠正后未成为正式事实；本轮不增加 Skill 版本。
- 过程 build 的源码等价于 `42e6a91`，但产物内嵌 commit 为 `fbd14eb`，故过程截图降为
  `HISTORICAL_SOURCE_EQUIVALENT`；只有重新构建后内嵌 `42e6a91309ba` 的健康图是 CURRENT。
- 新发现：创建仍有四个近义确认、结果/历史墙过长、Undo 资格与按钮矛盾、Undo 成功消息
  工程词泄漏；首次普通 reload 还出现一次有界子树读取失败的 session 核对风险。以上进入
  现有发布阻断，不新增 Runtime、正式状态或恢复分支。
- Partial 净变化 `-1`：来源预算错误表达关闭；Day 5 Context Recovery、Dynamic Now、
  Attention、P2-D 边界和其余 Final Release Gate 保持 OPEN。

### 2026-07-28 Day 4 Undo 前台结论收敛

- `7a0b444` 在不改变 Undo 资格算法、Application 保守叙述或正式 inverse 的前提下，让
  Plugin 已提供真实撤销动作时显示一致结论：可以发起撤销，执行时重验当前内容。
- Project 创建 Undo 成功结果不再泄漏 Project/Anchor/Audit/Commit，按“复用来源页保留”
  或“本次新建空白页移除”表达；该结果文案已自动验证，真实 Project Undo 重跑仍待 Day 5
  后续链，未冒充 Desktop 完成。
- 自动证据：Plugin `352/352`、typecheck/build、根级检查 PASS、0 skipped。Desktop 精确
  `7a0b444821b7` 已复验最近修改卡和系统健康：Pending/Recovery/Conflict `0/0/0`，
  explicit sync clean。
- 关闭撤销资格/按钮矛盾这个 UI Partial；新增长期 Partial、正式状态、Runtime、Recovery
  分支、Skill/Prompt/Validator 与写入权威均为 `0`。

### 2026-07-28 Day 5 Project 当前推进语义失败与通用修复

- 为重建 Graylog Project 运行 5 轮真实 DeepSeek Grill 和 1 次 Preview。模型把用户对
  “Project 重入时希望看到什么”的回答写入 `currentInterface`，Preview 因而把页面信息
  结构误列成“当前先从这里继续”；旧 Validator 接受了该结果。
- 用户在 Preview 阶段取消，没有进入 HIGH Review、Proposal 或正式写入；本次
  Proposal/Commit/Recovery/Undo 均为 `0`，可靠的正式状态没有被错误草稿覆盖。
- 根因不是单条输出措辞，而是 `CURRENT_INTERFACE` 的 machine uncertainty、Prompt 和
  Application draft contract 都允许“界面要求”与“业务当前推进”混用。修复统一为：
  `currentInterface` 必须是一项可继续的真实工作；页面布局、仪表盘、首屏字段或“应显示
  什么”保持 uncertainty 未解决并被 Validator 拒绝。
- `project-creation-modeling@1.6.0` 取代 1.5.0；没有新建 Skill、Agent Runtime、正式状态、
  恢复分支或写入权威。真实失败样本和独立业务动作反例均进入自动测试。
- 自动证据：Application `170/170`、Local Service `169/169`、Plugin `352/352`、
  targeted `26/26`、三包 typecheck 与根级 `./scripts/check.sh` PASS；新构建真实
  Provider/Desktop 复验仍是本子 Gate 的剩余条件。
- Pilot 累计真实 Provider `20`，运行时 Validator rejection `0`、retry `0`、abstention
  `0`；这里的 `0 rejection` 是缺陷证据，不是质量成功。Partial 净变化 `0`：增加的是
  已有 P2-C 质量 Gate 的明确阻断，未增加长期产品范围。
- `f7a5252` 随后用独立的 5 轮 Grill + 1 次 Preview 真实复验 1.6.0：原五类业务事实保留，
  `currentInterface` 变成采集第一条华为 iBMC syslog 的真实动作，没有把真实未知一起
  过滤。运行时 Validator rejection/retry 仍为 `0/0`。该 Preview 又暴露前台固定句式
  “当前先从先确认……继续”，现改为“目标 / 当前推进”两行；Plugin `352/352`、
  typecheck/build PASS。`19de8de` 又用第三组 5 轮 Grill + 1 次 Preview 复验最终渲染，
  并完成 HIGH Review、正式创建、真实插件 reload、Context Recovery、反馈、再次 reload、
  Undo 与健康复核。Context Recovery 没有制造草稿/反馈伪未知，AI 增量准确但对新 Project
  有限；Undo 成功消息无工程词，随后 Pending/Recovery/Conflict `0/0/0`、explicit sync
  clean。Pilot 累计 Provider 更新为 `32`，运行时 rejection/retry/abstention `0/0/0`。
  `project-creation-modeling@1.6.0` 达到 `CANDIDATE/DESKTOP_VERIFIED`，不晋升 Production。
  关闭 current-interface/渲染/Undo 成功消息三个既有子 Partial；新增长期 Partial `0`。
  创建完成卡的 Commit 工程词和长结果墙继续作为既有发布阻断。

### 2026-07-28 P0-K Block Condition 返回现场收口

- `0a9a170` 将正式 Block “暂时做不了”首屏压缩为一个安全结论和“等待别人 / 被问题
  卡住 / 我先暂停”三个用户意图，取消普通路径中的 Condition/Lifecycle/Ownership/Focus/
  Local Service 等工程语言；成功和 Undo 使用“被问题卡住 / 可以行动”用户状态。
- 最新 Query Desktop 首次发现无可靠身份时仍显示 `Block / active Primary Anchor`。
  `73dc1e2` 将空身份、未管理、关联冲突、对象缺失、已结束和正式能力不可用统一翻译为用户
  结果，并用 fail-closed 零写入测试固定该边界。
- 自动：Plugin `347/347`、0 skipped，typecheck/build PASS；产物内嵌
  `73dc1e26f610`。
- Desktop：Logseq 0.10.15 File Graph，host Light / Plugin Dark，999×720 与 727×720。Query 投影安全
  停止；正式测试任务完成入口→空原因失败→正式保存→返回同一 Block→Undo→reload 后
  “当前可以继续推进”；窄栏保持主结论、三个意图和取消可见。六张 CURRENT 截图对应
  exact build `73dc1e2`。
- Provider/Skill：没有调用 Provider；Validator 拒绝率与模型重试不适用；没有新增或修改
  Skill/Prompt。
- 复杂度：新增正式状态、Runtime、恢复分支、Validator、写入权威和新 Partial 均为 `0`；
  关闭 P0-K 最后一个代表性返回现场 Partial，Partial 净下降 `1`。P0-K 升为
  `DONE_DESKTOP_REPRESENTATIVE`；当时 P0-J 中文 IME/受限视觉仍使 P0 保持进行中，
  P0-J 后由 `a65da34` 关闭。

### 2026-07-28 Page / Project Page 现场操作压缩

- `f007cb8` 把普通 Page 与 Project Page 的入口说明改为用户语言：正式事项显示“任务 /
  进行中”，不再显示 `TASK / OPEN / vN / SQLite / Graph / Primary Anchor`；Project Page
  不再显示 `HIGH Proposal` 或“正式对象工作区”。
- 首次最新 Desktop 复验发现既有受控 Project Page 被错误识别为普通 Page。`6462f64`
  复用 Project 创建页既有 owner/object metadata，在 File Graph UUID 漂移时仍要求正式
  Project 存在、类型正确且只有一个 active Primary Anchor；精确 Anchor 与 metadata
  不一致继续 fail closed。
- `869127f` 依据真实截图继续压缩视觉判断：普通 Page 的“整理当前页”和 Project Page 的
  “打开项目工作区”分别成为唯一突出主操作，其余意图降为次级；没有合并或绕过 Review /
  Commit。
- 自动：Plugin `347/347`、0 skipped；根级 `./scripts/check.sh`、145 条稳定规则、build/
  dist integrity、恢复演练 `differences=[]` 全部 PASS。
- Desktop：exact build `869127f`，Logseq 0.10.15 File Graph，Plugin Dark / host Light，
  1001×720；普通 Page 与 Project Page 两张 CURRENT，取证后回到原 P0-K Page。
- Provider/Skill：未调用 Provider；Validator 拒绝率、模型重试不适用；Skill/Prompt 版本
  无变化。
- 状态：关闭 Page Context 用户语言与受控 Project Page 识别的一个代表性 UI Partial；
  新增正式状态、Runtime、恢复分支、Skill/Prompt/Validator、写入权威和新 Partial 均为 0。

### 2026-07-28 Project 创建后落地与返回工作现场

- `b4de474`～`bfabf40` 把创建后和项目列表的 Project 入口统一到 session-only 落地页：
  当前状态、一个推进、预期成果、来源背景和一个主操作进入首屏，完整结构折叠；工程
  metadata 只留在受控 Logseq Page 与技术层。
- “开始当前推进”和 Context Recovery 的返回动作复用同一只读定位器：重验对象版本、
  唯一 active Primary Anchor 与 Page owner/object metadata；普通同名 Page fail closed。
  File Graph runtime UUID 漂移不再让合法受控 Project Page 无法打开。
- 自动：Plugin `345/345`、0 skipped；新增回归证明受控 metadata Page 可用、普通同名 Page
  拒绝；最终根级 `./scripts/check.sh`、145 条稳定规则、恢复演练
  `differences=[]` 全部 PASS。
- Desktop：exact build `bfabf4025f60`，Logseq 0.10.15 File Graph；Dark/Light
  1000×720 与 Light 723×720 CURRENT。点击“开始当前推进”后面板关闭并留在同一 Project
  Page，正式状态没有变化。
- Provider/Skill：本 Slice 没有 Provider 调用；Validator 拒绝率、模型重试与 Skill 版本
  变化不适用。新增正式状态、Runtime、Recovery 分支、Prompt/Validator 和写入权威均为 0。
- 状态：关闭“新 Project Page 价值落地”的一个代表性 UI Partial；阶段级 Partial 新增 0，
  P2-C 仍保持 `ALL_SOURCES_DONE_VISUAL_GATES_OPEN`，最新构建整条 create→Undo 和其他宿主
  组合仍 OPEN。

### 2026-07-28 Project Preview / HIGH Review 交互压缩

- `2adfc35` 把 Page 来源 Project Preview 压缩为四区首屏，完整材料边界和审计依据默认折叠；
  “进入待我确认”明确只建立可审阅方案，正式应用前仍可返回。
- `7bd7811` 把 HIGH Review 的完整 Markdown 方案从首屏移入既有“查看完整依据”，首屏只
  保留两句业务理解；`efb3864` 把变化 / 不变 / 系统理解固定为标准宽度两列影响 + 全宽
  理解，并按真实 Logseq 缩放把约 762px 窄窗稳定切为单列。
- 自动：新增断言先红 2 项，修复后定向 2/2；Plugin 全量 344/344；最终响应式增量 1/1、
  typecheck/build PASS。
- Desktop：Logseq 0.10.15、File Graph、Dark 1000×720、Dark 762×720、Light 1000×720；
  reload 后同一 HIGH Proposal 可重建，来源正文和正式 Project 均未改变。
- Provider：9 次流程显式调用、Validator 拒绝 0、自动重试 0；出现 1 次已回答 Page 关系
  的重复提问，登记为质量债，不新增 Skill/Prompt/Validator 特例。
- 状态：Preview 与 HIGH Review UI Partial 各关闭 1 项；阶段级 Partial 新增 0，
  P2-C 与完整 Goal 仍保持原 `IN_PROGRESS` 口径。

## 已完成

- 明确当前仓库不是 V2 底座缺失，而是用户交互仍工程化；
- 证明 Focus、Condition、due、Proposal、Commit、Undo、Audit、Anchor、Project aggregate、Doctor、Backup/Restore、迁移和 Provider 都可复用；
- 证明当前未注册 Block/Page 就近入口，主导航仍为六个工程工作区；
- 证明 Plugin 当前不自动管理 Local Service 生命周期；
- 证明本轮根级检查通过且未覆盖用户已有改动；
- 建立 Goal 要求的实施目录和首轮文档。
- 完成 P0-A 的 `BlockFocusController`、Block context menu 注册、原地反馈与会话内 Undo；
- 完成重复提交互斥、active Primary Anchor 唯一解析、stale/closed/missing fail-closed；
- Plugin typecheck 与首轮 132/132 测试通过；
- 修改后根级 `./scripts/check.sh` 再次 PASS；
- 在真实 Logseq Desktop 复现 filesystem descriptor → `SERVICE_DESCRIPTOR_PATH_INVALID`；
- 新增只接受本地 JSON 文件的私有 descriptor 导入入口：校验后只写固定 FileStorage key，
  设置中不保存 token 或 filesystem path；
- 导入期间有 loading、禁用与脱敏错误，首次真实运行发现并修复 settings change 与直接
  refresh 的 generation race；
- Plugin 测试增至 137/137，覆盖合法导入、非法零写入、存储失败脱敏和 First-run UI 状态；
- 真实 Desktop 一次导入进入 `Runtime READY / Store READY`，reload 后自动恢复 READY；
- 真实 Block context menu 完成 Focus 加入、移出、Undo 恢复及 Local Service 状态读回；
- 测试结束后 Focus 清回空集，临时 descriptor 文件和剪贴板已清理。
- 完成 P0-B 的 Block 现场 Condition router、三种最小字段表单、busy 状态和状态 Undo；
- Plugin typecheck、143/143 测试与 build PASS；
- 真实 Desktop 分别写入 WAITING/BLOCKED/PAUSED，Local Service 读回一致；
- 每种状态写入均保持 Lifecycle OPEN、Focus 空，Undo 后恢复 ACTIONABLE；
- 真实 WAITING Undo 发现 JSON key 顺序假 stale，改用 `stableJson` 并补回归后复测通过；
- 最终 force reload 读回 version 10 / ACTIONABLE / Focus 空。
- P0-K 最新真实 Provider abstain 暴露“未创建 Proposal”工程词后，`06b8762` 将普通 Block
  分析的无需整理、建议已生成、不可用、中断和失败全部翻译为用户结论；Plugin 343/343、
  根级检查、真实 Dark Desktop 与单次 Provider 复验均 PASS，零正式写入、零自动重试。
- `eba1c54` 继续删除正常连接首屏的重复成功横幅，只保留一个持久 Copilot 状态；Graph
  switch 的 authority 隔离反馈不被静默删除。精确构建 reload 与真实 Provider abstain
  再次 PASS，`p0-k-10` 接管当前画面。
- `3bd76a6` 合并 Now/Migration 重复对象类型标签，所有可见筛选、分组和卡片类型改为中文；
  通用 `ACTIONABLE` 只保留一个首屏结论，完整正式事实仍在折叠依据。`f1d0e1f` 又清除
  `Focus / Now Work` 前台与无障碍术语，统一为“当前关注 / 现在”。Application 169/169、
  Plugin 343/343、根级检查及真实 Logseq 0.10.15 reload、1000×720、724×720 Gate PASS。
  本轮关闭 2 个当前 UI 缺陷，但没有把 P1 Attention/Marker 或 P0 宿主 Partial 升级为 DONE；
  Partial 总量 `0` 新增、`0` 减少。
- `971c6db` 继续沿真实 Project 重入失败链去除普通路径中的 `Anchor / 对象 / 运行时`
  术语。失联正文仍由既有安全边界阻止打开且零正式写入，用户只需知道原连接不可用、正式
  事项未修改，并从系统状态重新连接正文。Plugin 343/343、typecheck/build、根级检查和
  Logseq 0.10.15 exact-build reload Desktop Gate 均通过；未新增状态、Runtime、Skill、
  Validator、写入或 Recovery 分支。该 UI 缺陷关闭不改变 P1/P2 Slice 状态，Partial 总量
  `0` 新增、`0` 减少。
- `7da1a0a` 将 Project 首屏从“项目重入”改为“继续项目”，去除实现说明，并把 4 个并列
  动作收敛为一个主操作、一个 Context Recovery 次操作和折叠的“更多操作”；`b605e18`
  又把 Context Recovery 从绿色恢复/成功表面分离为蓝色 Copilot 信息表面。Plugin
  343/343、typecheck/build、根级检查及 Logseq 0.10.15 exact-build reload、1001×720、
  726×720 Gate PASS。没有 Provider 调用或正式写入；新增正式状态、Runtime、Skill、
  Validator、恢复分支和平行权威均为 0。关闭一个 Project 首屏 UI Partial，但阶段级
  Partial 总量 `0` 新增、`0` 减少。
- 完成 P0-C LOW 单组单 Block 白名单，`CREATE_OBJECT`/`REWRITE_BLOCK` 之外及 HIGH 组均拒绝；
- 连续编排复用既有 Review→Graph/版本重验→SemanticCommit→verify，不新增写路径或恢复器；
- busy 禁用同卡片审阅动作；stale 显示未写入；接受请求不确定时零自动重试并要求刷新；
- Plugin typecheck、147/147 测试和 build PASS；
- 真实 Desktop 执行 LOW `REWRITE_BLOCK` 一次接受应用，捕获 applying 禁用态、APPLIED/Undo；
- Undo 后 Graph 与 SQLite 恢复原正文，对象 version 10→11→12，正向 Commit UNDONE、逆向
  Commit COMPLETED、Pending/Recovery 0、integrity `ok`，测试普通 Block 已清除。
- 完成 P0-D 单一 Page menu 入口、执行时 Page UUID/Anchor/target tree 重验和普通/Project
  三项现场路由；
- Page 正式事项按目标 Page tree 与 active Primary Anchor 投影，不把 page string 或 main
  Page 当作 secondary target 身份；
- Plugin 155/155 tests、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 通过普通 Page、Project Page、Journal、受控 Project 创建/进入、HIGH
  current-interface 路由、取消/Back 和 sidebar 保留；
- SQLite 读回新 Project OPEN v2、唯一 active Primary Anchor、Pending/Recovery 0、
  integrity `ok`、foreign-key 无记录；
- Logseq 0.10.15 的 right-sidebar `…` 不提供 Plugin Page menu item；此宿主限制已记录，
  secondary-page payload 只按自动边界声明。
- 完成 P0-E 四项用户层主导航，顶部 Diagnostics 降级到“更多”而不删除；
- “项目”下保留 Project 列表/重入、当前接口、正式对象与受控创建，“更多”下保留最近修改/
  恢复、系统状态/诊断、备份/恢复和迁移；
- delegated `view` value 改为显式白名单校验，Plugin tests 157/157、0 skipped、typecheck
  与 build PASS；
- 真实 Desktop 下钻验证 Project、Objects、Audit、Migration、Diagnostics 均可达；包含完整
  内部 Commit ID 的页面不留截图，四张脱敏主流程截图逐张检查。
- 完成 P0-F 纯派生工具栏介入摘要，不新增领域状态源或写路径；
- 数字只计到期 review、待确认、HIGH 已接受未应用、PENDING Commit 与一次正式连接风险；
  OPEN、Focus、未来/普通 WAITING、Project 与 Candidate 总数被自动测试排除；
- `RECOVERY_REQUIRED` 自动覆盖数字为 `↻`，点击优先进入既有恢复；其他点击按连接诊断、
  Pending Commit、Proposal Review、Now 的顺序路由；
- Plugin tests 161/161、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 证明 READY/Pending=0/Recovery=0 时安静 `TC`，受控停服时为 `TC ①` 且进入
  Diagnostics，同库重启和 descriptor 安全刷新后恢复 `TC`；
- 当前库没有 Recovery 项，因此 `↻` 不虚报 Desktop PASS；P0-H 自动生命周期仍保持 OPEN。
- 完成 P0-G 纯用户层最近修改投影；只组合既有 Proposal/SemanticCommit，不新增 Audit、
  Receipt、Commit 或持久缓存；
- 主卡只显示用户意图、时间、“已应用/尚未完成/需要恢复/未能应用/已撤销”和可用动作；
  Commit/Proposal ID、error code、checksum 进入折叠技术详情；
- inverse Commit 折叠回原用户变化；后续正文、对象、Anchor、Ownership 或 Project interface
  变化时解释不能直接 Undo 的原因；
- generic、Ownership、Lifecycle、Project interface 分别复用既有 Undo handler，Closure
  不伪造通用 Undo；
- 即时结果用实际 semanticCommitId 查同一长期投影，导航/关闭后清除 session 提示；
- Plugin tests 167/167、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 完成 LOW 应用→即时结果→reload→长期 Undo→已撤销；最终 Graph 正文和对象
  恢复，正向 Commit UNDONE、逆向 Commit COMPLETED、Pending/Recovery 0。
- 完成 P0-J 的四条中文 slash 与六条中文命令面板注册；
- slash 仅插入 `[任务] / [MiniProject] / [决策] / [成果]` canonical 语法，正式化继续由
  既有 parser、显式同步和 Local Service 单一路径负责；
- “处理当前 Block”复用 Provider → Validator → Proposal，“加入或移出当前关注”复用
  active Primary Anchor 与 `BlockFocusController`，没有新写路径；
- Plugin tests 183/183、0 skipped，typecheck/build/bootstrap/dist integrity 与根级检查
  PASS；Desktop slash/palette/custom binding Gate 未虚报完成。
- 完成 P0-K session-only Block/Page origin route；主 Page 按 UUID 重验和定位，secondary
  Page 只关闭 overlay，来源丢失不猜测替代目标；
- 关闭、取消与 Block Condition 成功复用同一返回 Controller，Project 创建按设计进入新
  Project Page；UI 只显示“返回原 Block/Page”，不暴露身份；
- Plugin tests 187/187、0 skipped，typecheck/build/dist integrity PASS；Query/引用/
  right sidebar 等 Desktop Gate 未虚报完成。
- 补齐 P0-A 普通 Block 右键“处理这条内容”：不猜正式类型，按 context-menu payload 的精确
  UUID 单次绑定并在 Provider 前重读校验；
- missing/mismatch/空正文 fail closed；Provider 不可用零请求、零写入；一般入口、异常和
  Graph switch 清理旧目标，P0-K 继续保留 main/secondary 来源；
- Plugin tests 191/191、0 skipped，typecheck/build PASS；Query/引用/right sidebar 的真实
  SDK payload 与返回行为仍保留为 Desktop Gate。

## 当前进行

### Slice P0-H / P0-J / P0-K：产品化与日常现场

状态：`IN_PROGRESS`

P0-I 已完成：用户首屏固定回答发生了什么、影响能力、仍可用能力、数据安全与所需动作；
工程组件、协议、日志、ID 与修复入口默认折叠。真实 Desktop 已验证 READY 连接下的正文核对
注意状态，以及受控停服/reload 后的只读安全状态；没有把连接失败当空数据。

P0-H capability spike 已得出结论：iframe 不支持可靠 child process，采用独立 Launcher。
Launcher/LaunchAgent、ownership、shutdown、Graph binding、descriptor 刷新、TTL 与
crash/orphan recovery 已由自动和真实进程证据闭合；reload、退出和 Graph switch 的代表性
Desktop Gate 现也已闭合。

2026-07-26 的精确构建重装暴露一个真实 authority 漂移：同一 Graph 已显式绑定测试数据库，
再次运行 installer 且省略 `--database` 时，旧实现会静默改用默认数据路径。没有文件被删除，
运行映射已用原明确路径恢复；安装器现在复用同一 graphKey 的既有 databasePath，除非用户
显式传入新绝对路径。回归覆盖首次安装→同 Graph 无参数重装→第二 Graph 安装，Launcher
29/29 PASS；记录见 `logs/p0-h-launcher-reinstall-authority-automated-20260726.md`。

修复后已用当前构建执行真实无参数重装：graphKey/databasePath digest、inode、7 Objects、
24 Commits、12 Proposals 和 Provider model 前后完全一致；后续受控 Provider Gate 重装也未
改变 authority，最终恢复真实 DeepSeek 并由 Plugin 自动重连。该子 Gate 已 DONE。

`ca50304e9aa2` 又完成真实 Graph switch。首次运行先发现新 Graph 已显示而旧 Project 卡仍
短暂保留，故未把最终受限态冒充通过；修复后清除旧 graph key 和受限 UI 均发生在 lease
release 之前。当前构建切到未配置隔离 Graph 后，宿主首次显示新 Graph 的约 2481 ms 取样
已为“知识库不匹配 / 正式修改暂停”，旧 Project 不可见，6 秒后仍 fail-closed；切回原 Graph
约 3752 ms 恢复 READY、同一 Project 与“不复用上一知识库数据”结论。Launcher 仍
`configuredGraphs=1`，graphKey/path digest 和 database inode 不变。P0-H 从 Partial 关闭为
`DONE_DESKTOP_REPRESENTATIVE`；记录见
`logs/p0-h-graph-switch-desktop-live-20260727.md`。

P0-J 在该阶段从 `AUTOMATED_ONLY` 推进为代表性 Desktop partial：冷启动命令面板单组注册、Now/
系统状态路由、四条 Slash 可发现、`[任务] ` 代表插入和自定义 binding 配置/触发/清理均已
通过。连续 Plugin reload 的重复行经完整 restart 清除，按宿主 residue 记录而不增加第二
去重状态。Computer Use 不能可靠注入中文字符，因此原生中文 IME、受限态、Light 与窄窗口
在该阶段继续 OPEN；IME 后由 `a65da34` 的原生逐键 Gate 关闭，ended boundary 由
`bc79ffd` 关闭。完整记录见 `logs/p0-j-host-commands-desktop-live-20260726.md`。

P0-K 已完成 main Page 入口→来源说明→返回同一 Page 的真实 Desktop 代表链；Logseq 0.10.15
right-sidebar 专用菜单不提供 Plugin Page item，按 bounded host conclusion 安全隐藏，不猜测
secondary identity。`73fea9a` 又用脱敏 live query / block reference 页面确认：Query 投影
由宿主接管为页面预览，reference 只出现引用专用菜单，均不提供可靠 Plugin Block item；
因此安全隐藏并让用户先打开来源 Block，不增加 DOM hack 或投影身份状态。来源移动/删除以及
成功/失败/Undo 返回随后由 `73dc1e2` 当前构建关闭；P0-K 已为
`DONE_DESKTOP_REPRESENTATIVE`。记录见 `logs/p0-k-host-origin-desktop-live-20260726.md`、
`logs/p0-k-query-reference-host-bounded-desktop-live-20260727.md` 与
`logs/p0-k-block-condition-worksite-desktop-live-20260728.md`。

P1-A 已在不开放前台的边界内进入 Plugin session runtime：Attention Signal 纯派生字段、
自动失效、证据变化解除 cooldown、Recovery 不可冷却、有界容量/清理/遥测均已完成。
Plugin 只在 READY 且投影完整时读取 objects/proposals/commits/anchors；Graph switch 清空，
没有 SQLite schema 或用户可见信号。fresh-session recompute 对同一正式 snapshot 产生相同
active signal identity、scope hash、merge/suppress counts 与 Dynamic Now current signature；
firstDetected/cumulative counters 不参与当前投影。审计同时发现 reconcile 会清除已设置的
session cooldown；现已改为同 scope + 同 policy 保留，evidence scope 或 rule policy 变化才
解除。UX-G008 因此对当前未显现 shadow 得出“不持久化”的有界结论；未来用户 disposition/
cooldown 是否跨 reload，仍须首批可见信号的 Desktop 减噪证据。

P1-B 第一波纯函数已覆盖 reviewAt/due、accepted-not-applied、Pending/Recovery、
Anchor missing/conflict 与 Graph mismatch，并按数据安全 > 已确认未完成 > reviewAt > due
合并为一对象一主问题。未来/closed/已应用事实自动不产出，Graph mismatch 不按对象放大；
CREATE Proposal 与未挂对象 Commit 使用自身 subjectRef，避免把 Block UUID 或虚构 ID 当成
正式 Object。Plugin adapter 不带正文，runtime cycle 的变化日志只含 raw/merged/cooled/
active/invalidated 数量；失败不改变 UI 或正式写入可用性。

P1-D 首轮确定性对象状态翻译已建立统一契约：主结论、最多两条关键依据、完整 facts、
空的 deterministic inferences、明确 unknowns、结构化 next-action eligibility、evidence scope
和规则版本相互分离。只有到期 WAITING/PAUSED 与已完成 blocker 在相关现场生成一个动作；
普通 ACTIONABLE、未来等待和 Project focus 不被机械变成下一步。首屏文本封顶但完整正式
内容保留在 facts。

P1-C 首轮 `SHADOW` 动态 Now 投影已建立稳定三段：可行动 Focus 才进入继续处理，确定性
blocker/review/due/Focus blocked 进入需要回看，Focus 中未到期 WAITING/PAUSED 进入保持等待。
普通 OPEN、普通非 Focus 等待、远期 due、closed 与非工作对象均排除；review/waiting 有界，
Focus 不截断且超过 7 项只温和提示。Copilot 建议区固定为空，尚未把 Shadow Signal 或“近期
更新”提升为建议，也未替换现有 Service/UI。

Plugin 已把该投影接到既有 Attention session cycle 的 count-only telemetry：复用
`/now-work.focus` 已过滤的 object ID 顺序，不新增 Focus endpoint，不记录对象 ID 或正文；
日志只增加三段/建议/suppressed/overflow 数量与 Focus overload。相同当前数量不重复写日志。

### P1-E Block 轻标记宿主拒绝结论

自动 harness 曾证明精确 UUID、容量、identity guard 与零正文写入，但真实 Logseq `0.10.15`
File Graph 推翻了“宿主 slot 是追加式装饰位置”的关键假设：把正式 MiniProject 根 Block 的
setting 从 `off` 改为 `line` 后，可见根正文和 Accessibility 文本立即被 marker 替换，只剩
子 Block。Markdown、SQLite Object/Anchor 和 UUID 没有变化；恢复 `off` 与 Plugin reload
仍不足以恢复宿主渲染，完整退出/重开 Logseq 后正文才重新可见。

`53337f2` 因此把生产 setting、renderer slot 注册、样式和生命周期接线全部移除，并加入
`BLOCK_MARKER_HOST_RELEASE_POLICY` 回归合同：生产模式固定 `OFF`、公开设置不可见、状态为
`HOST_SLOT_REJECTED`。隔离的五候选实现与 100 Block harness 保留为研究资产；只有 Logseq
提供稳定、可验证的 append-only 官方 slot 时才重开。没有采用 DOM observer、全局 selector、
renderer macro 或正文属性绕过。这关闭了 P1-E 的发布决策 Partial，但不宣称当前宿主已交付
Block Marker；用户可见状态继续由 Now、Project workspace 和统一状态翻译承接。

### P1-D 确定性状态翻译扩展

Application 状态叙述现已覆盖 Object、Proposal、SemanticCommit、Primary Anchor 与 System。
Proposal accepted-not-applied 会先排除完成 Commit；PENDING/RECOVERY_REQUIRED 只路由既有
“最近修改与恢复”，Anchor 只路由受控 Rebind 预览，系统状态沿用
Recovery > Pending > Service/Graph > Anchor > Explicit Sync > Ready 的用户风险优先级。
用户叙述不暴露 Commit error code 或 Anchor external ID，也不会从完成状态猜测 Undo 仍安全。
Plugin 已用一个只读 adapter 把同一契约接到 System、Proposal Review 与 Recent Changes。
System 继续回答影响/可用能力/数据安全/用户动作五问，但 headline、依据和规则 provenance
来自 Application；Proposal 与 Commit 卡片先显示结论和最多两条依据，unknown 明示，内部
status、provider/model、Commit identity、checksum 与 error code 退到折叠详情。既有
Commit/Undo/Recovery Handler 和前置校验没有转移到叙述层，完成状态不会自动获得 Undo。
此时 Object/Now consumer 与真实 Desktop 信息密度对照仍未完成。

同一 adapter 随后接入 Now Work Object 卡片：Object 列表重复 identity 会 fail closed，只有
与 Now item 完全相同的 Object version 才能替换既有 reason；到期 WAITING/PAUSED 与已结束
blocker 的 next action 只映射到既有 Condition 编辑 Handler。投影不完整时明确显示错误并
保留 Service reason，不开放 Attention shadow，也不增加正式写入权限。Anchor repair 现场
与 Desktop 信息密度对照仍待完成。

Anchor missing/conflict 随后接入同一用户层系统状态：只投影缺失/冲突，active/replaced 保持
安静；每项只显示对象标题、结论、最多两条依据和 unknown，最多展示 5 项，不把
object/Anchor/Graph/Block/hash 标识带入用户投影或 diagnostics snapshot。唯一动作继续调用
既有 `v2-rebind-open`，要求用户先选择明确对象 Block，再走候选预览、独立确认、提交前
Block/hash/version 与 Service generation 重校验。Service 受限时动作不可用，重绘后的
loading/error/preview/success 也保持在折叠技术详情外；没有新增恢复状态机、正式写入路径或
自动正文修改。

### P1-F Project/Task 重入纯投影

Application 已新增只读重入投影。Project 的恢复风险优先于业务上下文；普通 Association
只作为背景计数；只有 Focus 中、直属 Ownership、OPEN 且 active Primary Anchor 可定位的
对象才成为最多三个进入点。初始化 Project 没有结构边界时明确显示“当前进入点不明确”。
Task 不建立强制 current interface，只组合精确 Condition、带机器引用的父正文、Primary
Owner 与 Anchor；信息不足时只打开原文。

Plugin 已把 Project workspace 切到该投影：一次 Primary Anchor 分页读取同时供 Attention
shadow 与重入使用；每张卡只有一个结论、最多两个依据和最多三个可定位进入点。普通
Association 不再展开为行动列表，完整 Objectives/Deliverables/对象树不再压过当前停留点。
读取链任一部分失败会显示明确错误，不伪装成空项目。

同一投影已接入 Logseq 0.10.15 的 Page Head 宿主 slot：当前 main Page 只有在 UUID 对应
唯一 active Project Page Anchor 时才出现一个“继续项目”动作；点击会再次读取当前 Page，
再走既有 Page Context 完整重验 Page、Project object/version，并只显示目标 Project 的
重入卡。被动检测不读取 Page Block tree。SDK 类型与 0.10.15 host 源码均显示该 hook 的
payload 为 `nil`，不能识别 sidebar Page，因此 sidebar 中明确隐藏按钮，不假装支持精确
secondary-page 重入。2026-07-26 的真实 File Graph 又确认 host 根本不挂载
`page-head-actions-slotted`；这一路径按 `BOUNDED_HOST_LIMIT` 安全隐藏。Project workspace
点击链已真实通过；DB Graph Page Head、主题和窄栏继续 OPEN。

### P1-G unified UX output 与上下文恢复 Skill

Application 新增一个 Provider-neutral 深模块：输入是不可信 JSON 草稿和机器 authority，输出
是统一 facts/inferences/unknowns/summary/evidenceScope/suggestedChanges/nextAction/risk/
discussion/review/provenance。模型不提交 fact 文本或动作 target，只能选择机器 fact/action ID；
越界 evidence、未知 ID、歧义 authority 和超界内容全部拒绝。机器 risk/review 只能升不能降，
模型提供的 provenance 被实际 Provider metadata、Prompt bundle hash、Skill version 和时间替换。

Local Service 新增无 persistence port 的 `LocalLlmUxOutputGenerator`，继续复用现有结构化
Provider transport。Project context-recovery 已形成第一个生产 Service 路由：客户端请求只含
`objectId + expectedVersion`，SQLite Object/Ownership/Association/Focus/Anchor/Commit、
Context Package、内置 `task-copilot-core`/`recover-context` 与只读动作白名单都由服务端构造；
stale、错误类型和额外客户端字段在 Provider 前拒绝，生成后再次重验版本，结果不进入 Domain、
Proposal 或持久化。`recover-context@1.0.0` 固定逐层读到够用即停、信息不足明确承认、下一
动作默认不生成。`recover-context@1.2.0` 又把 prompt 中允许的 fact/action ID 固定放入
`uxAuthority`，不再要求模型从 prose 猜 ID。UX-G009 因此关闭为“不持久化派生 UX 草稿；
正式修改仍进入 Proposal”。

真实 LaunchAgent/Keychain/DeepSeek V4 Flash Gate 已通过：安装态 `bin/skills`、15 文件
Context Package、60 秒有界 timeout、4096 output-token 上限、lease heartbeat、strict
Validator、事实/推断/未知和只读 next action 均实际运行；调用前后正式 Object 投影不变，
release 后 owned Service 退出。此前的 20 秒 timeout 正确映射 504，Validator 拒绝正确映射
422，未放宽合同。真实 Logseq Desktop 主链随后完成：Project workspace 保留确定性重入
基线，显式生成进入 loading，DeepSeek V4 Flash 经 Unified UX Validator 后按事实/判断/未知
分区显示，feedback 可提交，reload 清除 session 草稿；全链没有 Proposal/Commit。最近正式
Commit 已进入 Context Package 并将 forward/inverse 折叠为“已撤销”。

Plugin 已把该路由作为 Project 重入卡内的可选显式动作接入，不在刷新、Page Head 或后台
shadow 中自动调用 Provider。确定性重入结论始终位于上方；Copilot 草稿只在 session 内保存，
分别显示 facts、inferences、unknowns 与 review-only suggestions，生成中、错误、Project
version stale 均不伪装为空。模型动作还必须匹配当前 deterministic projection 的
Primary Anchor 或 Recovery Commit，并复用既有 `v2-open-primary-anchor` / Audit route；
伪造或过期 target 只显示失效提示。Graph switch、Service reconnect/restricted 会清空草稿，
并发重复点击只产生一个请求。

真实内容质量没有被“Provider 成功”掩盖：`2cf8bf2` 的中文结果标记 `HELPFUL`；精确
`894d14f` 虽通过中文和权限 Validator，却把“当前真实 Provider Gate 的结果”列为未知，用户
标记 `INACCURATE`。`recover-context@1.3.0` 将其提升为通用反身边界后，`653875a` 的真实
DeepSeek 原样本不再产生 false unknown，并有独立样本证明真实业务 unknown 仍被保留；均
1 attempt。Provider error、Validator rejection、真实 DeepSeek 延迟 stale、reload、
Dark/Light 与约 720 px 窄窗也已通过。正式 Commit 数保持 24。

该失败没有进入 Validator 特例：当前 recovery draft 及其 disposition 属评价通道，不得作为
业务 unknown；仍需用户评价时由现有 feedback 收集。1.2.0 已退休，1.3.0 现在为
`CANDIDATE/DESKTOP_VERIFIED`，不因有限样本直接晋升 Production。stale Desktop 复验同时
发现 Interaction Evidence 误计 GENERATED；现复用同一 entry 替换为
`STALE / V2_OBJECT_VERSION_CONFLICT`，当前摘要 `STALE=1 / GENERATED=0`。完整记录见
`logs/p1-g-context-recovery-1-3-desktop-live-20260726.md`。

### P1-H privacy-bounded interaction evidence

Application 新增 session-only `InteractionEvidenceBuffer`：exact-key allowlist 从结构上排除
正文、summary、对象/Block 身份、Prompt、请求/响应与异常消息，只允许有界 scene/outcome、
对象类型、Signal/Rule/Skill/Prompt/model 版本、scope hash、数量、用户处置、固定失败码和
时长。buffer 默认只保留最近 500 项、最大 4096，不新增 SQLite 表、Graph 写入或自动上传。

P1-G 生成器已记录三个结构事件：成功包含 evidence 数量和 next-action eligibility；
Validator 拒绝只含 `UX_OUTPUT_VALIDATION_FAILED`；Provider 失败只含
`UX_OUTPUT_PROVIDER_FAILED`。证据 sink 采用 best-effort 隔离，自己的异常不能让已生成结果
失败，也不能覆盖原始 Provider/Validator 错误。

随后完成 Plugin 通用诊断链审计：旧 StructuredLogger 会把任意 `Error.message`、stack 和
cause 放入内存 ring、Console、复制诊断与 JSONL 导出，Runtime stage 也会复制这些字段。
现在两个入口统一只保留错误名和 machine-token 错误码；logger 逐字段物化允许的结构字段，
任意注入字段和自由文本形状的错误码直接丢弃。Plugin 初始化、global error 和 diagnostics
fallback 不再绕过 logger 把 Error 对象写入 Console；Debug 开关也不提升数据权限。该结论只
覆盖正式 Plugin 诊断链。

跨进程审计随后发现 Local Service `main.ts` 会在 READY 输出 descriptor path、schema migration
输出 backup path，并把未分类 Error message 直接写入 stderr。新增 `process-output.ts` 后，
daemon READY 只返回 pid/capabilities，migration 只返回版本与 backupCreated，失败只返回
machine code。Launcher 原本已使用同类结构码且忽略 Service 子进程 stdio。CLI stderr 被明确
分类为用户主动命令的即时反馈，不是后台自动留存；live/golden runner 默认关闭并已有 bounded
metadata、zero-write 与 structural failure 测试，不能混入日常交互日志。

Interaction Evidence 随后增加纯派生版本/噪声汇总：按 Skill/Prompt/model 版本分别统计
generated/rejected/error、rated、helpful、noise 与 do-not-repeat，并给出 helpful/noise rate。
未评分版本返回 null 而不是伪造 0% 噪声；summary 只读取已经通过 allowlist 的 session entry，
不产生对象身份、正文、持久化或上传。

Project recovery 随后补齐五种可撤回 session disposition。成功结果只向当前客户端返回 opaque
handle，handle 不进入 snapshot/export/summary；过期或跨 session handle 返回 404。Plugin
卡片显示 HELPFUL/NOT_NEEDED/INACCURATE/TOO_MUCH/DO_NOT_REPEAT，反馈期间禁重复提交，
Graph switch、Service reconnect 与 stale generation 仍按既有 epoch 丢弃。`DO_NOT_REPEAT`
按 scene + Skill version 在 Provider 调用前抑制；之所以不按完整 prompt hash，是因为真实
Context Package 时间戳会让每次 hash 变化，按 hash 会静默绕过用户刚表达的 session 意图。
撤回或 Service restart 立即恢复，不写 Graph/SQLite。

真实 LaunchAgent/Keychain reference/DeepSeek Gate 已完成生成→HELPFUL→TOO_MUCH→
DO_NOT_REPEAT→Provider 前 409→撤回→summary：正式 Object 投影不变，summary 不含 handle，
release 后 owned Service 0、Launcher 1。Desktop 又真实提交 `HELPFUL` 与 `INACCURATE`，
证明处置入口与单 interaction 计数可用；样本量仍不足以建立真实噪声阈值，跨会话
derivative/dashboard 价值也仍未完成。

## 当前阻塞

当前没有阻塞 capability spike 的外部依赖。若 Logseq iframe 不能可靠启动受支持 Node20
子进程，必须以真实证据选择独立 launcher，不得在 UI 假装自动。

## 当前风险

- SDK context menu 的正式 Block payload/排序及 Focus/Condition 动作已真实验证；Page menu
  的普通/Project/Journal 主 Page 已验证；Query/引用与 sidebar Page 扩展入口仍待宿主能力；
- Service 产品化 Desktop lifecycle Gate 与中文命令 Desktop Gate 尚未集中闭合；
- 默认 shell Node v25，不得用于受支持 Gate；
- `@logseq/libs` 依赖告警继续公开保留。

## 证据

- P0-A 本地 commit：`e459939`；
- P0-B 本地 commit：`02e6472`；
- P0-C 本地 commit：`5998490`；
- P0-D 本地 commit：`6f6ef49`；
- P0-E 本地 commit：`72cbbd4`；
- P0-F 本地 commit：`53835b1`；
- P0-G 本地 commit：`ff10b93`；
- P0-A 普通 Block 路由 Plugin tests：191/191、0 skipped，typecheck/build PASS；
- P1-A/B Application tests：82/82、0 skipped，typecheck/lint PASS；
- P1-B Plugin runtime tests + 全量：196/196、0 skipped，typecheck/build PASS；
- P1-D 扩展后 Application tests：104/104、0 skipped，typecheck PASS；
- P1-F 纯投影后 Application tests：112/112、0 skipped，typecheck PASS；
- P1-F Plugin consumer 后 tests：200/200、0 skipped，typecheck/build PASS；
- P1-D Plugin consumer 后 tests：204/204、0 skipped，typecheck/build PASS；
- P1-D Object/Now consumer 后 tests：208/208、0 skipped，typecheck/build PASS；
- P1-D Anchor repair consumer 后 tests：213/213、0 skipped，typecheck/build PASS；
- P1-F Project Page Head consumer 后 tests：219/219、0 skipped，typecheck/build PASS；
- P1-G contract 后 Application tests：120/120、Local Service tests：94/94、Service Client
  tests：12/12；`recover-context` skill validator PASS；
- P1-H focused tests：5/5；Application tests：121/121、Local Service tests：97/97，
  0 skipped；两包 typecheck PASS；根级 Gate PASS，145 条稳定规则，恢复演练
  `differences: []`；
- P1-H Plugin diagnostics privacy tests + 全量：222/222、0 skipped，typecheck/build PASS；
- P1-H Local Service process output：focused 1/1、Local Service 98/98、0 skipped，
  typecheck/build PASS；
- P1-H version/noise summary：focused 2/2、Application 122/122、0 skipped，typecheck PASS；
- P1-G Project recovery Service route：Local Service 100/100、Service Client 12/12，
  typecheck PASS；成功、信息不足、只读动作、stale-before-provider、错误类型、额外字段、
  Provider disabled 和零正式写入均覆盖；
- P1-G Plugin consumer：Plugin 225/225、0 skipped、typecheck PASS；覆盖显式触发、
  loading/ready/error、前后版本重验、重复点击、Graph/runtime 清空、facts/inferences/
  unknowns 分区、内部 fingerprint 不显示与伪造动作 target 不可点击；
- P1-H session disposition：Application 123/123、Local Service 102/102、Plugin 226/226，
  0 skipped、typecheck PASS；真实 DeepSeek/Service Gate PASS，正式对象零变化，owned shutdown；
- P1-C 后 Application tests：98/98、0 skipped，typecheck PASS；
- P1-C Plugin runtime 后 tests：197/197、0 skipped，typecheck/build PASS；
- P1-A recompute/cooldown focused tests：13/13 PASS；fresh session current signature parity，
  同证据 cooldown 保留、evidence/policy 变化解除；
- P1-E Block marker：真实 Desktop 发现官方 slot 替换可见正文；`53337f2` 后 focused 5/5、
  Plugin typecheck/build、根级完整检查 PASS；生产 runtime/setting/CSS 已移除，完整重启后正文
  恢复，状态为 `DONE_BOUNDED_HOST_REJECTION`；
- P2-A Grill Turn contract：focused 4/4、Application typecheck PASS；机器选择最大开放
  uncertainty/readiness，事实/推断/未知与 evidence scope 分离，越界/提前结束/额外字段
  fail closed；仅 session draft，无 Proposal/operation/正式写入；Service/Provider/UI/Desktop OPEN；
- P2-A MiniProject Grill Service：`mini-project-modeling@1.0.0`、精确 Primary Anchor Block
  子树、正式 Context Package、两轮 answer→focus、Provider 前后 Object/Anchor/scopeHash 重验、
  source stale 丢弃与 client field fail-closed 自动 PASS；Local Service 108/108、Service Client
  12/12，正式状态前后相同。真实 DeepSeek、Plugin UI、Structure Preview/Proposal/Desktop OPEN；
- P2-A 真实 Provider：既有 Keychain reference + `deepseek-v4-flash` 两轮 PASS；第一轮
  boundary、第二轮 outcome，facts/inferences/unknowns 与 recommendation/tradeoff 均通过严格
  Validator，仍为 `SESSION_DRAFT_ONLY`。更新后完整 Service route 因当前 Logseq bridge 未连接
  返回 `GRAPH_READ_BRIDGE_UNAVAILABLE`，未写 Graph/SQLite，故 Desktop/完整 live route 仍 OPEN；
- P2-A Plugin 多轮 consumer：正式 MiniProject Objects 卡与既有“处理这条内容”Block 入口、逐轮
  understanding/facts/inferences/unknowns/recommendation/focus、1–4000 字 answer、duplicate、
  Provider error 保留上一轮、对象/Service stale、Graph switch/restricted/cleanup 清空和返回原
  Block 已完成；focused 4/4、Plugin 236/236、typecheck/build/package/bootstrap/dist PASS，UI
  不暴露 Proposal/Review/Commit；Desktop 与完整 Graph bridge live route 仍 OPEN；
- P2-A 零丢失阅读预览：Application `task-copilot-grill-preview-v1`、Service preview route 与
  Plugin session UI 已接通；材料 exact-once、root 留 root、原文/hash 机器注入、越界 evidence
  拒绝、未归类原位保留和 `deletedMaterialCount=0` 均 fail closed。真实
  `deepseek-v4-flash` 首两次分别因额外字段/材料遗漏被拒绝，收紧 schema 与集合守恒 Prompt 后
  3/3 材料、1 unclassified、root preserved、SESSION_PREVIEW_ONLY PASS；没有 Proposal 或正式写入，
  Application 132/132、Local Service 111/111、Plugin 238/238 与根级检查 PASS；Desktop/完整
  Graph bridge route 与 Preview→Proposal/Commit/Undo 仍 OPEN；
- P2-B Proposal 合同：代码审计证明通用 Commit 与 Plugin executor 只支持单 Block patch，正式
  Adapter 对 move 仍 fail closed。ADR-0007 与 Application Preview→Proposal builder 已落地；
  一个 HIGH 组显式记录 CREATE_BLOCK/MOVE_BLOCK 的 UUID、hash、原/目标父级和相邻位置，原材料
  禁止 rewrite/delete、未归类不移动；focused 13/13、Application 135/135、Domain 42/42 PASS。
  Service session handle/Proposal route 与 Plugin Preview→Review 已接通：handle TTL 30 分钟、
  容量 64、restart clear，client 不能上传 preview；Service 重读并重验来源后零 Provider 调用创建
  同一 HIGH Proposal。Plugin 显示 loading/error 并跳转待我确认，但没有结构 Commit。专用
  dedicated planner/ledger/verify/recovery 已自动闭环：完整来源与预期结构指纹、执行前/补偿位置
  分离、每操作 GRAPH_WRITE step、顺序核验、最终 APPLIED、故障后逆序补偿、FAILED/replay 均 PASS；
  过程中故障注入发现并修复“先插入分区会改变下一 MOVE 的执行前相邻位置”。防御性 Plugin
  executor 已实现每步写前 Service 观察、写后 verify、重放跳过与逆序补偿，4/4 focused PASS。
  隔离 Desktop Capability Lab 又真实完成 A/B/C → C/A/B → A/B/C：custom UUID、顺序和语义正文
  守恒，宿主只追加精确 `id::` 行；同时确认 Page runtime UUID 跨 reload 不稳定、属性键 camelCase，
  因而 registry 冲突保持 fail closed 并把跨 reload 归入 Rebind。完成态 Undo 已实现为独立
  inverse SemanticCommit：changed-state 零账本拒绝、每步观察、成功收口 UNDONE、reload
  replay 零重复写、失败用 forward step 恢复已应用结构；Local Service 115/115、Plugin
  executor 246/246 PASS。正式 Review 已接入专用 Commit/inverse Undo：只有单一已接受 HIGH
  `CREATE_BLOCK`/`MOVE_BLOCK` 组会显示结构动作，确认框明示零删除、UUID/正文保留、
  整树重验与双向恢复；完成后返回 session origin，不可用时返回 Review。专项 UI 与
  Plugin 全量 247/247 PASS。随后真实 Desktop 完成四轮 DeepSeek Grill、5/5 canonical
  零丢失预览、HIGH Review、8/8 step Commit、reload、真实 Undo divergence→Recovery、
  修正后 8/8 inverse Undo、reload、最近修改 inverse 折叠和返回原根 Block。原五个 UUID、
  正文、父级及 sibling chain 恢复，四个机器 section 消失，Pending/Recovery 0。该纵向 Slice
  状态从 Partial 变为 Done，P2-C～G 仍 OPEN；完整记录见
  `logs/p2-b-grill-structure-desktop-live-20260725.md`；
- P0-I Desktop：正文核对注意状态与 Service unavailable 受限状态 PASS；
- P0-H hidden reload：真实 Plugin reload 后不打开面板，等待 25 秒超过旧 lease 停止窗口，
  owned Service 仍由新 lease 保持；首次点击 `TC` 直接 Runtime/Store READY。Plugin 255/255、
  typecheck/build/dist PASS；后续 `ca50304` 已关闭 Graph switch 视觉与 authority Gate；
- P2-C 两层自动合同：Project 创建前不伪造 Object ID；Blank/Page/MiniProject 来源边界、
  internal closure/current interface readiness、来源相关 focus builder 与
  `project-creation-modeling@1.1.0` 已自动锁定，Page/Object 关系成为独立 machine
  uncertainty；Blank authenticated Service route 与真实
  `deepseek-v4-flash` Gate PASS（证据为 Skill `1.0.0`，两次 invalid shape 先安全拒绝，
  最终 object count=0）；
  Page route 已通过 Service-owned Graph bridge 读取/生成后重读与零写自动 Gate；
  MiniProject route 已通过 Object/version + Anchor + Graph 双重重验、stale 丢弃与零写自动
  Gate；Page depth 已收回 Graph Bridge 协议上限 5，Page stale 和两类空 Block 过滤已有
  自动证据，authenticated Page 七答案已真实穿过请求 parser 并返回 machine
  `READY_FOR_PREVIEW`；独立 Project Creation Preview Validator/Provider generator 已通过零材料
  Blank、来源逐条保留、证据白名单、零 formal impact 自动 Gate；公开 Service Client 与
  authenticated Preview route 已接通 Service-owned source rebuild、machine readiness、
  Provider 后重读和 session-only opaque handle。Blank 成功不请求 Graph/不产生来源材料，
  Page 成功逐条保留非空材料；Page 未就绪不调用 Provider，生成期间变化 stale，全部保持
  Object/Page/Commit 零写入。Blank Preview 已用真实 `deepseek-v4-flash` +
  `project-creation-modeling@1.1.0` 验证合法 Schema、待 Review 关系、handle、零 formal
  impact 与 Object 0→0。Preview handle 的 server-owned HIGH Proposal/Review 已自动接通：
  Service 消费前重新读取来源并校验覆盖稳定 Context facts 的 fingerprint 与 Graph scope，
  server-owned Preview handle 与完整规范 Preview 共同决定 Proposal identity；同一 handle
  幂等重放，独立生成但阅读内容相同的 Preview 也不会与不同 `createdAt` 的记录碰撞；
  Blank 独立建页、Page 规范 identity/version/hash
  下保留另建或升级当前 Page、MiniProject 保留另建的 Service 纵向链与关系白名单均 PASS，
  新建/复用目标分别要求 `ABSENT`/`PRESENT`，operation target 与 modify scope 的
  existence/version/hash 必须完全一致；未决关系、过期、Graph stale 和 MiniProject
  Object version stale 均在新 Proposal 前 fail closed；
  Review 接受后 Object/Page/Commit 仍为零。接受后的专用正式链已完成自动接线：Service
  prepare 重验来源与 Page existence，Plugin 只创建精确所有权空 Page 或复用已审阅 Page，
  finalize 原子写 Project、Primary Anchor 与 reviewed current interface；实际 Page
  UUID/hash 先持久绑定到 Graph step，Domain failure 可跨 restart 补偿。专用 Page 仅在
  ownership/empty 预检后删除，复用来源 Page 不创建、不标记、不删除；inverse Undo 保留
  原 Commit/Audit，含用户正文时 fail closed。Local Service 129/129、Plugin 260/260、
  Persistence 48/48 与根级 Gate PASS。该自动合同完成时 Desktop/reload/failure/Recovery/
  Undo/CURRENT 截图仍 OPEN，随后由本轮 Blank Desktop Gate 关闭；
- P2-C 用户入口已从 Partial 收敛为自动闭环：Blank、普通 Page、OPEN MiniProject 三来源
  统一进入 Project Creation Grill session；客户端不注入事实，前台按事实/Copilot 判断/
  未知分区，每轮一个问题，Preview 明示零正式影响，成功后只进入 HIGH Review。旧直建 UI
  与 action dispatch 已移除，不能绕过 Grill；Plugin 267/267、typecheck、production build
  PASS。该自动结论随后由以下真实 Desktop 与截图证据补充；
- P2-C Blank Desktop 纵向链从 OPEN 收敛为 DONE：真实 DeepSeek 输出先暴露英文/双问题和
  Preview 关系示例冲突，修复为 Skill `project-creation-modeling@1.2.0`、
  `mini-project-modeling@1.3.0`、自然中文 Validator 和 source-specific output contract；
  HIGH Review 后首次正式应用又真实发现 Logseq properties metadata Block、最近修改通用
  Undo 误路由、`deletePage` UUID/name 契约和删除读回延迟。所有失败均保持零误写或同一
  PENDING/Recovery ledger，修复后同一 Commit 完成创建，跨 reload 可读，再经专用 inverse
  Undo 删除仅事务拥有的空 Page、撤销 Project/Anchor、保留 Audit，第二次 reload 后系统
  READY 且无未完成修改/Anchor 冲突。当时截图 `p2-c-09`～`p2-c-11` 现已被最终 Page Gate
  证据降为 HISTORICAL/SUPERSEDED，完整记录见
  `logs/p2-c-project-creation-desktop-live-20260726.md`。该结论只关闭 Blank 主链；随后
  Page preserve/dedicated 由下一项继续收口；
- P2-C Page“保留来源另建”从 OPEN 收敛为 bounded DONE：三段专用测试材料经真实
  `deepseek-v4-flash` 七轮自适应 Grill 形成最终阅读，Preview 逐条保留来源，单组 HIGH
  Review 后原子创建 Project/Anchor/metadata-only 受控 Page。完整 Logseq restart 真实发现
  runtime Page/Block UUID 漂移，旧 Undo 安全拒绝且未先删正式对象；最终构建保持 Service
  原账本 identity，仅在精确 Page name 与 owner/object/semantic-commit metadata 全部匹配时
  重新绑定受控专用 Page并完成 inverse Commit。来源三段正文逐字不变，专用 Page 与正式
  Project/Anchor 移除；删除事件的短暂 reconciliation 经再次 restart 自动收敛为 false，
  Pending/Recovery/Source Conflict 为 `0/0/0`。真实 Provider 多次提出越权 Page 写入/回链
  建议，Validator 均零写拒绝；`GRILL_TURN_VALIDATION_FAILED` 与
  `GRILL_PREVIEW_VALIDATION_FAILED` 现映射为 422，HTTP 集成测试覆盖非法 authority。
  当前 `p2-c-18`～`p2-c-20` 对应 `913bbda4528f`；`p2-c-12`～`p2-c-17` 仅作真实历史过程，
  不作为当前 UI 权威；
- P2-C Page“升级当前 Page”也从 OPEN 收敛为 DONE：同一三段材料刻意保留“原文要求另建”
  与“用户本轮明确 reuse”的冲突，真实 DeepSeek 最终以用户决定形成 `REUSE_SOURCE_PAGE`。
  两次 Validator rejection 零写且保留答案后重试成功；Preview/HIGH Review 后只创建 SQLite
  Project 与 active Primary Page Anchor，Page 没有新增 properties/metadata/正文。创建、
  restart、inverse Undo 与再次 restart 前后，Page name/properties 和三段 Block
  UUID/content/properties 均逐字段等于创建前；Project 投影撤销且系统 `0/0/0`、
  reconciliation false。`p2-c-21`～`p2-c-24` 为最终构建 CURRENT 证据。内容质量仍有
  readiness 过长、重复“完成证据”标签和真实 Validator 拒绝率问题，记为既有
  `project-creation-modeling@1.2.0`/renderer 改进候选，不新建平行 Skill；
- P2-C MiniProject“演化为 Project”从 OPEN 收敛为功能 DONE：Service 有界读取正式
  MiniProject v14、active Primary Anchor 与五个精确 Block，真实 DeepSeek 自适应 Grill
  先后暴露 machine identity/fact key 泄漏、错误 closure 对象和 evidence repair 过宽，
  修复并沉淀到 `project-creation-modeling@1.5.0`。最终 Preview 五项来源均为
  `LINK_AS_SOURCE`，单组 HIGH Review 接受仍零写，最终 Commit 才创建专用 Page/Project/
  Anchor；reload 后可重入，inverse Commit 恢复来源对象/Anchor/UUID/正文/顺序。首轮安全
  Undo 误回 Journal，`7a7492a407ed` 改为只导航 Service 审阅并重验的正式 Page 或 active
  Primary Anchor。最新构建完整重跑真实 Provider 链后精确返回来源根 Block，再次 reload
  Runtime/Store/Service READY、`0/0/0`、reconciliation false。最终 Preview 前两次真实
  Validator rejection 零 Proposal/零写，第三次同答案集通过；安全边界 PASS，拒绝率和用户
  诊断继续作为 Skill/UX 质量项。CURRENT `p2-c-38`/`p2-c-39` 对应 `7a7492a407ed`，
  旧 Journal 返回 `p2-c-36`/`p2-c-37` 已标为 SUPERSEDED。当前全量 Application
  `155/155`、Local Service `133/133`、Plugin `271/271` 与根级检查 PASS；
- P2-D 继续保持整体 Partial，但 MEDIUM 纵向链 DONE：新增 16 类 Project operation intent 的确定性
  LIGHT/MEDIUM/HEAVY router，自动锁死 Ownership、正文移动、完整结构、拆分合并、Closure
  与 external Agent 不能降级。Project 重入、正式对象和 Page 更新入口统一先显示影响选择；
  LIGHT 复用现有 Condition/Association，完整当前接口复用 HIGH Proposal/Commit/Undo。
  MEDIUM 当前摘要已用真实 `deepseek-v4-flash`、Service-owned Context Package、
  `recover-context@1.2.0`、Unified UX Validator 与单组 `UPDATE_PROJECT_NARRATION`
  Proposal 完成 Review、apply、reload、最近修改、专用 inverse Commit 与二次 reload。
  前两次 Provider 草稿因前台 prose 泄漏机器身份被 Validator 安全拒绝且零 Proposal/零写；
  Skill 1.2.0 明确机器身份只进入结构引用字段，第三次通过。Object v2→v3→v4，只有摘要往返，
  current focuses 与全部结构字段守恒，Graph 未改。真实长期 Undo 又发现通用 Block 路由错误；
  `f6d0429` 修复为 Project interface 专用 inverse 后通过。`ae2395523798` 修正旧
  `Agent disabled` 状态并保存 CURRENT `p2-d-05`/`p2-d-06`。同一 `ae2395523798` 构建又完成 HEAVY 完整当前接口：
  Proposal→HIGH 接受→提交前重验→Commit→reload→专用 inverse→reload。Object v4→v5→v6，
  Commit 后 Objective/Deliverable/Work Stage/三项 Focus 全部可读，Undo 后恢复原空结构与
  单一 Focus；Graph 未改、`0/0/0`。CURRENT `p2-d-07`～`p2-d-10`。LIGHT Condition
  随后新增 receipt 持久 inverse 与 Service prepare/confirm 路由；Desktop Project
  v8→PAUSED v9→reload→正式 Undo ACTIONABLE v10→reload，Project 当前接口、Lifecycle、
  Focus、Ownership 与正文守恒。普通 Association 因无 remove/inverse 已从正式路由禁用。
  CURRENT `p2-d-11`～`p2-d-13` 对应 `58bf6306d04d`。Application `161/161`、Local
  Service `135/135`、Plugin `275/275`、Persistence `49/49` 与根级检查 PASS；
- P2-E 首条只读预览链完成自动 Gate：Project Closure evidence draft 从 Project interface 与
  直接 Primary Ownership 投影 Objective、Deliverable/Output、Decision、完成/未决工作；
  Objective 完成状态、实际结果、遗留和未来总结均保留用户判断，Association 与孙级对象不
  偷升格。stale/非 Project/非 OPEN/重复或缺失 Object 全部 fail closed。focused `3/3`、
  Application `164/164`；Local Service 只接受 `objectId + expectedVersion`，其
  `136/136` PASS；Plugin 在 Project 影响路由提供无 Proposal/Commit 权限的压缩预览，显式
  区分候选、unknown 与用户判断，`275/275` PASS；Service Client `12/12` 与 typecheck
  PASS。`ec1a70d848d6` 最新构建已在 Logseq 0.10.15 / Dark / `1567×1104` 完成
  Project 影响路由→只读预览；空证据场景仅有“取消”，reload 后 draft 消失、READY 并可
  重新计算，Objects/Proposals/Commits 保持 `2/10/21`，Project 保持 v10/OPEN/ACTIONABLE。
  CURRENT `p2-e-01`～`p2-e-04`。真实 Provider、HIGH
  Proposal/Review/Commit/Recovery/Undo 仍 OPEN；
- P2-E Provider model contract 已完成真实 Flash Gate：复用既有五层 Proposal generator；
  `design-project@1.3.0`
  新增 evidence candidate、NO_PROPOSAL、exact scope/operation 和前台 identity 隔离。
  缺原目标、主要交付或关键 Decision 时在网络调用前拒绝，`providerCalls=0`、Proposal
  队列不变、Project 仍 OPEN。生产 Validator 现在还逐项锁定 original goal、Deliverable、
  Decision、所有未确认 Objective 与 unresolved work。真实 `deepseek-v4-flash` 前两轮因
  遗留项未逐字保留被安全拒绝；增加 runtime `groundingContract` 后第三轮 1 attempt、
  约 24.1 秒、5861 tokens PASS：唯一 HIGH 组、4 read/1 modify、固定 Closure +
  COMPLETED 两操作、前台无机器 identity、Graph/Store 写入 0。该结果明确标为
  `MODEL_CONTRACT_ONLY`。领域矩阵禁止 Decision/Output → Project Primary Ownership，
  所以 formal-only route 继续在网络前拒绝，不伪造直属 Decision；
- P2-E session-only 用户判断已经进入公共 Service Proposal route：请求只接受同版本 Project
  与严格有界的 actual result、逐 Objective disposition、legacy、key Decisions 和 future
  summary；Service 从 SQLite 重建 evidence 后重验这些判断，Provider 只能逐字复制到唯一
  PENDING/HIGH Closure Proposal。自动 public happy-path 已证明 Project 保持 OPEN、
  SemanticCommit/Graph 写入为 0；缺用户判断的非法正式证据仍 `providerCalls=0`。更新后的
  脱敏 real Flash Gate 不再构造 Decision Ownership，使用 3 read/1 modify，1 attempt、
  约 22.6 秒、5648 tokens PASS，用户判断未被模型改写且前台无机器 identity。该证据仍是
  `MODEL_CONTRACT_ONLY`，Plugin 最终阅读、loading/error/stale、HIGH Review/Commit、
  Recovery/Undo 与当前 Desktop 未完成。Plugin 随后接入用户确认入口：证据与真实判断保持
  同屏，Objective 输入按正式数量动态生成；唯一主动作建立待审 Closure，成功后进入现有
  HIGH Review，失败、NO_PROPOSAL、stale 和 Provider unavailable 留在同一现场并保留已填
  session 内容。UI 不展示 Objective ID、scope hash 或 Provider 原始错误。Plugin
  `278/278`、build PASS；该 UI 仍需当前 commit 的真实 Desktop Gate。Local Service
  `144/144`、Service Client `12/12` 与根级 `./scripts/check.sh` PASS；
- P2-E 正常正式主链已完成真实 Desktop Gate：`1ec63ac` 构建完成用户逐项判断、真实
  `deepseek-v4-flash` loading、单组 HIGH Review 与最终 Closure Commit；完成态真实暴露
  “没有专用 Undo”的产品缺口，`p2-e-09` 作为 SUPERSEDED 失败证据保留。`06907f3`
  增加只允许 `COMPLETED → OPEN` 且精确移除本次 Closure 的专用 inverse Commit，Service
  以正向 plan/steps/receipt、当前 version/checksum 和无后续变化共同重验；Plugin 提供独立
  确认并在完成后回到 Project 重入。当前 `p2-e-10`～`p2-e-12` 证明 Undo 可发现、成功结果
  和 reload 后 Project 回归 Now Work；CLI/SQLite 回读为 `OPEN v13`、Closure absent、
  forward `UNDONE`、inverse `COMPLETED`、`0/0/0`。Domain `44/44`、Local Service
  `144/144`、Plugin `279/279` 与根级检查 PASS。正常主链从 Partial 变为 DONE。
  `6f7f9a857be9` 又完成受控 post-domain HTTP 500 → 原 `PENDING` Commit → reload →
  同 Commit receipt replay → reload → Closure Undo → reload；Project 最终 `OPEN v21`，
  Closure absent、forward `UNDONE`、inverse `COMPLETED`、异常 Commit `0/0/0`。该子 Gate
  从 `AUTOMATED_ONLY` 变为 Desktop DONE，且没有新增状态或恢复入口。Provider error
  Desktop 已由 `7727770` 关闭；generation stale 又由 `662246a` 当前构建关闭。真正
  `RECOVERY_REQUIRED` 仍 OPEN，所以 P2-E 整体不提前关闭。完整记录见
  `logs/p2-e-project-closure-desktop-live-20260726.md`；
- P2-G Restore 激活失败主链已完成真实 Desktop Gate：`94038e6` 补齐候选激活后故障的
  原库回滚、恢复点保留、Service 停止与用户层失败 disposition；`0c4526d` 修复回滚后
  成功/失败重复显示。隔离 Graph 中对活动 SQLite 注入真实文件级写入拒绝后，正式对象仍为
  5、版本 `[1,5,6,13,14]`，新增恢复点 schema 12 / integrity ok / foreign-key 0，
  owned Service PID `99248→99711`，Doctor PASS；Plugin Manager reload 后错误清空并显示
  系统正常。CURRENT `p2-g-44`～`46`。自动回滚失败后的手工 Recovery Desktop 与
  Light/窄栏仍 OPEN，故 P2-G 不提前关闭。完整记录见
  `logs/p2-g-restore-failure-recovery-desktop-live-20260726.md`；
- `2eb6df1` 关闭 Restore failure Gate 的自动并发/重启绕过风险：Restore 认证后独占入口、
  排空已进入请求再快照；同 Graph 并发 Launcher ensure 合并为单 child；两阶段
  `ARMED→RECOVERY_REQUIRED` 只在恢复点 Doctor PASS 后升级；sidecar 的创建/升级/清除由
  跨进程 mutation lock 串行化，arm no-clobber，clear 需要完整 expected record。损坏、
  0644、残留锁、竞态、双重回滚均 fail-closed；测试中的人工恢复先选择保留恢复点、
  offline Restore、Doctor PASS，再匹配清锁和重启。双轴 review 最终无剩余 finding。
  `e418c87` 又按数据库绝对路径摘要隔离 sidecar/lock 并校验 Graph identity，同时用统一
  per-Graph lifecycle gate 串行化 Launcher ensure、最后 lease release、reap 与 close；
  同目录双数据库、last-release/ensure 和 close/in-flight-spawn 的确定性竞争测试均通过。
  `cb87d86` 进一步让 interlock 读取进入同一 mutation lock，并在 gate 内复验过期候选的
  最新 heartbeat；absent-read/ARMED-writer 与 heartbeat-during-gate 两条竞争测试通过，
  最终双轴 review 无剩余阻断 finding。
  `23ae7bd` 又把该互锁的最小只读投影接入用户系统状态：严格 client 不允许
  路径/Backup identity/额外字段，前台只显示一个主结论和一个重新核验操作。
  Launcher `25/25`、Service Client `13/13`、Plugin `327/327`、Shared `9/9` 与根级检查
  PASS。`4c71af1` 进一步用同一 per-Graph lifecycle gate 启动 Local Service one-shot
  maintenance，只从互锁推导保留恢复点，先备份当前歧义状态，复用 offline Restore，
  Doctor PASS 后才 exact clear；失败保持锁并可从同一用户入口重试。Plugin 只增加
  session-only HIGH 确认，不获得路径/Backup identity/SQLite 权限。Launcher `29/29`、
  Local Service `160/160`、Service Client `13/13`、Plugin `328/328`、Shared `9/9` 与
  根级检查 PASS。`16bde9ad88a5` 随后用受控 `RECOVERY_REQUIRED` 前置条件完成真实 Desktop
  用户状态→HIGH Review→恢复→Doctor→清锁→重连→完整 Logseq restart；活动库恢复为 5 个
  基线对象，合成歧义对象只留在新安全快照，最终系统与 Service READY、`0/0/0`。本轮依据
  真实界面修复工程术语泄漏、恢复成功后陈旧只读状态及健康页内部枚举泄漏。状态为
  `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`，没有新正式状态、导航、
  Prompt、Skill 或 Recovery Kernel；受控前置条件不标作真实双重失败证据；
- `fe0b590034ac` 将上述受控前置条件推进为真实连续双重失败 Desktop Gate：专用测试
  Launcher 分别在候选激活后和自动回滚前抛错，活动库暂为 6 个对象，切换前 7 对象正式库
  与 `RECOVERY_REQUIRED` 互锁均保留。首轮暴露失败 catch 释放 Service 后未重新发现
  Launcher，导致人工恢复入口依赖 reload；修复复用既有
  `recoverConfiguredServiceRuntime`，第二轮无需 reload 即显示唯一“准备恢复”动作。
  独立 HIGH 确认后复用原 one-shot Restore、Doctor、exact clear 和 bounded runtime
  recovery，正式对象恢复为 7，Anchor conflict/Pending/Recovery `0/0/0`。故障 Launcher
  停止、正常 descriptor/LaunchAgent 恢复，Plugin reload 后 exact build、formal writes、
  explicit sync 和系统状态均 READY；database authority 未静默替换。CURRENT
  `p2-g-55`～`59`；新增正式状态、Skill、Prompt、Validator、恢复入口、平行 Runtime 和
  写入权威均为 `0`。本 Slice 不调用 Provider；
- `f17f46a` 关闭 Migration 写后响应丢失代表子 Gate：新增的只是 Local Service 既有
  fault port 上 test-only `afterMigrationImport`，生产调用不传。自动回归证明 Import 已
  原子提交后响应丢失、同 idempotency replay 与后续 Verify；真实 Desktop 又证明前台
  “先以台账为准”、同屏 `IMPORTED`/Verify、Plugin reload 后 ledger 重建、Verify 和既有
  HIGH Undo。隔离库 objects `4→5→4`，run/batch
  `PREVIEWED→IMPORTING/IMPORTED→VERIFIED→PREVIEWED/UNDONE`，SemanticCommit
  Pending/Recovery 始终 `0/0`。故障 Launcher 退出后，正常 LaunchAgent、7 对象 authority
  和 READY 用户状态恢复。CURRENT `p2-g-60`～`65`；新增正式状态、Skill、Prompt、
  Validator、生产恢复分支、平行 Runtime 与写入权威均为 `0`，本 Slice 不调用 Provider；
- `df5d2ea` 先关闭 Migration Verify/Activate 的自动失败原子性与重试子 Gate：test-only
  `beforeMigrationVerify` / `beforeMigrationActivate` 分别证明失败后保持
  `IMPORTING/IMPORTED` 与 `VERIFIED/VERIFIED`，同一正式 ledger 可重试至 `VERIFIED`
  与 `ACTIVATED`，SemanticCommit Pending/Recovery 始终 `0/0`。后续真实 Logseq 0.10.15
  复用既有私有配对凭据，没有再次写入 FileStorage，在隔离测试数据库上完成
  `Verify failure → 原 ledger 重试 → Activate failure → 原 ledger 重试 → reload`。
  最终 run `ACTIVATED`、新 batch `VERIFIED`、objects `5`、Pending/Recovery `0/0`。
  `e2361599fbc9` 精确当前构建 reload 后只显示“V2 已启用”和只读历史；正常 LaunchAgent、
  原 database authority 与 READY 状态已恢复。该 Desktop Partial 从 OPEN 变为 DONE；
  新增正式状态、Skill、Prompt、Validator、生产恢复分支、平行 Runtime 和写入权威均为 `0`，
  Partial 总量净下降 `1`；
- `25ddac9` / `4dfe014` 关闭高频壳层工程语言 Partial：删除顶部 Runtime/Store/Graph 状态条，
  把“更多”、启动、知识库切换和系统状态收敛为用户结论；恢复重连必须同时满足连接 READY、
  client 存在和正式修改可用。exact build 真实 reload 后，普通用户层约定工程词扫描为 `0`，
  CURRENT `p0-e-05`、`p0-h-08`、`p0-i-03`。没有新增正式状态、导航、Skill、Prompt、Validator
  或 Recovery 分支；本 Slice 不调用 LLM，拒绝率/重试不适用；
- `e8db32f1af6d` 关闭 P0-H 当前语言的结束/重启 Partial：真实结束先发现主动结束被通用诊断
  误报为知识库不匹配，又发现 ended shell 的“未配置”假结论和 lease release 短暂闪烁；最终
  复用现有 `SERVICE_ENDED_BY_USER` 与 Launcher lease，先记录 session-only 用户意图、立即
  关闭正式动作，再释放租约。100/400/1000/2500 ms 采样均无错误结论；重启后 exact commit、
  formal writes true 和 `0/0/0` 读回通过。CURRENT `p0-h-09`～`12`；没有新增正式状态、
  顶层导航、Skill、Prompt、Validator 或恢复分支；
- 新增 `11_COMPLEXITY_LEDGER.md`：将 Partial 堆积、Recovery 分裂、状态组合、Agent/Skill 重复、
  Desktop 笛卡尔积、证据漂移和工程语义泄漏列为发布前显式 Gate；
- 根级检查：PASS；
- rule coverage：145；
- recovery rehearsal：differences `[]`；
- 本轮已归档 48 张脱敏 Desktop 截图：P0-A/P0-H 12 张，P0-B 8 张，P0-C 5 张，
  P0-D 9 张，P0-E 5 张，P0-F 2 张，P0-G 4 张，P0-I 3 张；
- 历史 V2：39/39 traceability DONE、E2E-01–24 DONE、真实 DeepSeek/Desktop/恢复均完成。

## 2026-07-27 UI 压缩与当前 Desktop Gate

- `460b414` 完成 Preview/HIGH Review 三段影响叙述、两阶段“审阅方案/确认应用”语言、
  Project 用户意图路由、Now 单一主动作、Context Recovery 增量压缩和 Closure Step 1；
  `773405a` 再把当前待审阅与 APPLIED/REJECTED 历史分离，并收敛候选区用户语言。
- `f4acf77346b19aa2f096ff2c169bfa7323546062` 根据真实 Desktop 暴露的工程词，把 Closure
  每个目标的原始依据默认折叠；不改写事实，不改变 Proposal/Commit/Recovery/Undo。
- 自动证据：Plugin `339/339`、0 skipped，build/dist integrity、145 stable rules、恢复演练
  `differences=[]`、根级 `./scripts/check.sh` 全部 PASS。
- Desktop 证据：Logseq 0.10.15、真实 File Graph、精确构建，Light/Dark 1000×720 与
  751×720 窄栏；Now、候选区、待审阅历史、Project 意图与 Closure 均已存为
  `ui-compression-01`～`08` CURRENT。取证后恢复 Light、1000×720 和普通文档模式。
- 本轮关闭的是“Review 历史淹没当前问题”和“Closure 逐目标证据首屏工程词泄漏”两个 UI
  Partial；新增 Partial、正式状态、Skill、Prompt、Validator、Runtime、恢复分支与写入权威
  均为 `0`。P2-E stale 后续已由 `662246a` 当前构建关闭；当前只剩真正
  `RECOVERY_REQUIRED`。P1 Attention/Marker、
  P0 宿主剩余 Gate 和 P2-G Migration Light host Gate 仍 OPEN。
- 本轮没有重新调用 Provider；既有 `recover-context@1.3.0`、真实 DeepSeek 质量和
  Validator 指标保持原证据，不能把 UI Gate 写成新的 Provider 验证。

## 2026-07-27 深色表面与 custom.css 边界 Gate

- `59dcf93` 统一 Light/Dark 语义 token，并让可读宿主优先于过期保存偏好；自动测试通过，
  但真实 Logseq reload 仍为白底，因 File Graph `custom.css` 强制深色而 iframe、官方主题
  信号和系统媒体查询均无法表达最终可见颜色。
- `d7526f43e798` 复用 Logseq 原有插件设置，增加默认 `auto` 的“界面外观”；只有上述不一致
  时才需明确选择浅色或深色。没有宿主 DOM 注入，也不读取或改写 custom.css。
- Desktop：Logseq 0.10.15、File Graph，明确选择深色后 1001×720、完整 reload 和
  723×720 均保持深色表面；主导航、主结论、卡片和唯一主动作可读，取证后恢复窗口并返回
  Logseq 现场。CURRENT：`ui-theme-dark-current-d7526f4.png`、
  `ui-theme-dark-current-narrow-d7526f4.png`。
- 自动：Plugin 342/342、0 skipped；根级检查、145 stable rules、恢复演练均 PASS。
- 该轮关闭 1 个 UI Partial；新增正式状态、Runtime、Skill、Prompt、Validator、Recovery
  分支、写入权威和功能 Partial 均为 0。新增的显示偏好不进入 Domain/SQLite/Graph。
- 未调用 Provider；Validator 拒绝率和模型重试不适用。File Graph 自身 Light bounded host
  issue 仍 OPEN，不用本 Gate 冒充 Light PASS。

## 2026-07-27 P2-E Provider error 与 Review 压缩 Gate

- `77277704d901` 统一 Closure generation 的 provider/validator/stale 用户语言；Provider
  error 不再暴露 Provider、Proposal 或机器状态，只说明本次没有完成、项目和正文未变化，
  并提供唯一“重新整理关闭方案”。若 generation 期间 Project 版本变化，旧提交按钮被
  “重新检查关闭条件”替代，直接使用当前版本，避免 stale 重试循环。
- 真实 Logseq 0.10.15、File Graph、Light 1000×720 通过受控 Provider error：用户逐项判断
  保留，Project 保持 `OPEN v21`，Proposal 仍为 13，SemanticCommit 只有
  `COMPLETED 14 / UNDONE 12`，没有 `PENDING/RECOVERY_REQUIRED`。恢复真实
  `deepseek-v4-flash` 后，同一材料成功生成第 14 个 `READY` Proposal；
  `design-project@1.3.0` 经现有 Validator 一次接受，没有正式 Project 写入。
- 真实成功暴露 Review 首屏仍复述模型长报告。`662246a298ac` 不修改 Prompt/Skill/Validator，
  而从已通过验证的结构化 Closure 结果生成一句“将结束项目并保存结果”与未完成目标数量；
  完整模型说明继续留在折叠依据。Dark 1000×720 reload 后 CURRENT 证据显示唯一主判断、
  影响与安全边界均在首屏，Project 仍 `OPEN v21`、Proposal `READY`、异常 Commit 为 `0`。
- 自动证据：Plugin `339/339`、0 skipped；根级 `./scripts/check.sh`、145 条稳定规则、
  build/dist integrity、恢复演练 `differences=[]` 全部 PASS。
- 本轮关闭 P2-E `Provider error Desktop` 子 Gate，Partial 净下降 `1`；stale Desktop 与
  真正不能安全续跑的 `RECOVERY_REQUIRED` 代表链仍 OPEN。新增正式状态、Runtime、Skill、
  Prompt、Validator、恢复分支、写入权威与新 Partial 均为 `0`。
- 同一 `662246a` current build 随后关闭 generation stale Desktop 子 Gate：真实
  `deepseek-v4-flash` 请求经本地无日志 8 秒延迟转发，期间 Project Condition
  `ACTIONABLE v21 → PAUSED v22`；Provider 返回后旧草稿没有进入 Proposal，用户层只显示
  “项目内容已经变化、本次没有修改项目或正文”，唯一动作自动变为“重新检查关闭条件”。
  正式 Condition Undo 恢复 `ACTIONABLE v23`，Plugin reload 后回到健康 Now；Proposal
  保持 `13 APPLIED + 1 REJECTED`，SemanticCommit 保持 `14 COMPLETED + 12 UNDONE`。
  延迟代理、临时 base URL 和测试 Condition 均已撤销，原 DeepSeek 与 database authority
  已恢复。该子 Gate 又使 Partial 净下降 `1`，不新增任何正式状态或恢复分支。
- `cda4f95` 进一步移除 Review 标题中的 `Closure Proposal` 工程语言。最新构建在真实
  Logseq 0.10.15、File Graph、Dark 1000×720 中重新调用
  `deepseek-v4-flash`；`design-project@1.3.0` 经现有 Validator 一次通过、模型重试 `0`，
  Review 首屏显示“结束项目：P0 Page Route Gate 20260723”，方案随后被拒绝。数据库回读
  Project 仍为 `OPEN/ACTIONABLE v23`，Proposal 为 `13 APPLIED + 2 REJECTED`，
  SemanticCommit 为 `14 COMPLETED + 12 UNDONE`，没有 PENDING、RECOVERY_REQUIRED 或
  FAILED 增量。`p2-e-closure-review-current-dark-cda4f95.png` 取代
  `p2-e-closure-review-current-dark-662246a.png` 对当前标题和普通路径语言的解释权。
- 代码审计给出有界结论：Closure post-domain 中断使用 receipt-backed `PENDING` 原 Commit
  续跑，已经 Desktop DONE；Closure 路由不会把自身 Commit 推入 `RECOVERY_REQUIRED`。
  持久化状态机只允许 `RECOVERY_REQUIRED` step 补偿、Commit 收口为 `FAILED`，不允许前向
  恢复到 `VERIFIED/COMPLETED`。因此原计划的
  “RECOVERY_REQUIRED → 原 Commit resume”不是当前生产安全合同，不能用 SQLite 注入制造
  假 Desktop Gate。是否只把真正恢复态定义为人工补偿，或扩张 Kernel 支持精确 receipt
  校验后的前向恢复，属于需要用户决定的安全边界；决定前不新增状态或恢复分支。
- 同一真实流程在拒绝方案后暴露待审阅空态错误显示“Agent 已关闭”，尽管受控 V2 Provider
  刚刚成功。`cd59228` 删除这条由 legacy demo-agent flag 推导的错误用户结论：Provider
  可用时只提示“可以整理当前页或从待整理继续”，不可用时也只说明基础功能仍可使用。
  Plugin `339/339`、0 skipped 与根级检查 PASS；Logseq 0.10.15、File Graph、Dark
  1000×720 reload 后空态和 15 条折叠历史均正确。该修复不新增正式状态、Runtime、Skill、
  Prompt、Validator、恢复分支或 Partial。

## 2026-07-29 P2-E 写入前失败与有界恢复结论

- `98df827` 在既有 Project Closure route 内加入测试专用写入前故障点，不增加生产入口。
  无 Domain receipt 且唯一 step 仍为 `PREPARED` 时，Commit 终止为 `FAILED`；若重验发现
  Project 已变化，Proposal 同时转为 `STALE`。两类结果都明确零 Closure 写入，用户重新
  发起业务操作，不把失败伪装成可继续的原 Commit。
- receipt-backed post-write 中断保持既有 `PENDING` 原 Commit 续跑；FAILED 重放只读检查
  唯一 step、错误码和 receipt。矛盾 receipt 或 step 状态按账本损坏 fail closed，不会
  因重启重做 Domain 写入。
- 前台在请求前关闭最终确认对话框并回到审阅工作区。FAILED 只显示“没有完成、项目和正文
  没有变化、重新发起”；STALE 只显示“项目状态已变化、重新检查”。二者都不提供“确认应用”
  按钮，也不暴露内部错误码。
- 自动证据覆盖 generic failure→restart→re-initiate、version race→409 stale、contradictory
  receipt、FAILED/STALE UI 与 accepted planner 拒绝 FAILED；根级 `./scripts/check.sh`
  PASS。Logseq 0.10.15 File Graph、Dark、约 1000×730 在精确 commit `98df827` 完成
  插件管理器真实 reload；“待审阅”为 0、22 条历史默认折叠。生产入口无法安全制造
  FAILED/STALE，因此专用卡片仍标为 AUTOMATED_ONLY，不借截图升级。
- 有界结论：Closure 只有一个原子 Domain step。`PENDING` 只表示已有 receipt 的原操作
  可收口；写入前失败终止后重新发起；`RECOVERY_REQUIRED` 继续只用于有已应用步骤需要
  补偿的多步骤操作。无需扩张 Recovery Kernel。P2-E
  `PARTIAL→DONE_BOUNDED_RECOVERY_CONCLUSION`，Partial 净变化 `-1`。
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator 和 Provider 调用均为
  `0`；只增加一个共享的只读 Proposal shape inspector，未形成第二规划/写入权威。

## 下一步

1. 执行 `12_RELEASE_FREEZE_CHECKLIST.md` 的当前构建代表矩阵，优先安装/生命周期、
   Project create→Undo、主题/窄栏与 Release 包；
2. 核对 Skill catalog、安装态、运行态和代表性真实 Provider 样本，不新增 Skill 家族；
3. 只修复 Release blocker 或明确回归；P2-F、扩展 Attention、Block Marker 与 D 类结构操作
   保持既定 Shadow/关闭/有界结论。
