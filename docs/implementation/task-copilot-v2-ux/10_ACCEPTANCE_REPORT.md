# 交互优化验收报告

> 当前状态：`RELEASE_READY / OVERALL_CLEAN_GATE_OPEN`
> 本文件只登记已经有对应代码、自动化和适用运行证据的结果。设计或计划不会标成完成。
> `base_v2_status=IMPLEMENTATION_COMPLETE` 与完整产品化完成仍是不同层级；后者由本报告、
> Freeze checklist 和 `logs/release-final-status-alignment-20260731.md` 共同证明；仓库级
> `MVP_SUCCESS` 仍受外层 clean Gate 约束。

## 1. 阶段结论

| 阶段 | 状态 | 自动化 | Desktop | 结论 |
|---|---|---|---|---|
| Baseline | DONE | 根级 PASS | 复用 3 张当前 UX 基线截图，不代表新实现 | 可开始 P0 |
| P0 | DONE_DESKTOP_REPRESENTATIVE | P0-A～K、普通 Block route、系统状态、Service lifecycle、Graph authority 与统一 Commit/Recovery 自动矩阵 PASS | Focus/Condition/LOW apply/Block-Page route/four-nav/toolbar/recent changes/system status；reload/quit/no-arg reinstall/Graph switch；palette/Slash/binding/IME；accepted-not-applied/PENDING/RECOVERY_REQUIRED/Undo/restart 均有代表 Desktop。`7e72075` 用最新 Now、待审阅、更多、健康页合并既有 733px、主题和宿主有界证据关闭总 Gate | P0 阶段完成；File Graph host limitations 保留为发布边界 |
| P1 | DONE_RELEASE_BOUNDARY_CONTEXT_RECOVERY_DONE_ATTENTION_BOUNDED_PILOT_OTHER_SIGNALS_SHADOW | P1-A/B Dynamic Shadow + P1-C 三段纯派生/正式 Now + P1-D status consumers + P1-E Block Marker 有界宿主拒绝 + P1-F Project reentry/Page Head bounded + P1-G unified UX/真实 Provider + P1-H session disposition/噪声汇总 | `3097c39` / `c9919f2` 四个独立 session 证明取消不误记 acted、later/notRelevant 只安静当前 session、事实解除后自动失效并跨 reload 保持；`1549728` 当前构建又完成 Context Recovery 真实 Provider smoke、Project v31 零正式写入 | 时间 Attention 为 bounded Pilot；建议关注、Waiting 过久、Project 静默和跨对象观察 Shadow；Block Marker OFF；File Graph Page Head bounded。上述均明确不阻断首发，不保留模糊 Partial |
| P2 | DONE_RELEASE_BOUNDARY_P2D_EXTERNAL_AGENT_P2E_RECOVERY_P2G_HIGH_RISK_P2F_SHADOW | P2-A/B、P2-C、P2-D 路由/共享 external Agent、P2-E、P2-F shadow/provider、P2-G 高风险代表链 PASS | `39d73a0` / `9e7a105` 完成当前 MiniProject Grill/结构 Preview/Review/Commit/reload/Undo/reload 与压缩首屏；`8d24569` 完成 shared external Agent；`1549728` 完成最新 P2-C。最终 MiniProject 对象 v4、原四 Block 不变、Doctor PASS。P2-E/G 既有证据保持 | P2-F 与扩展研究能力默认关闭，不阻断首发；File Graph Light 为 bounded host limitation |
| Final Release | RELEASE_READY | r8 package、Node runtime fail-closed、根级检查与五个 Skill 一致性 PASS | 稳定 r8 Plugin、Now Task、quit/owned shutdown、reopen、同一 authority、Doctor 和当前 Provider smoke PASS | 无未解释 Release blocker；自然日用继续作为发布后观察，不反向打开已审计的 v1.1 Goal |

`8928861` 后的 r8 取代 r6 为当前发布产物。真实 Node 25 install 在任何配置、PID 或 authority
变化前以 `LAUNCHER_INSTALL_NODE_VERSION_UNSUPPORTED` 停止；Node 20 无 Graph identity 也
安全停止；Node 20 显式重装保留既有 graph key 与
`tmp/runtime/manual-v2/task-copilot.sqlite`。r8 zip SHA-256 为
`1d36258a21827554b41dede1deaf1b63d4f68875d85762769b6faf4781627f07`；包内 Plugin、
Launcher、Service、Runbook、native module 与五个 Skill 通过完整性和安装态一致性 Gate。
Logseq `0.10.15` 从稳定 r8 目录显示 Now Task 的单一主操作；完整 quit 后 owned Service 与
descriptor 清理、Launcher 保持，reopen 后同一 authority 自动 READY。CLI `objects 14`、
Doctor PASS；当前结构化 DeepSeek smoke attempt `1`、graph/formal store writes `0/0`。
本轮新增状态/Runtime/Recovery/Skill `0`，Release blocker/Partial 净变化 `-2`。完整证据见
`logs/release-r8-node-runtime-task-reentry-desktop-live-20260731.md`。

历史上，`11e0131` 后的 r6 曾取代 r5；当前已由 r8 标记为 `SUPERSEDED_PACKAGE`。审计发现 r5 的包内 Runbook 没有随
仓库同步，因此 r5 的安装/生命周期证据保留为历史，但产物不再作为当前候选。
r6 从当前 HEAD 全量组装，zip SHA-256 为
`bedf541640bd45976d213f72a98308705fc33173de63c1d208e59c269fc5e8e5`，`unzip -t`
PASS，包内 Runbook 与 HEAD 字节一致，凭据特征扫描命中 `0`。包内 installer
真正零参数 fail-closed，显式 Graph identity 重装不更换 graph key/database
authority；Launcher/Service 安装 hash 与 r6 payload 一致。Plugin 从稳定的
`tmp/releases/...-r6/task-copilot-plugin` 手动载入，而不是临时目录；真实
reload 和完整 quit/reopen 后 iframe 仍指向该路径，owned Service 约 8.5 秒后
正确停止，Launcher 保持；重开第一次轮询即重连。终态 CLI
`READY · objects 14`、Doctor `PASS`，只有一条既有 stale Proposal warning，
本轮零正式写入。该证据关闭“发布包、当前 Runbook、安装路径和 CURRENT 截图一致”
Partial `1`，但不把 `RELEASE_CANDIDATE_READY` 写成完整长期 Goal 完成。证据见
`logs/release-r6-current-package-desktop-live-20260731.md`。

`39d73a0` / `9e7a105` 又把 P2-A/B 从“历史 Desktop、当前截图 OPEN”推进为当前构建代表
验收：真实材料驱动 Grill 只围绕边界、成果、完成证据和旧材料去向追问，随后生成零丢失
Preview；正式应用复用原 Proposal/Commit/Recovery/Undo，reload 后保持，inverse Undo 后原
UUID、正文、父子层级恢复。当前渲染将 Preview 影响与“尚未应用”提前，讨论依据折叠；
六次真实 Provider 请求均一次通过，Validator rejection/retry/abstention `0/0/0`。只读复验
结束后对象仍为 `v4 / OPEN / ACTIONABLE`，四个 Block 精确不变，Doctor `PASS`。130 秒
deadline 已自动测试，未伪装为本轮 Desktop timeout 证据。完整证据见
`logs/p2-ab-mini-project-current-build-regression-20260730.md`。

