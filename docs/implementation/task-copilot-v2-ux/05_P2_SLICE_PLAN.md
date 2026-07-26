# P2 Slice 计划：复杂对象治理

## P2-A：MiniProject Grill Me

状态：`BOUNDED_VERTICAL_SLICE_DONE`

已完成的有界部分：Application 已建立 session-only Grill Turn 契约。机器按当前材料中的
critical、priority 与 evidence 选择最大开放不确定性，机器独占 readiness；四个维度和
未分类材料未全部安全解决前不得进入结构预览。模型只能返回理解草稿、事实引用、推断、
未知、最多三问和带取舍的建议，未知 ID、越界证据、固定字段外输出及提前结束均 fail closed。
该契约没有 Proposal、operation 或正式对象写入能力，术语边界见根目录 `CONTEXT.md`。
Local Service 已接入版本化 `mini-project-modeling@1.2.0`、精确 Primary Anchor 子树的
Logseq read bridge、正式对象 Context Package、结构化 Provider、前后 Object/Anchor/子树
stale 重验和两轮 answer→next-focus 自动闭环。回答只成为当前请求的 session fact；路由
不写 SQLite/Graph，也不生成 Proposal。

真实 `deepseek-v4-flash` 已在 Keychain-only 配置下完成两轮 Provider→Validator Gate：第一轮
聚焦 boundary，用户边界回答后第二轮转向 outcome，两轮均保留事实/推断/未知与带取舍建议。
之后 Graph read bridge 已接入正式 Plugin→Service 路径；隔离 Desktop 中完成四轮真实
`deepseek-v4-flash` 自适应 Grill，覆盖 Validator 拒绝后保留回答并安全重试、四个真实不确定性
依次收敛、最终进入 preview。该结论只证明当前 MiniProject 纵向场景，不等于所有 P2 完成。

Plugin 已接入 Objects 卡片，并让既有“处理这条内容”在正式 MiniProject Block 上按点击时
身份路由 Grill，未增加固定宿主菜单项；提供 session-only 多轮
理解/事实/推断/未知/建议/问题 UI。每轮前后重验对象，Provider error 保留上一轮，stale、
duplicate、Graph switch/restricted/cleanup 清空与返回原 Block 均已有自动合同；UI 不暴露
未审阅的正式写入动作。独立最终阅读/结构预览也已接线：Application Validator 强制
每项原材料恰好出现一次、root 保留、越界 evidence 拒绝、未归类原位保留和机器零删除；
Service 前后重验同一 Object/Anchor/subtree；Plugin 展示阅读结果与 impact，并只允许进入
独立 HIGH Proposal Review，不提供绕过 Review 的直接应用按钮。
真实 `deepseek-v4-flash` 预览在 canonical identity-property 修复后通过 5/5 材料守恒、
0 删除、0 未分类 Gate；Desktop 又完成 Preview→Proposal Review→Commit→reload→Undo→reload
并返回原根 Block。Skill 已升级为 `mini-project-modeling@1.2.0`，追加 follow-up history 和
已回答问题避重，避免连续轮次重复追问。P2-A 的当前纵向 Slice 因此从 Partial 变为 Done；
跨场景内容质量、P2-C Project Grill 和完整交互证据产品化继续由后续 Slice 验收。

循环：

1. 读取有限子树；
2. 总结当前理解；
3. 区分正式事实、Copilot 判断与未知；
4. 找最大真实分歧；
5. 每轮提出一组相关问题并给推荐；
6. 用户修正后更新理解；
7. 边界、成果、完成判断与无法归类内容都有安全去向后停止；
8. 生成最终阅读预览；
9. 进入 Proposal Review；
10. 正式 Commit 与 Undo。

不得把标题、成果、背景、动作、完成标准逐项固定询问。

## P2-B：MiniProject 原位重构

状态：`BOUNDED_VERTICAL_SLICE_DONE`

