# P1 Slice 计划：注意力信号、状态翻译与重入

## 进入条件

只有 P0 已完成并有真实 Desktop 验收，才允许把信号展示给用户。P1 的第一阶段始终是影子模式。

## P1-A：Attention Signal 纯模型与影子存储

状态：`PARTIAL_RUNTIME_SHADOW_BOUNDED_NOW_PILOT / UX-G008_BOUNDED` — 纯模型与有界
session shadow repository 已完成并接入 Plugin 只读刷新链路；`3097c39` 已让首批时间信号
在既有正式 Now 卡片完成真实前台处置与 reload/recompute Gate。没有接入正式 Domain 或
SQLite schema；跨会话 disposition 是否需要派生持久化，继续等待真实多日 helpful/noise
证据，不因一次人工样本扩张 authority。

最小内部字段：

- signal type；
- subject ref；只有目标已是正式对象时才附带 object id；
- source facts / source event；
- first detected / last confirmed；
- urgency / certainty / context relevance；
- proposed display level / surface；
- invalidation；
- merge target；
- cooldown；
- shown count / user disposition；
- rule / Skill / Prompt / model version；
- evidence scope。

硬边界：

- Signal 不是正式对象，不改变 Lifecycle/Condition/Focus/Ownership；
- 用户不维护 Signal；
- 默认不保存完整正文；
- 可重算、可失效、可清理；
- PENDING、RECOVERY_REQUIRED、Graph mismatch 不允许冷却；
- LLM 不能单独把信号升级为强提醒。

2026-07-24 首轮自动结果：

- 新增 Application 层纯派生 `AttentionSignalCandidate/Record`，覆盖 type、object/source facts、
  first/last detected、urgency/certainty/context relevance、拟议显现、invalidation、
  merge target、cooldown、shown/disposition、rule/Skill/Prompt/model provenance 与 evidence scope；
- shadow repository 只接受 `SHADOW / NONE`，没有 UI、Focus/Ownership、正式 Object、
  Proposal 或 SemanticCommit 端口；
- source facts 只接受有界机器 code、opaque ref、timestamp 与稳定 checksum，模型结构
  没有 `text/content/summary` 字段；
- 同一问题保留 first detection 并更新 last confirmation；事实不再出现时自动 invalidated；
  scope hash 改变解除 cooldown，`NEVER` 策略拒绝对 Recovery 信号冷却；
- repository 容量 1..4096、默认 512；只淘汰已 invalidated 记录，绝不静默淘汰 active；
  支持显式 clear 与 active/invalidated/detected/confirmed/evidence-changed/pruned 遥测；
- Application tests 75/75、0 skipped，typecheck PASS；
- Plugin READY 且 objects/proposals/commits/anchors 投影完整时运行 session-only cycle；
  Graph 切换清空，单轮最多 512 candidates，Anchor 分页失败只记 bounded warning；
- runtime telemetry 仅记录 raw/merged/cooled/active/invalidated 数量，数量未变化不重复记录；
  不记录正文或 object/proposal/commit/anchor identity；
- Application tests 82/82、Plugin tests 196/196，typecheck/build 与根级 Gate PASS；
- 当前仍不构成用户可见 P1 上线或 Desktop PASS。
- fresh repository 对同一正式 snapshot 重算得到相同 signal identity、scope hash、merge/suppress
  count 与 Dynamic Now signature；firstDetected/counters 等历史不参与当前投影；
- 发现并修复同证据 refresh 会意外清除 session cooldown：现在同 scope + 同 policy 保留 until，
  evidence scope 或 rule policy 变化才解除；当前 runtime 没有 markShown/setDisposition 用户入口，
  因此不为未使用历史新增 SQLite authority。

## P1-B：确定性 detector、合并与失效

状态：`PARTIAL_TIMING_PILOT_OTHER_DETECTORS_SHADOW` — 第一波确定性 detector 与合并
优先级已完成纯函数 Gate并接入 Plugin session shadow；`REVIEW_DUE / DUE` 已在既有 Now
卡片完成有界 Desktop Pilot。accepted-not-applied、PENDING/RECOVERY、Anchor/Graph 风险
继续由既有权威表面承接，不复制同义提醒；blocker 变化、WAITING 过久、Project 静默与
LLM 跨对象仍未开放。

开放顺序：

1. reviewAt due；
2. due；
3. accepted-not-applied；
4. PENDING / RECOVERY_REQUIRED；
5. Anchor missing/conflict；
6. blocker 变化；
7. WAITING 过久；
8. Project 静默；
9. LLM 跨对象。

