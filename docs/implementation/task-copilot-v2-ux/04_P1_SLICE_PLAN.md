# P1 Slice 计划：注意力信号、状态翻译与重入

## 进入条件

只有 P0 已完成并有真实 Desktop 验收，才允许把信号展示给用户。P1 的第一阶段始终是影子模式。

## P1-A：Attention Signal 纯模型与影子存储

状态：`PARTIAL_RUNTIME_SHADOW` — 纯模型与有界 session shadow repository 已完成并接入
Plugin 只读刷新链路；没有接入 UI、正式 Domain 或 SQLite schema。UX-G008 的跨 reload
派生存储位置仍待 reload/recompute 证据。

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

## P1-B：确定性 detector、合并与失效

状态：`PARTIAL_RUNTIME_SHADOW` — 第一波确定性 detector 与合并优先级已完成纯函数 Gate
并接入 Plugin session shadow；blocker 变化、WAITING 过久、Project 静默与 LLM 跨对象仍未实现。

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

状态：`PARTIAL_RUNTIME_SHADOW` — 稳定三段骨架、正式事实 inclusion/exclusion、容量与
Focus ownership 纯投影已完成并进入 Plugin count-only runtime 对照；未替换现有 Service/UI，
Copilot 建议关注仍保持空。

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
- 当前不构成用户可见 Now 编排或 Desktop PASS。

## P1-D：状态翻译层

状态：`PARTIAL_UI_AUTOMATED` — Application 确定性 Object/Proposal/Commit/Anchor/System
叙述契约已接入 Plugin System、Proposal Review 与 Recent Changes；Object/Anchor/Now
consumer、Desktop Gate 与 LLM draft protocol 仍待扩展。

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
- Application tests 112/112、Plugin tests 204/204、0 skipped，typecheck/build PASS；
- 当前未完成 Object/Anchor/Now consumer 与 Desktop 主题/窄栏/真实恢复对照，不能声明 P1-D 完成。

## P1-E：Block 轻标记原型

状态：`NOT_STARTED`

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

## P1-F：Project/Task 重入

状态：`PARTIAL_UI_AUTOMATED` — Application 只读重入投影已接入 Plugin Project workspace；
Project Page slot 与 Desktop Gate 尚未完成。

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
- Recovery route 只打开既有 Audit，Anchor route 只调用既有定位动作；
- 任一 Object/Commit/Relation/Anchor 投影读取失败会显示显式错误，不伪装为空项目；
- Application tests 112/112、Plugin tests 200/200、0 skipped，typecheck/build PASS；
  根级 Gate PASS（145 条稳定规则、恢复演练 differences 为空）。

## P1-G：LLM 叙述与上下文恢复 Skill

状态：`NOT_STARTED`

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

## P1-H：交互日志与版本

状态：`NOT_STARTED`

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