代码审计确认现有通用 Proposal Commit 只能执行一个 Block patch，正式 Adapter 也仍拒绝未完成
Desktop Gate 的 move；因此不复用该路径伪装多 Block 原子性。Application 已新增 Preview→HIGH
Proposal 纯构建合同，Domain 新增受约束 `CREATE_BLOCK` 并收紧 `MOVE_BLOCK` payload：每项操作
记录机器 UUID、正文 hash、原/目标父级与前一相邻位置；原材料不允许 rewrite/delete，未归类
材料不移动，所有操作保持一个不可拆组。focused 13/13、Application 135/135、Domain 42/42 PASS。
Service 已用 session-only preview handle 接通 server-owned Proposal route：handle 30 分钟过期、
容量 64、重启清空；client 不能上传 preview，Service 重新读取 Object/Anchor/subtree 后构建同一
HIGH Proposal。Plugin 提供 loading/error 的“进入变更审阅”并跳转待我确认，但不显示结构
Commit。专用 Application planner 与 Service ledger 已进一步完成：每项操作一个 GRAPH_WRITE step，
完整来源/最终结构指纹，执行前位置与补偿回原位置分离，按序 verify、最终 APPLIED、失败进入同一
RECOVERY_REQUIRED 账本并逆序补偿至 FAILED；stale、replay 和补偿前拒绝已有自动故障证据。
防御性 Plugin executor 已接入真实 insert/move/remove：每次写前由 Service 判定当前计划/账本，
写后仍由 Service 观察和 verify，重放不重复写，失败按 Service 返回的补偿计划逆序执行；四组
Plugin 测试覆盖正常顺序、重放、move 失败补偿 create 与 UUID 不匹配进入人工恢复。

隔离 Logseq Desktop 0.10.15 已真实通过 custom UUID 的 A/B/C → C/A/B → A/B/C move/restore，
顺序、UUID 与语义正文守恒。Gate 同时发现 Page runtime UUID 跨 reload 会变化，且属性键由宿主
以 camelCase 返回；Capability Lab 已按 namespace + owner + stable labPageId 有界识别并在 reload
冲突时拒绝自动认领。完成态 Undo 已进一步形成独立 inverse SemanticCommit：准备前要求当前
完整子树仍为已应用结构，逆序移动/删除机器新增空 Block，每步由 Service 观察；失败会用原
forward steps 恢复已应用结构，原 Commit 只有在 inverse 全部 VERIFIED 后才标记 UNDONE。
Local Service 115/115、Plugin 246/246 通过 changed-state 零账本、成功、reload replay 与失败
恢复。Review 现已只对该 HIGH 结构 Proposal 暴露专用“确认原位重构”，显式复核
最终阅读预览、删除为 0、UUID/正文保留与整树重验；完成后转为独立 inverse
Undo，不落入通用单 Block Commit/Undo。真实 Desktop 已进一步完成一个隔离 MiniProject 的
Preview→HIGH Review→八步 Commit→reload→八步 inverse Undo→reload→返回根 Block。
第一次 Undo 真实触发 sibling-order divergence，Service 正确进入 Recovery 而没有静默覆盖；
修正后的 completed-state Undo 按 source sibling 拓扑先恢复 MOVE，再逆创建顺序删除 section，
最终原 UUID/正文/父级/顺序全部恢复，机器 section 全部消失，Pending/Recovery 为 0。
最近修改也已把 inverse structure Commit 折叠回原意图，不再重复显示或提供通用 Undo。
P2-B 当前纵向 Slice 从 Partial 变为 Done；其他结构形态的兼容扩展和 P2-G 用户化恢复向导仍
保持 OPEN，详见 `logs/p2-b-grill-structure-desktop-live-20260725.md`。

默认保留原根 Block；原始事实零丢失；无法归类内容进入待判断/原始材料；结构只使用最小骨架和按需区块。

预览必须同时包含：

- 最终阅读效果；
- 标题/成果变化；
- 移动的 Block 数；
- 新增归纳；
- 删除内容（正常应为 0）；
- 无法归类内容；
- 技术 Diff 二级展开。

部分接受只按独立语义组，不按 SQL/Patch/Step。最终一次 SemanticCommit，成功后回根 Block。

## P2-C：Project 创建 Grill Me

状态：`ALL_SOURCES_DONE_VISUAL_GATES_OPEN`

所有入口：

- 空白新建；
- 当前 Page 升级；
- MiniProject 演化。

都经过至少一轮自适应 Grill Me。材料充分时只确认一个关键边界；材料不足时继续到 Project 是什么、最终形成什么、边界、内部闭环、当前接口和页面/对象关系稳定。

最终仍复用既有 Project prepare → Page create/verify → finalize 原子链。

首个 Application 合同已完成：Grill subject 使用 `PROJECT_CREATION`，创建前没有 Object ID；
Blank 不得声称来源证据，Page/MiniProject 必须携带有界 source ref。机器 readiness 除成果、
边界、完成证据和未分类材料外，还必须解决 Project 特有的 internal closure 与 current
interface；模型仍只有 `SESSION_DRAFT_ONLY`。Context Package、Skill/Prompt、Provider、
最终预览、server-owned create Proposal 与 Review 已接通；Proposal-bound 原子创建接线
也已自动完成。

