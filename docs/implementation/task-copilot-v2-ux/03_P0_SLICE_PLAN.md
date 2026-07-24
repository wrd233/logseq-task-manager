# P0 Slice 计划：日常路径和产品化

## P0-A：Block 现场路由与 Focus 纵向 Slice

状态：`DONE_WITH_BOUNDED_DESKTOP_SCOPE` — 正式 Block 的 Focus 加入、移出、会话内 Undo、
Local Service 读回与 reload 一致性已经完成自动和真实 Desktop 验收；普通 Block、Query/引用、
右侧栏与 Light 主题仍在后续现场路由 Slice 中验证，不影响本纵向 Focus 闭环。

### 用户问题

当前 Focus 已可安全写入，但用户必须先离开正文、打开 Now Work、找到对象后再操作。目标是在原 Block 的一次现场意图内完成：

```text
右键 Block
→ 加入/移出当前关注
→ 原地明确反馈
→ 可撤销
→ 仍停留在原 Block
```

### 复用能力

- `LocalServiceClient.selectFocus/removeFocus`
- Application `select_focus/remove_focus`
- Object version 与完整 Focus order 前置
- Primary Anchor / Block UUID
- Audit / Receipt
- 现有 Now Work refresh

### 实现边界

- 不新增 Focus 状态或第二 Focus Store；
- 不让 context-menu callback 直接写 Store；
- callback 先用 UUID 解析 active Primary Anchor 与正式对象；
- 无正式对象时进入“处理这条内容”路由，不猜 object type；
- Service 未就绪时正文不受影响，显示正式功能未启动；
- 重复点击必须 disabled/in-flight dedupe；
- 成功反馈包含“已加入/移出当前关注”，并提供受版本保护的撤销；
- 完成后恢复原 Block/编辑上下文。

### TDD seam

新建纯 controller：

- 输入：Block UUID、当前对象/Focus投影、origin token；
- 输出：`FORMAL_OBJECT_ADD`、`FORMAL_OBJECT_REMOVE`、`ORDINARY_BLOCK_ROUTE`、`SERVICE_RESTRICTED`；
- side effect 通过注入的 Service command 与 feedback/route port 执行。

失败测试先覆盖：

1. 普通 Block 不调用 Focus command；
2. active Anchor 对应正式对象才允许写入；
3. 已 Focus 走 remove，未 Focus 走 select；
4. 同一 intent in-flight 时第二次提交拒绝；
5. stale version 显示未生效且不假成功；
6. transport 不确定时要求核对，不自动重试；
7. 成功后返回同 Block；
8. Undo 后恢复 Focus 前状态；
9. dispose 后不迟到反馈。

### 自动验收

- controller unit tests；
- Bootstrap registration tests；
- Plugin typecheck；
- Plugin 全测试；
- 根级 `./scripts/check.sh`；
- `git diff --check`。

2026-07-23 结果：

- 新增 `BlockFocusController`，只通过 Local Service 的 `listObjects/listPrimaryAnchors/nowWork/selectFocus/removeFocus` 工作；
- 只接受唯一 `active primary_text` Anchor；普通、missing、冲突或关闭对象均 fail closed；
- 加入时追加到 Focus 末尾，移出后 Undo 恢复原 rank；
- 对象版本或 Focus 后状态变化时拒绝撤销；
- toggle/Undo 共享 in-flight mutex，重复点击不形成第二次写入；
- Bootstrap 注册两项稳定 Block 右键意图，UUID payload 通过测试；
- 成功/失败使用 Logseq 原地消息，不打开主 UI；代码路径不导航离开原 Block；
- 首轮 Plugin typecheck、132 项 Plugin 测试、根级 `./scripts/check.sh` 全部通过；
- P0-H 私有导入加入后，Plugin 测试增至 137 项并继续全绿。

### Desktop 验收

- 正式 Task：加入 Focus、原地反馈、Now Work 读回；
- 同一 Task：移出 Focus；
- Undo；
- 普通 Block：进入整理入口，不正式写入；
- Service RESTRICTED；
- Query 结果；
- Block 引用；
- 右侧栏与 Zoom；
- Light/Dark；
- reload 后 SQLite 状态一致；
- 截图包含 commit、前置、动作和实际结果。