同一对象的主问题优先级：

```text
数据/恢复风险
> 已确认未完成
> blocker 变化
> reviewAt
> due
> 等待过久
> 建议关注
> Project 静默
```

测试必须覆盖合并、自动失效、用户处置、冷却、新事实解除冷却和一对象一主问题。

2026-07-24 第一波自动结果：

- detector 只读取结构化 object/proposal/commit/anchor/Graph binding facts，不接正文；
- 已覆盖 reviewAt due、due、accepted-not-applied、PENDING、RECOVERY_REQUIRED、
  Anchor missing/conflict 与 Graph mismatch；
- 非 OPEN 对象、未来 reviewAt/due 和已由 COMPLETED Commit 应用的 Proposal 不产生候选；
- Graph mismatch 只生成一个 Graph subject 问题，不按所有对象复制；
- 一对象一主问题优先级已锁定为 Graph/Recovery/Anchor/Pending 数据安全风险
  > accepted-not-applied > reviewAt > due；
- 次要问题只进入本次 merge 的 suppressed metadata，不形成第二组可见卡片；
- eligible cooldown 可抑制重复事实；scope checksum 变化经 repository 自动解除 cooldown；
  PENDING/RECOVERY/Anchor/Graph 风险使用 `NEVER` 且不允许冷却；
- 输出继续强制 `SHADOW / NONE`；CREATE Proposal 与未挂对象 Commit 使用自身 `subjectRef`，
  不把 Block UUID 或虚构 ID 当正式 Object；
- Service 投影 adapter 不携带 Object/Proposal 正文，Plugin UI model refresh 已接入
  session-only detector/reconcile/merge；失败不影响主 UI 或正式写入能力；
- Application tests 82/82、Plugin tests 196/196、0 skipped，typecheck/build 与根级 Gate PASS；
- 当前已有 runtime shadow 编排，但没有用户可见 UI 和真实 Desktop telemetry 读回，
  因此不能算 P1-B 完成或 Desktop PASS。

## P1-C：“现在”动态编排

状态：`PARTIAL_DESKTOP_FRONTSTAGE_TIMING_PILOT_HELPFUL_NOISE_OPEN` — 稳定三段骨架、正式事实
inclusion/exclusion、容量与 Focus ownership 已完成纯投影；`3d63d5a` 已让既有正式
Service Now 在用户层按同一三段展示并完成“继续处理”标准宽度/窄栏 Desktop 代表 Gate。
Dynamic Now Shadow 仍只作对照，Copilot 建议关注仍为空；`3097c39` 已完成到期类
Attention 的有界前台处置与重算 Gate，但真实 helpful/noise 和跨会话策略仍未通过。

稳定骨架：

- 继续处理；
- 需要回看；
- 保持等待。

Copilot 建议关注只有达到质量门槛时动态插入。普通 OPEN、普通 Waiting、全部 Project 不进入首页。

指标：

- 原始信号数；
- 合并候选数；
- 实际显现数；
- 忽略/不准确/重复；
- 下一动作拒绝率；
- 每屏信息量；
- 用户找到正文和停留点的时间。

2026-07-24 首轮自动结果：

- 新增显式 `visibility: SHADOW` 的 `projectV2DynamicNowShadow`，不会被现有 Plugin UI 读取；
- “继续处理”只来自未过期 Focus 中 ACTIONABLE 的 Task/MiniProject/Project，并保留用户排序；
- “需要回看”按 blocker 已完成 > reviewAt 到期 > 七天内 due > Focus BLOCKED 排序，
  一个对象只进入一次；
- “保持等待”只包含 Focus 中尚未到期的 WAITING/PAUSED，普通非 Focus 等待保持安静；
- 普通 OPEN、Area/Decision/Output、closed、expired Focus 和远期 due 不进入三段；
- review/waiting 默认各 12、可配置 1..100，overflow 显式计数；Focus 继续项不截断；
- Focus 超过 7 项只生成温和事实，不自动移出、不阻止加入、不重写选择；
- `suggestedAttention` 首轮固定为空，未把近期更新或 SHADOW Signal 提升为 Copilot 建议；
- duplicate Object/Focus identity、invalid timestamp 与 invalid bounds fail closed；
- Plugin 从现有 `/now-work.focus` 只取过滤后的 object IDs 与顺序，不新增 Focus API；
  每次 Attention session cycle 同步记录 continue/review/waiting/suggestion/suppressed/overflow
  数量与 focus-overload，日志无正文和 identity；