第二个自动合同已完成：Local Service `project-creation-grill.ts` 将三种入口材料构造成
有界 Context 和七维 machine uncertainty，当前 `project-creation-modeling@1.5.0`
（初始自动 Gate 为 `1.1.0`）明确要求
跟随材料而非固定问卷，并将 Page/Object 关系与材料去向分开解决。Blank 由既有受控
Project Page 合同自动解决关系，Page/MiniProject 必须显式回答；Blank 首问结果、Page
首问材料去向、MiniProject 首问升级边界。

三种 authenticated route 已自动打通：Page/MiniProject 均由 Service 请求 Graph bridge、
生成后按同一 scopeHash 重读，Page depth 保持协议上限 5，无语义空 Block 不作为 LLM
事实；生成期间正文变化返回 stale 且零写。独立
`task-copilot-project-creation-preview-v1` Application Validator 与 Provider generator 已
自动完成：Blank 可零材料，Page/MiniProject 必须逐条保留原文，Page/Object 关系仅为
`PROPOSED_FOR_REVIEW`，formal impact 恒为零。

第三个自动合同已完成：公开 Service Client 与 authenticated
`/provider/grill/project-creation/preview` route 只接收来源标识和有界回答，由 Service
重新构造权威材料、执行 machine readiness、调用 Provider，并在返回结果前再次重读
Page/MiniProject scope。Blank 不请求 Graph、不得产生来源材料；Page 过滤语义空 Block
但仍按完整 snapshot scopeHash 重验。未就绪不调用 Provider，生成期间变化返回 stale，
两者都不签发结果；成功只签发容量 64、30 分钟过期、Service restart 清空的 session-only
opaque preview handle，正式 Object/Page/Graph/Audit/Commit 影响仍全部为零。现有自动证据
覆盖 Blank/Page 成功、Page 未就绪和 stale。

第四个自动合同已完成：同一 Service session 内的 handle 可形成 server-owned 单组 HIGH
Proposal；消费前重新构造来源、重算稳定 fingerprint 和 Graph scope，过期、未决关系或
stale fail closed。稳定 fingerprint 覆盖实际可影响模型的 Context facts，Proposal identity
覆盖完整规范 Preview。Blank 只允许独立受控 Project Page；Page 使用规范 Page
identity/version/hash，可整体审阅“保留来源并另建”
或“升级当前 Page”；MiniProject 只允许保留来源并另建。既有 Review 接受后仍没有
Object/Page/Commit 写入。

第五个自动合同已完成：已接受 HIGH Proposal 进入专用 prepare/finalize；新建 Page 使用
精确 owner/object/commit 所有权，复用 Page 零标记并按已审阅 identity/hash 重验。实际
Page UUID/hash 在 Graph step 执行前持久绑定，Domain failure 可跨 restart 补偿；专用
空 Page 才可删除，复用来源 Page 永不删除。专用 inverse Undo 在 Domain 写入前先做 Page
ownership/empty 预检，含用户正文时 fail closed；原 Commit、逆向 Commit 与 Audit 保留。
完成后路由已有 Plugin 自动证据。Blank 真实 Desktop 已完成 DeepSeek→Preview→Review、
同一 Recovery Commit→正式创建→reload→专用 Undo→reload 与健康状态；Page“保留来源
另建”也完成真实 Provider→Review→create→restart→跨 identity 漂移 Undo→restart 健康
Gate；Page reuse 随后也完成同强度链且证明零 Page write/delete。MiniProject 演化也已
完成真实 DeepSeek→Preview→HIGH Review→create→reload→Undo→reload；来源 Object、
active Anchor 与五个 Block 逐字段守恒。首轮 Undo 误回 Journal，`7a7492a407ed` 改为只用
Service 已审阅并重验的 source return target，最新构建重跑后精确返回来源根 Block且系统
`0/0/0`。三来源功能矩阵至此 DONE；Light/窄栏与集中宿主视觉 Gate 仍 OPEN。