2026-07-23 真实 Desktop 结果：

- 已在真实 Logseq 0.10.15 重新加载构建产物；
- P0-H 私有 descriptor 导入使 Plugin 进入 `Runtime READY / Store READY`，且 reload 后无需再次导入；
- 当前正式 MiniProject Block 的右键菜单真实显示两项稳定意图；
- 加入关注后原地反馈成功，Local Service 读回唯一 Focus；
- 再次触发可移出关注，Local Service 读回空集；
- “撤销上一次关注变化”把该对象恢复到原关注位置，Local Service 再次读回；
- 最终测试清理把 Focus 恢复为空，正文 Block 与页面位置保持不变；
- 截图只含虚构测试内容，不含 descriptor、token、路径、终端历史或私人正文。

## P0-B：“暂时做不了”

状态：`DONE_WITH_BOUNDED_DESKTOP_SCOPE` — 正式 Block 的三种意图、最小字段、版本保护、
重复提交保护、原地反馈、Focus/Lifecycle/Ownership 不变和会话内 Undo 已完成自动与真实
Desktop 验收；普通 Block 仍由后续“处理这条内容”路由负责。

### 纵向链

```text
当前正式 Block
→ 暂时做不了
→ 等待别人 / 被问题卡住 / 我先暂停
→ 只填必要内容
→ changeCondition
→ 原地反馈
→ Undo / 最近修改
```

### 必填规则

| 用户意图 | 必填 | 可选 | 禁止副作用 |
|---|---|---|---|
| 等待别人 | 等什么、何时回看 | 期待结果可由短语合并 | 不自动移出/加入 Focus，除非用户另行决定 |
| 被问题卡住 | 卡点 | blocker object | 不改变 Lifecycle/Ownership |
| 我先暂停 | 原因、重新判断时间 | 无 | 恢复后不自动加入 Focus |

### Gate

- 复用现有封闭 Condition command；
- 不新增 Condition 类型；
- 错误显示“没有保存，原状态未改变”；
- 成功后 Now Work 重算；
- 恢复为 ACTIONABLE 后只建议 Focus。

### 2026-07-23 结果

- Block context menu 新增一个稳定的“暂时做不了”现场入口和一个状态 Undo 入口；
- 先显示三种用户意图，不先展示 `WAITING/BLOCKED/PAUSED` 工程枚举；
- WAITING 把“在等谁/什么”和期待结果合并为一个用户短语，另只要求复查时间；底层仍生成
  Domain 要求的封闭 `waitingFor/expectedResult/reviewAt`；
- BLOCKED 只显示具体卡点与可选 blocker object；
- PAUSED 只显示暂停原因与强制的重新判断时间；
- 新增 `BlockConditionController`，复用唯一 active Primary Anchor、Object version 和
  `LocalServiceClient.changeCondition`，不直接写 Store；
- controller 与 UI 共有 6 项新增/扩展测试；Plugin typecheck、143/143 测试和 build PASS；
- 真实 Logseq Desktop 0.10.15 分别写入 WAITING、BLOCKED、PAUSED，Local Service 逐次读回；
- 每次写入前后 Focus 均为空，Lifecycle 始终 OPEN，Undo 逐次恢复 ACTIONABLE；
- 首轮 WAITING Undo 暴露 SQLite 读回 JSON key 顺序不同导致的假 stale；比较改用
  `stableJson` 并加入回归测试后，真实 WAITING Undo 通过；
- 最终 reload 读回对象 version 10、Condition ACTIONABLE、Focus 空。

## P0-C：低风险“接受并应用”

状态：`DONE_WITH_BOUNDED_DESKTOP_SCOPE` — 自动覆盖 CREATE/REWRITE 白名单、高风险拒绝、
scope stale 与不确定接受请求零重试；真实 Desktop 完成 LOW `REWRITE_BLOCK` 的单击连续
应用、busy 禁用、SQLite/Graph 读回和安全 Undo。CREATE 正向与恢复故障仍由既有
Proposal Commit 自动/历史 Desktop Gate 提供底层证据。

### 白名单

第一阶段只允许同时满足以下条件的 Proposal：

