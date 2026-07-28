# Current Golden Flows

## P1 Project Context Recovery

状态：`DONE_REPRESENTATIVE_DESKTOP_PROVIDER_GATES`

1. 用户从 Project workspace 看到确定性重入结论、关键依据与当前可定位进入点；
2. 只有用户显式点击“帮我恢复上下文”才调用 Provider，刷新/Page Head/shadow 不自动生成；
3. Service 以 `objectId + expectedVersion` 读取正式 Project、关系、Focus、Anchor、最近 Commit，
   构造 server-owned Context Package、fact/action allowlist 与 fingerprint；
4. loading 期间保留确定性基线，重复点击不产生第二请求；
5. 真实 Provider JSON 进入 Unified UX Validator；模型只能选择机器 fact/action/evidence ID，
   中文前台自然语言由 `unified-ux-generator@1.2.0` 统一检查；
6. 前台只显示核心理解、已确认事实、少量判断和仍不知道；建议动作仍是只读 route；
7. 用户可提交可撤回 session disposition；一次生成只形成一个 Provider call 和一个 evidence
   event，不保存正文、对象 identity、Prompt、原始响应或 Key；
8. reload/Service restart 清除草稿和反馈，重新从正式状态计算；生成和反馈均不创建
   Proposal/Commit。

当前真实结果：`653875a` 的 `recover-context@1.3.0` 已让上一轮反身 unknown 误判不再复现，
并用独立真实 Provider 样本证明真正的业务 unknown 仍会保留；两个样本均 1 attempt。Provider
error、统一 Validator rejection、真实 DeepSeek 延迟 stale、feedback、reload、Dark/Light
和约 720 px 窄窗均有当前证据。stale 期间 Project v17→v18→Undo v19，最终
`STALE=1 / GENERATED=0`、`PENDING=0 / RECOVERY_REQUIRED=0`。Logseq 0.10.15 File Graph
不挂载 Page Head slot，安全隐藏为 P1-F 的有界宿主结论；DB Graph Page Head 仍 OPEN。
CURRENT 权威截图为 `p1-g-07`～`13`，完整记录见
`../logs/p1-g-context-recovery-1-3-desktop-live-20260726.md`。

## P2-C Blank Project Creation

状态：`ALL_SOURCES_DONE_VISUAL_GATES_OPEN`

1. 项目 → 正式事项与创建 → 开始梳理 Project；
2. Service 构造 Blank Context，真实 DeepSeek 每轮只处理一个机器选定的不确定性；
3. 前台分开显示事实、推断和未知；回答只进入 session；
4. 七个机器维度齐备后生成最终阅读预览，仍为零正式写入；
5. 用户进入待我确认，独立接受唯一 HIGH 组；此时仍未创建 Object/Page/Commit；
6. 最终确认后先 prepare，再创建或复用已审阅 Page，最后原子写 Project、Anchor 与当前接口；
7. 若中断，只恢复同一 SemanticCommit，不新建重复 Project；
8. reload 后从项目与最近修改读回同一正式投影；
9. Undo 重新校验 Page ownership、受控 metadata-only 内容和对象版本；专用 Page 按 name
   删除，复用来源 Page 原样保留；
10. 再次 reload 后系统状态必须 READY，Pending/Recovery/Anchor conflict 为零。

当前真实结果：Blank Dark 主链 PASS。Page“保留来源另建”主链也 bounded PASS：真实
DeepSeek 七轮收敛，来源三段正文逐字保留；完整 Logseq restart 后 runtime UUID 漂移，
专用 Undo 只以 Service 原账本加精确 Page name/owner/object/commit metadata 安全重绑，
随后移除 Project/Anchor/受控空 Page；再次 restart 后系统健康。Page“升级当前 Page”也
PASS：模型在原材料要求另建与用户明确 reuse 的冲突中保留两者并以用户决定收口，创建/
restart/Undo/restart 全程 Page properties 和三段 Block UUID/content/properties 与创建前
逐字段一致。