第六个自动合同已完成：Plugin 的 Blank 主入口、普通 Page“将本页建立为 Project”和 OPEN
MiniProject“演化为 Project”统一进入同一 Project Creation session；客户端只提交 source
identity/version 与回答，不上传事实或结构。前台分开显示 facts、Copilot 判断与 unknowns，
每轮只保留一个真实分歧；loading/error/stale、零写入 Preview 和 HIGH Review 均有显式
状态。旧“直接创建 Project”UI 与 action dispatch 已移除，不能绕过 Grill。Plugin
最终 269/269 与类型检查、生产构建 PASS。真实 Provider 发现并修复英文/双问题和固定关系
示例冲突，Project Creation Skill 已升至 `1.5.0`，MiniProject 共享单问规则升至 `1.3.0`。

Blank Preview 已使用真实
`deepseek-v4-flash` 与初始 `project-creation-modeling@1.1.0` 通过独立 Service Gate，
Blank 当时真实 Desktop 使用 `1.2.0`：
来源材料 0、关系仍为待 Review、formal impact 0、Object projection 前后均为 0。
Proposal identity 进一步绑定 server-owned Preview handle：同一 handle 只幂等重放同一
Proposal，独立生成但阅读内容相同的 Preview 也不会与不同 `createdAt` 的记录碰撞。
semantic operation target 必须与 modify scope 的 existence/version/hash 证据完全一致；
MiniProject Preview 后 Graph 或正式 Object version 变化均在产生新 Proposal 前 fail closed。

Blank Desktop Gate 还证明 Logseq `createPage` 会把受控 Page properties 表现为 metadata
Block，`deletePage` 接受 Page name 而不是 UUID。当前实现只接受精确 owner/object/commit
三项 metadata、拒绝任何用户正文；删除前按 UUID/属性验权，删除时使用 name，并有 bounded
absence 复核。第一次失败保持同一 PENDING/Recovery ledger，修复后继续同一事务，没有重复
创建。证据见 `logs/p2-c-project-creation-desktop-live-20260726.md`。

Page“保留来源另建”Desktop Gate 进一步证明：真实 DeepSeek 七轮能依据三段 Page 材料
自适应收敛；越权 Page 写入/回链建议均被 Validator 零写拒绝，最终 Preview 逐条保留来源。
完整 Logseq restart 会重建 runtime Page/Block UUID，因此跨 restart 产品 identity 不能依赖
宿主 UUID 不变。Undo 仍以 Service 原账本为权威；只有原 UUID 找不到、精确 Page name 命中
且 owner/object/semantic-commit metadata 全部匹配时，才允许重新绑定并删除 metadata-only
专用 Page。复用来源 Page 永不进入此回退。最终来源三段正文逐字保留，Project/Anchor/专用
Page 撤销，再次 restart 后 Pending/Recovery/Source Conflict 为 0 且 reconciliation 收敛。

Page“升级当前 Page”也已完成相同强度 Gate：真实 Provider 能保留“来源材料原要求另建”与
“用户本轮明确要求 reuse”的冲突，并以用户明确决定形成 `REUSE_SOURCE_PAGE` Preview。
正式创建、restart、inverse Undo、再次 restart 前后，复用 Page 的 name/properties 与三段
Block UUID/content/properties 均逐字段等于创建前；正式变化只创建/撤销 SQLite Project 与
active Primary Page Anchor，不写、不标记、不删除来源 Page。两次 Validator rejection
安全保留答案后重试，未产生半成品；当前质量缺口是拒绝率、readiness 密度和重复“完成证据”
标签，不降低安全结论。

MiniProject“演化为 Project”最终使用 `project-creation-modeling@1.5.0`。真实测试先后把
machine identity/fact key 泄漏、把内部闭环错指向关闭来源对象和 evidence repair 过宽
暴露为失败样本并关闭。当前 Preview 的五项来源均为 `LINK_AS_SOURCE`，模型提出的嵌入
建议没有越过用户决定与机器关系白名单。最新重跑中最终 Preview 前两次被 Validator 安全
拒绝、第三次同答案集通过；没有留下 Proposal 或半成品，但真实拒绝率与前台可理解诊断仍是
后续 Skill/UX 质量项。

## P2-D：Project 结构操作路由

状态：`IN_PROGRESS_LIGHT_CONDITION_MEDIUM_AND_HEAVY_INTERFACE_VERTICAL_DONE`

| 级别 | 示例 | 用户摩擦 |
|---|---|---|
| 轻 | Focus、Condition、reviewAt、明确的一句摘要、普通 Association | 直接命令 + Undo |
| 中 | LLM 摘要优化、更新进入点、连接对象但不改主归属 | 接受并应用 |
| 重 | Ownership、批量子对象、MiniProject 拆建、移动正文、Objectives/Deliverables、拆分合并、Closure、外部 Agent | 讨论、预览、选择、正式应用、Undo |