- 总体风险 LOW；
- 唯一 accepted-capable group；
- 操作属于单 Block `CREATE_OBJECT` / 受约束 `REWRITE_BLOCK`；
- 无 Ownership、Closure、Lifecycle、Project structure、批量或跨对象修改；
- scope revalidation 与当前 Graph/版本都可在同一连续流程完成；
- Commit 支持当前既有 Undo。

### 用户状态机

```text
READY
→ 正在应用（按钮禁用）
→ 已应用 + 撤销
  | 未应用，原内容未改变 + 重新检查
  | 尚未完成，需要恢复 + 继续完成
```

后台仍执行：

```text
review accept
→ revalidate
→ prepare SemanticCommit
→ Graph step
→ Domain step
→ verify
→ APPLIED / FAILED / PENDING / RECOVERY_REQUIRED
```

### 否决条件

- 接受后停留在静默 `ACCEPTED`；
- 不确定 transport 后自动创建第二 Commit；
- 高风险组误入一键流程；
- 失败仍显示绿色成功；
- Undo 覆盖后续正文编辑。

### 2026-07-23 实施与实证

- `v2-low-risk-apply.ts` 只接受 READY、无未决问题、唯一独立 LOW 组、一个 Block Patch 和
  一个 `CREATE_OBJECT` 或 `REWRITE_BLOCK`；再调用既有 accepted-plan Validator；
- 连续流程仍逐步调用 `reviewProposal`、Graph scope observation、`revalidateProposal` 和
  `commitV2Formalization`，没有直接 Store 写入口、第二 Commit 或新恢复器；
- 接受请求 transport 不确定时只调用一次并要求刷新；接受后任一步失败都会明确显示
  “已接受但未报告正式应用”，不会绿色报成功；
- UI 在运行期间禁用该卡片的接受、拒绝和暂缓动作；只有最终 `COMPLETED` 才显示成功与 Undo；
- Plugin typecheck、147/147 tests 和 build PASS；
- Logseq Desktop 0.10.15 对真实 schema-v12 测试对象执行唯一 LOW `REWRITE_BLOCK`：
  READY/PENDING → applying disabled → APPLIED/Commit COMPLETED → Undo；
- Local Service/SQLite 读回对象 version 10→11→12，最终正文恢复 `P0 Focus Gate`；
  正向 Commit `UNDONE`、逆向 Commit `COMPLETED`、Pending/Recovery 0、integrity `ok`、
  foreign key check 无记录；
- 测试新增普通 Block 已从 Graph 清除，Focus/Condition/Lifecycle 未改变；截图不含 token、
  descriptor 内容、路径、真实业务正文或 API Key。

## P0-D：Page 现场路由

状态：`DONE` — Plugin tests 155/155、typecheck、build 与真实 Logseq Desktop 0.10.15
均通过；右侧栏宿主扩展入口限制单独保留。

- 普通 Page：整理当前页、查看本页正式事项、将本页建立为 Project；
- Project Page：更新项目当前状态、讨论项目结构、项目操作；
- Page payload 必须重读当前 page identity；
- “将本页建立为 Project”在 P0 只可路由既有安全入口；P2 再加入 Grill Me；
- 完成后回原 Page，创建新 Project 时进入新 Project Page。

实现与证据：

- 注册一个稳定的 `Task Copilot：页面操作`，动作执行时重读 Page UUID、Block tree、分页
  Anchor 和正式对象；
- 只有唯一 active page-level Project Primary Anchor 才进入 Project 路由；重复 Anchor、
  cursor loop、Page 消失/变化均零写入失败；
- 普通 Page、Project Page 与 Journal 的三项路由均通过真实 Desktop；
- Project create 复用既有受控入口，成功后进入新 Project Page；当前状态复用既有 HIGH
  Proposal，取消后零变化；讨论结构只进入 Review；
- main Page 打开/关闭路由时 right sidebar 保留；Logseq 0.10.15 的 sidebar `…` 不暴露
  Plugin Page menu item，secondary-page target 由自动测试覆盖，不虚报宿主入口；
- 证据见 `logs/p0-d-page-context-desktop-20260723.md` 与 `screenshots/original/p0-d-*`。
- 本地提交：`6f6ef49`。

## P0-E：四项主导航

状态：`DONE` — Plugin tests 157/157、typecheck、build 与真实 Logseq Desktop 0.10.15
均通过；本轮未复验窄宽度和键盘 Tab 注入，不扩大声明。

