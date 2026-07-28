# V2 当前实施状态

## 交互优化 Goal（2026-07-23）

V2 v1.1 底座完成结论不变；当前继续按
`docs/implementation/task-copilot-v2-ux/02_IMPLEMENTATION_ROADMAP.md` 推进交互优化 P0→P1→P2。

```yaml
base_v2_status: IMPLEMENTATION_COMPLETE
ux_productization_goal: IN_PROGRESS
p0_status: IN_PROGRESS_DESKTOP_GATES
p1_status: IN_PROGRESS_P1G_DONE_OTHER_P1_PARTIAL
p2_status: IN_PROGRESS_P2_AB_DONE_P2C_ALL_SOURCES_DONE_P2D_LIGHT_CONDITION_MEDIUM_HEAVY_CORE_DONE_P2E_MAIN_CHAIN_COMMIT_RESUME_PROVIDER_ERROR_AND_STALE_DESKTOP_DONE_RECOVERY_GATE_OPEN_P2F_SHADOW_PROVIDER_REPEAT_PASS_P2G_MIGRATION_RESPONSE_LOSS_RECOVERY_DESKTOP_DONE_RESTORE_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE
overall_goal: IN_PROGRESS
```

这里的 `V2_IMPLEMENTATION_COMPLETE` 只指领域、事务、安全、迁移、Provider 与恢复底座；
它不包含 P0/P1/P2 的交互优化和产品化验收，也不得被解释为完整 Goal 完成。

连续使用 Pilot `PILOT-2026W31-A` 已推进到 Day 5 完整代表链：Day 1—4 的自然捕获、
Waiting、MiniProject 与 Project create→reload→Undo 证据保持；Day 5 使用同一 Graylog
材料重新运行 5 轮真实 DeepSeek Grill 与 1 次 Preview 时，发现
`current-interface` 被误解释为“重入页面应显示什么”，并被 Validator 接受为业务当前推进。
本次 Preview 在进入 Proposal 前取消，正式写入、Proposal 与恢复分支均为 `0`。该失败推动
`project-creation-modeling@1.6.0` 将 `current-interface` 统一定义为一项可继续的真实工作，
Grill uncertainty、Provider 输出合同与 Application Validator 共用同一语义；1.5.0 退休，
不保留平行 active 版本。`f7a5252` 已用第二组 5 轮真实 Grill + 1 次 Preview 证明业务未知
仍被保留，当前推进正确落到“采集第一条华为 iBMC 原始 syslog”；同时真实 Preview 暴露
固定渲染句式的“当前先从先确认……继续”重复。`19de8de0f47c` 已用第三组 5 轮真实
Grill + 1 次 Preview 复验“目标 / 当前推进”两行，并继续完成 HIGH Review、正式创建、
真实插件 reload、Project 重入、真实 Context Recovery、用户反馈、再次 reload、Undo 与
健康复核。Context Recovery 没有把本次草稿或反馈误作业务未知；对刚创建且证据较少的
Project，AI 增量准确但有限，主要价值是压缩为一个可行动入口。真实 reload 后 session
草稿与反馈清除、正式 Project 保持；Undo 删除专用空白 Page 并返回 Logseq 现场，成功消息
不再泄漏 Project/Anchor/Audit/Commit，随后 Pending/Recovery/Source Conflict `0/0/0`、
explicit sync clean。Pilot 累计真实 Provider `32` 次，Validator rejection/retry/abstention
仍为 `0/0/0`。`project-creation-modeling@1.6.0` 可标记
`CANDIDATE/DESKTOP_VERIFIED`，不能因单条成功升为 Production。

此前 Day 4 代表链中，自然材料形成听云 MiniProject，
Graylog Project 经真实 DeepSeek 自适应 Grill、Preview、HIGH Review、正式创建、reload、
Project Page 重入和 Undo；精确构建 `42e6a91309ba` reload 后
Pending/Recovery/Source Conflict `0/0/0`、explicit sync clean。长 Page 来源超过有界预算
时的用户表达已修复为可行动范围说明，不再伪装 Provider 失败或提供无效 Retry。该轮累计
真实 Provider 14 次；加上 Day 5 三组各 6 次失败驱动复验，Pilot 累计 32 次，并暴露重复确认、
无依据模型建议、结果/历史墙、Undo 资格矛盾及成功
消息工程词。`7a0b444821b7` 已在最新 Desktop 关闭撤销资格/按钮矛盾，并自动压缩
Project Undo 成功消息；`19de8de0f47c` 已完成真实 Undo 复验。精确构建系统
Pending/Recovery/Source Conflict `0/0/0`、explicit sync clean。创建完成卡仍显示
“正式 Commit 已完整完成”并复制较长最终阅读，重复确认、结果/历史墙仍
阻断 Final Release。Day 5—10、Dynamic Now、Attention helpful/noise、
P2-D 完成边界与 P2-E/P2-G 尾项继续 OPEN，整体 Goal 仍为 `IN_PROGRESS`。

最新 P0-K 精确构建 `73dc1e26f610` 完成正式 Block “暂时做不了”的当前 Desktop 返回现场
Gate：Query 投影无可靠正式身份时安全停止且只显示用户语言；正式测试任务完成三意图入口、
空原因失败零写入、保存后返回同一 Block、会话 Undo、reload 后恢复“可以行动”。真实运行
首次发现旧错误仍泄漏 `Block / active Primary Anchor`，同轮将所有 Block identity 失败
翻译为用户结果并加入回归；同一入口在 727×720 窄栏保持主结论和三个意图可见。Plugin
`347/347`、typecheck/build PASS；没有新增正式状态、
Runtime、Skill、Validator、恢复分支或写入路径。该证据与既有 main Page、来源移动/删除、
Query/reference/right-sidebar bounded Gate 合并后，P0-K 升为
`DONE_DESKTOP_REPRESENTATIVE`；P0-J 中文 IME/受限视觉仍使 P0 保持进行中。

最新公共 UI 压缩证据基于 `f4acf77346b19aa2f096ff2c169bfa7323546062`；
Closure 异常、Review 压缩、普通用户标题与审阅空态的增量证据分别基于
`77277704d901`、`662246a298ac`、`cda4f95` 和 `cd59228`：
真实 Logseq 0.10.15 已验证“现在”卡片单一主动作、当前待审阅与 13 条历史记录分离、
Project 用户意图路由、Closure 首屏安全结论，以及 1000×720 Light/Dark 和 751×720
窄栏。Closure 的逐目标原始依据默认折叠；Provider error 只显示“没有完成、项目和正文
未变化、稍后重试”，并保留用户输入；真实 Provider 成功后的 Review 不再把模型长报告
复制到首屏，而从已验证结构生成一句结果与未完成目标数量；`cda4f95` 又把
`Closure Proposal` 标题收敛为“结束项目”。完整依据仍可展开，事实本身未改写。该 UI
Gate 后真实拒绝 Proposal 又暴露空态错误声称“Agent 已关闭”；`cd59228` 改为按实际
Provider 可用性显示“可以整理当前页或从待整理继续”，不再把 legacy demo-agent flag
误写成 Copilot 状态。没有新增正式状态、Runtime、Skill、Validator、写入路径或恢复分支，
也不关闭 P0/P1/P2 的其余 Partial。

`f1d0e1f1cee9` 又基于最新真实 Desktop 的“现在”页完成一轮日常表面压缩：原先独立维护的
英文 `Project / MiniProject / Task` 和原始对象枚举，已与 Migration 共用同一中文对象标签；
通用 `ACTIONABLE` 叙述只在首屏保留“当前可以继续推进”，同一正式事实仍保留在折叠依据，
不再重复显示；`Focus / Now Work` 可见与无障碍语言改为“当前关注 / 现在”。Application
169/169、Plugin 343/343、根级检查、1000×720 与 724×720 Logseq 0.10.15 reload Gate
均通过。该变化没有新增正式状态、Runtime、Skill、Validator、恢复分支或写入路径，也没有
把仍开放的 Attention/Block Marker/宿主 Gate 伪装为完成。

`971c6db268f7` 又沿真实 Project 重入失败链压缩连接术语：当 Project 的原正文已无法解析时，
既有 fail-closed 行为、零正式写入和系统状态中的重新连接入口保持不变，普通错误不再暴露
`Anchor`、对象或 Logseq 运行时，而明确说明“原正文连接已不可用、正式事项未修改、请在系统
状态中重新连接正文”。Plugin 343/343、typecheck/build 和根级检查通过；真实 Logseq 0.10.15
在 1001×720、Plugin Dark / host Light 下 reload 后复现同一失联测试 Project，并确认当前
提示与代码一致。该 Gate 只关闭这条前台术语缺陷，不把 Project 重入、Rebind 或 P1/P2 其余
Partial 升级为 DONE。

`b605e18c21ce` 在不改变 Project 投影、Context Recovery、Proposal 或写入权威的前提下，
继续压缩 Project 首屏：用户入口改为“继续项目”，删除“同一正式投影 / 不保存第二摘要 /
Project 重入”等实现说明；每张卡首屏只保留“打开当前项目”主操作和“帮我恢复上下文”次
操作，调整项目、加入当前关注及其他进入点折叠到“更多操作”。Context Recovery 使用蓝色
信息语义，不再与绿色完成/安全语义混用。Plugin 343/343、typecheck/build、根级检查和
1001×720 / 726×720 真实 Logseq 0.10.15 reload Gate 均通过；没有调用 Provider、执行
正式写入或新增状态、Runtime、Skill、Validator、恢复分支。该 Gate 关闭 Project 重入首屏
按钮墙与工程说明缺陷，不把 P1/P2 其余 Partial 升级为 DONE。

`2adfc354041b` / `efb3864c53af` 又关闭 Project Creation Preview 与 HIGH Review 的代表性
UI Partial。真实 Page 来源链使用当前有界材料和真实 Provider 生成 Preview；普通首屏只保留
系统理解、应用影响、安全边界、下一步和折叠完整依据。进入“待我确认”只创建可审阅方案，
未创建 Project Page 或正式 Project；Review 首屏先显示变化与不变，再显示系统理解。
真实 762×720 首轮发现三列布局把系统理解压成窄长文本，随后又证明 840/1080 CSS 断点
在当前 Logseq 缩放下不能可靠触发；`7bd7811` 把系统理解压缩为两句可读结论并把完整方案
移入既有折叠依据，`efb3864` 最终以 1280 CSS 断点实现标准宽度两列影响 + 全宽理解、窄窗
单列，并在 Dark 1000×720、Dark 762×720、Light 1000×720 通过 reload 后 Desktop 复验。
真实 Provider 共 9 次显式流程调用、Validator 拒绝 0、
自动重试 0；发现一次已明确 Page 关系仍被重复提问，登记为既有 Skill 的质量债，不新增
样本 Prompt、Skill 版本或 Validator 分支。P2-C 整体仍为
`ALL_SOURCES_DONE_VISUAL_GATES_OPEN`，完整 Goal 仍为 `IN_PROGRESS`。

- P0-A 正式 Block Focus 现场入口：自动测试与真实 Logseq Desktop 的加入、移出、会话内 Undo、
  Local Service 读回均已通过；
- P0-B“暂时做不了”：三种用户意图、最小字段、失败零写入、Focus/Lifecycle 不变、会话内
  Undo 与 reload 读回均已通过；
- P0-C 低风险“接受并应用”：严格 LOW/单组/单 Block 白名单、连续
  accept→revalidate→SemanticCommit、busy 防重复、显式 stale/transport/recovery 结果与既有
  Undo 已通过自动和真实 Desktop；HIGH/Ownership/Closure/Lifecycle/Project structure 均不进入；
- P0-D Page 现场路由：普通 Page、Project Page 与 Journal 的单一原生入口、执行时 UUID/Anchor
  重验、page-scoped 正式事项、Project 创建后进入新 Page、取消/返回原现场均已通过；当前
  Logseq 0.10.15 不在右侧栏 `…` 暴露 Plugin Page menu item，secondary-page payload 仅由自动
  边界证明；
- P0-H Service 产品化：descriptor 私有 handshake 的既有 Desktop 证据保持；独立
  Launcher、LaunchAgent installer、Graph-bound lease/heartbeat、最后租约 owned shutdown、
  TTL、Service/Launcher crash recovery、owner-PID orphan self-stop、显式结束前恢复检查与
  Graph switch fail-closed 已完成自动和真实独立进程 Gate。当前专用 LaunchAgent 已安装并
  READY；真实 Logseq reload 已证明面板重开后自动恢复 READY，真实 quit 后 owned Service 在
  租约窗口内结束而 Launcher 保留。Logseq 隐藏 iframe 的早期 Graph API/timer 停顿也已改为
  non-blocking bootstrap + `onGraphAfterIndexed`/`onRouteChanged` 恢复；真实隐藏 reload 后
  不打开面板等待 25 秒，owned Service 仍由新 lease 保持，首次打开即 READY。`ca50304`
  又关闭 Graph switch 视觉与 authority Gate：真实未配置 Graph 首次出现时即为安全受限，
  6 秒后仍未显示旧 Project 或选择新数据库；切回原 Graph 约 3.75 秒恢复同一 Project 和
  明确的“不复用上一知识库数据”结论。Launcher 仍只有原 `logseq` 映射，graphKey/path
  digest 与 database inode 不变。P0-H 因而为 `DONE_DESKTOP_REPRESENTATIVE`；`4dfe014`
  又在真实 Logseq reload 后验证“更多”只显示本次使用与
  用户维护语义，不再向日常界面暴露 Launcher/Service/Commit/SQLite。真实重装又发现同一
  Graph 省略 `--database` 会把既有数据库 authority 静默换到默认路径；
  运行映射已立即恢复，安装器现优先保留同一 graphKey 的既有 databasePath，只有首次安装或
  用户显式给出新绝对路径才改变。Launcher 29/29 与根级 Gate 通过；`e8db32f` 进一步用当前
  Desktop 完成确认结束→安全只读→重新启动→系统健康链，修复主动结束误报知识库
  不匹配和 lease release 窗口错误闪烁；结束态只有一个主结论与重新启动动作，重启后
  formal writes true、`0/0/0`；
- P0-E 四项主导航：主入口已收束为“现在 / 待我确认 / 项目 / 更多”；Project
  列表/重入/当前接口/正式创建与 Audit/Recovery/Diagnostics/Backup/Restore/Migration
  均在二级入口继续可达，自动测试与真实 Desktop 下钻已通过；`4dfe014` 当前 Desktop 已
  移除高频壳层的 Runtime/Store/Graph 重复运行条；窄宽度和本轮键盘注入未虚报；
- P0-F 工具栏介入摘要：只从既有 Now Work/Proposal/SemanticCommit/连接投影派生到期复查、
  待确认、HIGH 已接受未应用、Pending/Recovery 和正式连接风险；OPEN/Focus/普通 WAITING/
  Project/Candidate 不计数。真实 Desktop 已通过安静态、连接风险 `TC ①`、诊断路由与连接
  恢复；`RECOVERY_REQUIRED ↻` 只按自动测试声明；
