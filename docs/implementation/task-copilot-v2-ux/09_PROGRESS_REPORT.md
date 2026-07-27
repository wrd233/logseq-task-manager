# 交互优化实施进度

> 更新时间：2026-07-27
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
> Desktop；成功、失败、Undo 返回及其余 P0 仍未完成。

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
| P0 代码实现 | IN_PROGRESS_DESKTOP_GATES | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-H/P0-I bounded scope DONE；P0-H code/process、hidden reload、quit shutdown、无参数重装 authority、Graph switch fail-closed/切回均 Desktop PASS；P0-J palette/Slash 代表链/custom binding Desktop PASS；P0-K main Page、来源移动/删除与 Query/reference/right-sidebar bounded Gate PASS；中文 IME/受限视觉及成功/失败/Undo 返回 OPEN |
| P1 | IN_PROGRESS_P1G_DONE_OTHER_P1_PARTIAL | P1-A/B runtime shadow、P1-C dynamic Now shadow、P1-D status consumers、P1-E default-off Block marker prototype；P1-F Project workspace Desktop PASS、File Graph Page Head bounded/DB Graph OPEN；P1-G 真实 Provider 内容/error/rejection/stale/feedback/reload/Dark/Light/窄栏代表链 DONE；P1-H session disposition/噪声汇总真实 Service + Desktop disposition PASS；Attention 未展示，跨会话 dashboard 仍 OPEN |
| P2 | IN_PROGRESS_P2_AB_DONE_P2C_ALL_SOURCES_DONE_P2D_LIGHT_CONDITION_MEDIUM_HEAVY_CORE_DONE_P2E_MAIN_CHAIN_COMMIT_RESUME_PROVIDER_ERROR_AND_STALE_DESKTOP_DONE_RECOVERY_GATE_OPEN_P2F_SHADOW_PROVIDER_REPEAT_PASS_P2G_MIGRATION_FAILURE_RETRY_NARROW_AND_RESTORE_DOUBLE_FAILURE_DESKTOP_DONE | P2-A+B DONE；P2-C/P2-D/P2-E 核心链有 Desktop；P2-E receipt-backed Commit 中断→同 Commit 续跑→reload→Undo、Provider error 及 generation stale 零 Closure 写入均已 Desktop PASS，只剩真正 `RECOVERY_REQUIRED` OPEN；P2-F shadow/provider 无 UI；P2-G Rebind、Restore 正常往返、真实连续双重失败→人工恢复，以及 Migration through Activation 正常主链、Import 写后响应丢失、Verify/Activate failure→same-ledger retry 与 722px 窄栏均有真实 Desktop。Task Copilot 深色表面、reload 与 723px 窄栏已补 CURRENT；File Graph 自身 Light host Gate 仍 OPEN |
| 最终验收 | NOT_STARTED | `10_ACCEPTANCE_REPORT.md` |

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

P0-J 已从 `AUTOMATED_ONLY` 推进为代表性 Desktop partial：冷启动命令面板单组注册、Now/
系统状态路由、四条 Slash 可发现、`[任务] ` 代表插入和自定义 binding 配置/触发/清理均已
通过。连续 Plugin reload 的重复行经完整 restart 清除，按宿主 residue 记录而不增加第二
去重状态。Computer Use 不能可靠注入中文字符，因此原生中文 IME、受限态、Light 与窄窗口
继续 OPEN；完整记录见 `logs/p0-j-host-commands-desktop-live-20260726.md`。

P0-K 已完成 main Page 入口→来源说明→返回同一 Page 的真实 Desktop 代表链；Logseq 0.10.15
right-sidebar 专用菜单不提供 Plugin Page item，按 bounded host conclusion 安全隐藏，不猜测
secondary identity。`73fea9a` 又用脱敏 live query / block reference 页面确认：Query 投影
由宿主接管为页面预览，reference 只出现引用专用菜单，均不提供可靠 Plugin Block item；
因此安全隐藏并让用户先打开来源 Block，不增加 DOM hack 或投影身份状态。来源移动/删除以及
成功/失败/Undo 返回仍 OPEN；记录见 `logs/p0-k-host-origin-desktop-live-20260726.md` 与
`logs/p0-k-query-reference-host-bounded-desktop-live-20260727.md`。

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

### P1-E Block 轻标记隔离原型

本地 SDK 与官方 API 证实 `onBlockRendererSlotted` 是指定 Block UUID 的 condition hook，
`provideUI` 只能注入宿主提供的 slot。因此未采用会污染正文的 renderer macro，也未采用
MutationObserver/DOM selector 全局扫描。Plugin 新增默认 off setting，只对 active primary
Anchor 的精确 UUID 注册；LINE/DOT/ICON/TINT/PHRASE 五种 inert marker 只读取 Object
Lifecycle/Condition 与 Focus。关闭、Service restricted、Graph switch、unload 会清除当前
slots，Block 正文和 SQLite 均不变；只改 marker setting 不触发 Service rediscovery/lease churn。

focused 4/4 与 100 Block registration/injection harness、Plugin 231/231、typecheck/build PASS。
这是生产包内的隔离 prototype，不是发布：TODO/DONE、编辑光标、长文、父子、Query、引用、
Linked References、sidebar、Zoom、Light/Dark、renderer reload 与真实性能仍须 Desktop。

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
- P1-E Block marker prototype：focused 4/4、Plugin 231/231、typecheck/build PASS；默认 off、
  exact UUID、100 Block harness、slot cleanup 与 no-Markdown-write；Desktop OPEN；
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

## 下一步

1. 等待确认 P2-E 真正 `RECOVERY_REQUIRED` 的安全语义；决定前保留现有
   `PENDING` receipt resume 与人工补偿边界，不制造假恢复证据；
2. P2-G Rebind、Restore 正常往返、激活失败→自动回滚以及真实连续双重失败→HIGH Review→
   人工恢复→Doctor→清锁→正常 Launcher/reload 均已完成真实 Desktop Gate；下一次可控
   Rebind 仍需验证新的纠错/整库恢复指引。Migration 已完成 ledger、受控 scan、逐项
   Review/Preview、恢复点/Import/Verify/Undo 与 HIGH Activation 正常主链；真实运行先以
   `MIGRATION_SNAPSHOT_CHANGED` 证明单恢复基线边界，再修复为复用/重验计划原快照。
   当前正式对象 5、run ACTIVATED、Pending 0，`2beb1b5` 完整 restart 后只保留只读交接
   台账与 Backup/Restore 路由，新 scan/Review/Import/Undo/Activate 均退出。写后响应丢失
   已完成真实 `ledger→reload→Verify→Undo`，Verify/Activate 失败也已完成同 ledger
   重试和当前构建 reload；`7fcdcf5` 又完成 722×720 窄栏代表 Gate。Light 设置在
   Logseq 0.10.15 File Graph 完整 Reload 和完整 quit/reopen 后均回到深色宿主，继续作为
   bounded host issue；退出后旧 Service PID 按 lease 停止，重开后同一 Launcher 启动新
   Service 并自动恢复正式能力。继续 Rebind 最新指引，不得加入
   第二迁移或恢复状态源。
3. 集中关闭 P0-J 中文 IME/受限视觉与 P0-K Query/reference/来源变化返回，并继续 P1-F
   DB Graph Page Head、P1 Attention 开放门和 Block Marker；P0-H 不再重复扩大宿主矩阵。