- Application tests 98/98、Plugin tests 197/197、0 skipped，typecheck/build 与根级 Gate PASS；
- 该首轮 Shadow 本身不构成用户可见 Now 编排或 Desktop PASS。

2026-07-29 前台收口结果：

- 新增纯 UI 派生 `projectNowFrontstageSections`，只读取既有 `ServiceNowWork`，不新增
  Domain、SQLite、Signal、Runtime 或写入路径；
- 同一 object identity 在 Focus / next / waitingReview 之间去重；ACTIONABLE 进入
  “继续处理”，到期 Waiting/Paused、Blocked 与逾期 next 进入“需要回看”，未来
  Waiting/Paused 进入“保持等待”；
- Focus 来源显式显示“来自当前关注”；无论 Focus 数量多少都不进入普通 4 项折叠，
  用户权威不被系统容量规则隐藏；
- focused Waiting 只在“保持等待”出现一次，不再同时占据“当前关注”和“等待与复查”；
- focused `5/5` + Plugin `366/366`、typecheck/build、根级 `./scripts/check.sh` PASS；
- 精确构建 `3d63d5aee0a7` 在 Logseq 0.10.15 File Graph 完成真实 plugin reload，
  Plugin Dark 1001×720 与 733×720 显示同一信息层级；系统状态健康、无需操作；
- 同一精确构建又以正式测试 Task 完成 Focus→Blocked→恢复→Paused（未来 reviewAt）→
  恢复→移出 Focus；“需要回看 / 保持等待”分别出现且一对象只显示一个主问题。非 Focus
  Blocked 保持安静，符合低噪声边界；
- 结束后 Condition 与 Focus 均恢复到测试前基线，系统状态显示没有未完成修改或正文冲突；
- 累计关闭“来源分区重复/Focus 被容量折叠风险”“需要回看 Desktop”“保持等待 Desktop”
  子 Partial `3`。该时点 P1-C 仍因 Attention 前台 Pilot 与建议关注为空而保持 Partial；
  timing 子 Gate 后由 `3097c39` 关闭，真实 helpful/noise、跨会话策略和建议关注仍开放。

2026-07-30 Attention 有界前台 Pilot：

- 只把 `REVIEW_DUE / DUE` 装饰到同一正式 Now 卡片，显示
  `Copilot 提醒 · 试用`；没有新增 Attention 列表、一级导航或第二张同义卡；
- `本次先不提醒` 与 `本次不相关` 分别使用既有 session disposition/cooldown；正式对象、
  Condition、Focus、正文与写入权限不变；
- 同 scope 保持处置，事实变化解除旧处置，事实消失自动失效；真实 Plugin Manager reload
  清除 session disposition 并从正式事实重算；
- accepted-not-applied、Pending/Recovery、Anchor/Graph 风险不在 Now 复制，继续由 Review、
  系统状态和工具栏承接；
- 自动聚焦 `83/83`、Plugin `370/370`、typecheck/build 与根级检查 PASS；真实 Desktop
  完成显示→暂缓→reload/recompute→不相关→恢复正式测试 Condition→健康；
- 本轮只有一个人工 eligible 样本，不能计算真实 helpful/noise；跨会话 disposition、建议
  关注与默认 Block Marker 继续开放。关闭既有子 Partial `1`，新增长期 Partial `0`。

2026-07-30 Attention 质量边界补证（`c9919f2`）：

- 真实 Desktop 发现“只打开 Condition、随后取消也计 acted”的语义错误；计数点已移至正式
  保存成功或宿主导航成功之后，取消保持提醒且 `acted=0`；
- 四个独立 reload session 覆盖取消、later、notRelevant 和完成主操作；两个处置只安静
  当前 session，仍有效事实 reload 后重算，事实解除后自动失效且再次 reload 不返回；
- `acted` 只代表完成推荐动作，不等于 helpful；受控样本不伪装生产 helpful rate；
- disposition 正式固定为 session-only，不建立提醒数据库；Waiting 过久、Project 静默、
  跨对象观察和建议关注保持 Shadow，Block Marker OFF；
- Plugin `378/378`、typecheck/build、根级检查、Service READY、Doctor PASS、
  PENDING/Recovery `0/0`；新增状态/Runtime/Recovery/Skill/持久权威 `0`；