改变“怎么看项目”可以轻；改变“项目包含什么”必须重。

当前已落地：

- Application 对 16 类 Project operation intent 给出唯一 LIGHT/MEDIUM/HEAVY 路由；
- Ownership、正文移动、Objectives/Deliverables、Stage mapping、批量子对象、拆分合并、
  Closure 与 external Agent 有自动测试保证永不降级；
- Plugin 的 Project 重入、正式对象与 Project Page 更新入口先打开同一影响选择层；
- LIGHT 只复用现有版本化 Condition/Association 路径；没有对应 Undo 的能力不得通过最终
  Gate；
- MEDIUM 当前摘要通过 Service-owned Project Context Package、真实 Provider、Unified UX
  Validator 与 `recover-context@1.2.0` 生成；只允许一个
  `UPDATE_PROJECT_NARRATION`，Review/Commit/Undo 均复用正式 Project interface 安全链；
- HEAVY 完整当前接口继续复用既有 HIGH Proposal→Review→Commit→Undo，其他重操作仍保持
  各自安全链，不合并成万能表单。

自动证据为 router `4/4`、Application `161/161`、Local Service `135/135`、Plugin
`275/275`、Persistence `49/49` 与根级检查 PASS。Desktop `0.10.15` 已完成真实
DeepSeek→MEDIUM Review→Commit→reload→最近修改→专用 Undo→reload；Object v2→v3→v4，
只有摘要往返，current focuses 与全部结构字段守恒，Pending/Recovery/Conflict `0/0/0`。
`p2-d-05`/`p2-d-06` 为 `ae2395523798` CURRENT。

同一构建又完成一条 HEAVY 完整当前接口真实链：用户填写摘要、三项 current focuses、
一个 Objective、一个 Deliverable 与一个 Work Stage，只生成单组 HIGH
`UPDATE_PROJECT_INTERFACE`；接受仍零写，最终 Commit 后 Project v4→v5，reload 可读回全部
聚合字段；专用 inverse Commit v5→v6 精确恢复原摘要、单一 Focus 与空结构，再次 reload
健康。CURRENT `p2-d-07`～`p2-d-10`。这只关闭完整当前接口这一条 HEAVY 核心链，不代表
Ownership、正文移动、批量子对象、拆分合并或 Closure 已完成本轮 P2-D Desktop Gate。

LIGHT Condition 现已补齐跨 reload 的正式 Undo：Persistence receipt 保存变更前 Condition，
Service 只按历史 receipt 准备 server-owned inverse，确认时重验当前 Object version 与
Condition；旧 receipt 缺少证据时不猜测。Desktop 以 Project v8→PAUSED v9→reload→Undo
ACTIONABLE v10→reload 完成闭环，Project 当前接口、Lifecycle、Focus、Ownership 与正文均
守恒。没有 remove/inverse 的普通 Association 已在正式路由中禁用，避免把不可撤销的写入
算作 LIGHT 完成。CURRENT `p2-d-11`～`p2-d-13` 对应 `58bf6306d04d`，完整记录见
`logs/p2-d-light-condition-undo-desktop-live-20260726.md`。P2-D 仍为 Partial：Focus/reviewAt
的完整 Undo 结论、Association inverse、其他 HEAVY 类型、Light/窄栏与集中宿主 Gate 开放。

## P2-E：Closure 证据起草

状态：`IN_PROGRESS_MAIN_CHAIN_DESKTOP_DONE_FAILURE_RECOVERY_DESKTOP_OPEN`

MiniProject 聚合：子树、DONE、Output、Decision、原状态和遗留。

Project 聚合：原目标、Deliverables、Output、Decision、完成 MiniProject、未完成对象、等待/阻塞、遗留、future summary。

用户只处理真实判断。信息不足必须保留 unknown，不杜撰成果。遗留可转 Task、连接已有事项或仅记录，但每项必须有明确去向。