`ae9c6d7` 又以一条自然 Block 正式化链复核 Release Candidate：真实 DeepSeek 生成方案，用户
先审阅再确认应用，reload 后 Task 进入 Now，最终通过产品 Undo 回到原文与 objects `14`。
该链发现已完成“最近修改”卡的无效“查看”及 Commit/Object ID 泄漏；先红后绿修复并重载
当前构建后，卡片只保留真正可用的“撤销”，PENDING/RECOVERY_REQUIRED 的同账本入口不受
影响。Plugin `378/378`、根级检查、Doctor 与恢复演练 PASS。新 Release zip
新包完整性和当前 Plugin hash 一致性 PASS；真正零参数 install 安全停止，提供 Graph identity
但不传 `--database` 的正式重装保持原 graphKey/databasePath，reload 后 Service READY；因此
RC 状态保持，
但完整长期 Goal 仍为 `IN_PROGRESS`。完整证据见
`logs/release-candidate-natural-use-regression-20260730.md`。

`3883848` / `78528f7` 已把 accepted-not-applied 从 P0 Partial 推进为
`DONE_DESKTOP_REPRESENTATIVE`：真实审阅后正文/Object 零变化，Plugin Manager reload 后入口
仍在；重验方案随后正式应用、inverse Undo，并在再次 reload 后恢复 TODO 与 Object 基线。
首次预检 stale 为零写入，最新构建又把 stale 从当前待审阅移入折叠历史。
该时点 PENDING 和 RECOVERY_REQUIRED 的同 ledger 用户语言只有自动回归；后续
PENDING 已由下述代表 Desktop 链关闭；在该时点 P0 仍由 RECOVERY_REQUIRED 保持进行中，
后者与总 Gate 均已由后续证据关闭。
证据见
`logs/p0-unfinished-modification-frontstage-desktop-live-20260730.md`。

PENDING 后续已在同一 `78528f7` 前台上完成代表性 Desktop Gate：精确
Proposal-bound 中断使领域收据已持久、Commit 仍 `PENDING`；触发器删除后，
reload 只重建一个尚未完成问题，同 Commit 续跑不重复递增 Project 版本，
Undo 与再 reload 回到健康。RECOVERY_REQUIRED 仍只有自动化用户语义，不用本证据
替代。证据见 `logs/p0-pending-frontstage-desktop-live-20260730.md`。

`dbc5243` 又对上述真实 Gate 中发现的 transport jargon 做了修复与当前构建复验：
持久 PENDING 优先覆盖瞬时错误字符串，用户只看到“这次修改没有完成”“已完成步骤
已经安全保存”和“继续原修改”。同一正式链再次完成 resume、Undo、Plugin Manager
reload 与健康读回；组件回归 `372/372`。专用测试 Project 自身的工程化正文不计作
普通 UI 文案通过，避免以测试材料替代日常语言验收。

`872d2d4` / `684491f` 已把 RECOVERY_REQUIRED 从 `AUTOMATED_ONLY` 推进为
`DONE_DESKTOP_REPRESENTATIVE`：真实 Logseq 先完成并验证第一个 MOVE step，第二步断开后
持久进入 `COMPENSATION_REQUIRED`；Plugin Manager reload 仍从同一 ledger 显示一个恢复
入口，确认恢复后原 UUID、正文和顺序恢复，对象保持 v4，Proposal/Commit 终止为 FAILED。
完整 quit/reopen 后 Service READY、待审阅 0。终态失败已归档，最近修改只显示首段摘要。
该子链自身不替代 P0 最终视觉总 Gate；后者由下述 `7e72075` 汇总关闭。两者都不关闭整体 Goal。

`7e72075` 已完成 P0 最终代表视觉总 Gate：在最新 Logseq 0.10.15 File Graph 中重新检查
Now、待我确认、更多和用户系统状态，并与既有窄栏、Block/Page、主题、reload/quit/Graph
switch 和三类未完成修改证据合并为分层代表矩阵。当前问题与 29 条历史分离，普通健康页
不暴露技术诊断，正式状态无 Pending/Recovery/Anchor conflict。Query/reference/sidebar、
Page Head 与宿主真实 Light 信号保持明确 bounded host limitation，不通过脆弱注入伪装支持。
P0 因而为 `DONE_DESKTOP_REPRESENTATIVE`；这不关闭 P1、P2、Final Release 或完整 Goal。

`bfabf40` 已通过 Project 创建后落地与返回现场的代表性 UI Gate：真实 Logseq 0.10.15
File Graph、Dark/Light 1000×720、Light 723×720 均显示当前状态、一个推进、预期成果、
来源与一个主操作；完整结构折叠。点击“开始当前推进”会重验正式 Project 与受控 Page，
随后关闭面板并留在同一 Logseq Project Page，零正式写入。该 Gate 关闭一个 UI Partial，
但不替代最新构建完整 create/reload/Undo，也不关闭 P2-C 或 Final Release。

`2adfc35` / `efb3864` 已通过 Project Preview 与 HIGH Review 代表性 UI Gate：真实 Page
来源、真实 Provider、零正式写入 Preview、Proposal-only Review、reload、Dark/Light 和
1000/762px 均有当前证据。HIGH Review 的 762px 三列缺陷和首屏完整 Markdown 方案均已在
同轮修复并重取证。该 Gate
只关闭两个 UI Partial，不替代 Project 创建正式 Commit/Undo 的既有证据，也不关闭 P2-C
其余视觉项、P2-D～G 或最终发布。

`7a0b444` 已关闭最近修改卡的撤销资格/按钮矛盾；`19de8de` 又在最新 Logseq 0.10.15
File Graph、约 1000×720 的精确构建完成真实 Project 创建→reload→Context Recovery→
反馈→reload→Undo。Undo 成功消息不再泄漏 Project/Anchor/Audit/Commit，专用空白 Page
被移除并返回 Logseq；再次真实插件 reload 后 Pending/Recovery/Conflict `0/0/0`、
explicit sync clean。创建完成卡仍泄漏“正式 Commit 已完整完成”并复制长最终阅读，
因此只关闭 Undo 成功表达 Gate，不宣布 P2-C 或 Final Release 完成。

`1c18e9b` 已关闭连续使用 Day 6 的 Waiting 回复到达后原地恢复子 Gate：同一正式 Task
在原 Block 进入“恢复为可以行动”，确认页明确只改能否继续，应用后返回原 Block并成为
“接下来值得处理”第一项；真实 plugin reload 后保持，系统状态无未完成修改或正文连接
冲突。它复用既有 Condition/Service/version/Undo，不新增状态或恢复分支，也不代表
Dynamic Now、Attention 或完整 Pilot 完成。

同一正式事实的 Dynamic Now 对照 Gate 未通过：正式 Now 为
`Focus 1 / Next 10 / Waiting 0`，Shadow 为
`Continue 1 / Review 0 / Keep waiting 0 / Suggested 0 / Suppressed 10`，且后者隐藏
Day 6 刚恢复 Task。因此 P1-C 保持 Shadow；没有把低卡片数误作低负担，也没有开放 UI。