MiniProject 演化也已 PASS：正式 Object/version + active Primary Anchor + 精确 Block
子树由 Service 有界读取，七项真实不确定性收敛后只允许
`CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE`；最终 Preview 将五个来源 Block 全部标为
`LINK_AS_SOURCE`。HIGH Review 接受仍零正式写，最终确认才创建专用 Project Page、Project
Object 与 Anchor。reload 后 Project workspace 可重入，inverse Undo 移除本事务拥有的空
Page/Object/Anchor，原 MiniProject v14/OPEN、Primary Anchor、五个 Block UUID/正文/顺序
逐字段不变。首轮真实运行发现 Undo 只回到 Journal；`7a7492a407ed` 将 Service 审阅过的
source return target 传回 Plugin，并只在正式 Page 或 active Primary Anchor 可重验时导航。
最新构建再次跑通真实 DeepSeek 全链，Undo 精确返回原 MiniProject 根 Block，再次 reload
后 `0/0/0`。`2adfc35` / `efb3864` 又用 Page 来源真实 Provider 链关闭 Preview / HIGH
Review 的代表性视觉 Gate：Preview 固定为四区，Review 先显示影响与安全边界，系统理解
只保留两句而完整方案折叠；Dark 1000/762px 和 Light 1000px 均有当前截图。该样本 9 次
显式 Provider 请求、0 rejection、
0 retry，但出现一次已回答 Page 关系的重复提问；继续作为既有 Skill 的通用
answer-evidence 质量债，不新增样本补丁。因此 P2-C 的来源功能矩阵已闭环，Preview /
Review 代表性 Light/窄栏已关闭；新 Project Page、其他宿主位置和集中视觉 Gate 继续 OPEN，
不影响 P2-D 启动但仍属于最终验收。

## P2-D MEDIUM Project 当前摘要

状态：`DONE_MEDIUM_VERTICAL_P2D_STILL_IN_PROGRESS`

1. Project → 调整 Project → 只压缩当前理解；
2. Service 读取版本化 Project interface 并构造有界 Context Package；
3. 真实 Provider 按 `recover-context@1.2.0` 输出 Unified UX 草稿；
4. Validator 拒绝机器身份进入前台 prose，机器保留事实、风险、scope 和动作权威；
5. Service 物化唯一 MEDIUM `UPDATE_PROJECT_NARRATION` Proposal；
6. 用户接受、提交前重验并最终确认；只有 `currentSummary` 进入正式 Commit；
7. reload 后“现在”读回新摘要，结构、Focus、Ownership 和 Graph 不变；
8. 最近修改把该操作路由到 Project interface 专用 inverse Commit；
9. Undo 恢复原摘要，再次 reload 后 READY、`0/0/0`。

真实结果：Provider 前两次因 `FRONTSTAGE_PROSE` 安全拒绝且零写，Skill 1.2.0 后通过。
长期 Undo 首次暴露通用 Block 路由错误，修复后 Object v2→v3→v4，摘要往返而全部结构字段
守恒。P2-D 的 LIGHT/HEAVY 与视觉 Gate 仍开放。

## P2-D HEAVY 完整 Project interface

状态：`DONE_ONE_HEAVY_VERTICAL_P2D_STILL_IN_PROGRESS`

1. 影响路由进入“完整当前接口与结构关系”；
2. 用户在一屏内填写摘要、1–3 个当前推进、Objectives、Deliverables 与 Work Stages；
3. 机器只生成唯一 HIGH `UPDATE_PROJECT_INTERFACE` Proposal；
4. 用户独立接受 HIGH 语义组；正式状态仍不变；
5. 提交前重验后再确认最终 Commit，SQLite 原子更新 Project aggregate，不改 Graph；
6. reload 后“现在”和 Project 重入从同一正式投影读回；
7. 最近修改进入 Project interface 专用 inverse Commit；
8. Undo 后再次 reload，原 Project aggregate 精确恢复且系统健康。

真实结果：Project v4→v5→v6。Commit 后一个 Objective、一个 Deliverable、一个 Work Stage、
三项 Focus 与摘要完整读回；Undo 后恢复原摘要、单一 Focus 和空结构。Graph、Ownership、
Lifecycle 与 Condition 不变，Pending/Recovery/Conflict `0/0/0`。Ownership、正文移动、
批量子对象、拆分合并与 Closure 仍需各自安全链，不因本链完成而降级。

## P2-D LIGHT Condition durable Undo

状态：`DONE_LIGHT_CONDITION_VERTICAL_P2D_STILL_IN_PROGRESS`