首个安全底座已实现：Application 的只读 evidence draft 只接受版本匹配的 OPEN Project、
当前 Project interface、正式 Objects 与直接 Primary Ownership。Objective、已接受/可用
Deliverable、owned Output/Decision、完成工作和未决工作会成为有来源引用的候选；Objective
完成状态一律保持 `NEEDS_USER_JUDGMENT`，空材料明确输出 unknown。普通 Association、孙级
对象和缺失 identity 不会被当成 Project 成果。Local Service 已增加只接受
`objectId + expectedVersion` 的只读路由；Plugin 的 Project 影响路由已能展示候选证据、
未决工作、显式 unknown 与仍需用户判断的部分，且没有 Proposal/Commit 权限。
focused `3/3`、Application `164/164`、Local Service `136/136`、Plugin `275/275`、
Service Client `12/12` 与 typecheck PASS。`ec1a70d848d6` 最新构建已在真实 Logseq
Desktop 完成入口、空证据预览、零写入、reload 清空 session draft 与重新计算 Gate；
CURRENT `p2-e-01`～`p2-e-04`。当前尚未接真实 Provider、正式
Review/Commit/Recovery/Undo，因此 P2-E 不得标为 DONE。自动记录见
`logs/p2-e-project-closure-evidence-automated-20260726.md`。

下一安全门也已自动完成：专用 Provider route 复用现有五层 Proposal generator；
`design-project@1.3.0` 明确 evidence 候选、NO_PROPOSAL、exact scope、前台 identity
隔离。缺原目标、主要交付或关键 Decision 时 Provider 调用次数必须为 0；模型草稿即使
Schema 合法，也必须保持唯一 HIGH 组和同版本两操作才能进入 Review。Local Service
自动 Gate PASS。真实 Flash 的脱敏 model-contract Gate 已经通过 machine grounding、
Objective 保守 disposition、逐项遗留保留和前台 identity 隔离；前两轮失败均由 Validator
零写入挡住，第三轮 1 attempt PASS。随后公共 Service route 已增加版本绑定、严格有界的
session-only 用户判断：实际结果、每个 Objective disposition、遗留、关键 Decision 与
future summary 必须由用户逐项确认；Provider 只能逐字带入，不能替用户改写。正式矩阵仍
拒绝 Decision/Output → Project Ownership，formal-only 路径继续在网络前 fail closed；
用户确认路径的自动 Gate 已证明只生成 PENDING/HIGH Proposal，Project 保持 OPEN、
SemanticCommit 为 0。更新后的脱敏 Flash Gate 又以不含直接归属 Decision 的 3-read
证据通过，约 22.6 秒、5648 tokens；Graph/正式 Store 写入仍为 0。见
`logs/p2-e-project-closure-user-confirmed-automated-20260726.md` 与
`logs/p2-e-project-closure-provider-live-20260726.md`。Plugin
loading/error/stale、最终阅读、HIGH Review/Commit/Recovery/Undo 与当前 Desktop
仍 OPEN，因此 P2-E 仍为 Partial。Plugin 已进一步接入同一条公共 route：只读证据后按
实际 Objective 数量动态收集用户判断，只有一个“整理为待确认的关闭建议”主动作；
Provider unavailable、busy、NO_PROPOSAL、stale、Validator rejection 都在同一现场表达，
失败后保留当前会话输入，成功后直接进入既有 HIGH Review。Plugin `278/278` 与 build PASS；
该可见链尚未完成最新 Desktop Gate。Local Service `144/144`、Service Client `12/12`、
typecheck 与根级 `./scripts/check.sh` PASS。见
`logs/p2-e-project-closure-plugin-draft-automated-20260726.md`。

正常主链随后已在真实 Logseq Desktop 闭环：确定性 evidence → session-only 用户判断 →
真实 `deepseek-v4-flash` loading → 单组 HIGH Review → 最终 Commit → Closure 专用 Undo →
Plugin reload → Project 回到 Now Work。首轮真实完成态发现没有专用 Undo，保留
`p2-e-09` 为 SUPERSEDED 失败证据；`06907f3` 增加 receipt/checksum/version 绑定的专用
inverse Commit 后，`p2-e-10`～`p2-e-12` 为 CURRENT。回读为 Project `OPEN v13`、
Closure absent，正向 Commit `UNDONE`、逆向 Commit `COMPLETED`，异常 Commit 计数为 0。
正常主链 Gate 已 DONE，但当前构建的 Provider error/stale 和注入 Commit failure →
RECOVERY_REQUIRED → resume 仍需 Desktop 证据，P2-E 整体保持 Partial。完整记录见
`logs/p2-e-project-closure-desktop-live-20260726.md`。

## P2-F：跨对象观察