- P0-G 最近修改与用户层结果：既有 Proposal/SemanticCommit 已投影为用户意图、时间、
  “已应用/尚未完成/需要恢复/未能应用/已撤销”和安全动作；技术 ID 只进折叠详情，即时与长期
  结果共享实际 commit identity。真实 Desktop 已完成 LOW 应用、跨 reload 长期 Undo 与
  Graph/SQLite 恢复；PENDING/Recovery 新投影只按自动测试声明；
- P0-I 用户层系统状态：首屏固定回答发生了什么、影响、仍可用、数据安全和所需动作；
  Provider 未配置不误报故障，Pending 与 Recovery 分离，工程组件/原因码/日志/修复入口默认
  折叠。真实 Desktop 已验证正文核对注意状态与 Service unavailable 只读安全状态；
  `4dfe014` 又以最新健康态确认启动、知识库切换与系统状态均使用用户语言，工程身份只在
  主动展开的诊断层；恢复重连还必须确认正式修改可用，不能仅凭连接 READY 报告成功；
- P0-J 中文创建命令与快捷动作：四条 slash 只插入 canonical 显式正文语法，三条高频
  command palette 复用“现在”、Provider Proposal 与正式 Focus Controller；`a835f59`
  让这三项进入 Logseq 原生可配置快捷键但不设默认键。Plugin 329/329 与根级检查通过；
  真实 Desktop 已验证冷启动单组 palette、四条 Slash 可发现、`[任务] ` 代表插入、临时
  chord 配置/触发/清理和冷启动复验。原生中文 IME、受限态、Light/窄栏仍 OPEN；
- P0-K 完成后路由：Block/Page 来源只保存在 session token；main Page 按 UUID 重验返回，
  secondary Page 保持宿主现场，来源缺失安全关闭；自动 Gate 187/187 通过。真实 Desktop
  已验证 main Page 入口与返回同一 Page；Logseq 0.10.15 right-sidebar 菜单不提供 Plugin
  Page item，按宿主限制安全隐藏。`73fea9a` 又在脱敏专用页面确认 Query 投影只进入宿主
  页面预览、Block reference 只提供引用专用菜单，两者均无可靠 Plugin Block identity，
  因而安全隐藏并引导先打开来源 Block。`66850e6` 后的真实 Desktop 又验证同一 UUID
  移动后精确返回新位置，来源删除后关闭 Task Copilot、明确提示且不猜测其他目标；两次
  真实 Provider 均为一次请求的 `NO_PROPOSAL`，未产生正式写入。`73dc1e2` 又完成正式
  Block 三意图入口、空原因失败、保存、返回原 Block、Undo 与 reload 代表链；Query 无
  正式 identity 时安全降级且不再泄漏 Block/Anchor 工程词。P0-K 因而为
  `DONE_DESKTOP_REPRESENTATIVE`；`06b8762` 随后把普通 Block 分析的 abstain、成功、不可用、中断和失败提示
  压缩为用户语言，真实 Provider abstain 复验不再显示 Proposal/Provider/Commit/Store，
  仍为一次请求、零正式写入；`eba1c54` 又删除正常启动/host-ready 恢复的重复成功横幅，
  只保留持久 Copilot 状态；Graph switch 的 authority 隔离反馈继续保留；
- P0-A 普通 Block 内容路由：右键“处理这条内容”按 payload UUID 单次绑定，在 Provider 前
  重读同一 Block；missing/mismatch/空正文零请求、零写入；Plugin 191/191 自动 Gate 通过，
  普通 Block 已有自动 Gate；Query/引用/right-sidebar 的原地入口按当前 File Graph 宿主
  能力有界隐藏，不冒充精确支持；
- P1-A shadow-only 已进入 Plugin 会话运行：Application Attention Signal 纯派生模型与
  bounded session repository 覆盖失效、cooldown、provenance、capacity、clear 和 metrics；
  只接受 `SHADOW/NONE` 与机器引用/checksum，Plugin 只读刷新链路运行，Graph switch 清空，
  未接 UI/正式 Domain/SQLite。fresh-session recompute 已证明 active identity、scope 与当前
  count-only projection 可由正式 facts 等价重建；同证据刷新现在保留 session cooldown，
  evidence/rule policy 变化才解除。当前 shadow 因没有 shown/disposition 入口，不建 SQLite
  derivative；未来显现后的跨 reload 用户偏好价值仍需 Desktop 证据；
- P1-B 第一波确定性纯函数覆盖 reviewAt/due、accepted-not-applied、Pending/Recovery、
  Anchor missing/conflict 与 Graph mismatch；按数据/恢复风险优先合并为一对象一主问题，
  CREATE Proposal/未挂对象 Commit 以自身 subjectRef 保持真实身份；已接入 session-only
  runtime count telemetry，Application 82/82、Plugin 196/196 与根级 Gate 通过，仍未接 UI；
- P1-D 确定性状态翻译已接入 System、Proposal Review、最近修改与 Now Work：主结论/依据/事实/
  推断/未知/下一动作资格/evidence scope/source 分离；恢复只路由既有 Audit，Anchor
  只路由受控修复，完成 Commit 不擅自承诺 Undo；Now narration 必须匹配 Object version，
  到期复查只复用既有 Condition Handler；Anchor missing/conflict 已在用户层系统状态下显示
  有界问题卡，并复用既有 Rebind 预览、独立确认和提交前重校验链，正常/历史 Anchor 保持
  安静，Service 受限时不开放动作；Application 112/112、Plugin 213/213 通过，Desktop
  主题/窄栏与真实 repair Gate 仍待验证；
- P1-C `SHADOW` 动态 Now 已进入 Plugin count-only runtime 对照：继续处理只来自可行动 Focus，需要回看按
  blocker/review/due/Focus blocked 收敛，保持等待只含 Focus 中安静等待，普通 OPEN 不进入；
  复用 `/now-work.focus` 的过滤后顺序，不新增 API；Copilot 建议固定为空，Application
  98/98、Plugin 197/197 与根级 Gate 通过，未替换 Service/UI；
- P1-E Block 轻标记已进入默认关闭的生产包内 prototype：只对 SQLite active primary Anchor
  的精确 Block UUID 注册官方 `onBlockRendererSlotted`，通过宿主 slot 注入 LINE/DOT/ICON/
  TINT/PHRASE 五种无动作标记；不写正文、不用 renderer 宏、不扫描 DOM，Service 受限、Graph
  switch、设置关闭与 unload 均清理 slot。Plugin 231/231、100 Block harness PASS；真实编辑态、
  TODO/DONE、Query/引用、sidebar、Zoom、Light/Dark 和性能 Desktop Gate 仍开放，未全局发布；
- P1-F Project/Task 重入投影已接入 Project workspace：恢复风险优先，Project 只保留最多
  三个 Focus 直属进入点，普通 Association 不升级为动作；新 Project 与无正文 Task 会明确
  承认进入点不足；Project 主 Page 顶部新增一个只读“继续项目”宿主动作，点击时重验当前
  Page UUID、唯一 active Project Page Anchor 与 Object version，再只打开该 Project 的同一
  重入投影；Page Head hook 不提供页面 payload，因此右侧栏入口明确隐藏，不伪装成精确现场；
  真实 Logseq 0.10.15 File Graph 又确认 host 只在 DB Graph/LSP 分支挂载
  `page-head-actions-slotted`，所以 File Graph Page Head 安全隐藏属于 `BOUNDED_HOST_LIMIT`，
  Project workspace 的真实进入与点击链已通过；DB Graph Page Head、Light/窄栏仍待验证；
  Application 112/112、Plugin 219/219 通过；
- P1-G 已建立 Provider-neutral unified UX output 深模块；`recover-context@1.3.0` 已从最新真实
  `INACCURATE` 样本沉淀“当前草稿及其用户评价不是业务上下文未知”的反身边界：
  模型只能引用机器 fact/action/evidence ID；正式事实文本、动作目标、scope hash、时间和
  Skill/Prompt/Provider/model provenance 由机器物化，模型不能降低 risk/review；
  `DRAFT_PROPOSAL` 建议没有正式 operation/write authority。Local Service 已新增只接受
  `objectId + expectedVersion` 的 Project context-recovery 路由：事实、关系、Focus、Anchor、
  Commit、Context Package 和可打开动作均由服务端权威构造，客户端不能注入 fact/prompt/
  action；Provider 期间版本变化会丢弃草稿，全程不持久化。Application 122/122、Local
  Service 100/100、Service Client 12/12 与 Skill 格式/Hash/catalog 自动 Gate 通过；
  Plugin Project 重入卡已接显式触发的 session-only consumer：确定性投影始终保留，
  loading/error/stale 独立显现，facts/inferences/unknowns 分区显示；下一动作必须再次匹配
  当前投影与既有只读 route，伪造 target 不可点击，Plugin 225/225 通过。真实 LaunchAgent
  路径又关闭 installed `bin/skills` 解析、Launcher schema v2 Provider allowlist、timeout/token
  限幅和 prompt `uxAuthority` 缺口；DeepSeek V4 Flash 已真实通过 15 文件 Context Package、
  strict Validator、事实/推断/未知/只读动作与零正式写入 Gate。`894d14f` 的精确构建又在
  Dark Desktop 完成 Project workspace→确定性基线→显式生成→loading→真实 Provider→
  Validator→分区渲染→反馈，reload 后 session 草稿清除；最近正式修改会折叠 forward/inverse
  为“已撤销”，中文前台合同由 `unified-ux-generator@1.2.0` 统一验证且不自动二次调用
  Provider。`653875a` 已用 `recover-context@1.3.0` 重新完成真实 DeepSeek、真实业务 unknown、
  Provider error、Validator rejection、generation stale、feedback、reload、Dark/Light 和
  窄栏代表 Gate；反身 unknown 误判未复现，真实未知没有被过度过滤。stale 遥测现在替换同一
  evidence outcome 为 `STALE`，不再误计 `GENERATED`。P1-G 状态升级为
  `DONE_REPRESENTATIVE_DESKTOP_PROVIDER_GATES`；Skill 为
  `CANDIDATE/DESKTOP_VERIFIED`，尚不因小样本直接晋升 Production；
- P1-H 已建立 session-only、bounded、strict-allowlist 的 Interaction Evidence：只记录
  scene/outcome、对象类型、规则/Signal/Skill/Prompt/model 版本、结构计数、用户处置、固定
  failure code 与时长；未知字段、正文、summary、对象/Block 身份、Prompt 和模型原始输出
  无存储入口。P1-G 成功、Validator 拒绝与 Provider 失败已接入，证据 sink 故障不影响用户
  结果；Project 恢复草稿现提供五种可撤回 session disposition，opaque handle 不进入 export/
  summary，`DO_NOT_REPEAT` 会在同一场景与 Skill 版本下、Provider 调用前暂停后续生成，撤回
  立即恢复；Plugin 自动 UI、真实 LaunchAgent/DeepSeek/Service feedback 与零正式写入 Gate
  均通过。Desktop 已真实提交 `HELPFUL` 与 `INACCURATE` disposition；最终精确 session 为
  `GENERATED=1 / REJECTED=0 / INACCURATE=1`，一次交互只有一次 Provider 调用和一个 evidence
  entry。Application 123/123、Local Service 102/102、Plugin 226/226 通过；持久化与跨会话
  dashboard 仍未加入，主题/窄栏仍开放；Plugin 通用 StructuredLogger/Runtime Diagnostics 已改为字段 allowlist 与仅
  `errorName/errorCode`，启动/全局/fallback 异常不再把 message/stack/cause 送入 Console
  或导出，Plugin 222/222 通过；Local Service READY/migration/stderr 也只输出无路径的结构
  状态与错误码，Local Service 98/98 通过。CLI 属于用户主动前台反馈，live/golden runner
  属于默认关闭的显式研究 Gate，均不归入自动留存日志；session buffer 已可按
  Skill/Prompt/model version 汇总 helpful/noise/error/rejection/do-not-repeat，Application
  122/122 通过，但用户处置入口与真实噪声阈值仍未验；
- P2-A/P2-B 的一个隔离纵向 Slice 已完成真实 Desktop 闭环：真实 DeepSeek 四轮自适应 Grill、
  Validator 拒绝后安全重试、canonical 零丢失预览、server-owned HIGH Proposal、显式 Review、
  八步正式 Commit、reload、真实 divergence→Recovery、修正后的八步 inverse Undo、再次 reload、
  最近修改 inverse 折叠与精确返回原根 Block 均有证据。该结论只关闭 P2-A/P2-B 的这条主链，
  P2-C～P2-G、P1 和整体产品化 Goal 继续 IN_PROGRESS；