| 新入口 | 组合现有能力 |
|---|---|
| 现在 | Now Work + attention handoff |
| 待我确认 | Candidate/Proposal decision queue + accepted-not-applied |
| 项目 | Objects 中的 Project + reentry + current interface |
| 更多 | 最近修改、系统状态、技术诊断、Backup/Restore、Migration、Audit/Recovery |

完成时必须证明原有能力仍可达，不只是隐藏旧导航。

实现与证据：

- 主导航严格收束为“现在 / 待我确认 / 项目 / 更多”，Diagnostics 不再占据顶栏；
- “项目”保留 Project 列表/重入、当前接口、正式对象与受控创建；
- “更多”保留最近修改/恢复、系统状态/技术诊断、备份/恢复、迁移；
- `objects` / `reentry` 映射为同一个 active“项目”，`audit` / `migration` 映射为同一个
  active“更多”，未删除工程能力；
- delegated `view` value 经过显式 `isWorkspace` 边界校验；
- Desktop 真实下钻到 Project、Objects、Audit、Migration 与 Diagnostics；含完整内部
  Commit ID 的 Audit/Diagnostics 页面只记操作结果、不留截图；
- 证据见 `logs/p0-e-four-primary-navigation-desktop-20260724.md` 与
  `screenshots/original/p0-e-*`。

## P0-F：工具栏介入摘要

状态：`DONE_WITH_BOUNDED_DESKTOP_SCOPE` — Plugin tests 161/161、typecheck、build 与真实
Logseq Desktop 0.10.15 的安静态、正式连接风险数字、点击诊断及恢复后回安静态均通过；
`RECOVERY_REQUIRED ↻` 因当前库无恢复项，仅按自动测试声明。

计入：

- 到期 review；
- 待确认；
- 高影响已确认未应用；
- PENDING/RECOVERY_REQUIRED；
- 当前 Graph 正式连接风险。

不计入：

- OPEN 总数；
- Focus 总数；
- 普通 WAITING；
- Project/Candidate 总数。

恢复风险存在时用 `↻` 取代数字，点击直接进入恢复。

实现与证据：

- 新增纯 `deriveToolbarIntervention`，只从 Now Work、Proposal 与 SemanticCommit 既有投影
  及当前连接状态派生，不增加表、缓存权威或正式写路径；
- 到期 WAITING/PAUSED review 与 DEFERRED Proposal 去重计数；待确认、HIGH 已接受未应用、
  PENDING Commit 和一次正式连接风险进入数字；
- OPEN、Focus、未来 review、普通 WAITING、Project 与 Candidate 总数没有输入计数；
- `RECOVERY_REQUIRED` 覆盖数字并路由 Audit/Recovery；其余优先级为连接诊断、Pending
  Commit、Proposal Review、Now；
- 工具栏用同一 host key 动态更新，安静态为 `TC`，数字为 `TC ①…`，tooltip/aria-label
  使用用户语言；
- 真实 Desktop 安全停服后显示 `TC ①` 并点击进入 Diagnostics，同库重启与私有 descriptor
  刷新后恢复 `TC`；Service 进程/descriptor 自动生命周期仍归 P0-H；
- 证据见 `logs/p0-f-toolbar-intervention-desktop-20260724.md` 与
  `screenshots/original/p0-f-*`。

## P0-G：最近修改与用户层结果

状态：`DONE_WITH_BOUNDED_DESKTOP_SCOPE` — Plugin tests 167/167、typecheck、build 与真实
Logseq Desktop 0.10.15 的用户层历史、折叠技术详情、查看原 Proposal、即时结果、跨 reload
长期 Undo、逆向 Commit 和 Graph/SQLite 恢复均通过；PENDING/Recovery 新投影只按自动测试
声明。

- 不新增 Audit；
- 由 Audit/Receipt/Commit 投影生成一句用户语言；
- 即时结果和长期入口共享同一 commit identity；
- 无法撤销时说明后续哪类变化阻止覆盖；
- 最近修改只显示用户意图、时间、是否应用和可用动作，技术 ID 进入详情。

实现与证据：