状态：`IN_PROGRESS_SHADOW_PROVIDER_REPEAT_PASS_FRONTSTAGE_CLOSED`

只允许提出：

- 多个 Task 可能属于同一 MiniProject；
- 遗留未承接；
- Project current interface 可能失效；
- Association / Ownership 候选。

要求：

- 先影子模式；
- 候选数量有上限；
- 给出证据；
- 明确是 Copilot 判断；
- 不自动改变 Ownership/Focus；
- 进入待我确认。

当前已完成安全底座：

- Application 只接收 exact-key、无自由文本的结构化 observation draft；
- 2–8 个唯一版本化 subject、显式 Object/Project scope、2–16 条 evidence、每轮最多 8 条；
- 只物化为 `LLM_CROSS_OBJECT / INFERENCE / SHADOW / NONE`，并复用既有失效与 cooldown；
- 正式 due、Proposal、Commit、Anchor 与 Recovery 风险继续拥有更高优先级；
- Plugin runtime 仅输出 count-only telemetry，不泄露 Object/ref/evidence；
- 不持久化 Candidate，不创建 Proposal，不改变 Focus/Ownership，不开放前台。

Application `168/168`、Plugin `280/280`、根级检查与恢复演练 PASS；非法 LLM 批次不会
中断确定性 Attention 基线。

首批真实 Provider 质量门现已完成：Service 机器构造 2–8 Object、显式 scope 与 2–16
evidence 的 bounded Context Package，模型只可选择 kind/subject/evidence 或
`NO_OBSERVATION`。真实 `deepseek-v4-flash` 5/5 最终 PASS：三类 grounded observation 与
两类 deliberate abstention 均命中；再复跑两轮后累计 `15/15` case-runs、9 observation、
6 abstention，kind/evidence/abstention 一致且零 Graph/正式 Store 写入。探索中发现 confidence 不应
由模型自授，已收回为机器 LOW/MEDIUM；模型不能产生 HIGH。该 Prompt 仍是
`0.1.0-experimental` Skill candidate，不进入正式 catalog。重复运行、stale/error、
reload/recompute、disposition/cooldown、用户反馈和待我确认 UI 仍 OPEN。
机器语义 Context fingerprint 已自动覆盖：刷新时间不制造 stale，Object 摘要或 evidence
fingerprint 变化拒绝旧草稿。公共 runtime 的 generation→revalidate→recompute 接线仍 OPEN。

## P2-G：Recovery/Rebind/Restore/Migration 向导

状态：`IN_PROGRESS_REBIND_RESTORE_ROUNDTRIP_DESKTOP_DONE_MIGRATION_REVIEW_PREVIEW_DESKTOP_DONE`

### Recovery

统一表达“继续完成这次修改”，复用原 semantic_commit_id，禁止创建重复操作。

### Rebind

统一表达“重新连接正文”；候选显示阅读预览，不显示 UUID 列表；保留旧 Anchor 历史。

当前自动 Gate 已完成：ready preview 和 success feedback 不再显示 Block UUID、Anchor ID、
external ID、hash、`missing/replaced` 或 `Primary Anchor/object_id`；候选只显示事项名称、
类型和翻译后的连接状态。DOM value 使用 session-local `candidate:<index>`，正式提交时才映射
回内存中已验证的旧 Anchor。既有一页有界读取、确认、Block 持久身份、版本/hash 重验、
Service Rebind 与旧 Anchor 历史均不变。为避免替代 Block 被自动显式同步抢先创建正式对象，
用户主动发起 5 分钟有界捕获窗口：开始时 flush 已有队列并暂停 materialization，取消、超时
或提交后只恢复一次；其他正式正文不受影响。focused `9/9`、Plugin `284/284`、typecheck
与根级检查 PASS。

当前 commit `344c705ec446` 的真实 Logseq 0.10.15 已完成：
丢失 Anchor → 开始重新连接 → 新建并选择替代 Block → 阅读预览 → 确认 → Service
Rebind → reload 后系统正常。Service 回读证明旧 Anchor 为 replaced、新 Anchor active，
没有产生额外正式对象。Rebind 常规主链 Desktop DONE。Recovery/Undo 指引已完成自动 Gate：
旧 Anchor 常因 missing/conflict 才被替换，不能仅凭 receipt 存在就机械恢复为 active；成功态
把选错正文路由回 5 分钟受控 Rebind，把整库回退路由到 Backup/Restore 只读目录。focused
`10/10` 与 typecheck PASS；新成功态 Desktop 仍 OPEN。