- 关闭“主操作计数语义”和“跨会话 disposition 决策”两个 Partial，净变化 `-2`。
  自然日用 helpful/noise 继续作为有界 Pilot 观察，不阻断首发。

## P1-D：状态翻译层

状态：`PARTIAL_UI_AUTOMATED` — Application 确定性 Object/Proposal/Commit/Anchor/System
叙述契约已接入 Plugin System、Proposal Review、Recent Changes 与 Now Work；
Anchor missing/conflict 的用户问题卡和既有 Rebind 修复链也已接入；Desktop Gate 与 LLM
draft protocol 仍待扩展。

Application/ViewModel 契约：

```text
conclusion
keyEvidence[]
facts[]
inferences[]
unknowns[]
nextActionEligible
nextAction?
evidenceScope
source
```

前台：

> **主结论**（最多一到两个关键依据）

详情再显示完整证据。确定性模板优先，LLM 只能在不改变事实的情况下起草或压缩表达。

下一动作资格至少要求：信号强、上下文充分、动作具体、不依赖猜测、与对象直接相关、当前场景适合且减少判断成本。

2026-07-24 自动结果：

- 新增 `StatusNarration` 纯契约，固定分离 `conclusion / keyEvidence / facts /
  inferences / unknowns / nextActionEligible / nextAction / evidenceScope / source`；
- 确定性模板的 `inferences` 恒为空；规则、版本和带对象版本的 evidence refs 可追溯；
- WAITING 复查到期、已完成 blocker、PAUSED 复查到期只有在相关现场才具备一个结构化
  next action；未来等待、普通 ACTIONABLE、Project current focus 与后台场景不生成动作；
- 未读取 blocker 时明确输出 unknown；blocker identity 不匹配 fail closed；
- Project current summary/focus 只作为正式事实，不把 focus 文本自动升级成动作；
- 主结论和关键依据各封顶 160 字、next-action label 封顶 80 字；完整正式内容保留在 facts，
  不以高密度为理由丢失证据；
- 用户层文本不直接暴露 Lifecycle/Condition 字段名；
- accepted-not-applied 只有不存在完成 Commit 时成立，并只路由既有 Proposal Review；
- PENDING/RECOVERY_REQUIRED 保留原 Commit 语义，只打开既有 Audit/Recovery 详情，不生成
  第二个恢复命令；FAILED/COMPLETED/UNDONE 不猜测 retry 或 Undo 资格；
- Anchor missing/conflict 不显示外部 Block identity，只在对象证据已读取时声明“正式事项仍保留”，
  并只打开受控修复入口；
- System priority 固定为 Recovery > Pending > Service/Graph > Anchor > Explicit Sync > Ready；
  restricted 状态明确正文仍可编辑，Provider 未配置不降级基础事务能力；
- Plugin adapter 只把 Service 结构化事实送入 Application，不把叙述结果作为正式状态；
- System 五问首屏的 headline、最多两条依据与 rule provenance 来自同一契约，原有影响范围、
  数据安全和用户动作说明继续保留；
- Proposal Review 先显示确定性结论/依据/未知，`ACCEPTED/APPLIED`、Provider kind/model 和
  rule id 退到折叠详情；accepted-not-applied 仍复用既有 Commit 按钮；
- Recent Changes 先显示 Commit 结论和依据，Undo 资格仍由原有 operation-specific Handler
  与前置校验决定；完成状态不会凭叙述自动显示 Undo；
- 用户首屏 notice 不再显示 SemanticCommit ID；技术身份、checksum、error code 仍只在折叠
  详情中可查；
- Now Work 用同一轮 `listObjects + nowWork` 只读结果投影 Object narration；重复 Object identity
  fail closed，卡片只消费与 Now item 完全相同的 Object version；
- 到期 WAITING/PAUSED 与已结束 blocker 的具体复查按钮只复用既有 `v2-condition-open`，
  target identity 不匹配或资格不足时保持普通“更新状态”；
- Now 卡片先显示结论、依据与 unknown，完整 facts 折叠；投影失败明确降级到 Local Service
  既有 reason，不改变正式状态或动作资格；
- Anchor missing/conflict 只在“系统状态”用户层生成有界问题卡，active/replaced 不产生卡片；
  标题、结论、最多两条依据和 unknown 不包含 object/Anchor/Graph/Block/hash 标识；
- 问题卡一次最多展示 5 项，修复按钮只复用既有 `v2-rebind-open`；用户仍需先选中明确对象
  Block，随后经过既有候选预览、独立高影响确认、Block/hash/version 与 Service generation
  重校验，未建立第二套恢复状态机；