`3d63d5a` 随后在不采用该 Shadow authority 的前提下关闭正式 Now 的前台分区子 Gate：
既有 Service facts 被一次性去重并投影为“继续处理 / 需要回看 / 保持等待”；用户 Focus
明确标识且全部可见，普通 next 才按 4 项折叠。纯投影 5/5、Plugin 366/366、根级检查
PASS；真实 Logseq 0.10.15 reload 后在 Plugin Dark 1001×720 与 733×720 通过“继续处理”
代表 Gate，系统健康。追加正式链以同一 Task 完成 Focus→Blocked→恢复→Paused（未来
reviewAt）→恢复→移出 Focus，“需要回看 / 保持等待”均有当前截图；非 Focus Blocked
保持安静。测试后 Condition/Focus 恢复基线，系统仍健康。P1-C 继续 Partial，不以这一
UI 收口冒充 Attention helpful/noise 或 Dynamic Now 全部完成。

`3097c39` 随后关闭首批确定性 Attention 缺少真实前台处置证据的子 Gate：人工构造的
到期 Waiting 只在既有“需要回看”卡片显示试用标记；暂缓/不相关只收起该标记，正式卡片
和 Waiting 事实不变。真实 Plugin Manager reload 后同一事实重新生成标记，最终测试
Condition 恢复且系统为 `0/0/0`。该项验收 session-only 显示、处置、失效和重算合同；
它只有一个人工样本，不能验收真实 helpful/noise、跨会话持久化或其他 Detector 前台化。

P2-D Release 边界已由 `3c83856` 固化为唯一 Application 合同：16 类 internal intent 只做安全路由，普通
前台维持四个用户意图；Focus/Condition 内置，摘要与完整结构分 MEDIUM/HIGH，
Ownership/Closure 保持专用链，批量/移动/拆分合并路由外部 Agent，Association 与 Project
due 在 inverse/语义未齐前禁用。`8d24569` 又完成 C 类一条共享多 Block 移动链：有界
Context→外部 Agent Proposal→共用 Review→正式 Commit→reload→Undo→reload。首次 Undo
缺陷由既有 Recovery Kernel 安全补偿，通用 planner 修复后成功复验；没有新增 Runtime、状态、
Recovery 分支或 Skill。P2-D 因而为 `DONE_BOUNDED_EXTERNAL_AGENT_REPRESENTATIVE`，不声称
每种 C 类 intent 都有独立工作台，也不把 D 类写成 Out of Scope。

连续使用 Day 7 已通过同一 UUID moved/renamed 的代表性 Anchor Gate：真实 MiniProject
子树在 Logseq 工作现场移动到新 Page 并改名，explicit sync 后 identity 保持且 Primary
Anchor `active`；真实 Plugin reload 后 Now 能准确打开新位置，系统无正文连接冲突，也
没有错误要求 Rebind。该项只验收稳定移动，不把 duplicate/missing/conflict 或 Rebind
纠错写成完成。

连续使用 Day 8 已通过 Candidate disposition/cooldown 的代表性前台 Gate：三项真实候选
分别暂缓、保持普通内容和不再提示，当前队列归零，reload 后保持；修改“不再提示”来源
再检查仍保持安静。精确构建 `318baab` 不再把已处置内容列作新增或提供提交按钮，系统状态
无未完成修改与正文连接冲突。该项验收主动候选审阅的低噪声合同，不等于 Attention
前台开放；Provider/Skill/正式对象/Proposal/Commit/Recovery 均未变化。

连续使用 Day 9 已通过 Closure 正常连续使用与前台表达代表 Gate：已有正式 Project 的
用户判断经真实 DeepSeek 一次通过 Validator，审阅阶段零正式写入；确认应用后完成并经
reload 保持，专用 Undo 后恢复 `OPEN`、移除本次 Closure，再次 reload 后系统健康。
普通路径已明确“审阅方案不等于正式应用”，不再暴露 Commit/Lifecycle/SQLite/Service/
Audit，Undo 使用业务结论。该 Day 9 证据当时不等于 P2-E 完成；随后 `98df827` 已用自动
故障注入固定最终合同：receipt-backed `PENDING` 可继续原操作，写入前失败终止并重新发起，
`RECOVERY_REQUIRED` 只收口多步骤一致性。P2-E 现按有界 Kernel 结论关闭。

连续使用 Day 10 已通过十日代表 Pilot 回顾 Gate：当前待整理/待审阅 `0/0`，22 条历史
折叠，Project 区 2 张卡，维护能力保持二级；真实 Plugin reload 后连续性不变。切换到
无可用 authority 的隔离 Graph 时正式修改安全暂停，切回后原 Now 恢复。该 Gate 关闭
连续使用 Pilot 本身，但明确否决现有 Dynamic Now Shadow 直接前台化：正式 Now 的
`Focus 1 / Next 10` 偏长，而 Shadow 会遗漏刚恢复事项。Attention 当时继续开放；Block
Marker 后续已由 `53337f2` 以真实宿主替换正文证据关闭为 bounded host rejection，不能用
“没有展示 Signal”冒充低噪声门通过。

精确构建 `df6469f` 已关闭上述 Now 首屏过载子 Gate：正式 Now 仍保留原 Service 顺序和
全部对象，当前关注全部显示，普通 Next 首屏只显示前 4 项，其余 6 项由一个原生折叠承接。
Logseq 0.10.15 File Graph、host Light / Plugin Dark、约 1000×720 已完成真实插件 reload、展开和第二次
reload；第二次 reload 后首屏重新折叠，Focus 与原前 4 项保持。Plugin `356/356`、
typecheck/build PASS，零正式写入。该项可标为 `DONE_DESKTOP_REPRESENTATIVE`，但不等于
Dynamic Now 排序或 Attention helpful/noise 完成。Block Marker 的后续独立 Gate 结论是当前
宿主不可安全发布，并非视觉方案通过。

## 2. P0 验收

- [x] 主导航只有现在、待我确认、项目、更多；Project/Objects 与维护能力均有二级可达证据
- [x] Block/Page 就近入口；Block Focus/Condition、普通 Block 精确 UUID 内容路由与 Page
  普通/Project/Journal 路由已完成自动 Gate；普通 Block 真实 Provider abstain 已使用用户
  语言且零写入；P0-K 正式 Block 失败/成功/Undo/reload 已完成，Query/引用/right-sidebar
  按宿主有界隐藏；中文 IME 已关闭；普通 Block 的 abstain/成功/不可用/中断/失败均已有
  用户语言回归，真实 Provider abstain 与零写入 Desktop 已复验
- [x] 高频动作 1—2 个明确决定；Now/Review/Condition/Block route 首屏均只有一个主操作，
  低频动作折叠；维护首页按场景分卡但不进入高频路径
- [x] 正常连接首屏只有一个 Copilot 状态；启动/host-ready 不再重复成功横幅，Graph switch
  仍明确说明没有复用上一知识库数据；
- [x] 暂时做不了统一入口；三种意图、最小字段和版本保护 Undo 已通过
- [x] Waiting/Blocked/Paused 回复或卡点解除后可在同一 Block 恢复为可行动；只更新既有
  Condition，返回原现场，Now 立即重排且真实 plugin reload 后保持
