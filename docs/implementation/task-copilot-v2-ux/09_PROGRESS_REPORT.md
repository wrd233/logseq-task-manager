# 交互优化实施进度

> 更新时间：2026-07-24
> 当前结论：`PARTIAL` — P0-A Focus、P0-B“暂时做不了”、P0-C 低风险“接受并应用”、
> P0-D Page 现场路由、P0-E 四项主导航、P0-F 工具栏介入摘要、P0-G 最近修改和 P0-H
> descriptor 私有 handshake 已完成自动与适用 Desktop 验收；P0-H 独立 Launcher、
> LaunchAgent、owned shutdown 与 crash/orphan recovery 已完成自动和真实进程 Gate，剩余
> Desktop reload/退出/Graph switch 视觉 Gate；P0-J 中文命令自动 Gate 已完成，剩余
> slash/palette/custom binding Desktop Gate；P0-K session origin route 与 P0-A 普通 Block
> “处理这条内容”自动 Gate 已完成，剩余 main/sidebar/Query/reference Desktop Gate 及其余
> P0 仍未完成。

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
| P0 代码实现 | IN_PROGRESS | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-I bounded scope DONE；P0-H code/process DONE；P0-J/P0-K 与普通 Block 路由 automated DONE；H/J/K/Desktop host Gate OPEN |
| P1 | IN_PROGRESS_PARTIAL_UI | P1-A/B runtime shadow、P1-C dynamic Now shadow、P1-D System/Proposal/Recent Changes/Now/Anchor consumer、P1-F Project workspace + main Page Head、P1-G unified UX contract + server-owned Project recovery + Plugin consumer + 真实 Provider、P1-H session disposition/噪声汇总真实 Service PASS；Attention 未展示，LLM/反馈 Desktop、跨会话 dashboard 与 UX-G008 persistence decision OPEN |
| P2 | NOT_STARTED | 依赖 P1 |
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
crash/orphan recovery 已由自动和真实进程证据闭合；当前等待不绕过桌面安全机制的集中
reload/退出/Graph switch Gate，同时继续其他独立 P0 项。

P0-J 自动 Gate 已完成；当前等待同一集中 Desktop 轮次验证 slash 可发现性、中文输入与
光标、命令面板、自定义 binding、受限态、主题和窄窗口。

P0-K 与普通 Block 内容路由自动 Gate 已完成；当前等待同一集中 Desktop 轮次验证 main
Page、right sidebar、Query/引用、来源移动/重命名/删除以及成功/失败/Undo 返回。

P1-A 已在不开放前台的边界内进入 Plugin session runtime：Attention Signal 纯派生字段、
自动失效、证据变化解除 cooldown、Recovery 不可冷却、有界容量/清理/遥测均已完成。
Plugin 只在 READY 且投影完整时读取 objects/proposals/commits/anchors；Graph switch 清空，
没有 SQLite schema 或用户可见信号；跨 reload 存储位置仍按 UX-G008 保持开放。

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
secondary-page 重入；Desktop 仍需验证实际 slot 生命周期、主题、窄栏与点击链。

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
动作默认不生成。`recover-context@1.1.0` 又把 prompt 中允许的 fact/action ID 固定放入
`uxAuthority`，不再要求模型从 prose 猜 ID。UX-G009 因此关闭为“不持久化派生 UX 草稿；
正式修改仍进入 Proposal”。

真实 LaunchAgent/Keychain/DeepSeek V4 Flash Gate 已通过：安装态 `bin/skills`、15 文件
Context Package、60 秒有界 timeout、4096 output-token 上限、lease heartbeat、strict
Validator、事实/推断/未知和只读 next action 均实际运行；调用前后正式 Object 投影不变，
release 后 owned Service 退出。此前的 20 秒 timeout 正确映射 504，Validator 拒绝正确映射
422，未放宽合同。真实 Logseq Desktop 点击、loading、stale、主题和窄栏仍开放。

Plugin 已把该路由作为 Project 重入卡内的可选显式动作接入，不在刷新、Page Head 或后台
shadow 中自动调用 Provider。确定性重入结论始终位于上方；Copilot 草稿只在 session 内保存，
分别显示 facts、inferences、unknowns 与 review-only suggestions，生成中、错误、Project
version stale 均不伪装为空。模型动作还必须匹配当前 deterministic projection 的
Primary Anchor 或 Recovery Commit，并复用既有 `v2-open-primary-anchor` / Audit route；
伪造或过期 target 只显示失效提示。Graph switch、Service reconnect/restricted 会清空草稿，
并发重复点击只产生一个请求。

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
release 后 owned Service 0、Launcher 1。当前只证明 Service 指标链可用；Desktop 反馈体验、
真实噪声阈值与跨会话 derivative 价值仍未完成。

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
- P0-I Desktop：正文核对注意状态与 Service unavailable 受限状态 PASS；
- 根级检查：PASS；
- rule coverage：145；
- recovery rehearsal：differences `[]`；
- 本轮已归档 41 张脱敏 Desktop 截图：P0-A/P0-H 7 张，P0-B 8 张，P0-C 5 张，
  P0-D 9 张，P0-E 4 张，P0-F 2 张，P0-G 4 张，P0-I 2 张；
- 历史 V2：39/39 traceability DONE、E2E-01–24 DONE、真实 DeepSeek/Desktop/恢复均完成。

## 下一步

1. 在 Desktop 中集中验证 P1-F Project workspace/Page Head、P1-G recovery draft、P1-H
   feedback 的 loading/error/stale、Light/Dark 与窄栏；用真实反馈判断噪声指标是否足够有用，
   再决定是否需要跨会话 derivative；
2. 汇总 P0-H/P0-J/P0-K 的 Desktop lifecycle、slash/palette/custom binding 与 origin；
3. 完成 P1-D
   System/Proposal/Recent Changes/Now/Anchor repair 的 Desktop 信息密度与恢复对照；
4. 用一次真实 reload/recompute 读回 Shadow telemetry，回答 UX-G008 是否需要跨 reload
   derivative，再汇总 Query/引用、Light/窄栏和 Service 生命周期 Desktop Gate。