- Rebind loading/error/preview/success 重绘后保持在折叠技术详情之外；Service 受限时不显示
  可提交动作；
- 复制/导出的 diagnostics snapshot 只保留冲突计数，不包含对象标题或用户叙述投影；
- Application tests 112/112、Plugin tests 213/213、0 skipped，typecheck/build PASS；
- 当前未完成 Desktop 主题/窄栏/真实 missing→repair→reload 对照，不能声明 P1-D 完成。

## P1-E：Block 轻标记原型

状态：`DONE_BOUNDED_HOST_REJECTION` — Logseq `0.10.15` File Graph 真实 Desktop 证明
`onBlockRendererSlotted + provideUI(slot)` 会替换目标 Block 的可见正文，而不是提供稳定的
追加式装饰位置。生产设置、slot 注册、CSS 和生命周期接线已由 `53337f2` 移除；隔离原型和
自动样本仅作为研究证据保留，不进入发布运行时。

候选：

- 左侧细线；
- 圆点；
- 小图标；
- 极淡底色；
- 正文末尾短语。

原型 Gate：

- Light/Dark；
- TODO/DOING/DONE；
- 编辑态和光标；
- 长文本；
- 连续 Block；
- 父子；
- Query；
- 引用；
- Linked References；
- 右侧栏；
- Zoom；
- 100 个正式 Block；
- renderer reload；
- Plugin 关闭后正文干净；
- 性能预算。

原型验证前不全局上线。

2026-07-30 Desktop 结论：

- 在正式 MiniProject 根 Block 上把 setting 从 `off` 切到 `line` 后，根正文立即从页面和
  Accessibility tree 消失，只剩一条竖线；Markdown 文件、正式 Object/Anchor 与 SQLite
  权威均未变化；
- setting 恢复 `off` 和 Plugin reload 不足以让宿主恢复该 slot；完整退出/重开 Logseq 后
  原根 Block、子 Block、UUID 与正式映射重新可见；
- 当前发布策略固定为 `OFF / publicSettingVisible=false / HOST_SLOT_REJECTED`。只有 Logseq
  提供可验证、稳定、append-only 的 Block 装饰 slot 时才重新开启评估；
- 不使用 MutationObserver、DOM selector、renderer macro 或正文属性模拟视觉标记。Now、
  Project workspace 和状态翻译继续承担用户可见治理信息；这是一项有证据的宿主边界结论，
  不把“不安全但能画出来”伪装为已交付能力。

2026-07-24 自动原型：

- Logseq 官方 SDK `onBlockRendererSlotted(blockUuid, callback)` 是指定 UUID 的条件 slot hook，
  `provideUI(slot)` 只能向宿主给出的 DOM slot 注入 HTML；不存在本轮使用的全局 Markdown
  postprocessor。见 https://logseq.github.io/plugins/interfaces/IAppProxy.html 与
  https://plugins-doc.logseq.com/logseq/provideUI；
- setting 默认 `off`，可比较 line/dot/icon/tint/phrase；设置只变化视觉模式，不重启或重新
  获取 Service lease；
- 只注册 SQLite active primary Anchor 对应的精确 UUID，状态只来自 Object Lifecycle/
  Condition 与正式 Focus；inactive/missing/conflict/无对象 Anchor 不注入；
- marker 无 button/data-action，`pointer-events: none`、`user-select: none`，不写 Markdown、
  不插入 renderer macro、不使用 MutationObserver/全局 DOM 扫描；
- 同一 UUID 可同时拥有 main/query/reference 等多个宿主 slot，但实际宿主是否提供这些 slot
  仍需 Desktop；identity mismatch、无效 slot、容量溢出、Service 受限、Graph switch、off 与
  unload 均 fail closed/清理；
- focused 4/4、Plugin 231/231、typecheck/build PASS；100 个正式 Block 的注册/注入结构 harness
  PASS，但不是 Desktop 布局/帧率结论。

## P1-F：Project/Task 重入

状态：`PARTIAL_DESKTOP_WORKSPACE_FILE_GRAPH_PAGE_HEAD_BOUNDED` — Application 只读重入投影
已接入 Plugin Project workspace 与 Project 主 Page 的 Page Head 单动作；Project workspace
真实 Desktop 已通过。Logseq 0.10.15 File Graph 不挂载 Page Head slot，安全隐藏为有界宿主
结论；DB Graph Page Head 与视觉 Gate 尚未完成。