- [x] 低风险一次接受并应用；LOW 单组单 Block CREATE/REWRITE 自动覆盖，真实 Desktop REWRITE 通过
- [x] accepted-not-applied 不静默；真实审阅后零写入、Plugin Manager reload 持续入口、
  最终应用/Undo/reload 与 stale 历史分离均通过
- [x] PENDING 清楚；真实中断、reload、same-Commit resume、Undo 与最终健康通过
- [x] RECOVERY_REQUIRED 代表性 Desktop 前台清楚；真实部分执行、reload、同记录补偿、
  restart 与正文/UUID/顺序守恒通过
- [x] 即时 Undo 与最近修改可发现；同一 Commit identity、跨 reload 长期入口与真实逆向
  Commit/Graph 恢复已验证
- [x] 工具栏只表示需要介入；安静态、连接风险数字与诊断路由已 Desktop 验证，
  `RECOVERY_REQUIRED ↻` 已完成代表性 Desktop 恢复验证
- [x] Service 日常无需终端；真实 LaunchAgent 安装、READY、更新、租约启动/结束与 crash recovery 通过
- [x] 隐藏 Plugin reload 不要求先打开面板；non-blocking bootstrap 与宿主 ready 事件自动取得
  精确 Graph identity，新 lease 在 25 秒观察窗内保持，首次打开直接 READY
- [x] Logseq 退出安全结束 owned Service；自动 unload/TTL/owner-PID 与真实 Desktop quit 后
  租约窗口内 owned Service 结束、Launcher 保留均通过
- [x] 中文命令与快捷动作；真实 Desktop 已完成冷启动 palette 单组、四条 Slash 可发现、
  `[任务] ` 代表插入和 custom binding 配置/触发/清理；`bc79ffd` 又关闭显式结束后的
  正式动作 fail-closed、零写入和显式重启代表链；`a65da34` 以原生简体拼音逐键完成
  组合、候选、已提交中文中间光标插入、正式建页、保存与 reload 读回
- [x] 用户层系统状态；READY/协议/Graph/Pending/Recovery/Anchor/正文核对自动覆盖，
  真实 Desktop 注意状态与 Service unavailable 受限状态通过，技术诊断默认折叠；
- [x] 完成后回业务现场；session-only Block/Page origin route 自动 Gate PASS，真实
  main Page 入口与返回同一 Page 已 PASS；right-sidebar 无 Plugin Page item 按宿主限制安全隐藏；
  Query 页面预览与 Block reference 专用菜单均不提供可靠 Plugin identity，按当前 File Graph
  宿主能力有界隐藏；同一 UUID 移动后精确返回新位置、来源删除后安全关闭且不猜测其他目标
  已 PASS；成功/失败/Undo/Condition/Project 创建后返回均有代表链；
- [x] Light/Dark/窄栏/Query/引用采用代表性有界验收；Plugin Dark 1001px/723px 与 reload
  PASS，多个 Light 当前页面 PASS；File Graph 最终主题信号、Query/reference/right-sidebar
  identity 无可靠宿主能力时安全隐藏并明确记录，不冒充全组合支持；
- [x] 自动与 Desktop 证据按分层代表矩阵齐全；不要求完全笛卡尔积。

## 3. P1 验收

- [x] Attention Signal 保持派生、session-only 且可失效；事实解除后自然消失，
  Graph switch 清空会话数据，不建立提醒数据库；
- [x] 影子模式通过；Dynamic Now、Waiting 过久、Project 静默和跨对象观察均可在
  不显现、不写正式状态的前提下重算和失效；
- [x] 规则决定强显现；首发只对 `REVIEW_DUE / DUE` 开放有界 Pilot，LLM 不能
  独立升级强提醒；
- [x] 一对象一主问题；恢复、正文连接、阻塞和时间信号按固定优先级合并；
- [x] “现在”不在首屏铺开所有 OPEN；三段只读投影、Focus 权威与普通项前 4 条+
  折叠其余项已有 Desktop/reload 证据；
- [x] Dynamic Now 前台 Gate 以有界否定结论关闭；Day 6 真实对照证明 Shadow 会隐藏
  刚恢复但未 Focus 的 Task，因此首发不替换正式 Now，不为此新增状态；
- [x] 首批 `REVIEW_DUE / DUE` 在既有 Now 卡片完成有界 Desktop Pilot：一对象一张卡、
  `本次先不提醒 / 本次不相关` 为 session-only、真实 reload/recompute、零正式写入；
  accepted-not-applied、Pending/Recovery、Anchor/Graph 风险不复制；
- [x] Attention 主操作计数与跨会话 disposition 决策：`c9919f2` 真实证明取消不计 acted、
  session-only 处置、reload 重算和事实解除自动失效；不建立提醒数据库，acted 不冒充 helpful；
- [x] Attention helpful/noise 首发门以有界 Pilot 关闭；4 个独立 session 记录
  `shown/acted/later/notRelevant/unresolved`，十日 Pilot 证明待审阅未失控；证据不足的
  建议关注和高噪 Detector 保持 Shadow，不伪造生产 helpful rate；
- [x] 状态叙述先结论；Now、Review、最近修改、系统状态和恢复卡均先显示
  用户结论，技术事实默认折叠；
- [x] “现在”日常表面不暴露对象枚举、`Project/MiniProject/Task`、`Focus/Now Work`；
  通用可推进卡片首屏只有一个状态结论，完整正式事实仍可展开；真实 reload 与
  1000×720/724×720 HISTORICAL 证据通过；
- [x] 信息不足时承认不知道；Task 无可靠正文、Project 证据不足和 Context Recovery
  业务 unknown 均有机器合同与真实 Provider 证据；
- [x] 下一动作资格有效；只能使用服务端白名单动作，target/version 不匹配
  时不可点击；
- [x] Block 标记不干扰阅读/编辑；真实宿主证明官方 slot 会替换正文，生产
  Runtime/CSS/setting 已删除并默认 OFF，不用 DOM hack 绕过；
- [x] Project/Task 重入在首发边界有效；Project workspace/Context Recovery 有真实 Desktop，
  Task Now consumer 已覆盖 owner/Anchor/receipt-backed CREATE interruption，投影失效时 fail closed；
- [x] Project 继续工作首屏只有一个明显主操作和一个 Context Recovery 次操作；其他进入点、
  调整项目与加入关注折叠，普通路径不再解释正式投影或第二摘要；真实 Dark 1001×720 /
  726×720 reload 通过；
- [x] Project 重入的失联正文失败态使用用户语言；真实 reload 后明确“正式事项未修改”和
  “去系统状态重新连接”，普通路径不暴露 `Anchor / 对象 / 运行时`，且没有执行正式写入；
  此项只验收失败态表达，不代表 Project/Task 重入整体完成；
- [x] LLM 输出事实/推断/未知分离；机器 fact/action/provenance/risk/review 契约、
  server-owned Project recovery、Plugin 分区显示/只读动作重验自动 PASS；
  `recover-context@1.3.0` 已完成真实 DeepSeek、error/rejection/stale、feedback、reload、
  Dark/Light/窄栏和零正式写入 Desktop Gate；
- [x] 默认日志不含完整正文；P1-H 专用事件、Plugin StructuredLogger/Runtime Diagnostics
  与 Service daemon output 已用 strict allowlist 排除正文、Prompt、原始响应、路径与异常
  message/stack/cause；CLI 为主动前台反馈，live/golden 为默认关闭研究 Gate；