1. Project → 调整 Project → 更新状态；
2. 版本化 direct command 只改变 Condition；
3. receipt 持久保存变更前 Condition，Plugin session 不充当 Undo 权威；
4. reload 后 Project 投影读回 PAUSED 状态与原因；
5. 用户选择撤销最近状态，Service 准备 server-owned inverse；
6. 确认时重验当前 Object version 与 Condition；有任何后续变化即安全停止；
7. inverse command 恢复 ACTIONABLE，再次 reload 读回原确定性投影；
8. Lifecycle、Focus、Ownership、正文与 Project 当前接口保持不变。

真实结果：Project v8→v9→v10，最终结构逐字段恢复。普通 Association 因没有 remove/inverse
不进入正式路由。CURRENT `p2-d-11`～`p2-d-13` 对应 `58bf6306d04d`。该结论只关闭
Condition 这一条 LIGHT 链；Focus/reviewAt、Association 和其他 HEAVY 类型仍开放。

## P2-E Project Closure evidence → Provider → Commit → Undo

状态：`NORMAL_MAIN_CHAIN_DONE_FAILURE_RECOVERY_GATE_OPEN`

1. Project → 调整 Project → 整理 Closure 证据；
2. Service 从 SQLite 当前权威读取 OPEN Project、Project interface、正式 Objects 与直接
   Primary Ownership；Association、孙级对象与 LLM 判断不升格为成果；
3. Preview 分开显示候选证据、未收口工作、显式 unknown 与仍需用户判断的内容；
4. 用户逐项确认实际结果、Objective disposition、遗留、关键 Decision 与未来重入；
5. 真实 Provider 只能逐字组织已确认判断；Validator 锁定 evidence、scope、版本和两项
   Closure operation；
6. 单组 HIGH Review 接受后仍零正式写；最终确认才通过一个 SemanticCommit 原子写入
   Closure 与 `COMPLETED`；
7. 专用 Undo 以 forward plan/steps/receipt、当前 version/checksum 和无后续变化重验，
   原子恢复 `OPEN` 并移除本次 Closure，不改 Logseq Page；
8. Undo 后直接返回 Project 重入；Plugin reload 后同一 Project 再次出现在 Now Work。

真实结果：前向链 `1ec63ac`，当前 Undo/reload 构建 `06907f34b8d2`，Logseq 0.10.15，
Dark，`994×700`。真实 `deepseek-v4-flash` 通过 production Validator；最终回读为
Project `OPEN v13`、Closure absent、forward Commit `UNDONE`、inverse Commit
`COMPLETED`、`PENDING/RECOVERY_REQUIRED/FAILED=0`。CURRENT `p2-e-10`～`p2-e-12`；
`p2-e-05`～`p2-e-08` 为历史真实前向链，`p2-e-09` 是已修复的无 Undo 缺陷。当前构建的
Provider error/stale 与 Commit failure → Recovery resume 仍需 Desktop 证据，因此 P2-E
整体仍是 Partial。

## P2-G Rebind 受控正文恢复

状态：`NORMAL_MAIN_CHAIN_DESKTOP_DONE_RECOVERY_UNDO_GUIDANCE_OPEN`

1. reload 后 reconciliation 只检查已知 Anchor，并将不可读旧正文标为 missing；
2. 用户系统状态先说明正式事项仍在、受影响能力、数据安全和唯一主动作；
3. 用户点击“开始重新连接”，Plugin flush 既有显式同步后打开最长 5 分钟的受控选择窗口；
4. 用户回到 Logseq 新建或选择显式替换 Block；窗口内暂缓自动物化，避免创建第二个正式事项；
5. 预览只显示目标标题/类型、候选事项和翻译后的连接状态，不显示任何机器身份；
6. 已经连接到另一正式事项的目标在确认前拒绝，Service 安全规则不放宽；
7. 用户选择候选并单独确认；提交前重读 Block version/hash 和候选 Object/Anchor 证据；
8. Service 原子 Rebind，旧 Anchor 保留为 `replaced`，新 Anchor 成为唯一 `active`；
9. Plugin 恢复显式同步并排空捕获窗口内 pending change；
10. reload 后用户系统状态健康，`0/0/0` 且 reconciliation false。