- P2-C 已进入第二个自动合同：Grill session 支持不伪造 Object identity 的
  `PROJECT_CREATION` subject；Local Service 已有三来源自适应 generation builder 与
  `project-creation-modeling@1.6.0`（初始自动 Gate 为 `1.1.0`；1.5.0 已退休），Blank/Page/MiniProject 分别先处理结果、现有材料去向、
  升级边界，并要求 Project 特有的 internal closure/current interface 与独立 Page/Object
  关系；Blank 已通过认证
  Service route 与真实 `deepseek-v4-flash` Validator Gate（首轮证据为 Skill `1.0.0`），
  object count 保持 0；Page route
  已通过 Graph bridge 双读与零写自动 Gate；MiniProject route 也已通过 Object/version、
  Primary Anchor、Graph scope 双重重验及生成期间正文变化 stale/zero-write 自动 Gate；
  Page authenticated route 已用七项答案返回 machine `READY_FOR_PREVIEW`，公开 Service
  Client 也已包含 `PAGE_OBJECT_RELATIONSHIP`；
  独立 Project Creation Preview Validator/Provider generator 已自动完成，锁定零正式写入、
  来源逐条保留与关系仅为待 Review 提案；公开 Service Client 与 authenticated Preview
  route 已接通 Service-owned source rebuild、machine readiness、Provider 后 source
  revalidation 和 session-only opaque handle。Blank 成功无 Graph 读取/来源材料，Page 成功、
  未就绪不调用 Provider及生成期间 stale 均有零写入自动证据；handle 现可由同一 Service
  session 消费为 server-owned 单组 HIGH Proposal，Service 会重新读取来源、重算稳定
  source fingerprint 与 Graph scope；fingerprint 覆盖实际送入模型的稳定 Context facts，
  Proposal identity 覆盖 server-owned Preview handle 与完整规范 Preview，避免不同模型
  阅读结果或分别生成的相同阅读结果因不同 `createdAt` 发生幂等碰撞。Page 使用
  Graph bridge 解析后的规范 identity/version/hash，并显式区分目标必须存在或不存在；
  operation target 与 modify scope 的 existence/version/hash 必须完全一致；关系未决、
  过期、Graph stale 或 MiniProject Object version stale 均拒绝且不创建新 Proposal 或
  Project。
  Blank 只允许独立受控 Project Page，Page 可审阅“保留来源另建”或“升级当前 Page”，
  MiniProject 只允许保留来源另建；HIGH Review 接受后仍保持 Object/Page/Commit 零写入。
  已接受 HIGH Proposal 的专用 create 接线、失败补偿、restart recovery、dedicated/reused
  Page 安全差异、inverse Undo 与成功后进入 Project Page 已自动完成；实际 Page UUID/hash
  会在 Graph step 执行前持久绑定，专用 Page Undo 先预检 ownership/metadata-only，复用来源 Page
  永不删除。Local Service 129/129、Plugin 260/260、Persistence 48/48 与根级 Gate PASS；
  最新 Plugin 又把 Blank、普通 Page 与 OPEN MiniProject 三个用户入口统一接入同一个
  session-only Project Creation Grill→Preview→HIGH Review 链，并移除日常 UI 和 action
  dispatch 中绕过 Grill 的旧直建入口；facts/inferences/unknowns、单轮问题、
  loading/error/stale 与正式影响为零均在前台可见。真实 Blank Desktop 链又完成当前
  DeepSeek 多轮 Grill、Preview、HIGH Review、Logseq properties Block 语义修复、同一
  Recovery Commit 正式创建、reload、专用 Undo、Page name 删除、再次 reload 与健康状态；
  最近修改的专用 Undo 分派、删除可见性延迟和 UUID/name 宿主契约均已从真实失败转为自动
  回归。Page“保留来源另建”也已用三段真实测试材料穿过 DeepSeek 七轮 Grill、Preview、
  HIGH Review、正式创建、完整 Logseq restart、跨 runtime UUID 漂移 Undo 与再次 restart；
  来源正文逐字保留，专用 Page 与 Project/Anchor 移除，冷启动后
  Pending/Recovery/Source Conflict `0/0/0` 且 reconciliation 收敛。runtime UUID 跨完整
  restart 不作为稳定产品 identity；Service 原账本仍为权威，只有精确 Page name 加
  owner/object/semantic-commit metadata 才允许重新绑定受控专用 Page，复用来源 Page 永不
  使用删除回退。真实 Provider 多次越界 Page 写入建议均被 Validator 零写拒绝，Grill
  validation 现作为 422 暴露并允许保留答案重试。Application 152/152、Local Service
  129/129、Plugin 269/269 PASS；CURRENT 截图与
  明细在 `current-ui/` 和 `logs/p2-c-project-creation-desktop-live-20260726.md`。
  Page“升级当前 Page”随后也完成真实 DeepSeek 七轮、Preview/HIGH Review、reuse create、
  restart、Page-aware Undo 与再次 restart；原材料要求另建与用户明确 reuse 的冲突被保留，
  用户决定形成 `REUSE_SOURCE_PAGE`。创建/重启/撤销全程 Page name/properties 与三段 Block
  UUID/content/properties 逐字段等于创建前，正式变化只创建/撤销 SQLite Project 与
  active Primary Page Anchor。MiniProject 来源随后也完成真实 DeepSeek 自适应 Grill、
  Preview、HIGH Review、创建、reload、inverse Undo 与再次 reload；来源 Object v14/OPEN、
  active Anchor、五个 Block UUID/正文/顺序逐字段守恒。首轮 Undo 安全完成但误回 Journal，
  `7a7492a407ed` 改为只使用 Service 已审阅并重验的正式 Page/Primary Anchor
  `sourceReturnTarget`，最新构建重跑全链后精确返回来源根 Block。最终 Preview 前两次真实
  Validator rejection 均保持零 Proposal/零写入，第三次同答案集通过，说明安全 Gate
  有效但真实拒绝率与用户诊断仍需继续改善。Undo 后专用 Page/目标 Project/Anchor 均不在
  当前投影，再次 reload 为 READY、`0/0/0`、reconciliation false；CURRENT 截图为
  `p2-c-38`～`p2-c-39`。P2-C 三来源功能矩阵至此 DONE；`2adfc35` / `efb3864` 又关闭
  Preview / HIGH Review 的代表性 Light/窄栏 Gate，新 Project Page 和其余集中宿主视觉
  Gate 仍 OPEN。当前全量 Application `155/155`、Local Service `133/133`、Plugin `271/271`
  与根级 `./scripts/check.sh` PASS；
- P2-D 已进入 `IN_PROGRESS_LIGHT_CONDITION_MEDIUM_AND_HEAVY_INTERFACE_VERTICAL_DONE`：Application
  新增 16 类 Project operation intent 的纯路由合同，明确 LIGHT direct、MEDIUM
  review-then-apply 与 HEAVY discuss→Preview→Commit→Undo/Recovery。Ownership、正文移动、
  Objectives/Deliverables、Stage mapping、批量子对象、拆分合并、Closure 与 external
  Agent 永远不能降级。Plugin 的 Project 重入、正式对象与 Project Page 更新入口先进入同一
  影响选择层；LIGHT 复用已有 Condition/Association，HEAVY 完整当前接口复用既有 HIGH
  Proposal/Commit/Undo。MEDIUM 当前摘要现由 Service 构造有界 Project Context Package，
  真实 DeepSeek 经 `recover-context@1.2.0` 与 Unified UX Validator 只生成单组
  `UPDATE_PROJECT_NARRATION` Proposal；正式 Review/Commit 只替换 `currentSummary`，
  current focuses 与全部结构字段、Ownership、正文和位置保持不变。Desktop 已完成
  Provider→Review→apply→reload→最近修改→专用 inverse Commit→reload；首次长期 Undo
  暴露的通用 Block 路由错误已由 `f6d0429` 修复并复验，`ae2395523798` 又把误导的旧
  `Agent disabled` 改为“Copilot 可用 · 建议需审阅”。Application `161/161`、Local
  Service `135/135`、Plugin `274/274` 与根级检查 PASS；CURRENT `p2-d-05`/`p2-d-06`。
  同一当前 Project 又完成一条 HEAVY 完整接口真实链：HIGH Proposal、独立接受、提交前重验、
  最终 Commit、reload、专用 Undo 与二次 reload；Object v4→v5→v6，Objectives、
  Deliverables、Work Stages 与三项 Focus 在 Commit 后完整可读，Undo 后精确恢复原空结构与
  单一 Focus。CURRENT `p2-d-07`～`p2-d-10`。
  LIGHT Condition 随后补齐 Service receipt 持久 inverse、prepare/confirm 版本重验和
  跨 reload 可发现 Undo；真实 Desktop 以 Project v8→PAUSED v9→reload→Undo
  ACTIONABLE v10→reload 闭环，Project 当前接口、Lifecycle、Focus、Ownership 与正文守恒。
  没有 remove/inverse 的普通 Association 已从正式路由禁用，不以“可创建”伪装安全完成；
  CURRENT `p2-d-11`～`p2-d-13` 对应 `58bf6306d04d`。Application `161/161`、Local
  Service `135/135`、Plugin `275/275`、Persistence `49/49` 与根级检查 PASS。P2-D 仍未
  整体完成：Focus/reviewAt 的完整 Undo 结论、Association inverse、其他 HEAVY 类型、
  Light/窄栏与最终 Gate 继续 OPEN；
- P2-E 已进入 `IN_PROGRESS_READ_ONLY_PREVIEW_DESKTOP`：Application 新增只读 Closure evidence
  draft，只读取版本匹配的 OPEN Project、Project interface、正式 Objects 与直接 Primary
  Ownership。它把 Objective、AVAILABLE/ACCEPTED Deliverable、owned Output/Decision、
  完成工作和未决工作投影为候选证据；所有 Objective 仍标为需要用户判断，不从 success
  evidence 或子对象状态推断完成。Association、孙级对象、缺失 Object、重复 identity 与
  stale version 均不能被静默提升或猜测。Local Service 只接受
  `objectId + expectedVersion`，并把同一只读包暴露给 Project 影响路由；Plugin 明确分区显示
  候选、未决工作、用户判断与未知项，不提供 Proposal/Commit 按钮。focused `3/3`、
  Application `164/164`、Local Service `136/136`、Plugin `275/275`、Service Client
  `12/12` 和 typecheck PASS。`ec1a70d848d6` 最新构建已安装进真实
  Plugin/Launcher/owned Service：Project → 调整 Project → 整理 Closure 证据可达；空证据
  场景显式区分候选、unknown 与用户判断，唯一按钮为“取消”。reload 后 session preview
  不残留、Runtime/Store READY，并从同一 Project v10 重新计算；Objects/Proposals/Commits
  前后保持 `2/10/21`。CURRENT `p2-e-01`～`p2-e-04`。真实 Provider、正式
  Proposal/Review/Commit/Recovery/Undo 尚未闭环。下一安全门已自动实现：Service 复用五层
  `LocalLlmProposalGenerator` 与 `design-project@1.3.0`；缺原目标、主要交付或关键
  Decision 时在网络调用前拒绝，证据充分时也只允许精确 read/modify scope 和一个 HIGH
  Closure 组（同版本 `UPDATE_PROJECT_INTERFACE + TRANSITION_LIFECYCLE`）进入审阅队列。
  新增生产 grounding contract 后，目标、交付、Decision、所有未确认 Objective 与逐项遗留
  都必须回到机器证据；真实 `deepseek-v4-flash` 前两轮因遗漏逐字遗留被零写入拒绝，
  runtime grounding contract 补齐后第三轮 `MODEL_CONTRACT_ONLY` PASS：1 attempt、
  约 24.1 秒、5861 tokens、唯一 HIGH 组、4 read/1 modify、两项固定 operation，Graph/
  Store 写入均为 0。该结论不冒充公共 Service happy-path：正式 Ownership 矩阵禁止
  Decision/Output 以 Project 为 Primary Owner，而当前 evidence draft 仍把这条不可能关系
  当作 Provider 前置。下一步保持 Ownership 语义不变，增加“正式候选 + 用户确认”的
  session-only Closure draft，再进入 Plugin HIGH Review/Commit/Recovery/Undo。随后真实
  Desktop 已完成确定性证据 → 用户逐项判断 → 真实 `deepseek-v4-flash` loading →
  单组 HIGH Review → 最终 Commit → 专用 Closure Undo → Plugin reload → Project 重新进入
  Now Work 的主链。首轮完成态暴露“Closure 已生效但没有专用 Undo”，保留为
  `p2-e-09` SUPERSEDED 失败证据；`06907f3` 增加版本/checksum/receipt 绑定的专用 inverse
  Commit 后，当前 `p2-e-10`～`p2-e-12` 证明入口、撤销结果与 reload 后 ACTIVE Project。
  Service 回读为 Project `OPEN v13`、Closure absent；正向 Commit `UNDONE`、逆向 Commit
  `COMPLETED`，`PENDING/RECOVERY_REQUIRED/FAILED=0`。P2-E 正常主链从 Partial 变为 DONE。
  `6f7f9a857be9` 当前构建又用隔离测试库完成真实 post-domain HTTP 500：同一 receipt-backed
  Commit 保持 `PENDING`，reload 后由原 Review 继续，收口为 `COMPLETED/APPLIED` 且 Project
  不重复增版；再经 reload、Closure 专用 Undo 和再次 reload 回到 `OPEN v21`、Closure
  absent、正向 `UNDONE`、逆向 `COMPLETED`、异常 Commit `0/0/0`。该 Gate 复用同一
  SemanticCommit/Receipt/最近修改入口，没有新增恢复状态或第二写路径。Provider error
  Desktop Gate 已由 `7727770` 关闭；`662246a` 当前构建又用真实 DeepSeek 无日志延迟、
  Project Condition 正向+Undo 完成 generation stale Desktop Gate，旧草稿零 Proposal、
  界面改为“重新检查关闭条件”，reload 后恢复 ACTIONABLE。只剩真正
  `RECOVERY_REQUIRED` 仍 OPEN。`cda4f95` 最新构建又以真实 `deepseek-v4-flash` 生成并
  拒绝一份测试方案，Review 标题已为“结束项目”，Project 保持 `OPEN/ACTIONABLE v23`，
  Proposal 为 `13 APPLIED + 2 REJECTED`，SemanticCommit 仍为
  `14 COMPLETED + 12 UNDONE`。代码审计同时确认：Closure 的 receipt-backed 中断只允许
  `PENDING` 原 Commit 续跑；当前 Recovery Kernel 的真正 `RECOVERY_REQUIRED` 只允许
  补偿收口，不允许前向恢复到 `COMPLETED`。因此不能用数据库篡改伪造
  “RECOVERY_REQUIRED → resume”证据；是否扩张该安全语义属于待用户决定的产品/安全分支。
  P2-E 整体仍为 Partial。Local Service `144/144`、Plugin
  `279/279`、Domain `44/44`、typecheck 与根级 `./scripts/check.sh` PASS；
- P2-F 已从 NOT_STARTED 进入 `IN_PROGRESS_SHADOW_PROVIDER_QUALITY_PASS`：Application 新增
  严格、无自由文本的跨对象观察 draft，固定五类候选、2–8 个版本化 subject、显式有界
  scope、2–16 条结构化 evidence、exact Skill/Prompt/model provenance 与每轮 8 条上限。
  只有校验通过的 draft 才能进入既有 `LLM_CROSS_OBJECT` Attention shadow，且强制
  `INFERENCE/SHADOW/NONE`、可 cooldown；正式 due/Proposal/Recovery 风险继续优先。
  Plugin 只输出计数遥测，序列化结果不含 Object/ref/fact code。没有公共 Service route、
  Candidate/Proposal/Commit、Focus/Ownership 写入、用户显现或 Desktop 证据。Application
  `168/168`、Plugin `280/280` 与根级检查 PASS；非法 LLM 批次整体 fail-closed，不能
  中断确定性 Attention 基线。`cross-object-observation` 仍是需要重复性、失败和反馈证据
  后再决定的 Skill candidate，不提前固化为 Skill。Service 随后增加机器权威的 bounded
  Context Package/evidence-key seam：模型不能生成 scope、provenance、confidence、正文、
  action 或 write。真实 `deepseek-v4-flash` 最终 5/5 PASS：Task cluster、legacy handoff、
  stale interface 三类观察均保留必须证据，表面词汇相同和 Ownership 冲突两例均
  `NO_OBSERVATION`；5 attempts、约 28.6 秒、5478 tokens、Graph/正式 Store 写入 0。
  同一 answer-free Gate 再完整复跑两轮并保持相同 kind/evidence/abstention；累计
  `15/15` case-runs、9 observation、6 abstention、16,742 tokens，全部零写入。
  探索失败促使 confidence 从模型权限收回，由机器对 Association/Ownership 固定 LOW、
  其余固定 MEDIUM；失败只记录 case/结构码，不保存原始输出。P2-F 仍没有正式 Skill、
  Candidate/Proposal、反馈、reload/recompute 或 Desktop UI，前台继续 CLOSED。Local
  Service 又增加机器权威 semantic Context fingerprint：仅 observedAt 刷新保持一致，
  Object 语义或 evidence fingerprint 变化以 `LLM_CROSS_OBJECT_CONTEXT_STALE` 拒绝旧草稿。
  focused `9/9`、Local Service `153/153` 与 typecheck PASS；