### Restore

复用既有校验、恢复点、停写、原子切换、Doctor、descriptor 清理和 Service 停止。向导不得另建恢复流程。

自动 Gate 已完成：Service 只读列出最近 20 个服务端快照，Plugin 只显示时间、事项数量
和完整性状态；DOM 只持有 session-local `snapshot:<index>`，不接收路径或 Backup ID。
用户可以创建当前快照、选择旧快照、触发再次校验并单独确认最终影响。提交前 flush 显式同步，
并复用 owned shutdown policy 拒绝未完成 Commit 和 reconciliation；正式执行仍调用唯一
Restore API，随后由 Service 自停和 Launcher 同 Graph 重连收口。Plugin `288/288`、
Local Service 全套测试、typecheck 与根级检查 PASS。

commit `6ae8f2fcebd0` 的真实 Logseq 0.10.15 已完成快照目录、再次校验、未确认零请求、
正式 Restore、恢复点创建、owned Service PID `47467→47600`、Launcher 同 Graph 重连、
Plugin reload 后目录 `2→3` 与系统 READY/`0/0/0`。首轮成功/旧错误并列问题已修复。
随后同一测试 Task 经真实 Now Work 和 Desktop Restore 完成
`ACTIONABLE v5↔PAUSED v6` 旧快照/自动恢复点正反往返，Local Service 每步逐字段读回，
最终恢复 ACTIONABLE 基线。Restore 正常往返 Desktop DONE；失败注入、失败后的用户层
Recovery 与 Light/窄栏仍 OPEN。

### Migration

一次性出现：scan → preview → decisions → backup → import → verify → activate；完成后退出日常 UI，不恢复双写。

当前只读 ledger 已完成用户层状态翻译：日常卡片不再显示 run ID、Bundle hash、Backup ID、
原始状态枚举或 CLI 命令，只显示计划序号、更新时间、批次计数与下一步。新材料现可由用户
明确选择 2 B～8 MiB Recovery Bundle 并执行 session-only 只读 scan；客户端先限界，
Service 继续完成 checksum/readback、无损恢复、未完成 Commit 检查与 SQLite Doctor
零变化断言。前台只暴露五类计数，clear/Graph switch/reload 清空，不显示对象/evidence/hash/
正文。该自动 Gate 只关闭 ledger 表达与材料只读扫描，逐项决定、恢复点确认、
import→verify→activate、失败/重启/Undo 继续 OPEN。

commit `15b976d28ec3` 的真实 Logseq 0.10.15 已完成当前文件选择、2 项脱敏 Bundle
分类、显式放弃、reload 清空、非法 JSON 重试和最终 READY/`0/0/0`；SQLite 回查
migration run/batch 仍为 `0/0` 且 integrity `ok`。因此只读 scan Desktop Gate DONE，
但不单凭这条只读证据宣称迁移可写。

在此基础上，`3103df3`/`c660f2d` 已开放 session-only 逐项 Review 与 PREVIEWED 计划创建：
用户主动选择的材料只显示规范化的一行 160 字符摘录和来源类型；完整正文、内部 identity、
evidence/hash 不进入 UI snapshot、账本或日志。机器建议缺失时保持空选择，结构冲突不可
导入；所有非导入决定在 Plugin 与正式 Domain Validator 都要求有界判断依据。响应丢失进入
不确定态并只允许同决定幂等重试。计划创建只写审阅账本，不创建正式对象、batch 或恢复点。

commit `c660f2d00be5` 的真实 Logseq 0.10.15 已完成 2 项脱敏材料逐项决定、计划创建和
reload；SQLite 只读回查为 `PREVIEWED`、summary `2/1/1/0/0`、run/batch `1/0`、正式对象
仍为 4、Pending 0。CURRENT `p2-g-26`～`29`。因此 Migration Review/Preview 纵向
Slice 从 Partial 变为 Done；恢复点确认、import→verify→activate、失败/重启/Undo 继续 OPEN，
Migration/P2-G/整体 Goal 不关闭。

## P2 完成否决条件

- Grill Me 变成固定问卷；
- 结构预览遗漏原始事实；
- 未分类内容被静默删除；
- LLM 自动改变 Ownership/Focus；
- Closure 杜撰成果；
- Recovery 用新 Commit 掩盖旧 PENDING；
- Restore/Migration 要求用户复制内部 UUID 或数据库路径；
- 任一高影响流程无法恢复或 Undo。