- 新增纯 `projectRecentChanges`，只组合既有 Proposal 与 SemanticCommit，不增加正式状态源；
- 用户状态固定翻译为“已应用 / 尚未完成 / 需要恢复 / 未能应用 / 已撤销”；
- generic、Ownership、Lifecycle 与 Project interface 分别复用既有 Undo；Closure 无通用
  Undo 时明确说明，不显示虚假动作；
- inverse Commit 折叠回原用户修改；failed inverse 根据正文、对象、Anchor、Ownership 或
  Project interface 变化解释为何不能覆盖；
- Commit/Proposal ID、error code 与 checksum 只在折叠技术详情出现；
- 即时结果保存实际 commit identity，再从同一长期投影取结果；导航/关闭清除 session 提示；
- 真实 Desktop 完成 LOW 应用→即时结果→reload→长期 Undo→Graph/SQLite 恢复；
- 证据见 `logs/p0-g-recent-changes-desktop-20260724.md` 与
  `screenshots/original/p0-g-*`。

## P0-H：Service 产品化

状态：`PARTIAL` — descriptor 私有导入/重连 handshake 已完成自动与 Desktop 闭环；Service
进程仍由外部启动，Plugin-owned launcher、安全退出、崩溃恢复与 Graph 切换尚未实现，因此
P0-H 整体不得标记完成。

状态：`NOT_STARTED`

先做受控 spike，再选择最小方案。必须回答：

1. Logseq Plugin iframe 能否可靠启动和持有 Node 20 子进程；
2. 若不能，是否需要本机 launcher/登录项，而不是在 UI 假装自动；
3. descriptor 如何安全进入 Plugin 私有 FileStorage；
4. 多 Graph 切换如何绑定数据库；
5. Plugin-owned Service 如何避免杀死非本 Plugin 启动的进程；
6. beforeunload 的时间窗口是否足以完成安全 close；
7. 未完成 Commit 如何阻止结束或路由 Recovery；
8. 崩溃后 orphan process/descriptor 如何识别；
9. Restore 后停止与正常结束如何区分；
10. 不配置 Provider 时如何保持全部基础能力。

实现不得依赖硬编码用户路径、shell 拼接或把 token 放入设置。

## P0-I：系统状态

状态：`DONE` — 用户状态推导、默认折叠技术诊断、自动覆盖与真实 Desktop 注意/受限状态均已通过。

用户层固定回答：

1. 发生了什么；
2. 哪些能力受影响；
3. 哪些仍可用；
4. 数据是否安全；
5. 是否需要用户操作；
所需动作直接写入第五项，不另造技术入口；需要原因时统一展开技术诊断。

技术诊断仍保留 component/code/protocol/log/ID，但默认折叠。

完成证据：

- 新增纯 `deriveUserSystemStatus`，只读取既有 Diagnostics/Commit/Anchor/explicit-sync
  投影，不建立第二状态源；
- `RECOVERY_REQUIRED`、`PENDING`、Service/Store 受限、Anchor conflict、explicit-sync
  核对和 READY 按安全优先级翻译；
- Provider 未配置只影响 Agent 分析，不把确定性基础事务系统误报为故障；
- 原 Runtime/Store/Service/Graph/版本/日志/ID、Anchor repair 与诊断导出动作完整保留在
  默认关闭的“展开技术诊断”内；
- Plugin 174/174、typecheck、build、dist integrity PASS；
- 真实 Desktop 在 Service READY 但存在一项正文核对时显示“需要留意”，受控停服/reload
  后显示“正式服务暂时不可用”，并明确正文和历史仍可用、数据安全、不得重复提交；
- 健康 READY、协议不匹配、Graph identity 不匹配、Pending、Recovery、Anchor conflict
  与正文核对均有纯测试；本轮没有制造虚假 Recovery 或清空真实队列；
- 证据见 `logs/p0-i-user-system-status-desktop-20260724.md` 与
  `screenshots/original/p0-i-*`。

## P0-J：中文创建命令与快捷动作

状态：`NOT_STARTED`

斜杠：

- 创建任务；
- 创建 MiniProject；
- 创建决策；
- 创建成果。

命令面板 / 可配置 binding：

- 打开“现在”；
- 处理当前 Block；
- 加入或移出当前关注。

不为 WAITING/BLOCKED/PAUSED 分别占用默认快捷键。