- P2-G Rebind 常规主链已进入 `REBIND_MAIN_CHAIN_DESKTOP_DONE`：既有 Rebind
  事务、预览、确认、版本/hash 重验和 replaced 历史完全复用；Plugin 只改用户层选择。
  ready preview 不再显示 Block UUID、Anchor/external ID、hash、raw `missing/replaced` 或
  `Primary Anchor/object_id` 术语，改为事项名称/类型/翻译后的连接状态和正文阅读预览。
  DOM select 也只存 session-local `candidate:<index>`，提交时映射回内存中已验证 Anchor；
  成功反馈不再打印 Object/Block identity。真实 Desktop 首轮发现“新建替代正文会被
  自动显式同步先占用”的安全拒绝；当前实现增加 5 分钟有界捕获窗口，先 flush 并暂停自动
  materialization，取消、超时或提交后只恢复一次。focused `9/9`、Plugin `284/284`、
  typecheck 与根级检查 PASS；当前 commit `344c705ec446` 的真实 Logseq 0.10.15 已完成
  丢失 Anchor → 开始重新连接 → 新建并选择替代 Block → 阅读预览 → 确认 → Service
  Rebind → reload 后系统正常，且旧 Anchor 保留为 replaced、新 Anchor active。
  Rebind Recovery/Undo 指引现已进入 `AUTOMATED_DESKTOP_OPEN`：receipt 虽保留旧/新
  Anchor，但旧连接常因 missing/conflict 才被替换，机械 inverse 会把事项重新指回不可用
  正文，因此不新增不安全通用 Undo。成功态把“选错正文”路由到新一轮 5 分钟受控 Rebind，
  把“回退整个正式状态”路由到只读 Backup/Restore 目录；focused `10/10` 与 typecheck
  PASS。新成功态 Desktop 与 Migration 向导仍 OPEN；
- P2-G Restore 已进入
  `RESTORE_FRONTSTAGE_STATE_DELTA_ROUNDTRIP_AND_FAILURE_ROLLBACK_RELOAD_DESKTOP_DONE`：Local
  Service 新增
  最近 20 个服务端快照的有界只读目录，只返回时间、校验状态、schema 与对象数量，不返回
  路径。Plugin 通过 session-local `snapshot:<index>` 隐藏 Backup ID，支持创建当前快照、
  选择、再次校验、单独确认和正式 Restore；执行前 flush 正文同步并复用 owned shutdown
  policy 拒绝 PENDING、RECOVERY_REQUIRED 与 reconciliation。正式切换仍完全复用既有
  recovery point、原子 Restore、Service 自停与 Launcher 重连。Plugin `288/288`、
  Local Service 全套测试、typecheck 和根级检查 PASS。commit `6ae8f2fcebd0` 的真实
  Logseq 0.10.15 已完成未确认零请求、正式 Restore、owned Service PID
  `47467→47600`、Launcher 同 Graph 重连、Plugin reload 后目录 `2→3` 以及系统
  READY/`0/0/0`；首轮成功/旧错误并列的缺陷已修复且旧画面不计 CURRENT。随后同一
  测试 Task 经真实 Now Work 和 Desktop Restore 完成 `ACTIONABLE v5↔PAUSED v6`
  正反往返，Local Service 每步逐字段读回，最终恢复 ACTIONABLE 基线并 reload 健康。
  `94038e6` 又补齐激活后故障的原库回滚、恢复点保留、Service 停止与四种失败 disposition；
  `0c4526d` 修复回滚后成功/失败重复显示。当前构建在隔离 Graph 对活动 SQLite 注入真实
  文件级写入拒绝，atomic activation 失败后正式对象仍为 5、版本
  `[1,5,6,13,14]`，新增恢复点 schema 12 / integrity ok / foreign-key 0，Service PID
  `99248→99711`，Doctor PASS；reload 后陈旧错误清空且系统正常。自动回滚失败后的手工
  Recovery 向导在该阶段仍 OPEN，Light/窄栏也未验证。`2eb6df1` 进一步完成自动安全底座：Restore
  先独占 admission 并排空已进入请求，Launcher 同 Graph 并发 ensure 只启动一个 Service；
  私有 sidecar 以 `ARMED→RECOVERY_REQUIRED` 区分“恢复点未确认/已确认”，用
  0600、fsync、原子 rename、跨进程 mutation lock 和完整记录 compare-and-clear 保证
  reload、另一客户端、损坏权限或竞态不能重新开放写入。双重回滚失败会跨 reload 阻断
  Service；自动测试只有在选定保留恢复点、恢复并 Doctor PASS 后才允许清锁。该互锁在当时
  尚无 Desktop 注入证据，也不冒充已完成手工向导。`e418c87` 又关闭复审发现的两项隔离缺口：
  interlock/lock 以数据库绝对路径摘要分区并核对 Graph identity，同一数据目录内的多个
  Graph 互不阻断；Launcher 将 ensure、最后 lease release、reap 与 close 纳入同一
  per-Graph lifecycle gate，旧 Service 完成停止前不得生成替代 Service。`cb87d86` 最终
  将 interlock 读取也放入同一 mutation lock，关闭 absent→ARMED 的 TOCTOU；租约回收在
  lifecycle gate 内复验最新 heartbeat，避免排队期间已续租的健康 Service 被误停。最终
  双轴复审无剩余阻断 finding。`23ae7bd` 又将现有互锁以严格、无路径/
  Backup identity 的只读投影接入用户系统状态：只区分恢复点已确认、尚未确认
  或记录无法安全读取，并只提供一个重新核验动作。该投影为 session-only
  `AUTOMATED_ONLY`，不清锁、不恢复、不新增正式状态/导航/Recovery Kernel。`4c71af1`
  继续复用该互锁、Launcher per-Graph lifecycle gate、既有离线 Restore 与用户系统状态，
  打通受控手工恢复执行：只有 `RECOVERY_REQUIRED`、精确 Graph、已确认的服务端恢复点、
  无活动 Service/lease 和独立 HIGH 确认同时成立才启动 Local Service one-shot maintenance；
  maintenance 先保存当前歧义状态，再恢复保留恢复点并完成 Doctor，最后才 exact clear 互锁。
  进程失败、超时、恢复点无效、Graph 变化或 Doctor 失败都保留安全锁，可从同一入口重试；
  Plugin 不接收数据库路径、Backup identity 或 SQLite 操作权。Launcher `29/29`、Local
  Service `160/160`、Service Client `13/13`、Plugin `328/328`、Shared `9/9` 与根级检查
  PASS。commit `16bde9ad88a5` 又在隔离测试 Graph 中建立受控 `RECOVERY_REQUIRED`
  前置条件，并通过真实 Logseq 0.10.15 完成用户状态→独立 HIGH Review→保存当前歧义状态→
  恢复保留基线→Doctor→清锁→Service 重连→完整退出/restart。恢复后正式对象回到 5，
  合成歧义对象不在活动库而仍保留于新安全快照，互锁清除，系统状态和 Service 均 READY，
  Pending/Recovery/Source Conflict 为 `0/0/0`。真实操作同时发现并修复数据库/诊断术语泄漏、
  恢复后陈旧只读状态和健康页内部枚举泄漏。该受控链当时升级为
  `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`。`fe0b590034ac`
  现已用专用故障 Launcher 真实触发候选激活后失败和自动回滚再次失败：活动库暂时切到
  6 个对象，切换前 7 对象正式库与 `RECOVERY_REQUIRED` 互锁均被保留。首轮暴露 Plugin
  只有 reload 后才重新发现 Launcher、因而恢复说明与按钮不一致；修复后第二轮在不 reload
  的情况下直接显示唯一“准备恢复”动作。独立 HIGH 确认后复用同一 one-shot Restore、
  Doctor、exact clear 和 bounded runtime recovery，正式对象恢复为 7，互锁清除，
  Anchor conflict / Pending / Recovery 均为 0。停止故障 Launcher、恢复原 descriptor、
  bootstrap 正常 LaunchAgent 并 reload 后，Plugin exact build `fe0b590034ac`、Service
  formal writes、explicit sync 与系统状态均 READY；authority 仍指向原测试数据库，没有
  静默替换。真实 double-failure 子 Gate 因而升级为
  `RESTORE_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE`；Light/窄栏仍 OPEN，Migration
  Verify/Activate failure 与 Import 写后响应丢失已由后述 Gate 关闭。完整记录见
  `logs/p2-g-backup-restore-frontstage-automated-20260726.md` 与
  `logs/p2-g-restore-failure-recovery-desktop-live-20260726.md` 以及
  `logs/p2-g-restore-recovery-status-automated-20260726.md` 与
  `logs/p2-g-restore-manual-recovery-automated-20260726.md` 与
  `logs/p2-g-restore-manual-recovery-desktop-live-20260726.md` 与
  `logs/p2-g-restore-double-failure-desktop-live-20260727.md`；
- P2-G Migration 已进入
  `MIGRATION_ACTIVATION_MAIN_CHAIN_DESKTOP_DONE_FAILURE_RECOVERY_GATES_OPEN`：
  现有只读 run 投影把原始状态翻译为用户可理解的审阅、验证和启用阶段，只显示计划序号、
  更新时间与批次计数；run ID、Bundle hash、Backup ID 和 CLI 命令不再进入日常 UI。没有
  run 时可由用户明确选择 2 B～8 MiB Recovery Bundle；内容仅在当前 Plugin session
  内存与一次 `/migration/scan` 请求中存在，Service 继续执行 checksum/readback、无损恢复、
  未完成 Commit 检查和 SQLite Doctor 零变化断言。前台只显示五类计数，clear/Graph switch/
  reload 清空，不暴露对象 identity、evidence、hash 或正文。`15b976d28ec3` 的真实
  Logseq 0.10.15 已完成文件选择、2 项分类、放弃、reload 清空、非法 JSON 和最终
  READY/`0/0/0`；SQLite run/batch 仍为 `0/0`。随后 `3103df3`/`c660f2d` 开放
  session-only 逐项 Review 与 PREVIEWED 计划创建：当前材料只显示规范化 160 字符单行
  摘录和来源类型；完整正文、内部 identity、evidence/hash 不进入 UI snapshot、账本或
  日志。所有非导入决定在 Plugin 与正式 Domain Validator 都要求有界判断依据。真实
  Desktop 已完成两项决定、计划创建与 reload；SQLite 回查为 `PREVIEWED`、run/batch
  `1/0`、正式对象保持 4、Pending 0。随后 `e8044bd`/`593d14a` 把同一正式 batch ledger
  接入 session-private 执行控制器：用户重新选择同一 Bundle、只读核对计划与未导入范围、
  选择 1～50 项、创建并校验恢复点、独立 HIGH 确认 Import、Verify 和受保护 Undo；
  run/batch/object/backup identity 与幂等键不进入 UI/DOM。真实 Logseq 0.10.15 已完成
  `PREVIEWED → IMPORTING/IMPORTED → VERIFIED → 完整 restart → UNDONE → 再次 restart`；
  SQLite 正式对象 `4→5→4`、validation PASS、Pending 始终 0，reload 后 batch 与正确动作
  都由 ledger 重建。Import/Verify/Undo 正常主链从 Partial 变为 Done。随后
  `dfb24eb`/`f42b62d` 开放独立 HIGH Activation，并在真实 Desktop 暴露和修复 Undo 后重做
  错误新建恢复点的问题：同一计划现在固定一个导入前恢复基线，后续批次只重新校验，Service
  的 `MIGRATION_SNAPSHOT_CHANGED` 安全边界保持不变。真实链已完成恢复基线复用、
  `PREVIEWED→IMPORTING→VERIFIED→ACTIVATED`、缺确认零写入和完整 Logseq restart；
  objects `4→5`、Pending 0，旧 UNDONE 与新 VERIFIED batch 均保留，reload 后不再显示
  Import/Undo/Activate 动作。Activation 正常主链从 Partial 变为 Done。`2beb1b5` 又把
  ACTIVATED 页面收敛为只读交接历史：新 Bundle scan、Review、Import、Undo 与 Activate
  全部退出，仅保留台账和 Backup/Restore 路由；完整 restart 的 CURRENT `p2-g-43`
  仍为 ACTIVATED、objects 5、Pending 0。`f17f46a` 随后关闭 Import 写后响应丢失代表 Gate：
  专用测试库真实 `4→5` 后响应失败，前台不猜测结果而要求“先以台账为准”，同屏正式 ledger
  已显示 `IMPORTED` 和唯一 Verify 动作；Plugin reload 后从 ledger 重建同一动作，Verify 后
  run/batch 均为 `VERIFIED`，既有 HIGH Undo 又使对象 `5→4`、run/batch 回到
  `PREVIEWED/UNDONE`，SemanticCommit Pending/Recovery 始终 `0/0`。故障运行时退出后，
  正常 LaunchAgent、7 对象 authority 和用户系统状态 READY 均恢复。该
  post-write response-loss / Service interruption 子 Gate 从 Partial 变为 Done。`df5d2ea`
  又以两个 test-only transaction-before fault hook 自动证明 Verify 失败保持
  `IMPORTING/IMPORTED`、Activate 失败保持 `VERIFIED/VERIFIED`，并可在同一 ledger 上
  分别重试到 `VERIFIED` 与 `ACTIVATED`，SemanticCommit Pending/Recovery 为 `0/0`。
  未新增正式状态、生产恢复分支或第二权威。随后真实 Logseq 0.10.15 在隔离测试数据库上
  复用既有私有配对凭据，没有再次写入 FileStorage 或建立新持久访问权，完成
  `Verify failure → 原 ledger 重试 → Activate failure → 原 ledger 重试 → reload`。
  Verify 失败保持 `IMPORTING/IMPORTED`，Activate 失败保持 `VERIFIED/VERIFIED`；
  最终同一 run 进入 `ACTIVATED`，SemanticCommit Pending/Recovery 始终 `0/0`。当前
  `e2361599fbc9` 精确构建 reload 后只显示“V2 已启用”和只读历史。故障运行时退出后，
  正常 LaunchAgent、原 authority 与 Logseq READY 已恢复。该子 Gate 升级为
  `MIGRATION_VERIFY_ACTIVATE_FAILURE_RETRY_DESKTOP_DONE`。当前 `7fcdcf5` 又在
  `722×720` 窗口完成只读完成态窄栏 Gate：主结论、两批历史、唯一返回路径和折叠技术详情
  均可读，无横向溢出或新写入动作。Logseq 0.10.15 File Graph 的“浅色模式”虽已在设置中
  选中，完整 Reload 及完整 quit/reopen 后仍恢复深色宿主；该结果记录为 bounded host
  issue，不伪报 Light PASS。完整退出后旧 Service 子进程按 lease 停止，重新打开后同一
  Launcher 启动新 Service 并自动恢复正式能力。Migration 窄栏从 Partial 变为 Done，
  Light 仍 OPEN，
  P2-G 与整体 Goal 继续 `IN_PROGRESS`。完整记录见
  `logs/p2-g-migration-verify-activate-failure-desktop-live-20260727.md`；
  Blank Preview 已在独立 Service + SQLite 上使用真实 `deepseek-v4-flash` 与
  初始 `project-creation-modeling@1.1.0` 通过 Gate，当前 Skill 已升至 `1.2.0`：Schema/handle 合法、关系仍待 Review、
  formal impact 0、Object 0→0；