Project 顶部条只组合 schema v12、Condition、Focus、Anchor、最近 Audit 与未完成 Commit；不建立第二摘要权威。

上下文充分：

> **项目｜当前停留点**（关键边界）

上下文不足：

> **当前进入点不明确**（最近一次正式变化时间）

Task 不建立强制 current interface。依次使用正式状态、当前正文、父 Block、Condition、所属 Project 和最近变化；不足时只打开原文。

2026-07-24 首轮自动结果：

- Project Recovery/PENDING Commit 高于普通当前接口，且只路由既有 Audit/Recovery；
- 结构化当前接口、精确 Condition 或 Focus 中的直属对象至少有一项时才声明上下文充分；
- 默认新 Project 没有结构边界时显示“当前进入点不明确”，不把初始化占位摘要伪装成进度；
- 只允许 Focus 中、Primary Ownership 属于该 Project、Lifecycle OPEN 且 active Primary
  Anchor 存在的对象成为进入点，最多三个；
- 普通 Association 只计入背景上下文，不成为动作；
- closed Project 使用 Closure 实际结果，不能建议 Focus 或修改当前接口；
- Task 依次使用精确 Condition、有 sourceRef 的父正文、Primary Owner 与 active Anchor；
  ACTIONABLE 且没有正文上下文时只提供“打开原文”，不生成 current interface；
- external Block identity 不进入投影，facts/inferences/unknowns/evidenceScope 分离；
- duplicate identity、时间无效、Anchor/Object 不匹配与无机器引用的父正文 fail closed；
- Plugin 一次分页读取 Primary Anchors，并同时供 Attention shadow 与重入投影使用，
  没有为每个 Project 重复请求；
- Project workspace 已改为一个结论、最多两个关键依据、最多三个可定位进入点；
  完整 Objectives/Deliverables/对象树仅通过现有编辑/详情路径访问，不在重入卡片铺开；
- Logseq 0.10.15 的 `onPageHeadActionsSlotted` / `provideUI(slot)` 已作为正式宿主入口，
  Header 只显示紧凑“继续项目”，不写 Graph、不保存第二摘要；
- 固定 SDK 与 0.10.15 host 源码均表明 Page Head hook 的 payload 不含 Page identity；
  因此按钮只在 main Page 可见，right sidebar 通过样式明确隐藏，不把无身份 slot 误当现场；
- 被动入口只读取当前 Page identity、对象和分页 Primary Anchor，不读取 Page Block 树；
  只有当前 UUID 对应唯一 active Project Page Anchor 时才注入；
- 点击后再次解析当前 Project，再用既有 Page Context 完整重验 Page、Project object/version；
  任一变化均 fail closed，不回退到其他 Project；
- 打开后只显示目标 Project 的同一 P1-F 投影，目标消失会明确报错；“查看全部项目”才解除
  session-only 目标过滤；
- Recovery route 只打开既有 Audit，Anchor route 只调用既有定位动作；
- 任一 Object/Commit/Relation/Anchor 投影读取失败会显示显式错误，不伪装为空项目；
- Application tests 112/112、Plugin tests 219/219、0 skipped，typecheck/build PASS；
  根级 Gate PASS（145 条稳定规则、恢复演练 differences 为空）。
- 2026-07-26 真实 Logseq 0.10.15 File Graph 源码与运行双重确认：
  `page-head-actions-slotted` 只在 DB Graph/LSP 分支挂载，File Graph 不能显示该动作；没有
  使用 DOM 注入、页面标题或 stale properties 猜身份。Project workspace 的确定性重入卡与
  Context Recovery 入口可用，DB Graph Page Head 继续 OPEN。

## P1-G：LLM 叙述与上下文恢复 Skill

状态：`DONE_REPRESENTATIVE_DESKTOP_PROVIDER_GATES` — Provider-neutral unified UX
output validator、Local Service 生成器、`recover-context@1.3.0` 与 Plugin session-only
用户界面已完成；真实 Provider 内容、真实业务 unknown、error、stale、validator rejection、
feedback、reload、Dark/Light 与窄栏代表 Gate 均已通过。Project current-interface 的正式
修改继续归 P2-D Proposal/Commit 链，不扩张 P1-G 的只读写入权。

统一结构化输出至少包含：

- facts；
- inferences；
- unknowns；
- summary；
- evidenceScope；
- suggestedChanges；
- nextActionEligible / nextAction；
- riskLevel；
- requiresDiscussion / requiresReview；
- provenance；
- skill/prompt/model version。