真实结果：`344c705ec446`、Logseq 0.10.15、Dark、994×700。受控窗口中新建目标在正式
提交前 `matching_objects=0`；提交后仅一个正式对象，旧 Anchor `replaced`、新 Anchor
唯一 `active`。CURRENT `p2-g-07`～`12`。专用 Recovery/Undo 引导仍 OPEN；Restore
状态差异/失败链和 Migration 也未完成，故只关闭 Rebind 正常主链，不关闭 P2-G。

## P2-G Backup/Restore 产品入口

状态：`FRONTSTAGE_STATE_DELTA_ROUNDTRIP_AND_FAILURE_ROLLBACK_RELOAD_DESKTOP_DONE`

1. 更多 → 备份与恢复只读取当前 Graph 的 Service-owned 最近快照；
2. 前台只显示时间、正式事项数量与校验结果，DOM 不保存 Backup ID 或数据库路径；
3. 选择后由 Service 再校验，并说明 SQLite、Logseq 正文、恢复点与自动重启的最终影响；
4. 未勾选单独确认时不发送 Restore；
5. 确认后先 flush 正文同步并检查 PENDING、RECOVERY_REQUIRED 与 reconciliation；
6. 复用固定确认、恢复点、offline atomic Restore、descriptor 删除与 Service 自停；
7. Launcher 为同一 Graph 重建 owned Service，Plugin 自动回到 READY；
8. reload 后恢复前快照仍在目录中且完整性 PASS；
9. 若 atomic activation 失败但原库可回滚，界面只显示一次“恢复未完成”，明确原正式状态
   已重新可用且恢复点保留；
10. 失败后的 Launcher 重连与 Plugin Manager reload 必须清除陈旧错误，并由 Doctor 证明
    当前正式状态健康；
11. 系统状态必须显示当前构建身份与 `0/0/0`。

真实结果：`6ae8f2fcebd0`、Logseq 0.10.15、Dark、994×700。首轮
`6415dd14b568` 真实运行发现成功态残留未确认错误，因此不计 CURRENT；修复后重跑未确认
零请求，owned Service PID `47467→47600`，目录 `2→3`，reload 后 Runtime/Store/Service
READY 且 `0/0/0`。随后真实 Now Work 把测试 Task `ACTIONABLE v5→PAUSED v6`，旧快照
Restore 读回 `ACTIONABLE v5`，自动恢复点反向 Restore 又读回 `PAUSED v6`，最后恢复
ACTIONABLE 基线；每步都经真实 Desktop 发起和 Local Service 逐字段读回。CURRENT
`p2-g-13`～`19`。

`0c4526d4006f` 当前构建又在隔离 Graph 对活动 SQLite 注入真实文件级写入拒绝。atomic
activation 失败后，原正式 objects 5 与版本 `[1,5,6,13,14]` 完全保持，Restore 前恢复点
schema 12 / integrity ok / foreign-key 0，owned Service PID `99248→99711`，Doctor PASS。
前台只显示一次回滚结论，Plugin Manager reload 后系统状态恢复健康。CURRENT
`p2-g-44`～`46`。这关闭激活失败→自动回滚→重连→reload 主链；自动回滚也失败时的手工
Recovery 向导和 Light/窄栏仍 OPEN，所以不关闭 Restore 全部 Gate 或 P2-G。

其后 `2eb6df1` 只升级自动安全边界：恢复先排空已进入请求；同 Graph Launcher 不会并发
生成两个 Service；私有互锁只在恢复点校验通过后从 `ARMED` 升为
`RECOVERY_REQUIRED`，所有创建/升级/清除均经跨进程 mutation lock，旧记录不能覆盖或删除
新记录。双重失败的自动合同必须完成匹配恢复、Doctor PASS 后才清锁。此提交未产生新的
Desktop 截图，也未把手工 Recovery 向导升级为 DONE。

`e418c87` 继续修复自动-only 的多 Graph 与进程生命周期边界：interlock/lock 使用数据库
绝对路径摘要隔离并校验 Graph identity；同一 Graph 的 ensure、最后 lease release、reap
和 close 完全串行，替代 Service 必须等待旧 Service 完成 stop。它同样没有新的 Desktop
截图，不改变上述 CURRENT 界面结论。

`cb87d86` 最后关闭互锁读取 TOCTOU 与租约回收 heartbeat 竞态；最终双轴 review PASS。
这仍是自动-only 安全证据，没有产生新界面或改变手工 Recovery 向导的 OPEN 状态。