- [x] session disposition 可撤回且不扩大权限；五种反馈、版本汇总、opaque handle 脱敏、
  `DO_NOT_REPEAT` Provider 前抑制与零正式写入已通过自动及真实 DeepSeek/Service Gate；
- [x] 首发已开放范围的噪声可接受；一对象一主问题、session-only disposition、
  reload 重算和自动失效通过；未取得真实噪声门的类型一律不开放。

## 4. P2 验收

- [x] MiniProject Grill Me 当前纵向 Slice 非模板化；真实 DeepSeek 四轮按 boundary/outcome/
  completion/material disposition 自适应收敛，Validator rejection 可安全重试，5/5 canonical
  材料进入最终阅读预览并完成正式链；跨场景质量继续纳入后续验收；
- [x] Project 所有创建入口经过自适应 Grill Me；Blank/Page/MiniProject creation subject、
  source evidence 边界及 internal closure/current interface readiness、Preview 与
  server-owned 单组 HIGH Proposal/Review 自动合同 PASS；Blank 真实 Provider turn/preview
  和完整正式 Desktop 链 PASS；Page preserve/dedicated 真实 Provider 与正式 Desktop 链
  bounded PASS；Page reuse 也完成真实 Provider 与正式 Desktop 链；MiniProject 真实
  Provider、来源关系、HIGH Review/Commit/reload/Undo/来源返回均已闭环；
- [x] 原位重构当前纵向 Slice 零丢失；原 UUID/正文守恒、0 delete、Undo 后父级与顺序恢复；
- [x] 原位结构宿主能力有界通过；同一会话内 custom UUID、语义正文与 A/B/C 顺序经过
  move-first-child/restore-after-sibling 保持，Page runtime UUID 跨 reload 限制已明确转入 Rebind；
- [x] 预览为最终阅读效果；identity property 已从 canonical 用户材料剥离；
- [x] 当前纵向 Slice 一次 Commit + Undo；8-step forward/inverse、真实 divergence Recovery、
  reload、recent-changes 折叠和返回根 Block Desktop PASS；
- [x] Closure 从证据起草；只读 evidence model、Service route、Plugin preview 及真实
  Desktop reload/recompute 已覆盖正式 Project interface、直接 Ownership、unknown 和用户
  判断边界，并证明零 Proposal/Commit；Provider preflight/exact scope/one HIGH group 已自动
  PASS，脱敏 real Flash model-contract 也通过 machine grounding；公共 route 已支持版本
  绑定的 session-only 用户判断并自动生成 PENDING/HIGH Proposal，同时保持零 Commit/正式写入；
  更新后的真实 Flash Gate 不再伪造 Decision Ownership，用户确认内容逐字守恒。Plugin 用户
  判断入口、busy/error/stale 保留输入和进入既有 HIGH Review 已自动覆盖；正常主链已用
  真实 DeepSeek 完成用户判断、loading、HIGH Review、正式 Commit、专用 Undo、reload 与
  Project 重入，回读 `OPEN v13`、Closure absent、forward UNDONE、inverse COMPLETED。
  `6f7f9a857be9` 又完成 receipt-backed post-domain 中断：HTTP 500 后同一 Commit
  `PENDING`，reload 后只继续原 Commit，完成后 Project 仍为 v20；专用 Undo 与再次 reload
  回到 `OPEN v21`、Closure absent、forward UNDONE、inverse COMPLETED、异常 Commit
  `0/0/0`。`7727770` 又完成 Provider error 保留判断/零写入/单一重试 Desktop Gate；
  `662246a` 随后完成真实 DeepSeek 延迟 generation stale、Condition Undo 与 reload 健康
  Gate。`98df827` 又覆盖写入前 generic failure→FAILED→restart→re-initiate、version
  race→STALE、矛盾 receipt fail closed 和 FAILED/STALE 用户卡。Closure 唯一 Domain
  step 在写入前失败时没有需补偿步骤，因此不人为进入 `RECOVERY_REQUIRED`；PENDING
  receipt resume 与多步骤 Recovery Kernel 保持原合同。本项按
  `DONE_BOUNDED_RECOVERY_CONCLUSION` 勾选，FAILED/STALE 卡不冒充 Desktop 故障注入；
- [x] 跨对象候选在 Shadow 发布边界内有证据和数量上限；结构化 2–16 evidence、
  2–8 subject、每轮 8 条上限与
  exact scope/provenance 已自动 PASS；首批真实 DeepSeek 3 observation + 2 abstention 质量门
  三轮累计 `15/15` case-runs PASS；semantic Context fingerprint 已证明时间刷新稳定、
  语义/evidence 变化 stale。由于尚无真实业务反馈，前台继续默认关闭；
- [x] LLM 不改变 Ownership/Focus；P2-F shadow 合同已拒绝 operation/自由文本并强制
  `INFERENCE/SHADOW/NONE`；Provider 不能生成 confidence，Association/Ownership 由机器
  固定 LOW，其他当前 kind 固定 MEDIUM；因为用户确认链尚未建立，该能力
  不进入前台，也不构成写入权威；
- [x] Recovery 继续原 Commit；Project Closure receipt-backed 中断在 Desktop 上保持同一
  `PENDING` Commit，reload 后从原 Review 续跑，不重复 Domain 写入、不创建平行 Commit；
- [x] Rebind 常规主链不展示 UUID 列表；ready preview/success HTML 与 select value 已
  identity-free，5 分钟有界捕获窗口解决自动 materialization 竞态；既有正式 Rebind 安全链
  保持。当前 commit `344c705ec446` 已真实 Desktop 完成 capture→Preview→Submit→reload，
  Service 回读旧 Anchor replaced、新 Anchor active，正式对象没有重复创建；
- [x] Rebind 纠错/Undo 指引不复活 missing/conflict 旧 Anchor：自动 Gate 已把选错正文路由
  到新一轮受控 Rebind，把整库回退路由到 Backup/Restore，并明确不删除事项或旧历史；
  `075e031` 真实 Desktop 完成有界 Preview→正式 Rebind→成功指引→reload→健康；同一
  构建还证明取消捕获会在恢复前重读当前 Block，已删除候选在取消后与 reload 后均为
  零正式对象。focused 新增 `3/3`、Plugin `360/360`、root PASS，最终
  Pending/Recovery/Source Conflict `0/0/0`；