Service 必须机器覆盖 provenance、model id/version、时间和 scope hash。输出只可进入缓存/Proposal，不直接成为正式事实。

2026-07-24 首轮自动结果：

- Application 只暴露一个 `materializeUnifiedUxOutput(unknown, authority)` 深模块；
- 模型使用 `factRefs` 选择机器 fact，正式事实文本不能由模型重写；
- inference/suggested-change evidence 必须属于机器 allowlist，未知 fact/action、重复机器
  identity、越界 ref、错误 schema 与超界文本全部 fail closed；
- next action 只能选择机器给出的 action ID，label/intent/target 由机器物化；
- risk 取机器 floor、模型声明和建议项的最高值；discussion/review 只能被提高，不能降低；
- `DRAFT_PROPOSAL` 只有摘要、evidence 和 risk，没有 semantic operation 或持久化权；
- contract/prompt/Skill/Provider/model/time 与 scope hash 全部由 Local Service 生成器回填，
  模型伪造 provenance 被忽略；
- `recover-context@1.0.0` 固定正式事实→当前正文→Project 当前接口→直接关系→宽检索的
  够用即停阶梯，信息不足时要求明确承认，下一动作默认 false；
- 新 Skill 通过 `quick_validate.py`、SHA-256 catalog、真实 Local Service `/skills` 读取和
  Context Package 复用，不创建 Object/Proposal/Commit；
- Application tests 120/120、Local Service tests 94/94、Service Client tests 12/12；
- 当前未持久化 unified UX output，从而关闭 UX-G009 的“是否另建正式缓存”方向；若后续
  性能证据需要缓存，只允许可失效派生 cache，任何修改建议仍必须转为正式 Proposal。

2026-07-26 Desktop / Provider 结果：

- `4e02226` 将最近正式 Commit 纳入机器事实，并把同一 Proposal 的 forward/inverse 折叠为
  “已撤销”；模型不再把已完成/已撤销变化写成未知；
- `unified-ux-generator@1.2.0` 固定当前产品的中文前台合同：受控产品词不参与语言比例，
  剩余自然语言需以中文为主且不得混入日文假名；Validator 失败只返回固定
  `UX_OUTPUT_VALIDATION_FAILED`，不自动发起第二次 Provider 调用；
- 真实 Project workspace→确定性重入卡→显式恢复→loading→DeepSeek V4 Flash→Validator→
  facts/inference/unknown 分区→feedback 已通过，reload 后草稿与 disposition 清除；
- 最新精确构建 `894d14f` 的事实和语言边界正确，但把“当前真实 Provider Gate 的结果”列为
  未知，用户标记 `INACCURATE`；这是真实质量失败回归，不作为 P1-G 完成证据；
- 生成/反馈前后 `semantic_commits=24` 且最新正式时间不变，证明该链零 Proposal/Commit；
- 代表性截图与日志见 `current-ui/SCREENSHOT_INDEX.md` 和
  `logs/p1-project-context-recovery-desktop-live-20260726.md`。
- `recover-context@1.3.0` 将上述失败提升为通用 Skill 规则：正在生成的 recovery draft 及其
  user disposition 属评价通道，不得作为业务 unknown；有待用户评价时省略反身结论，由既有
  feedback 单独收集。`653875a` 已完成真实 DeepSeek 复验：信息充分样本不再产生反身 unknown，
  独立样本仍正确保留“当前项目边界和目标尚未明确”的真实业务 unknown；均 1 attempt。
- 同一构建已完成 Provider error、统一 Validator rejection、真实 DeepSeek 延迟 stale、reload、
  Light 与约 720 px 窄窗。stale 现在把已记录的同一 Interaction Evidence 从
  `GENERATED` 替换为 `STALE / V2_OBJECT_VERSION_CONFLICT`；当前运行摘要
  `STALE=1 / GENERATED=0`，没有新事件或恢复状态。
- `recover-context@1.2.0` 退休；1.3.0 晋升
  `CANDIDATE/DESKTOP_VERIFIED`，真实 helpful/noise 样本仍不足以晋升 Production。完整证据见
  `logs/p1-g-context-recovery-1-3-desktop-live-20260726.md`。

## P1-H：交互日志与版本