`16bde9ad88a5` 又用隔离测试库的受控 `RECOVERY_REQUIRED` 前置条件完成真实 Desktop
用户状态→HIGH Review→保存当前歧义状态→恢复保留基线→Doctor→exact clear→Service
重连→完整 Logseq quit/restart。活动库从 6 个对象恢复为 5 个基线对象，合成歧义对象只保留
于新安全快照；最终系统、Store、Service READY，Pending/Recovery/Source Conflict 为
`0/0/0`。CURRENT `p2-g-47`～`50`。该链关闭“人工恢复用户纵向链”的受控 Desktop Gate，
但不把人为建立前置状态冒充真实 Restore 连续双重故障；真实 double-failure 与 Light/窄栏
继续 OPEN。

本轮 Desktop 发现的三项通用缺陷均在重跑前修复：用户恢复页不再显示数据库/诊断术语，
恢复成功后复用同一 runtime recovery 刷新正式能力而不残留只读误报，健康页内部枚举只留
折叠技术详情。主面板壳层和“更多”页仍有工程词，作为下一高频复杂度 Gate 处理。

## P2-G Migration session-only 只读扫描

状态：`READONLY_SCAN_DESKTOP_DONE_ITEM_REVIEW_AND_WRITE_OPEN`

1. 更多 → 迁移；
2. 用户通过原生文件选择器明确选择脱敏 Recovery Bundle；
3. Plugin 在读文件前检查 2 B～8 MiB，并在本地解析 JSON；
4. Local Service 对 Bundle 做完整只读校验，Plugin 只投影五类计数；
5. 前台首先说明“正式变化 0”，不显示正文、identity、hash、内部文件或 run；
6. 用户放弃后立即清空；再次扫描后 reload 也清空；
7. 非法 JSON 不发起 Service scan，并保留可重试入口；
8. 最终系统状态与 SQLite 回查证明 run/batch `0/0`、Pending/Recovery `0/0`。

真实结果：`15b976d28ec3`、Logseq 0.10.15、Dark 宿主、994×700；CURRENT
`p2-g-20`～`25`。此链只关闭材料选择与 read-only scan；逐项 Review、恢复点、Import、
Verify、Activate、failure resume 和 Undo 仍 OPEN，Migration/P2-G 不提前关闭。

## P2-G Migration 逐项 Review 与 PREVIEWED 计划

状态：`ITEM_REVIEW_AND_PREVIEW_DESKTOP_DONE_IMPORT_GATE_OPEN`

1. 用户明确选择脱敏 Bundle 并完成既有只读 scan；
2. 每项只显示 session-only 规范化单行摘录、来源类型、旧状态和机器建议；
3. 缺少机器建议时保持空选择；结构冲突不可导入；非导入决定必须写判断依据；
4. 每项先独立保存，全部完成后才出现唯一主动作“保存审阅并创建迁移计划”；
5. Service 重新读取同一 Bundle，并由 Application/Domain 正式 Validator 解析全部决定；
6. 只创建 `PREVIEWED` review ledger，不创建正式对象、batch 或恢复点；
7. reload 后 Bundle、摘录、identity map 和决定释放；计划卡持久保留；
8. SQLite 回查 run/batch `1/0`、formal objects 4、Pending 0。

真实结果：`c660f2d00be5`、Logseq 0.10.15、Dark 宿主、994×700；CURRENT
`p2-g-26`～`29`。一行摘录只用于当前脱敏测试会话，不推翻“不持久化/不记录完整正文”的
隐私边界。恢复点、Import、Verify、Activate、failure resume 和 Undo 仍 OPEN。

## P2-G Migration 恢复点、Import、Verify 与 Undo

状态：`IMPORT_VERIFY_UNDO_MAIN_CHAIN_DESKTOP_DONE_ACTIVATION_FAILURE_GATES_OPEN`