- 当前并行收敛 P0-H/P0-J/P0-K 剩余 Desktop Gate，并继续 P1 runtime/状态翻译/重入；
- 本 Goal 的细粒度状态、风险、缺口和验收以
  `docs/implementation/task-copilot-v2-ux/09_PROGRESS_REPORT.md` 与
  `docs/implementation/task-copilot-v2-ux/10_ACCEPTANCE_REPORT.md` 为准。

## 当前 Slice

V1 frozen / base V2 E2E-01–24 complete / UX productization IN_PROGRESS /
P0 remaining host Desktop gates / P1 partial UI and shadow gates /
P2-A+B bounded Grill→Preview→Review→Commit→Recovery→Undo→reload→root Desktop slice DONE /
P2-C Blank + Page dedicated + Page reuse + MiniProject source DONE, visual gates OPEN /
P2-D router + MEDIUM narration + one HEAVY full-interface vertical DONE,
remaining LIGHT/other-HEAVY/visual gates OPEN /
P2-E normal Provider→Review→Commit→Undo→reload main chain Desktop DONE,
failure/Recovery Desktop gate OPEN /
P2-F shadow safety contract + first real Provider repeat quality gate PASS, frontstage/feedback/reload gates OPEN /
P2-G Rebind identity-free capture main chain Desktop DONE,
Restore frontstage state-delta roundtrip Desktop DONE,
Restore activation-failure automatic rollback + recovery-point + reload Desktop DONE,
Migration item Review/Preview Desktop DONE,
Migration recovery-point/Import/Verify/Undo normal main chain Desktop DONE,
Migration Activation normal main chain Desktop DONE,
Migration post-write response-loss→ledger reload→Verify→Undo Desktop DONE,
Migration Verify/Activate failure→same-ledger retry→reload Desktop DONE,
Migration final read-only narrow Desktop DONE,
Task Copilot dark surface + reload + 723px narrow Desktop DONE；File Graph 自身 Light host Gate OPEN,
Rebind Recovery/Undo guidance AUTOMATED,
Restore rollback-failure manual recovery chain Desktop DONE /
overall Goal IN_PROGRESS

## 当前阶段结论

```text
V1_RUNTIME_KERNEL_PASS
V1_MVP_PILOT_PARTIAL
V1_FROZEN_FOR_MIGRATION
V2_MIGRATION_DESIGN_READY
V2_REQUIREMENT_GATES_PASS
V2_IMPLEMENTATION_COMPLETE
V2_UX_PRODUCTIZATION_IN_PROGRESS
```

`V1_MVP_PILOT_SUCCESS` 未达到：Capture 与 Task 通过；MiniProject/Project 的主归属、推进、聚合以及 Decision/Output/Closure 没有形成低摩擦闭环。V1 不再扩建长期能力，这些差距转入 V2。

## 本轮完成