状态：`PARTIAL_LIVE_SERVICE` — Application 已建立 session-only bounded
Interaction Evidence Buffer，P1-G 生成器已记录成功、Validator 拒绝和 Provider 失败；
Plugin StructuredLogger/Runtime Diagnostics 与 Local Service daemon output 已去除自由
文本异常和本机路径；Project recovery 五种可撤回处置、版本噪声汇总、同场景/Skill 版本
`DO_NOT_REPEAT` 与真实 DeepSeek/Service Gate 已完成，Plugin UI 自动 Gate 完成；Desktop
点击与跨会话持久化/清理策略、用户可见 dashboard 仍开放。

默认仅记录：

- scene/object type；
- signal/Skill/version；
- evidence scope 的结构化摘要；
- user disposition；
- Commit/Undo/stale/conflict；
- elapsed time。

禁止：

- API Key；
- Authorization；
- 全键盘输入；
- 全 Graph；
- 默认完整正文；
- 无期限 raw request/response。

Prompt/Skill 演化仍必须走证据 → 候选 → 人工审阅 → 测试 → 版本 → 可回退。

2026-07-24 首轮自动结果：

- buffer 容量限制为 1–4096，默认 500，超过容量只丢弃最旧项，Graph/SQLite 不新增表或写路径；
- runtime parser 使用 exact-key allowlist，未知字段直接拒绝；接口没有 summary/content/objectId/
  blockUuid/Prompt/request/response 字段；
- version、model、rule、signal、failure code 只接受长度受限 machine token；scope hash 只接受
  有界十六进制值，计数与时长均封顶；
- P1-G 成功只记录 evidence scope hash、fact/inference/unknown/suggestion/ref 数量、
  next-action eligibility、版本与时长；
- Validator 拒绝只记录固定 `UX_OUTPUT_VALIDATION_FAILED`；Provider 失败只记录固定
  `UX_OUTPUT_PROVIDER_FAILED`，不保存 exception message 或原始响应；
- evidence sink 是 best-effort 派生观测；写入失败不能覆盖成功结果、Validator 错误或
  Provider 错误；
- 当前不自动持久化或上传；`snapshot/exportJsonl/clear` 只是显式 session API。完整正文
  即使显式授权也必须进入未来独立、可删除的研究样本流程，不能复用本默认事件模型。
- Application tests 121/121、Local Service tests 97/97，0 skipped，typecheck PASS。
- Plugin StructuredLogger 只挑选 machine-token/count/boolean allowlist 字段，调用者无法通过
  任意 object 注入 error message、stack、cause 或 content；
- Runtime stage failure、Plugin 启动、全局异常和 fallback Console 路径只保留错误名与机器
  错误码；Debug 开关也不放宽这一隐私边界；
- Plugin tests 222/222、0 skipped，typecheck/build PASS。
- session handle 只用于当前 Service 内关联反馈，`snapshot/exportJsonl/summary` 均不暴露；
  handle 过期或跨 session 返回 404，不会误绑定新草稿；
- Project recovery 卡提供 HELPFUL/NOT_NEEDED/INACCURATE/TOO_MUCH/DO_NOT_REPEAT 与撤回；
  `DO_NOT_REPEAT` 按同一 scene + Skill version 在 Provider 前抑制，避免动态 Context hash 绕过，
  Service restart 或撤回即恢复，不写 SQLite/Graph；
- Application 123/123、Local Service 102/102、Plugin 226/226；真实 LaunchAgent + Keychain
  reference + DeepSeek Gate 验证评分变更、抑制、撤回、summary 脱敏、零正式写入和 owned shutdown。
- Local Service READY 输出不含 descriptor/database，schema migration 输出不含 backup path，
  stderr 只返回 machine error code；Local Service tests 98/98、0 skipped，typecheck/build PASS；
- CLI stderr 是用户显式调用的即时反馈而非自动留存日志；live/golden runner 默认关闭且已有
  bounded metadata/zero-write/structural failure 测试，完整样本只能进入独立显式研究流程。
- session summary 按 Skill/Prompt/model version 汇总 generated/rejected/error、用户 rated、
  helpful/noise/do-not-repeat 与有界 rate；未评分时 rate 为 null，不用“无反馈”伪装满意；
- summary 只消费已验证 session entry，不含对象/Block identity 或正文；Application tests
  122/122、0 skipped，typecheck PASS。
- Dark Desktop 已真实提交 `HELPFUL` 与 `INACCURATE`；最终精确 build session 为
  `GENERATED=1 / REJECTED=0 / INACCURATE=1`，一次用户生成只记录一个 event，未发生自动
  Provider retry。跨会话 disposition/dashboard 仍未加入，也没有把派生反馈升级为正式状态。