1. 从 reload 后仍可见的 `PREVIEWED` 计划点击“准备下一批”；
2. 重新选择同一 Recovery Bundle，系统只读核对 source、计划和未导入 Review scope；
3. 用户选择 1～50 项本批范围；未选择或 identity 失效时零恢复点、零正式写；
4. 创建服务端恢复点并要求 Doctor PASS，随后才显示独立 HIGH 最终确认；
5. 明确确认后经唯一 Migration Application/SQLite transaction 导入；
6. 导入成功只显示“等待验证”，不能直接 Activate；
7. Verify 逐项检查正式投影，PASS 后才显示受保护 Undo；
8. 完整 Logseq restart 后 Bundle/backup ref 释放，batch 与 Undo 从正式 ledger 重建；
9. HIGH Undo 只删除本批未被后续修改/引用的对象，保留 Review/Validation/Audit；
10. 第二次 restart 后 `UNDONE` batch 和下一批入口仍可读。

真实结果：`593d14ac2c7`、Logseq 0.10.15、Dark 宿主、994×700。SQLite formal objects
`4→5→4`、run `PREVIEWED→IMPORTING→VERIFIED→PREVIEWED`、batch
`IMPORTED→VERIFIED→UNDONE`、validation PASS、Pending 始终 0。CURRENT
`p2-g-30`～`37`。Activate、失败注入、Service 中断不确定恢复、完成后退出日常 UI 和
Light/窄栏仍 OPEN，因此 Migration/P2-G/整体 Goal 不提前关闭。

## P2-G Migration Activation

状态：`ACTIVATION_MAIN_CHAIN_DESKTOP_DONE_FAILURE_RECOVERY_GATES_OPEN`

1. Undo 后重做或后续批次重新选择同一 Recovery Bundle；
2. 只读核对计划与 pending scope，复用并重新校验整项计划唯一导入前恢复基线；
3. Import 后必须 Verify，run 达到 VERIFIED 才出现“准备启用 V2”；
4. 独立 HIGH Review 明示 V1 只读、无双写；缺确认零请求；
5. 固定确认经 Local Service/Application/SQLite 单一链启用；
6. 完整 Logseq restart 后 run 仍为 ACTIVATED，V1 只读结论保留；
7. 不再提供新 Bundle scan、Review、Import、Undo 或重复 Activate，只保留只读交接台账和
   Backup/Restore 路由。

真实结果：`f42b62d`、Logseq 0.10.15、Dark 宿主、994×700。首次重做被
`MIGRATION_SNAPSHOT_CHANGED` 安全拒绝，修复后 objects `4→5`、Pending 0，旧 UNDONE 与
新 VERIFIED batch 均保留，run `PREVIEWED→IMPORTING→VERIFIED→ACTIVATED`。CURRENT
`p2-g-38`～`43`；其中 `2beb1b5` 的 `p2-g-43` 证明完成态已退出日常迁移操作。失败注入、
Service 中断/不确定恢复与 Light/窄栏仍 OPEN，因此 Migration/P2-G/整体 Goal 不提前关闭。

## 交互评估

- 优点：用户只需一次回答一个问题；确定性基线和正式安全链未被 LLM 覆盖；恢复复用同一
  Commit；最终健康态不要求理解技术状态机。
- 已修复：英文/双问题输出、Preview 关系枚举冲突、Logseq properties Block 被误判为正文、
  最近修改误路由通用 Undo、`deletePage` UUID/name 契约、删除读回延迟、完整 restart 后
  runtime UUID 漂移、mounted diagnostics 旧快照、Grill validation 错误误报 500，以及
  MiniProject 演化中的 machine identity/fact key 泄漏、错误 closure 对象和 evidence
  rejection。统一 Validator 现在给出安全分类，并只做一次有界自动修复。
- 待改进：Review 历史卡片密度偏高；“尚不能确认安全撤销条件”与可点击的预检式 Undo
  同屏时仍可能让用户困惑；真实 Provider 多次给出超出 Page 写入权限的建议，虽被 Validator
  安全拒绝但增加重试负担；最新 MiniProject 重跑的最终 Preview 前两次也被安全拒绝、第三次
  在同一答案集上通过，说明分类虽安全但真实拒绝率与用户诊断仍需降低；reuse Preview 还有
  重复“完成证据”标签；新 Project Page
  首屏仍直接露出 ownership/object/commit properties，虽不泄密但工程味过重。需要在既有
  Skill/renderer/Page Head 中继续压缩；Condition 表单也应在标题中显示目标对象，避免用户
  把 blocker 候选误读为当前修改目标。后续状态翻译 Slice 还需把剩余撤销文案统一为“撤销时
  会重新检查”。