- 复核分支、remote、恢复包、Agent、FileStorage、测试 Graph 和 root checks；
- 正式接受 OD-001..003，并冻结三份 ADR；
- 在 Logseq Desktop 0.10.15 使用专用 copied-data 页面完成 Capture、Task、MiniProject、Project Pilot；
- 建立 Pilot 前后 0600 恢复包，回放 differences 为 `[]`，Pending/Recovery Required Commit 均为 0；
- 明确 V1 可复用内核、冻结边界和淘汰语义；
- 完成 FileStorage → SQLite 主权交接设计及 Legacy 状态映射；
- DeepSeek v4 真实 Gate 已从旧的 HTTP 200 / `finish_reason=length` 失败推进到完整 L4：Key 只经 Keychain reference 解析，中文 Structured Output 与真实 Journal→Proposal 正向路径通过，E2E-21 完成；真实截断/timeout 均零写入。早期带 expected/assertion 答案泄漏的 22/22 runner 已作废；补强 MiniProject、Decision、Output 产出者、Ownership 候选和证据不足边界后，严格无答案黄金套件在 `deepseek-v4-flash` 与 `deepseek-v4-pro` 各完成 22/22 `PIPELINE_PASS`。真实 Logseq Desktop 又完成当前块 loading/error、READY/NO_PROPOSAL、直接接受、拒绝、同 proposal_id 调整后接受、两组部分接受和 Diagnostics secret scan；全程 Object/Commit 为 0。E2E-22、E2E-18、E2E-24 已完成，脱敏交互见 `docs/testing/deepseek-v4-l4-desktop-2026-07-22.json`。
- Slice D L1-L4 已贯通：Provider 非硬编码 Base URL/Model、env/Keychain secret reference、Structured Output 元数据、timeout/cancel、有限 retry、认证/限流/5xx/network/空/非法/截断错误；五层 Prompt 后由 Service 覆盖模型 ID/source/status/time 与机器计算 patch hash，再经现有 Domain Validator。合法结果只进入 Proposal Review，普通记录可返回 `NO_PROPOSAL` 理由且零持久化，非法结果零 Proposal/Graph/正式 Store。Review Center 可把有界自然语言调整提交给真实 Provider，但 Service 强制同 proposal_id/createdAt/Block scope/group/operation/target 并只原位修订唯一机器表示；任何意图漂移保留原 Proposal。生产默认输出/超时仍为 2048/20 秒，受限 runtime override 只用于已证明需要的真实 Gate。
- 建立 V2 六类对象、Lifecycle/Condition/Focus 纯 Domain seam；不含 Phase/Signal；
- 通过 Node 20/macOS arm64 SQLite Spike：Graph-bound 初始化、schema/损坏保护、版本/幂等写入、Doctor 和独立备份；
- 建立仅绑定 `127.0.0.1`、session-token 认证的只读 Local Service health/status/doctor/object 骨架。
- 建立 V2 Application Command envelope、版本前置、原子 Object+Audit receipt 和幂等重放；
- Primary Anchor 与 Primary Ownership 同时经过 Domain 与 SQLite 约束，失败事务不会推进对象版本；
- 建立 0600 runtime descriptor、版本化 Service Client、超时/断连/未授权/协议不兼容错误及受限状态；
- 建立可执行 `task-copilot-service` 与只读 `tc status/doctor/object`；`tc object list` 可按六类对象和四种 Lifecycle 筛选，`tc object search` 可在同一 Service 投影中按 object_id/正文关键词检索，均不直读 SQLite、不新增索引或状态源；真实 Local Service 集成已覆盖 Project 查询。
- SQLite 写锁冲突已收敛为结构化零写入失败；Backup 增加不覆盖、只读 schema/Graph/完整性/外键校验。
- Local Service 开放受控 Backup Create/Restore Validate/Apply；只接受服务端 ID，拒绝客户端路径、遍历和超大请求，Apply 必须使用固定确认并在原子切换后停服。
- SQLite schema 升至 v3；`initialize` 不静默升级，v1/v2→v3 需显式恢复点，在单一事务写 DDL/ledger/metadata/user_version，注入失败后零半写且可重试。
- Plugin 已接入版本化 Service Client。Desktop 0.10.15 实测 iframe 不暴露 Electron Node reader，现由 Service 将 0600 descriptor 写入 Task Copilot 私有 FileStorage，Plugin 设置只保存受限文件名 key 并通过 Logseq bridge 临时读取；该文件不含领域状态、不恢复 V1 写入、不构成 SQLite 双写。兼容 Node reader 保留；任何发现失败均进入脱敏 RESTRICTED 状态。
- descriptor 未配置时，Plugin 在创建 Logseq Adapter/FileStorage 前停止，欢迎页只提供“开始使用 / 迁移现有内容 / 检查系统状态”；无扫描、迁移或模型调用的自动分支证据已建立。
- SQLite 离线 Restore 已完成自动与 Desktop Gate：候选 Backup 与当前库恢复点均先做只读校验，同目录原子激活后再 Doctor；注入失败会回滚原库并保留恢复点。真实 Desktop 已证明固定确认、descriptor 删除、Service 进程退出、Plugin 自动受限、同库重启、对象快照读回与 Doctor 12 PASS/0 WARN。
- SQLite schema 升至 v5：v3 建立受约束 `semantic_commits` / `semantic_commit_steps`，v4 新增 `proposals` / `proposal_groups`，v5 只解除 immutable Audit 对当前 Object 投影的外键依赖，使严格 Undo 可删除当前 Object/Anchor 而保留历史 object_id；所有旧版本必须经显式快照迁移，无静默升级。
- step ledger 最小状态机已通过：PENDING + PREPARED 原子准备、幂等重放、非法跳步拒绝、全 VERIFIED 后才能 COMPLETED、未补偿 step 不得标记 FAILED，RECOVERY_REQUIRED 可重启查询并补偿收口。
- Service Restore Apply 已通过：固定确认短语、服务端 Backup ID、恢复点、关闭 live Store、原子切换、Doctor、descriptor 删除和 Service 停止；无确认不产生变化。
- CLI 已提供 `backup create/validate/restore`；Restore 缺少精确 `--confirm RESTORE_AND_STOP_SERVICE` 时在加载 Service 前退出。独立进程冒烟已证明 CLI create → restore → Service exit/descriptor cleanup → restart → Doctor PASS。
- `tc doctor` 已从 SQLite 完整性扩展为结构化组件报告：直接检查 Schema、Anchor missing/conflict/多 Primary、标识、Stale Proposal、Pending/Recovery Commit、最新 Backup、Key 引用边界、Provider 配置、内置 Skills 和 CLI/Service 协议；FAIL 仍以 HTTP 200 返回可诊断报告，CLI 用稳定退出码 7 表示不健康。`tc doctor --export <diagnostics.zip>` 生成 0600、防覆盖、带 SHA-256 清单的脱敏 ZIP，已由真实 Service/CLI 进程与 `unzip -t` 证明可读。Graph/Desktop 事件、Provider 在线健康和 Service 日志采集仍明确标记为专用 Gate，不伪装成已检查。
- CLI Proposal 纵向入口已复用同一 Local Service：`proposal list/show/validate/submit` 支持固定 JSON envelope 与退出码，外部文件限制为 1 MiB UTF-8 JSON；validate 零持久化，submit 只进入 Plugin 共用审阅队列并显式返回 `formalWritesExecuted: false`，不存在 `proposal apply/commit`。真实 Service 集成已证明固定提案提交后 Proposal=1、Object=0、SemanticCommit=0；真实 DeepSeek 外部 Agent 又从 Desktop Page Context Package 生成原始候选，经 CLI validate/submit 和 Plugin Review 接受后仍为 Object 0 / Commit 0，E2E-13 已 `DONE`。E2E-20 的隔离 Project Closure Proposal Desktop Completion 已另行通过。
- 外部 Agent Skills 已版本化：`task-copilot-core@1.0.0` 固定 scope/事实分层/Proposal-only/submit≠commit 边界；`design-project` 从外部 Agent 验证的 `1.1.0` 升至 `1.2.0`，增加 in-product Closure evidence、NO_PROPOSAL、exact scope/operation 与前台 identity 隔离规则。两者经 Skill 结构校验、SHA-256 标识并随 Service 构建复制。Local Service `GET /skills[/{name}]` 与 CLI `skill list/show` 返回同一只读资产，读取后 Object 仍为 0；没有新增表或可编辑副本，Context Package 复用同一资产。
- Context Package 已开放设计既定的 block/page/object/project 四种范围：object/project 继续从 SQLite 导出最多 256 个正式对象及 Primary Anchor/Ownership、Decision/Output 子集；block/page 通过 Plugin 的瞬态 Logseq API 只读桥接取得实时有界 excerpt，再只纳入 excerpt 中锚定的 SQLite 正式对象。Page depth 0..5、Block parents 0..8、总计最多 256 Blocks / 1 MiB；Service 重验请求/结果 shape、UUID、Block 去身份语义 hash、Page revalidation hash 和 scope hash。CLI 先验证完整文件集/bytes/hash，创建 0700/0600 新目录并最后写 manifest，已有目录、路径穿越或 hash 不匹配均拒绝并清理新产物。真实 Logseq Desktop 已完成 Page/Block/resolve、reload 后 UUID 变化、Page parent entity shape 修复、Context Package→DeepSeek 外部 Agent→CLI validate/submit→Plugin Review；接受组后仍为 Object 0 / Proposal 1 / Commit 0，E2E-13 `DONE`。桥接请求和正文只在内存中存在，无新表、缓存、扫描器、Graph 写路径或第二权威；详见 `docs/runtime/V2_E2E13_GRAPH_CONTEXT_DESKTOP_REPORT.md`。
- V1→V2 迁移已完成自动与 copied-data Desktop 纵向闭环：Scan → 人工逐项审阅 → 服务端快照校验 → ≤50 项 batch → SQLite 原子导入 → Verify → 精确 Undo → 新幂等键重试 → Activate。纯 Domain 覆盖全部旧 Phase/Condition/Signal，ACTIVE 不自动 Focus，结构冲突拒绝导入，非直接或人工改映射必须记录审阅说明；批次只物化既定 Object/Anchor/Ownership，不复制正文到迁移账本。真实 V1 Pilot 后 0600 Recovery Bundle 在 Logseq Desktop 0.10.15 中完成 8 项 Scan、完整 Decisions、Backup、缺确认零请求、Import 重放、IMPORTING 时 Service 中断/重启续作、Verify、单批 Undo、重试与 Activate。首轮导入的当前 Graph 缺失 Anchor 被既有 reconciliation 更新后，Verify 安全拒绝且未 Activate；最终只导入当前 Anchor 仍可解析的范围，Run 为 ACTIVATED、Doctor 12 PASS/0 WARN。Plugin 只读迁移工作区真实显示 PREVIEWED/IMPORTING/VERIFIED/ACTIVATED、计数、恢复点和下一步，无可编辑控件、不接收 Bundle。E2E-14 `DONE`，详见 `docs/runtime/V2_MIGRATION_COPIED_DATA_DESKTOP_REPORT.md`。
- SQLite Restore Desktop Gate 已完成：隔离 Task v2 快照后修改为 v3，缺确认零请求；Restore 原子恢复 v2 并把 v3 保存为恢复点。第一次实测发现 Plugin 陈旧 READY 与 Graph bridge 重试风暴，现复用既有 restricted state 与 explicit-sync pause，在首次传输失败后停止 bridge。重跑中 descriptor 删除、Service 在 Desktop 保持打开时退出、Plugin 自动显示 `READ_ONLY_SAFE_MODE / RESTRICTED / formal writes false`，同库重启后恢复 READY、Task v2、Graph bridge 与 Doctor 12 PASS/0 WARN。E2E-17 `DONE`，详见 `docs/runtime/V2_SQLITE_RESTORE_DESKTOP_REPORT.md`。
- 首次启用与 Service 受限 Desktop Gate 已完成：空 V2 系统在 descriptor 缺失时只显示“开始使用 / 迁移现有内容 / 检查系统状态”，Store 为 `NOT_STARTED`，没有自动扫描、迁移或模型调用。无监听进程的 v1 descriptor 进入 `SERVICE_UNAVAILABLE`，v2 descriptor 进入 `SERVICE_PROTOCOL_MISMATCH` 并跨 Logseq reload 保持；同一普通 Block UUID 在两种受限态下均可编辑与读回，formal writes 始终 false。用户编辑只触发 3 条有界 sync warning 与 session-only reconciliation flag，没有持久队列或第二权威。V2-FIRST-001 / E2E-15 `DONE`，详见 `docs/runtime/V2_FIRST_RUN_RESTRICTED_DESKTOP_REPORT.md`。
- 首次启用“迁移现有内容”不再停留在未来时描述：它明确给出 scan → preview → backup 的零写入/恢复点顺序、三项高影响命令的精确确认边界，以及 Service 重启后用 `migration show` 继续的方法；页面自身仍零文件读取、零扫描和零写入。Plugin 日常迁移视图也仅显示同一 Service 账本，操作继续经显式 CLI 命令完成。
- SQLite schema v7 只包含设计中明确要求的 `migration_runs` / `migration_batches` / `legacy_evidence`，用于 E2E-14 的 run 状态、≤50 项幂等批次/Undo 校验和和旧标识映射依据，不存当前对象副本。`task-copilot-service migrate-schema` 必须显式给出 DB、Graph 和不存在的 Backup 路径，不启动 HTTP/Provider/descriptor；已用真实 v6 库证明 0600 快照、v6→v7、Service 重启与 CLI Doctor schema 7 PASS。迁移批次沿用单一 Application Command 与 SQLite 事务，不扩展 SemanticCommit、不新增补漏器或第二恢复路径。
- SQLite schema v8 只在 `objects` 新增 nullable `closure_json`，且 DB 约束其仅能用于 `PROJECT + COMPLETED`；v1..v7 均需显式快照后升级，失败整体回滚。该列直接对应 E2E-20 规范已存在的 `closure_summary`，没有新表、第二状态机或平行恢复路径。已有自动 v7→v8 快照/升级证据；当前 schema v10 隔离 Desktop 库已实际持久化并读回 Closure。
- SQLite schema v9 增加最小 `associations` 投影，只表达有方向的普通 `RELATED`，不改变 Primary Ownership、位置、Lifecycle、Condition 或 Focus。Plugin 明示影响并要求确认，提交前重验来源版本且有 busy/error/success 与防重复提交；写入仍只走 Local Service → Application → 单一 SQLite 事务。Context Package 只导出 scope 内两端都存在的关系；Materialization/Migration Undo 已把入向与出向关系纳入变化保护。v8→v9 有精确只读快照和迁移证据；未增加关系分类、扫描器、补漏器或第二权威。Desktop 已真实通过 TASK→OUTPUT 选择、缺确认零写入/可修正错误、确认后唯一 RELATED、来源版本/Audit 4→5、Ownership/Focus/Anchor 不变及 Plugin reload 读回；证据见 `docs/runtime/V2_ASSOCIATION_DESKTOP_REPORT.md`。
- SQLite schema v10 只新增设计既定的 `candidates` 审阅状态表：正文仍以 Logseq 为唯一权威，表内仅保存来源 UUID/版本、分类、理由、处置、当前 Proposal 与时间。来源 UUID + kind 保持一个稳定 Candidate；同版本重扫保留用户处置，来源变化才重开并把旧当前 Proposal 标为 `STALE`。v9→v10 必须先做精确只读快照，迁移、回滚和重试均有自动证据；没有新增扫描器、恢复器、写入路径或通用工作流状态机。Desktop 已真实通过离线当前页发现、原文优先、稍后/普通/同建议不再提示、CREATE Proposal READY/ACCEPTED 时 Object=0、最终 Commit RESOLVED、Undo reopen 和 Plugin reload。真实运行同时发现并修复 `id::` 属性回声提前物化：现用有界同正文窗口覆盖旧 traversal 与真实 echo，正文变化立即解除，timer 主动回收。UPDATE 也已通过真实 Desktop 纵向闭环：用户选择一个已有 Block 对象并编辑完整最终正文，审阅单组 `REWRITE_BLOCK` 的红/绿 Diff；READY/ACCEPTED 零正式写入，最终复用既有两步 SemanticCommit 同步同一 object_id，版本 4→5，Plugin reload 稳定读回，Undo 恢复旧正文并推进同一对象版本 5→6，再 reload 后 Candidate 重开。首次真实运行发现 Logseq 持久化 `id::` 导致 identity-only 假 stale；修复复用已有 Candidate rediscovery，仅在去身份正文 hash 未变时刷新版本，正文真实改动仍零写入拒绝。没有新增表、Commit 类型或恢复器。`E2E-12` 已升级 `DONE`；合同见 `docs/implementation/V2_CANDIDATE_UPDATE_CONTRACT.md`，运行证据见 `docs/runtime/V2_CANDIDATE_REVIEW_DESKTOP_REPORT.md`。
- SQLite schema v11 不新增表或字段，只放宽已有 `closure_json` 约束，使它也能用于 MiniProject 完成，并允许 Project/MiniProject 归档后保留完成事实。v10→v11 仍要求显式恢复点，在单一事务中重建 objects 约束并执行 foreign-key check；自动证据已证明对象/Anchor 保留、OPEN Closure 零写入拒绝、迁移后三问关闭、ARCHIVED 保留与 Doctor PASS。
- OD-006 与 Project 当前接口已完整收口：schema v12 只在 `objects` 增加一个 Project-owned、受验证的 JSON aggregate，覆盖 Objectives（Primary/Secondary + success evidence）、Deliverables（自然验收 + 状态）、并行 Work Stages、当前摘要、1–3 当前推进和可选主 Stage 映射。完整变化只经唯一 HIGH Proposal → Review → Object version revalidation → 单步 Domain SemanticCommit；专用 inverse Commit 恢复审阅前 aggregate，后续版本变化零覆盖。Logseq Desktop 0.10.15 已真实完成创建、结构化编辑、HIGH 接受、最终 Commit、v3 reload 读回、专用 Undo、v4 reload 精确恢复；Pending/Recovery 为 0、integrity `ok`、foreign-key check 无记录。进程故障首次暴露新 renderer 与旧 15 秒长轮询冲突会被误判为 Service 死亡，修复只在既有 GraphReadBridgeController 对 `GRAPH_READ_BRIDGE_ALREADY_CONNECTED` 做最多 20 次、每次 1 秒的有界接管重试；真实复测保持同一 Service PID 并直接恢复 READY，没有新增协议、状态源或写路径。证据见 `docs/runtime/V2_PROJECT_STRUCTURE_DESKTOP_REPORT.md`。
- 对象页已通过 `GET /ownerships/primary` 读取同一 SQLite 投影，以有界 `child → owner / 唯一主归属` 列表与普通 Association 并列展示；该只读可见性不开放直接 Ownership 写入。新增/变更主归属仍必须进入既定 HIGH Proposal 审阅与 Commit 路径。
- Primary Ownership HIGH Proposal 的 accepted-plan Validator 已建立：只接受唯一已接受 HIGH 组、单个 `CHANGE_OWNERSHIP`、零正文 Patch、带版本 child、新 Owner 和可选当前 Owner 前置；新 Owner 必须是 `scope.read` 中唯一带版本 OBJECT，风险降级或复合操作在 Commit 规划前拒绝。
- Primary Ownership 已形成自动化正向与逆向纵向闭环：Domain/Application/SQLite 在同一事务校验 child version、new Owner version 与精确当前 Owner，并更新 Object version、唯一 `primary_ownerships`、Audit 和幂等 Receipt；accepted HIGH Proposal 专用 `/ownership/commit` 由服务端权威重读对象，固定确认后复用一个既有 DOMAIN_WRITE SemanticCommit step。Review Center 只为唯一 HIGH `CHANGE_OWNERSHIP` 显示专用确认，具备 busy 防重复、stale/错误反馈和成功后同一列表读回。专用 Ownership Undo 再以正向 Proposal 的审阅前 Owner 与正向 Receipt 的实际结果交叉验证，恢复旧 Owner 或未归属；它只创建一个 Domain-only 逆向 Commit，不触碰正文、位置、Anchor、Association 或其他状态。child/当前 Owner 有后续变化时零写入并收口 FAILED；逆向 receipt 后中断可重启幂等续完并把正向 Commit 标记 UNDONE。正向未完成 Commit 仍锁住 review/revalidate，prepare/receipt/FAILED 各故障边界保持既有恢复证据。无直接 Ownership 写路由、平行恢复器或第二权威。Desktop 已真实通过 CLI Proposal-only、HIGH 接受但零正式写、版本重验、最终 Commit、reload 读回、专用 Undo 与再次 reload；Task v5→v6→v7，正向 Commit `COMPLETED→UNDONE`、逆向 Commit `COMPLETED`，Project v2、Anchor 与普通 Association 全程不变。真实移动不改归属仍由 E2E-04 独立验收；合同见 `docs/implementation/V2_OWNERSHIP_CHANGE_CONTRACT.md`，运行证据见 `docs/runtime/V2_OWNERSHIP_DESKTOP_REPORT.md`。
- E2E-20 Project Closure 已形成完整纵向闭环：外部 Agent 只能提交 Proposal；Closure 与 `COMPLETED` 必须是同一个 HIGH 组，分别经组确认和最终精确确认。Validator 要求原始目标、实际结果、Deliverable/Output、未完成 Objective 的原因与后续、遗留去向、关键 Decision 和未来总结，但允许部分 Objective 未完成。固定 fixture 与真实独立 Agent 输出均已经真实 CLI 文件 `validate → submit` 进入 Review queue，且 Project 仍 OPEN、无正式写入；首次 Agent Schema 错误被 Validator 零写入拒绝，`design-project@1.1.0` 补齐精确模板后通过。Service 重验 SQLite Object version，用既有 SemanticCommit 单一 Domain step 调用 Application，原子写 Closure/Lifecycle/Audit/Receipt；Focus 清理由自动事务证据覆盖。Desktop 0.10.15 已实测 HIGH 接受时对象仍 `OPEN + v2`，最终确认后同一对象为 `COMPLETED + v3`、Proposal/Commit 为 `APPLIED`/`COMPLETED`；reload 后 Closure 可读、Focus 计数为 0 且 Now Work 中不显示该 Project、原 Logseq Project 页仍可搜索打开，Pending/Recovery=0 且 SQLite integrity/FK 通过。`E2E-20` 已为 `DONE`，详见 `docs/runtime/V2_PROJECT_CLOSURE_EXTERNAL_AGENT_REPORT.md`。
- Slice B0 显式语法 Parser 已建立：只接受 `[任务]`、`[MiniProject]`/`#MiniProject`、`[决策]`、`[成果]`；Marker 不决定身份，裸 TODO 不物化，空标题/多类型冲突确定性拒绝，Area/Project 不使用未定义前缀猜测。
- Slice B3 Marker 的 Task 与 MiniProject 安全提交路径已完成自动合同与历史 Desktop Gate：简单 Task DONE 改为 `COMPLETED`，重复与 Marker 移除不重开；CANCELED/CANCELLED 在记录取消原因前零写入；TODO/NOW/DOING/WAITING 不改 Condition/Focus；终态相反 Marker 为零写入语义冲突。MiniProject DONE 复用唯一 SQLite Proposal 表示、HIGH 审阅、对象/active Anchor/Block 重验和既有 SemanticCommit；一个活跃意图原位修订，终态后新 DONE 使用新代次，旧回执不能倒灌。完整 MiniProject 三问 Closure 已扩展到三种正式发起方式：Marker、对象列表侧栏与外部 Agent Proposal；侧栏只创建/打开一个确定性 object-only Proposal，外部 Agent 继续走统一 validate/submit，二者最终只重验 Object version 且不伪造 Anchor 或改写 Graph。三问必须一次填完并进入唯一 Proposal；接受不生效，最终确认后才与 Lifecycle/Audit/Receipt 原子持久。UC-28 Agent 草拟已在真实 Logseq Desktop 0.10.15 通过 loading、Service 中断安全失败、同 Proposal 三问回填与真实 Flash 成功；模型仍只生成完整可验证 Proposal，Service 只取三问并丢弃模型 scope/target/version。遗留 Task 在用户选择的空 Block 上建立独立 Formalization Proposal，非空保护、接受零写入、最终 Commit、reload 和独立 Undo 均通过；Closure 始终与遗留 Commit 解耦。真实运行发现并修复 Logseq 写后短暂旧读和两次连续插件写入的晚到事件回声，最终 Object 只有 Proposal Commit/Undo Audit，显式同步 echo 为 0。全路径没有新表、状态机、扫描器、恢复器或第二写入路径，详见 `docs/implementation/V2_MINI_PROJECT_CLOSURE_CONTRACT.md`、`docs/runtime/V2_MINI_PROJECT_CLOSURE_DESKTOP_REPORT.md` 和 `docs/runtime/V2_MARKER_DESKTOP_REPORT.md`。
- Task/Project/MiniProject 的原因化取消与显式重开已完成自动纵向闭环：Domain 不再允许通用 Lifecycle 命令无原因进入 `CANCELLED`，并提供独立版本保护的 cancel/reopen Application Command；Local Service 对象路由只创建或原位修订一个 Proposal，Review 仍零正式写，最终确认词必须与已审阅动作一致后才复用一个 DOMAIN_WRITE SemanticCommit。独立 Lifecycle inverse Commit/Undo 可恢复取消或重开前状态，并在 SQLite v11 约束下清除/恢复 Project/MiniProject Closure 快照。Logseq Desktop 0.10.15 已完成 Task MEDIUM 以及 Project/MiniProject HIGH 的空原因拒绝、审阅、最终确认、reload、中断收口和专用 Undo；正文、Anchor、Condition、Focus、Ownership 与 Closure 保持指定边界。详见 `docs/runtime/V2_REASONED_LIFECYCLE_AUTOMATION_REPORT.md` 与 `docs/runtime/V2_REASONED_LIFECYCLE_DESKTOP_REPORT.md`。
- Slice B 防抖与首次物化基础已建立：UUID 级事件合并只交付最新 Parser 结果，失败显式回调；Application/SQLite 将 Object、Primary Anchor、Audit、Receipt 单事务写入并幂等重放，重复外部 Block 整笔回滚。
- Local Service 已开放受约束的 `POST /objects/materialize` 与统一 `POST /objects/synchronize`，并报告 `formalWrites=true`；请求不能携带 Graph/DB 路径/object_id/anchor_id/actor，只允许四类 Parser 对象、8 位 Anchor hash 和有界命令字段。
- 同类型显式同步后端已完成：Domain/Application/SQLite 更新标题缓存、对象版本和 Anchor 观察证据；`/objects/synchronize` 自动区分首次物化与已绑定更新，Service 用 Graph ID + Block UUID + Logseq 输入版本形成 SHA-256 幂等边界。类型变化明确零写入并作为 terminal Proposal-required 冲突保留，不再误当断线永久重试；正式 Proposal 创建仍属于 Slice C。
- Plugin 已将 `DB.onChanged` 接入显式 Parser/防抖/Service Client。Service READY 且声明 `formalWrites=true` 时统一经 Local Service 写 SQLite；断线时正文仍可编辑，最近事件只保存在按 UUID 覆盖、上限 256 的会话内队列，恢复连接后按幂等请求重试。该队列不写 FileStorage、不复制正文、不是第二状态源；交付失败、结构冲突或溢出都会进入脱敏诊断和 `reconciliationRequired`。
- Slice B1 有限子树已接入唯一事件主链：`DB.onChanged` payload 只提供待重读根 UUID，经 300ms 防抖后以 32 根队列和 256 Block 预算重读权威子树，不读整页或全 Graph；截断/异常只交付已验证前缀，其余明确要求 reconciliation，卸载 cancellation 不迟到交付。Desktop 已真实验证逐项编辑、快速连续编辑、整树批量粘贴及 Service 中断后恢复：Task/Decision 各自物化，裸 TODO 无 `id::`/无 Object，快速编辑只交付最新值。33 根溢出显式为 `EXPLICIT_SYNC_SUBTREE_QUEUE_CAPACITY_EXCEEDED`。事件入口集成测试又精确覆盖 257 节点：只读写前 256 项，第 257 项不触达，发出 `EXPLICIT_SYNC_SUBTREE_TRUNCATED` 且要求 reconciliation；进行中 unregister/dispose 不再读子节点或迟到写入。A-RT-03.18 工程边界已收口。详见 `docs/runtime/V2_EXPLICIT_SUBTREE_DESKTOP_REPORT.md`。
- 配置 V2 descriptor 后，Plugin 进入 V2 sync-only 运行路径：不初始化 V1 `VersionedStateRepository`，旧 Capture/Proposal/Commit 写命令保持关闭；V1 实现代码仅作为迁移与历史兼容资产保留，避免 V1 FileStorage 与 V2 SQLite 双写或双语义运行。
- Service 已开放当前 Graph 未被替换的 Primary Anchor 分页；Plugin 在每次恢复 READY 及其后每 5 分钟最多读取一页 256 个已知 Anchor 的对应 UUID，以不透明游标逐轮收敛且不扫描全 Graph。正文 hash 变化会走同一同步命令，并发检查会合并为同一轮，单个 Graph 读取失败不会断开健康 Service，dispose 后不会继续迟到工作。
- Slice B4 Anchor 观察持久化已贯通：Block 缺失记为 `missing`，Marker 移除/形态异常记为 `conflict`，Object 不删除；同 UUID 合法正文可恢复 `active`，`replaced` 不可复活。观察经 Local Service/Application，由 Service 注入 Graph/actor/version/幂等边界，Object version + Anchor + Audit + Receipt 单事务；重复同状态零写入，失败显式报告并可下轮重试。
- Slice B4 move/copy 已完成自动合同与真实 Desktop：Logseq 原生 Cut/Paste 跨页移动在 reload 后保持同 object_id、active anchor_id、Block UUID、版本、Association 和 Ownership；去 properties 复制得到新 UUID、新 object_id/anchor_id，原对象不被覆盖，两者 reload 后均 active。真实事件同时否定了 `txData` 平行补漏：`event.blocks` 已足够，datom 含瞬态空 Block，因此未保留第二事件路径。
- Slice B4 rebind 安全闭环已完成自动与 Desktop：精确 `REBIND_PRIMARY_ANCHOR` 确认由 Application 强制；Service 只接受旧 Anchor 引用、预览并发前置与新 Block 证据，SQLite 单事务保留旧 `replaced` Anchor 并建立唯一 active Anchor。Plugin 只读当前 Block 与一页已知 Anchor，独立确认和 stale 重读通过后才复用既有身份写入，复核 `id:: <UUID>` 后以新 Logseq version/去身份 hash 提交；确认缺失与 stale 均零 Graph/SQLite 写入。cold reload 首轮 reconciliation 延迟 5 秒避开 Logseq 索引窗口，仍复用同一已知 Anchor 检查而未新增扫描器或恢复器。Desktop 已走完真实删除→missing 观察→同类型新 Block 预览→缺少确认零写入→确认 rebind→cold reload：同一 object_id version 2→3→4，旧 Anchor `missing`→`replaced`，新 Anchor 唯一 `active`，Audit/Receipt 各只增加一次观察和 rebind。E2E-06 `DONE`；证据见 `docs/runtime/V2_SLICE_A_B_DESKTOP_REPORT.md`。
- Slice B4 当前页 Candidate 发现严格限定当前页和 256 Block 处理预算，不做启动或全 Graph 扫描；Anchor 覆盖不完整、Block 形态/身份异常均整轮拒绝，普通正文忽略，非法显式块只计数。整批提交前重读所有候选，只经 `/candidates/discover` 写 Candidate；正式化再按 UUID 重读 version/hash/type/title，只生成 Proposal，最终仍经 Review 与 SemanticCommit。Desktop 已补齐 2 个合法候选 + 1 个非法项、整批保存 Object=0、编辑后 stale 零写入、重扫后只处理一项、READY/ACCEPTED 零正式写、Commit 和 Undo。真实运行同时关闭了显式同步旁路：无 Anchor Block 已有未完成 Candidate 时，Service 复用现有 SQLite 索引返回 `V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED`，Plugin 保持连接并引导继续审阅；已有 Anchor 的正常同步不受影响。未增加表、状态、扫描器、协议或写入路径。证据见 `docs/runtime/V2_CANDIDATE_REVIEW_DESKTOP_REPORT.md`。
- Slice B5 Project 原子创建已通过自动与 Desktop Gate：最终 `Projects / 对象` 工作区 → Logseq Page Adapter → Local Service → Application → SQLite；prepare 发行稳定 semanticCommit/object ID 但不创建领域对象，插件只精确检查/创建带三项所有权证据的 `Project/<名称>` 页面，finalize 校验页面 UUID/hash 后将 Project、Primary Anchor、Audit、Receipt 单事务写入。真实 Desktop 已验证成功创建、V2 Lifecycle/Condition 对象列表、未知同名零覆盖、页面改名后同 UUID/同 object_id、冷 reload，以及 finalize 请求到达时停止 Service 后 SQLite 目标对象为 0、受控页面保留、重启同意图只收口一个对象。没有新增表、扫描器、双写或平行恢复账本。E2E-19 `DONE`；详见 `docs/implementation/V2_PROJECT_PAGE_CREATION_CONTRACT.md` 与 Desktop 报告。
- Slice C0-C5 Proposal 安全闭环已有自动基础与 Desktop 部分通过：runtime schema、确定性两文件、scope/hash/risk/dependency Validator、语义组部分接受、Proposal/Group 持久化、submit/list/get/review/revalidate 均通过。Review UI 在同一卡片展示理解、最终预览、文本/语义 Diff、分组处置、提交前检查和独立最终确认；Desktop 已真实证明接受不等于生效、拒绝、两个独立组部分接受、Provider 同机器意图调整后接受、版本重验、最终确认、Graph+SQLite Commit、卡片 Undo 和 cold reload。
- 单 Block 正式化 Commit 只支持一个 accepted group 中耦合的一个 Patch + `CREATE_OBJECT`；prepare 先持久化 PENDING Graph/Domain steps，Plugin 逐次重读 before/after hash，finalize 才经 Application 原子物化 Object/Anchor/Audit/Receipt，全部 VERIFIED 后标记 Proposal `APPLIED` 并在原卡片显示生效与 Undo。Domain 冲突只在无后续编辑时补偿；未知响应最多幂等重试一次。重启时已存在的 PENDING intent 接受精确 before 或 after Graph 证据继续，不会把自己写入的 after 状态误判 STALE；RECOVERY_REQUIRED 可从同一入口补偿。
- C5 inverse Commit/Undo 已完成自动与 Desktop 验收：Undo 建立独立 PENDING 逆向 Commit，反向应用并验证 Graph Patch，再删除精确未变化的当前 Object/Primary Anchor 投影；immutable Audit、正向 receipt 和 inverse receipt 均保留，正向 Commit 收口 `UNDONE`。真实进程在正向与逆向 `PREPARED/PENDING` 后终止，同库重启后从 Review Center 续完原 semantic_commit_id，四步 `VERIFIED`、Pending/Recovery 0、Doctor PASS；后续编辑保护仍零覆盖。
- Slice E Now Work 纵向闭环已接入 SQLite → Application projection/Command → Local Service → Plugin 正式 Now Work 页面：严格三个可空区域，不显示分数；Focus 可在同一页面加入、移出和手动上下排序，写入以对象版本和当前完整顺序作并发前置，但不伪装成 Lifecycle/Condition 或完整 Audit；插入 rank 会事务性让位，stale 批次整笔回滚。每张有 active Primary Anchor 的卡片可安全解析当前 Logseq 页面并打开正文。近期可推进项限制 12 项，普通 Waiting 保持安静，仅复查到期或影响 Focus 才出现。类型筛选和按类型分组是纯会话视图状态；筛选/分组时不暴露基于局部列表的顺序按钮，必须回到“全部 · 混排”调整完整 Focus 顺序。Desktop 已完成 Focus 加入、两项上移排序与 reload 恢复、Anchor 打开、WAITING/BLOCKED、本地时间期限、阻碍唤醒，以及 Task、Project、Area 筛选/分组；筛选后 SQLite Focus rank、对象版本和 Audit 均不变。主导航键盘激活后焦点跨重绘保持，深浅主题 token 已在 Desktop renderer 分别验证；E2E-11 与 `V2-VIEW-001` 已完成。
- V2 Condition 手工闭环已贯通 Now Work 同页表单 → Local Service → Application `change_condition` → SQLite 现有 `condition_json`：ACTIONABLE / WAITING / BLOCKED / PAUSED 字段集合封闭，WAITING 强制等待对象、期待结果和合法复查时间，PAUSED 可带合法复查时间；BLOCKED 可从 OPEN 对象可读列表选择阻碍来源，不存在、关闭和自引用均零写入。Focus A 指向阻碍 B 时，旧的可行动 B 会提前进入“接下来值得处理”，安静 Waiting B 也会被唤醒进入“等待与复查”，并显示自然语言原因。对象版本、确定性幂等回执和 Audit 同事务；Condition 更新不改变 Lifecycle 或 Focus。没有新增表、Schema 版本或关系状态源。Desktop 已验证 WAITING、BLOCKED 与阻碍唤醒，并新增验证 PAUSED 含原因保存/读回、对话框关闭且 Focus/Lifecycle 不变；失败表单仍待集中验收。
- V2 Task 明确期限已贯通 Now Work 表单 → Local Service → Application `change_due_at` → SQLite schema v6 nullable `objects.due_at`：只允许 OPEN Task，合法时间/清除、对象版本、幂等 Receipt 与 Audit 同事务；七天内或已到期限可突破近期更新时间边界进入“接下来值得处理”，按实际时间先后排序并显示自然语言理由，绝不生成分数。v1..v5→v6 均需先创建并只读校验快照，DDL/ledger/metadata 单事务，失败回滚。没有新表、平行状态或第二恢复路径。真实运行库 v3→v6 迁移与独立 Service/CLI 已通过，Desktop 已验证写入、显示、CLI 读回、reload 保持和已有期限清除；失败输入 Desktop Gate 尚未完成。
- Review Center Candidate 已从会话预览升级为 SQLite 单一机器权威：当前页扫描仍有 256 Block 上限且不扫描全 Graph，整批提交前先重读全部 UUID/version/hash，随后只写 Candidate，不直接创建 Object。统一列表最多显示并瞬态重读同一批 50 项，按“原文→进入理由→建议”呈现；支持到期后再现的“7 天后再看”、保持普通内容、按稳定来源+类别+建议跨普通编辑抑制同一建议，以及生成唯一 Proposal；已有当前 Proposal 时服务端以 409 拒绝平行关闭/暂缓。首次正式化会在用户动作内建立 `id::` 后重读，并在正文 hash 不变时刷新 Candidate 版本再生成 Proposal，避免自制造 stale；若刷新请求瞬时失败，下一次点击可基于相同正文自动续跑而无需再扫描。Candidate 与 Proposal 绑定在同一 SQLite 事务，Review 前 Object=0。Proposal Commit 后 Candidate `RESOLVED`，Undo 后原 Candidate 回到 `PENDING`，且 `UNDONE + inverse COMPLETED` 重放会补做幂等 reopen；无差异 Graph Patch 不覆盖 `id::` 持久身份。真实 Service 集成已走完 Candidate→Proposal→Review→Commit→Undo 和 Undo reopen 故障窗口。`UPDATE` Candidate 的“更新已有对象”已通过完整 Desktop 视觉与交互 Gate：选择目标、编辑最终正文、审阅 Diff、accepted-not-applied、Commit、reload、Undo、再 reload、Candidate reopen 与 stale 零写入均已验证，`E2E-12` 已为 `DONE`。Review Center 双视图空态、键盘切换、焦点保持和深浅主题已补齐，`V2-VIEW-001` 为 `DONE`。
- 2026-07-20 Desktop 阶段 Gate：A-RT-01 与 A-RT-02 通过；专用页显式 Task 首次物化、同 object_id 标题更新、已知 Anchor 候选去重通过；Service 停止时正文连续两次可保存，重连同一 SQLite 后仅交付最新正文，object version 3→4。移除原 UUID Marker 后 Anchor 变为 `conflict`且原 Object 保持上一可信正文；恢复 Marker 后同 object_id/anchor_id 回到 `active`，version 5→6。Diagnostics 已真实显示完整 commit/listener snapshot 与显式同步 pending/transport/reconciliation 状态。同一测试库已在迁移前 0600 快照后从 schema v3 单事务升级至 v6，独立 Service + CLI status/Doctor/object list PASS，停止后 descriptor 清理且对象/完整性/Pending 计数不变；这不是期限 UI Desktop Gate。有限子树等剩余项继续验收，详见 `docs/runtime/V2_SLICE_A_B_DESKTOP_REPORT.md`。
- 2026-07-20 Desktop 后续 Gate：冷启动已加载 commit `572ea5dd5e47`，修复无界 bridge 探测、Electron 旧 bundle 缓存、V2-only 工作区被误锁和 V2 对话框漏传。专用测试库已真实完成 Focus 加入、WAITING 证据、Task 期限、reload 保持、第二显式 Task 经 `DB.onChanged` 物化、BLOCKED 可读选择器和阻碍唤醒、Task 筛选/分组、Primary Anchor 打开。CLI 读回对象 version 9 与期限/Condition/blockerObjectId 一致；未修改正式 Graph，证据保留在本地 ignored 专用页面与 `tmp/runtime/v2-desktop/`。
- 2026-07-20 Project Desktop Gate：修复 V2 actions 被 V1-only guard 拦截和 V2 对象页固定空列表后，成功创建并显示 Project；未知同名页零覆盖，页面改名与冷 reload 保持 UUID/所有权/object_id。真实 finalize 进程中断时 descriptor 清理、SQLite 零半对象，重启同意图复用受控页面并只收口一个 Project；临时未知冲突页已清理，两个受控 Project 留在专用测试 Graph 供后续 Review/Closure Gate。
- Proposal Desktop Gate：真实 Desktop 已验证审阅期改文导致 `STALE` 且零写入、Commit 后后续编辑拒绝 Undo 覆盖，以及高影响独立确认。2026-07-22 又完成两组依赖与暂缓闭环：后置组先接受明确失败，前置组暂缓时间/原因可见且 reload 持久，仍不能绕过依赖；按依赖顺序接受后只进入 `ACCEPTED`，对象/Audit/Commit 均未变化。正式同步、候选提交和 Proposal Commit 前继续确保 `id:: <Block UUID>` 持久身份；构建入口缓存键按内容摘要变化。
- 2026-07-22 Commit/Undo 进程故障 Desktop Gate：正向与逆向流程都在既有 `PREPARED/PENDING` 后真实终止 Local Service，插件立即进入 `formal writes false` 且不报假成功。同一 SQLite 重启后，用户从 Review Center 显式确认并续完原 semantic_commit_id；最终正文恢复、测试 Object/Anchor 移除、正向 `UNDONE`、逆向 `COMPLETED`、四步 `VERIFIED`、Pending/Recovery 0、Doctor PASS。没有新增 fault API、状态、协议或恢复路径；专用 Test Graph 页面已清理。
- 2026-07-22 E2E-16 Desktop Gate：隔离库先用既有同步入口在测试 Block UUID 建立 active Anchor 冲突；首轮合成版本被提交前重验安全标为 `STALE`。稳定身份重试经 Plugin Review 与最终确认后真实完成 Graph 写入，再因 Domain materialization 冲突进入补偿；Plugin 明示失败并恢复原正文，不报假成功。Proposal/Commit 为 `FAILED / DOMAIN_WRITE_FAILED`，Graph step `COMPENSATED`、Domain step `PREPARED`，唯一冲突对象未变；reload 后失败终态保持，Doctor `PASS / COMMIT_HEALTHY / 0`。没有新增 fault API、表、状态、协议或恢复器；测试页、descriptor 和隔离运行时已清理。
- 2026-07-22 E2E-23 Error Classification Gate：不重复 L3/L4；真实 endpoint 用单次非敏感无效 token 得到 `401→LLM_AUTH_FAILED`，真实 Keychain 配置请求在开始后 10ms Abort 并于 20ms 收口 `LLM_CANCELLED`。429 依规范使用真实 loopback HTTP server 验证生产 fetch、请求外形、两次有限尝试和 `LLM_RATE_LIMITED`，没有向 DeepSeek 制造洪峰。结合既有真实 timeout/truncated/empty 与 Provider 10/10 回归，Graph/Candidate/Proposal/正式 Store 写入均为 0；没有代码、错误码、重试、表或恢复路径变化。
- 2026-07-22 Ownership Desktop Gate：首次 HIGH Proposal 最终确认因 Project page Anchor 被通用 Block reconciliation 误判 `missing` 而安全变为 `STALE`，Ownership 保持 0。TDD 修复复用现有对象投影，仅让 TASK/MINI_PROJECT/DECISION/OUTPUT 进入 Block reconciliation，PROJECT/AREA page Anchor 留给 page workflow；不新增扫描器、状态或写入路径。修复后真实走完 external Proposal `validate→submit`、HIGH 接受零正式写、版本重验、最终 Commit、插件 reload、专用 Undo 与再次 reload；Task v5→v6→v7，Project v2 与 Anchor 均不变，普通 Association 始终为 1，结束时 integrity ok、Pending/Recovery 0、descriptor 已清理。详见 `docs/runtime/V2_OWNERSHIP_DESKTOP_REPORT.md`。
- 2026-07-22 Marker Desktop Gate：Task DONE/重复/移除不重开、相反终态冲突与 CANCELED 原因保护均通过。MiniProject DONE 进入唯一 HIGH Proposal，接受后仍 OPEN，专用最终确认后同一对象 v3→v4 COMPLETED；reload 和 Marker 移除均不重开，Proposal/Commit 为 APPLIED/COMPLETED，Condition/Focus 独立，Pending 0、integrity ok、descriptor 已清理。修复只复用现有 Proposal、同步回执与 SemanticCommit，没有新表、扫描器或恢复路径。详见 `docs/runtime/V2_MARKER_DESKTOP_REPORT.md`。
- 2026-07-22 DeepSeek L4 Desktop Gate：真实 Flash 完成当前块 Validator 安全失败、READY Proposal、普通记录 `NO_PROPOSAL`、直接接受、拒绝和同 proposal_id 调整标题后接受；确定性 external Agent fixture 完成两个独立组的部分接受。所有审阅均未执行最终 Commit，运行结束前 Object 0 / Commit 0 / Pending 0、Graph 原文未变、Doctor PASS。两次 Diagnostics 导出覆盖 ready/no-proposal/revised，credential-looking pattern 为 0；没有新增表、状态机、写入口或 Provider 绕过。详见 `docs/runtime/V2_DEEPSEEK_PROVIDER_L4_DESKTOP_REPORT.md`。
- 2026-07-22 原因化 Lifecycle Desktop Gate：Task 空原因被拒绝；取消 Proposal 接受后仍为 OPEN，最终确认后为 CANCELLED；Service 在最终响应后中断并以同一 DB 重启，Proposal/Commit 收口 APPLIED/COMPLETED、Pending 0。显式重开最终变为 OPEN，reload 后原因和 Undo 可见；Undo 恢复 CANCELLED，正向重开 Commit 为 UNDONE、逆向 Commit 为 COMPLETED，正文未变。Project HIGH 路径完成独立接受、最终取消、reload 与专用 Undo：同一对象 v2 OPEN→v3 CANCELLED→v4 OPEN，Page Anchor 始终 active。MiniProject HIGH 也在全新隔离库完成空原因拒绝、取消、reload、显式重开、reload 与重开 Undo：同一对象 v3 OPEN→v4 CANCELLED→v5 OPEN→v6 CANCELLED，正文、Anchor、Condition 与 Closure 不变，Pending/Recovery 0、Doctor PASS。
- 2026-07-22 UC-28 Desktop Gate：真实 Flash 完成 MiniProject Closure 三问草拟，失败可重试且零正式写；校对后 Closure 与独立遗留 Proposal 分别审阅。遗留 Task 的最终 Commit/Undo/reload 均通过，MiniProject Closure 保持 COMPLETED；非空 Block 零写入拒绝。首轮真实运行暴露 Logseq 写后旧读与连续插件写事件回声，修复后用有界 read-after-own-write 和同一 10 秒窗口内最多四个精确 hash 抑制收口，不新增状态源或恢复路径；结束时 Doctor/Backup PASS、Pending/Recovery 0，脱敏 Provider 证据已版本化。
- 2026-07-22 显式子树 Desktop Gate：真实首次显式 Block 曾因 `id::` 回声抑制误删原始同步而只写身份、不创建 Object；`c28fa06` 修复只在现有 pending 项保留“本次持久身份”来源位。修复后 Desktop 逐项/快速/整树粘贴、断线恢复与 cold reload 均通过；2 Task + 2 Decision、4 active Anchor，裸 TODO 零写入，pending 0、reconciliation false、Doctor PASS。无新表、协议、扫描器或写路径；详见 `docs/runtime/V2_EXPLICIT_SUBTREE_DESKTOP_REPORT.md`。
- 2026-07-22 Candidate 多项/stale Desktop Gate：真实预览 2 个合法项并计数 1 个非法项，整批保存后 Object 0。修改首项正文时，显式同步未绕过 Candidate 审阅、连接保持 READY；旧视图正式化明确 stale 且零写入。重扫后只将 OUTPUT 推进至 Proposal→Review→Commit→Undo，另一 Candidate 保持 PENDING；结束 Object 0，正向/逆向 Commit 为 UNDONE/COMPLETED，Doctor PASS。修复 `979b440` 只复用现有 Candidate 索引和 Explicit Sync 终态冲突分支。
- 2026-07-22 Area Desktop Gate：`Projects / 对象` 工作区已贯通受控创建、就地编辑、列表和版本冲突零覆盖。真实 Area 在同一 object_id 上 v1→v2→v3，旧 v2 对话框在并发变更后明确拒绝，SQLite 保留 v3；0 Anchor，Logseq 未创建普通或命名空间页面。复用现有 Object/Audit/Receipt 和 Local Service/Application Command，无新表、状态、Graph 写路径或恢复机制；证据见 `docs/runtime/V2_AREA_DESKTOP_REPORT.md`。
- 2026-07-22 Now Work Project/Area 过滤 Desktop Gate：真实 Area v3 与带 Logseq Page/active primary Anchor 的 Project v2 同时进入 Focus；Area、Project 类型筛选和按类型分组只改变可见卡片，筛选前后两条 Focus 的 object_id/version/rank 不变，Audit 保持 4，局部视图不暴露顺序按钮。无新增状态或写路径；证据见 `docs/runtime/V2_NOW_WORK_PROJECT_AREA_FILTER_DESKTOP_REPORT.md`。
- 2026-07-22 View 键盘/主题 Desktop Gate：Review 双视图与主导航可由 Enter/Space 操作，重绘后按稳定控件身份恢复焦点，toggle/current ARIA 明确且焦点环可见；Light/Dark renderer 分别命中独立 token。结合既有非空 Candidate/Proposal 专项，`V2-VIEW-001` 已为 `DONE`；无持久机制或正式写入，证据见 `docs/runtime/V2_VIEW_KEYBOARD_THEME_DESKTOP_REPORT.md`。
- 2026-07-22 V2 Runtime 权威收口：正常 Plugin 入口已删除 V1 Application/FileStorage 写 Runtime、Inbox 导航与 V1 Audit 写按钮；默认 Now Work、Project 重入、Audit 和 Diagnostics 都读同一 Local Service 投影，查询失败不再伪装为空历史。Logseq Desktop 0.10.15 冷启动真实显示全阶段 READY、formal writes/explicit sync/Graph bridge true、Pending/Conflict 0/0，无 Inbox/V1 操作。无新表、状态、协议或恢复路径；证据见 `docs/runtime/V2_RUNTIME_V1_WRITE_UI_RETIREMENT_DESKTOP_REPORT.md`。
- 2026-07-22 OD-008 release spike：npm 建议的 `@logseq/libs` 0.3.4 仍固定 DOMPurify 3.3.3 与 lodash-es 4.17.23，均落在当前 advisory 影响范围，因此 major upgrade 不能消除既有 2 high / 1 critical。隔离 0.3.4 在把 nullable Page Block tree 明确转成零写入失败后通过 typecheck、129 tests、build/bootstrap/dist；但把 SDK 改为纯类型依赖后，真实 Logseq 0.10.15 只有 `__LSP__HOST__`、不会自行建立 `window.logseq`，Plugin Frame 无法加载。该方案已拒绝并恢复；当前继续固定 0.0.17 runtime、保留 audit 风险，等待上游提供实质更安全构建后再走同一兼容 Gate。无 shim、fork、双 SDK 或隐藏 audit override；证据见 `docs/testing/logseq-libs-od008-spike-2026-07-22.json` 与 ADR 0007。
- 2026-07-22 最终 clean audit：追踪矩阵 39/39 `DONE`，开放 `ADR_REQUIRED` 0，skipped/only 测试 0，可执行 FIXME/stub 0；UI 的 HTML `placeholder` 均为真实输入提示，不是实现占位。当前代码的根级 typecheck/lint/全部测试（Plugin 130）、build、Plugin/架构边界、145 rules、acceptance rehearsal 与仓库边界全部 PASS，临时 Store 恢复 `differences: []`。Silent Overwrite、Pending/Recovery、Feature Flag、插件受限/关闭后正文可读和外层 Git 均复核；仅保留用户已有且从未暂存的 `apps/task-copilot-local-service/package.json` 改动。结论与证据见 `docs/runtime/V2_FINAL_CLEAN_AUDIT_REPORT.md`。