- [x] Restore/Migration 复用唯一安全链；Restore 已自动证明服务端有界目录、session token、
  再校验、单独确认、PENDING/reconciliation preflight、既有原子 Restore/Service 自停/
  Launcher 重连接线，Plugin `288/288` PASS；`6ae8f2fcebd0` 已真实 Desktop 证明未确认
  零请求、恢复点、owned Service 重启、reload 目录 `2→3`、READY/`0/0/0` 和无陈旧错误；
  同一 Task 又完成 `ACTIONABLE v5↔PAUSED v6` 的旧快照/自动恢复点正反往返并最终恢复
  原基线。Migration ledger 已把内部状态翻译为用户阶段并隐藏 run/hash/backup identity；
  受控文件选择与 session-only `/migration/scan` 也已自动 PASS，前台只见五类计数。
  `15b976d28ec3` 已真实 Desktop 证明文件选择、2 项分类、放弃、reload 清空、非法 JSON
  重试及最终 READY/`0/0/0`；其后 `c660f2d` 又完成逐项有界阅读、两项决定、
  正式 Validator、PREVIEWED 计划创建与 reload。其后 `593d14a` 又完成同材料/计划/scope
  只读重验、1～50 项范围、恢复点 PASS、独立 HIGH Import、Verify、完整 Logseq restart、
  受保护 HIGH Undo 与第二次 restart。SQLite formal objects `4→5→4`、run
  `PREVIEWED→IMPORTING→VERIFIED→PREVIEWED`、batch
  `IMPORTED→VERIFIED→UNDONE`、Pending 始终 0；完整正文与 run/batch/object/backup
  identity/hash/key 未进入 UI/DOM/日志。恢复点/Import/Verify/Undo 正常主链 DONE。
  `f42b62d` 又真实完成计划原恢复基线复用、Import、Verify、独立 HIGH Activation、缺确认
  零写入与完整 Logseq restart；run=`ACTIVATED`、objects=5、Pending 0，旧 UNDONE 和新
  VERIFIED batch 保留，reload 后 V1 只读且无 Import/Undo/Activate。Activation 正常主链
  DONE；`2beb1b5` 又在完整 restart 后证明 ACTIVATED 页面只保留只读交接台账和
  Backup/Restore 路由，新 scan/Review/Import/Undo/Activate 全部退出。Restore 方面，
  `94038e6`/`0c4526d` 又完成激活失败后的原库自动回滚、恢复点保留、单一用户层结论与
  reload：真实文件级写入拒绝后 objects 仍为 5、版本 `[1,5,6,13,14]`，新增恢复点
  schema 12 / integrity ok / foreign-key 0，Service PID `99248→99711`，Doctor PASS，
  HISTORICAL `p2-g-44`～`46`。受控人工恢复 Desktop 已由后述 `p2-g-47`～`50` 补齐；
  真实连续双重故障又由 `fe0b590034ac` 的 `p2-g-55`～`59` 完成候选激活失败→自动回滚
  失败→无需 reload 出现人工恢复→HIGH 确认→Doctor/清锁→正常 Launcher/reload。活动库
  `7→6→7`，最终 Anchor conflict/Pending/Recovery `0/0/0`，database authority 未替换。
  Migration Import 写后响应丢失已由后述 `f17f46a` Gate 关闭；Verify/Activate failure
  与窄栏后续均已完成 Desktop Gate。File Graph 真实 host Light 保持 bounded host
  limitation，不影响同一 Restore/Migration 安全链的发布结论。
  `2eb6df1` 已以自动测试补齐
  Restore admission drain、Launcher single-spawn、`ARMED→RECOVERY_REQUIRED`、
  mutation lock/no-clobber/compare-and-clear、损坏与权限异常独立 fail-closed 叙述，以及
  “先恢复匹配恢复点并 Doctor PASS、后清锁”的双重失败合同；该项当时仍缺执行链与真实
  Desktop。`e418c87` 又关闭同目录多数据库互锁串扰与 Launcher
  last-release/ensure 双 Service 竞态；`cb87d86` 关闭 interlock read TOCTOU 与过期
  lease 排队期间 heartbeat 误删，不据此升级 P2-G；`23ae7bd` 将现有互锁以
  无路径/Backup identity 的严格响应投影到用户系统状态。`4c71af1` 又复用同一
  per-Graph lifecycle gate、离线 Restore、Doctor 和互锁，把独立 HIGH 确认接成受控 one-shot
  手工恢复；任何失败都保留锁，只有恢复点与 Graph 重验、恢复和 Doctor 全部通过才清锁。
  Launcher `29/29`、Local Service `160/160`、Service Client `13/13`、Plugin `328/328`、
  Shared `9/9` 和根级检查 PASS。`16bde9ad88a5` 又以受控 `RECOVERY_REQUIRED` 前置条件完成
  用户状态、独立 HIGH Review、恢复、Doctor、清锁、Service 重连与完整 Logseq restart；
  正式基线、安全快照和 `READY/0/0/0` 均有结构化读回。该项当时为
  `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`。`fe0b590034ac`
  随后用专用故障 Launcher 真实触发两段异常并关闭 no-reload 人工恢复入口缺口，最终
  `RESTORE_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE`；没有新增恢复状态、入口或写入权威；
- [x] Migration Import 写后响应丢失可从正式 ledger 续作：`f17f46a` 的 test-only
  `afterMigrationImport` 自动证明原子写入、幂等 replay 和后续 Verify；真实 Desktop 又证明
  UI 不猜测结果、要求“先以台账为准”，reload 后从同一 `IMPORTED` batch 重建 Verify，
  Verify 后复用既有 HIGH Undo。隔离库 objects `4→5→4`，run/batch 最终
  `PREVIEWED/UNDONE`，SemanticCommit `PENDING/RECOVERY_REQUIRED=0/0`；正常 7 对象
  authority 与 LaunchAgent 已恢复。该勾选仅关闭 post-write response-loss / interruption
  代表子 Gate，不代表 Migration Verify/Activate failure 或 P2-G 整体完成；
- [x] Migration Verify/Activate 失败链完成 Desktop Gate：`df5d2ea` 已自动证明事务前失败
  不产生半状态，并在同一正式 ledger 上完成 Verify/Activate 重试；真实 Logseq 0.10.15
  又在隔离数据库上完成 `Verify failure → retry → Activate failure → retry → reload`，
  Verify 失败保持 `IMPORTING/IMPORTED`，Activate 失败保持 `VERIFIED/VERIFIED`，
  最终 run `ACTIVATED`、新 batch `VERIFIED`、Pending/Recovery
  `0/0`。当前 `e2361599fbc9` 精确构建 reload 后只显示“V2 已启用”和只读历史；
  正常 Launcher、Service 与原 authority 已恢复。该勾选只关闭失败→原 ledger 重试
  Desktop 子 Gate；`7fcdcf5` 又在 `722×720` 完成只读完成态窄栏 Gate。浅色模式在
  Logseq 0.10.15 File Graph 完整 Reload 和完整 quit/reopen 后仍恢复深色宿主，因此记为
  bounded host limitation，不伪报 Light PASS；退出后旧 Service 按 lease 停止，重开后
  同一 Launcher 启动新 Service 且正式能力自动恢复。Rebind 指引已由
  `075e031` 的真实成功、纠错、取消与 reload 链关闭；
- [x] 首发开放的高影响流程均可恢复；有 inverse 的流程经 Undo，多步不一致经
  `RECOVERY_REQUIRED` 补偿，Rebind 不使用会复活旧失效正文的伪 inverse，无安全
  inverse 的能力保持关闭；
- [x] Project 结构操作按影响给摩擦；16 类 A/B/C/D router 与 LIGHT Condition durable Undo 已完成，
  MEDIUM 当前摘要完整 Desktop 纵向链与一条 HEAVY 完整当前接口 Desktop 链已 PASS，
  Ownership/Closure 不降级已有自动证据；Association/Project due 已安全禁用；
  `8d24569` 已完成一条共享 C 类 Context→Preview→正式 Commit→reload→Undo/
  Recovery→reload 产品链，不为每种结构操作新建 Runtime；

P2-C 专项证据：Application `155/155`、Local Service `133/133`、Plugin `271/271` 与根级
`./scripts/check.sh` PASS。Blank 已验证
properties Block、PENDING/Recovery、专用 Undo、Page name 删除与 reload 健康。Page
preserve/dedicated 又验证三段来源正文守恒、完整 restart identity 漂移、Service 账本 +
metadata-only 精确重绑、inverse Undo 与冷启动 reconciliation 收敛。HISTORICAL 截图
`p2-c-18`～`p2-c-20` 对应 `913bbda4528f`。Page reuse 又验证零 Page write、restart 与
Undo 前后 Page/Block 逐字段相同，HISTORICAL 截图 `p2-c-21`～`p2-c-24`；`p2-c-01`～
`p2-c-17` 均按 commit 一致性登记为 HISTORICAL/SUPERSEDED，不作为当前 UI 权威。
MiniProject 演化当前使用 `project-creation-modeling@1.6.0` 验证来源 Object/Anchor/子树边界、
五项 `LINK_AS_SOURCE`、HIGH Review、专用 Page 创建、reload 重入和 inverse Undo。来源
UUID/正文/顺序守恒，目标 Project/Anchor/专用 Page 撤销；`p2-c-38`/`p2-c-39` 对应
`7a7492a407ed`，证明精确返回原根 Block及再次 reload 后 READY、`0/0/0`。旧的 Journal
返回截图已标为 SUPERSEDED。`2adfc35` / `efb3864` 已补 Preview / HIGH Review 的
Light/窄栏代表证据；新 Project Page 后由 `bfabf40` 关闭，freeze 构建的
create→reload→Undo→reload 又由 `1549728` 复验。其他未选择的宿主组合按代表矩阵
有界关闭，不扩成笛卡尔积；P2 的完成仍由本节全部 Slice 证据共同决定。

## 4.1 当前 UI 压缩验收（`f4acf77` / `7727770` / `662246a` / `cda4f95` / `2adfc35` / `efb3864`）

| 页面 | 主结论清晰度 | 主操作清晰度 | 心智负担 | 工程词泄漏 | 当前状态 |
|---|---:|---:|---:|---:|---|
| 普通 Page 操作 | 高 | 高 | 中→低 | Anchor/SQLite/Graph/版本枚举移出普通路径 | DESKTOP_VERIFIED Dark 1001×720 (`869127f`) |
| Project Page 操作 | 高 | 高 | 中→低 | Page/HIGH Proposal/正式对象工作区移出普通路径；受控身份冲突 fail closed | DESKTOP_VERIFIED Dark 1001×720 (`869127f`) |
| 现在 | 高 | 高 | 中→低 | 测试 Project 正文仍可含工程词；系统控件已折叠 | DESKTOP_VERIFIED Light/Dark |
| 待整理 | 高 | 高 | 低 | 普通控件 0；完整技术事实未显示 | DESKTOP_VERIFIED 751×720 |
| 待审阅 | 高 | 高 | 高→低 | 当前问题与历史分离；空态不再把 legacy Agent flag 误写成 Copilot 不可用 | DESKTOP_VERIFIED 751×720 + Dark 1000×720 (`cd59228`) |
| Project 意图路由 | 高 | 高 | 高→中 | LIGHT/MEDIUM/HEAVY 不出首屏 | DESKTOP_VERIFIED 751×720 |
| Project Creation Preview | 高 | 高 | 高→中低 | 四区首屏；来源材料、机器依据和内部分类折叠 | DESKTOP_VERIFIED Dark 1000×720 + 762×720 |
| Project Creation HIGH Review | 高 | 高 | 高→中低 | 影响和安全边界优先；系统理解只保留两句，完整方案与内部状态折叠；标准宽度全宽、窄栏单列 | DESKTOP_VERIFIED Dark/Light 1000×720 + Dark 762×720 (`efb3864`) |
| Closure Step 1 | 高 | 高 | 高→中 | 逐目标原始依据与完整依据默认折叠 | DESKTOP_VERIFIED Light/Dark/窄栏 |
| Closure Provider error | 高 | 高 | 高→低 | Provider/Proposal/Commit 不出普通错误态 | DESKTOP_VERIFIED Light 1000×720 |
| Closure HIGH Review | 高 | 高 | 高→中低 | `Closure Proposal` 已移出普通标题；模型长说明折叠；首屏只显示结构化结论、影响和安全边界 | DESKTOP_VERIFIED Dark 1000×720 (`cda4f95`) |
| Closure 应用 / reload / Undo | 高 | 高 | 高→低 | 审阅与应用分层；结果卡、最近修改和 Undo 使用业务结论，工程词折叠 | DESKTOP_VERIFIED Light 1000×720 (`f18cc72` / `7fe762d`) |
| 通用插件壳层 | 高 | 高 | 中→低 | Dark 语义 token 完整；custom.css 不一致时只暴露“界面外观”，不暴露主题探测机制 | DESKTOP_VERIFIED Dark 1001×720 + 723×720 + reload (`d7526f4`) |

验收边界：本表只关闭当前信息架构和代表性主题/宽度 Gate；generation stale 由独立真实
运行闭环。`98df827` 的自动故障注入证明写入前失败零正式变化并终止、receipt-backed
PENDING 继续原 Commit；Closure 单一原子 Domain step 不制造 `RECOVERY_REQUIRED`。
该状态仍只用于多步骤操作补偿收口。P2-E 因而以有界 Kernel 结论关闭，但不得据此把
P0/P1/P2 或 Final Release 标为 DONE。

## 5. 操作距离指标

| 场景 | 基线 | 目标 | 实测 |
|---|---:|---:|---:|
| Block 加 Focus | 离开正文→Now Work→找对象→操作 | 1 个现场动作 | 自动 + Desktop PASS；右键一次，原地反馈与读回一致 |
| 暂时做不了 | Now Work→状态表单→选择字段 | 2 个决定 | Desktop PASS：Block 右键→三选一→最小字段；空原因零写入；保存后回原 Block；Undo 与 reload 恢复“可以行动” |
| 普通 Block 整理 | 当前页 Candidate→Review→接受→Commit | 现场建议 + 1 次接受应用 | 右键按精确 UUID 进入既有受控建议链；真实 abstain、用户语言、零写入和 LOW 应用/Undo PASS；Query/引用无可靠 identity 时安全隐藏 |
| 打开正文 | Now Work/Project 找卡片 | 1 个动作 | Now、Project 和来源移动后按 UUID 返回均为 Desktop PASS；来源删除时安全停止 |
| Project 重入 | 独立重入 workspace | Page 顶部 1 个动作 | Project workspace + Context Recovery Dark 主链 Desktop PASS；Logseq 0.10.15 File Graph 不挂载 Page Head slot，安全隐藏为 bounded；DB Graph Page Head 未作为首发宿主声明，不阻断 File Graph 产品入口；current-interface 复用 HIGH Proposal |
| Service 恢复 | 终端 + descriptor + reload | 1 个产品入口 | descriptor 私有导入、Launcher、hidden reload、owned shutdown、crash recovery、Graph switch 与切回均为 Desktop/Process PASS |

## 6. 发布否决条件

以下任一出现即不得宣布阶段完成：