## 2026-07-28 交互产品化增量

`base_v2_status=IMPLEMENTATION_COMPLETE` 仍只表示底层领域、事务、安全、迁移、Provider 与
恢复能力完成；`ux_productization_goal=IN_PROGRESS`、`overall_goal=IN_PROGRESS`。
最新 `869127f` 已在真实 Logseq 0.10.15 File Graph 关闭 Page Context 用户语言与受控
Project Page UUID 漂移识别的代表性 UI Partial：一个突出主操作、工程词折叠、冲突
fail closed。P0/P1/P2 剩余宿主、Attention、Block Marker、Recovery 与 Final Release
继续开放，不能由旧 `V2_IMPLEMENTATION_COMPLETE` 标记替代。

## 当前证据

- Git：`feature/task-copilot-mvp`；当前阶段包含 Service/CLI 基础与 SQLite 恢复加固；
- 自动检查：2026-07-22 根级 `./scripts/check.sh` 的全部 typecheck/lint/test/build、Plugin/架构边界、145 rules、acceptance rehearsal 与仓库边界 PASS，0 failed/skipped。npm audit 既有 2 high / 1 critical 已由 OD-008 spike 证明当前无安全有效的自动修复目标，未使用破坏性 `audit fix --force`；
- Process smoke：独立 Service 进程、0600 descriptor、`tc --json status`、`tc doctor`、Backup create/validate、CLI Restore 停服、descriptor 清理、重启后 Doctor PASS、0700/0600 权限均 PASS；2026-07-20 又对 Desktop 测试库完成 schema v3→v6 迁移前快照、独立进程重启、CLI status/Doctor/object list 与停服清理，schema v6 / integrity / 对象数 / Pending 均符合预期；
- Runtime：`docs/runtime/V1_MVP_PILOT_REPORT.md`；
- V2 Desktop：需求级 Gate 总状态为 `V2_REQUIREMENT_DESKTOP_PASS`；E2E-01–24 和追踪矩阵条目均已有对应 Runtime Report，现在只进行 Release 审计；
- Recovery：Pilot 前后 bundle 均已做 checksum/readback；Pilot 后 8 objects、14 captures、23 proposals、20 commits、1 relation、66 events；
- Pilot 后恢复包 SHA-256：`4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`；
- DeepSeek：L4 Desktop 与 UC-28 live Provider 均 `PASS`；L3 黄金矩阵见 `docs/testing/deepseek-v4-golden-live-2026-07-22.json`，L4/UC-28 脱敏交互见 `docs/testing/deepseek-v4-l4-desktop-2026-07-22.json` 与 `docs/testing/deepseek-v4-uc28-desktop-2026-07-22.json`。

## 冻结与复用

- 复用：Domain/Application 分层、object_id、Anchor observation/rebind、Proposal DAG、SemanticCommit/inverse Commit、Pending/Recovery、A/B 恢复、Diagnostics、Logseq Adapter 和 runtime 测试纪律。
- 冻结只读：V1 FileStorage、恢复包、旧 Phase/Signal、Proposal/Commit/Event 历史。
- 淘汰：V1 长期写入模型、Phase/Signal 当前轴、Plugin 直写 Store、长期 V1/V2 双模式和双写。

## 下一步

1. 在隔离 Logseq Desktop 完成 Project 当前接口 Proposal → Review → Commit → reload → Undo → reload，并记录结构化证据；
2. 继续 Release 审计与根级全量检查；不重复 DeepSeek L3/L4、迁移、Restore、first-run 等未受影响的昂贵 Gate。

## 仍需用户决定

当前没有新的产品语义决定。真实 DeepSeek 配置已安全建立，不需要用户再提供 Key；L4/Review Center、E2E-23、copied-data 迁移、SQLite Restore 与 first-run/restricted Desktop 已通过。下一步只处理 Release 审计发现的真实缺口，不重复昂贵 Gate。