- 原文可能静默丢失；
- 失败后用户误以为已应用；
- accepted-not-applied 无持续入口；
- LLM 自动改变 Focus/Ownership；
- context/Block 标记严重干扰正文；
- Service 仍要求日常终端操作；
- Recovery 重复 Commit；
- Graph mismatch 仍可写入；
- 默认日志保存完整正文或 Key；
- Project 创建变固定大问卷；
- “现在”展示所有 OPEN；
- 技术状态机重新进入日常首屏；
- 只有自动测试，没有真实 Desktop 证据。

## 7. 最终交付清单

- [x] 可运行代码；r8 稳定路径已安装并在 Logseq `0.10.15` 加载；
- [x] 自动测试；根级 typecheck/lint/test/build、145 rules、恢复演练与仓库边界 PASS；
- [x] 真实操作截图；`current-ui/SCREENSHOT_INDEX.md` 区分 HISTORICAL/HISTORICAL/
  SUPERSEDED/PROTOTYPE，r8 当前截图与 exact build 一致；
- [x] 设计到代码映射；
- [x] P0-A 自动测试、真实 Desktop Focus/Undo 与 Local Service 读回证据；
- [x] P0-H descriptor 私有导入、失败边界与 reload READY 证据；`e8db32f` 又完成最新用户语言的
  安全结束、立即只读、重新启动与健康读回，结束期间无知识库不匹配闪烁；`ca50304`
  又关闭未配置 Graph 立即受限、旧 Project 不可见、6 秒保持和切回原 authority Gate；
  同一 Graph 重装现默认保留既有 database authority，真实发现的静默路径替换已修复并由
  Launcher 29/29 回归覆盖；当前构建的真实无参数重装也已证明 graphKey/path/inode 与
  `7/24/12` 正式计数保持；显式数据库迁移仍必须由用户明确给出路径；
- [x] P0-B 三种 Condition、失败零写入、Focus 不变、Undo 和 reload 证据；
- [x] P0-C LOW 白名单、连续 Review/revalidate/Commit、busy/stale/transport 与真实 Desktop Undo 证据；
- [x] P0-D 普通/Project/Journal Page 路由、UUID/Anchor 重验、Project create/reentry 与
  sidebar 共存证据；
- [x] P0-E 四项主导航、Project/Objects 与 More/Audit/Migration/Diagnostics 可达性及四张
  脱敏 Desktop 截图；`4dfe014` 又以最新 Dark Desktop 证明高频壳层不再显示重复运行组件条；
- [x] P0-F 介入计数/噪声排除/Recovery 优先级自动覆盖，以及安静态、正式连接风险 `TC ①`、
  诊断路由和恢复后安静态的两张脱敏 Desktop 截图；
- [x] P2-D Release 边界已完成证据化分类并由 `3c83856` 固化；Focus/reviewAt 复用现有
  Condition/Focus 逆向合同，Association/Project due 明确不开放。外部 Agent 结构操作
  已由 `8d24569` 完成一条共享 Context→Preview→正式 Commit→reload→Undo→reload 代表链；
- [x] P0-G 用户层状态翻译、inverse 折叠、专用 Undo 路由、折叠技术详情，以及 LOW 应用→
  即时结果→跨 reload 长期 Undo→Graph/SQLite 恢复的四张脱敏 Desktop 截图；
- [x] P0-I 五个用户问题、Provider 非故障降级、安全优先级、Pending/Recovery 分离和
  默认折叠工程诊断，以及真实 Desktop 注意/停服受限状态的两张脱敏截图；`4dfe014` 的健康
  系统状态又证明用户层工程词扫描为 0、精确版本只在主动展开的技术诊断中；
- [x] P1-G Project Context Recovery：`653875a` 已验证确定性基线、真实 DeepSeek 内容、
  真实业务 unknown、Provider error、Validator rejection、generation stale、分区显示、
  feedback、reload、Dark/Light/窄栏和零越权写入；stale evidence 为
  `STALE=1 / GENERATED=0`。`recover-context@1.3.0` 为
  `CANDIDATE/DESKTOP_VERIFIED`，不等于 Production；DB Graph Page Head 属 P1-F 宿主矩阵；
- [x] 连续使用 Pilot：`PILOT-2026W31-A` 已真实完成 Day 1—10 代表链；Day 1—2、
  Day 3 Waiting 子链与
  Day 4 MiniProject/Project create→reload→Undo；Day 5 又用 6 次真实 DeepSeek 暴露
  `currentInterface` 把页面显示要求误作业务推进的通用合同缺陷，并在 Preview 取消、
  零 Proposal/零正式写入。第二组 1.6.0 真实复验又用 6 次调用保留业务未知并生成可行动
  当前推进；第三组 6 次调用在 `19de8de0f47c` 完成最终 Preview、HIGH Review、Create、
  reload、Context Recovery、feedback clear、Undo 与健康复核；Day 6 Waiting 恢复、
  Day 7 稳定移动、Day 8 disposition/cooldown 与 Day 9 Closure 正常链也完成代表 Gate；
  Pilot 累计 33 次真实
  DeepSeek。普通笔记未被
  自动正式化，Now 未立即洪水，Page 来源超预算已安全解释，Project Undo 后精确构建
  0/0/0 且 explicit sync clean。`project-creation-modeling@1.6.0` 已达
  `CANDIDATE/DESKTOP_VERIFIED`。Day 10 已证明 Review 无积压、Now 仍偏长、Graph switch
  fail closed/return 正常。Day 7 duplicate/missing/Rebind、Dynamic Now 前台和
  Attention helpful/noise 仍开放；Closure 的有界失败合同随后由 `98df827` 关闭。这些
  明确变体留在对应 P1/P2 Gate，不反向打开十日代表 Pilot；
- [x] P0/P1/P2 完成报告；本文与 `09_PROGRESS_REPORT.md` 分开记录实现、自动、
  Desktop、Shadow 与 bounded host limitation；
- [x] 已知限制；`12_RELEASE_FREEZE_CHECKLIST.md` 和 `13_RELEASE_RUNBOOK.md` 列出首发
  默认关闭能力、File Graph 宿主边界与 SDK advisory；
- [x] 恢复和升级说明；`13_RELEASE_RUNBOOK.md` 覆盖安装、升级、启动、关闭、
  Rebind/Restore/Migration、诊断与安全卸载；
- [x] 用户层操作说明；`current-ui/GOLDEN_FLOWS.md` 与 `CURRENT_UI_MAP.md` 使用
  用户语言记录当前入口、主操作、退出安全性和返回现场；
- [x] 技术层维护说明；`13_RELEASE_RUNBOOK.md`、当前 ADR、Doctor/Backup/Restore 运行文档
  与 Service/Launcher 证据构成唯一维护路径；
- [x] 交互日志与 Skill 版本说明；`logs/`、P1-H 严格允许列表、Skill catalog/hash 和
  CANDIDATE/RETIRED 台账已有当前证据；
- [x] 未完成项和原因；研究能力已明确分为 Shadow/OFF/Future enhancement/bounded host
  limitation，不保留模糊 Partial；
- [x] 后续建议；Freeze 后只继续有界自然日用、上游 SDK 复评和真实回归，
  不新增平行 Runtime/状态/恢复体系。

最终报告必须分别列出：已真实实现、已自动测试、已 Desktop 验证、仅原型、仅设计、被阻塞、超出范围。
