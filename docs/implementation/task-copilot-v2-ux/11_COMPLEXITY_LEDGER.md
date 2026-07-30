# Task Copilot V2 复杂度台账

> 状态：`ACTIVE`
> 适用范围：UX 产品化 Goal P0 / P1 / P2 / Final Release
> 原则：控制复杂度是交付完整 Goal 的方法，不是删减 Goal 的理由。

## 当前发布阻断台账

| 风险 | 等级 | 当前证据 | 统一缓解措施 | 阻断发布 |
|---|---|---|---|---|
| Partial 长期堆积 | HIGH | P0 已以分层代表矩阵收口；P1-G、P1-E 宿主拒绝、P1 Attention 计数与跨会话策略、P2-E 有界恢复合同、P2-G 高风险代表链已关闭。P1 自然日用 helpful/noise/建议关注、P2-D 外部 Agent、P2-F 与 Final Release 仍 OPEN | 暂停新正式对象/导航/Slice；每轮优先把已有 `PARTIAL/SHADOW/PROTOTYPE/AUTOMATED_ONLY` 升级为代表性 Desktop DONE、有界 Pilot 或有证据的 bounded host conclusion | 是 |
| Recovery 语义分裂 | HIGH | Commit、Rebind、Restore、Migration 内部账本精细，但前台曾有分散术语与入口 | 所有场景只翻译为：未应用、可继续、已应用可撤销、需重新连接、需手工恢复；统一进入系统状态/最近修改/备份恢复，不创建第二 Recovery Kernel | 是 |
| 状态组合膨胀 | MEDIUM | 正式 Lifecycle/Condition/Focus 与 Proposal/Commit/Anchor/Service 等运行事实同时存在 | 新 UI 状态必须派生且 session-only；一对象只显示一个按数据安全、恢复、阻塞、时间的优先结论；新正式状态需单独证明不可替代性 | 是 |
| Agent / LLM 平行小系统 | MEDIUM | Context Recovery、Grill、Creation、Closure、Cross-object 都有场景差异 | 共享 Context Package、Fact/Inference/Unknown、Action Authority、Grill Turn、Preview Handle、Proposal Factory、Validator、Interaction Evidence 与 Provider/stale 处理；Skill 不得重建运行时 | 是 |
| Skill/Prompt/Validator 补丁化 | MEDIUM | `unified-ux-generator`/`recover-context` 已建立首组 CANDIDATE/RETIRED 台账与真实 Provider 指标；其他 active Skill 仍需统一收敛 | 只保留 `EXPERIMENTAL/SHADOW/CANDIDATE/PRODUCTION/RETIRED`；晋升看固定样本、真实 Provider、拒绝/重试/abstain/helpful-noise/越权；旧版退休而非永久兼容 | 是 |
| Desktop 验收笛卡尔积 | HIGH | 宿主、主题、宽度、错误和恢复组合已很多 | 三层代表矩阵：高频日常覆盖 Block/Page/sidebar/Query-reference/Light-Dark/窄栏/reload/Graph switch；复杂操作覆盖 Preview/HIGH/Commit/reload/Undo/stale/Recovery；低频高风险覆盖正常、一种失败、自动回滚、手工入口、restart | 是 |
| 文档/代码/截图漂移 | HIGH | 历史 Desktop 证据多，最新安全提交可能没有新 UI | 截图必须记录 commit 并分 `CURRENT/HISTORICAL/SUPERSEDED`；自动-only 安全修复不借用旧截图升级 Desktop 状态；每轮同步 status/progress/acceptance/plan/current-ui | 是 |
| 后台工程概念泄漏 | MEDIUM | `4dfe014` 的最新 Desktop 已证明“现在”移除重复运行条、“更多”使用用户维护语义、系统状态默认折叠工程诊断；高级 Review/Grill/Project/Migration/Restore 表面仍需逐场景复核 | 默认只显示一个主结论、1—2 条依据、一个主操作、最多两个快速处置；版本/ID/checksum/机器理由只进技术详情/Audit；以代表性复杂链继续压缩而不新增说明层 | 是 |

## 本轮变化（2026-07-30）

### P1-E Block Marker 宿主拒绝（`53337f2`）

- 真实 Logseq `0.10.15` File Graph 证明 marker slot 会替换正式根 Block 可见正文；文件、
  SQLite、Anchor 与 UUID 未变，完整重启恢复；
- 删除生产 setting、slot runtime、CSS 和 lifecycle 接线，公开激活路径从 `1` 减为 `0`；
  保留隔离 prototype 与回归样本，不新增平行 Runtime；
- 新增正式状态 `0`、新 Runtime `0`、新 Recovery 分支 `0`、新 Skill/Prompt `0`；删除生产
  Runtime `1`，P1-E 长期 Partial 净变化 `-1`；
- 当前风险从“正文被视觉增强遮蔽”降为“等待宿主提供稳定 append-only slot”的非发布阻断
  宿主能力观察项；Now/Project/状态翻译继续承担用户前台价值。

### P2-D Release Router 单一合同（`3c83856`）

- 合并文档/UI 与 Application router 的 A/B/C/D 发布边界，删除两个“无 inverse 但声称可直接
  Undo”的错误路由和一个把所有重操作塞进万能结构 Review 的重复机制；
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt `0`、UI 入口 `0`；
  `releaseClass` 仅为纯 Application 路由合同；
- P2-D release-boundary drift Partial 净变化 `-1`；外部 Agent 完整产品链仍保持明确 OPEN，
  未被改写为 Out of Scope 或伪装 DONE；
- 状态/恢复膨胀风险不变，文档/代码漂移风险下降；普通用户继续只看四个意图，不接触 16 类
  machine intent、摩擦等级或路由枚举。

### P0 最终代表视觉总 Gate（`7e72075`）

- P0 `IN_PROGRESS_DESKTOP_GATES→DONE_DESKTOP_REPRESENTATIVE`，长期 Partial 净变化 `-1`；
  P1/P2/Final Release 与完整 Goal 不变；
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator、Provider 调用和写入权威
  均为 `0`；没有新增长期 Partial；
- 将无边界的“最终视觉总 Gate”收敛成高频日常、判断与历史、系统生命周期、宿主与外观四层
  代表矩阵；没有增加 Logseq 宿主 × 主题 × 宽度 × 错误的笛卡尔积；
- 最新 Desktop 重新检查 Now、待审阅空态、更多和系统健康页；复用未受改动的 733px、
  Block/Page、主题、reload/quit/Graph switch 与恢复证据，不机械重拍；
- File Graph Page Head/identity/真实 Light 继续作为 bounded host limitation；不创建 DOM hack、
  影子 identity 或新的前台状态。

### P0 RECOVERY_REQUIRED 同记录安全补偿（`872d2d4` / `684491f`）

- Partial 净变化 `-1`：RECOVERY_REQUIRED 代表 Gate 从 `AUTOMATED_ONLY` 升为
  `DONE_DESKTOP_REPRESENTATIVE`；新增长期 Partial `0`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator 版本 `0`、
  写入权威 `0`。复用原 Proposal、SemanticCommit step ledger、Graph bridge、补偿步骤、
  Review、最近修改和系统状态。
- 删除重复表面：安全补偿完成后的 FAILED 不再占当前待审阅；工具栏、Review、最近修改都由
  同一 ledger 投影。最近修改只取 Preview 首段，完整 Markdown 回到原审阅记录。
- Desktop 采用一个双 MOVE 代表场景：真实 step 0、step 1 断开、Plugin Manager reload、
  同记录确认恢复、完整 quit/reopen。对象版本、两个 UUID、正文和顺序守恒。
- Provider flash/pro 的重复提问、Validator 拒绝与 timeout 没有推动单样本 Prompt 补丁；运行
  默认恢复 flash，Skill 版本不变。用户来源 Proposal 用于恢复内核隔离，不冒充 LLM 成功。
- 风险变化：Recovery 语义分裂从 `HIGH` 降为 `MEDIUM`；P0 总 Gate 后续已关闭，P1 质量门、
  P2-D/P2-F 与 Final Release 仍阻断发布。

### P0 PENDING 同 Commit 续跑（`78528f7`）

- 关闭 PENDING 代表子 Gate；RECOVERY_REQUIRED 仍开放，因此该组长期 Partial
  总数净变化 `0`。本轮累计仍由 accepted-not-applied 子项产生净 `-1`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator
  `0`、Provider 调用 `0`、写入权威 `0`。复用原 SemanticCommit、receipt replay、
  inverse Undo、最近修改与用户系统状态。
- 一次性故障只绑定精确 Proposal，命中后立即删除；最终数据库触发器、
  PENDING 和 RECOVERY_REQUIRED 均为 `0`。没有将测试故障开关带入产品运行时。
- 删除重复恢复路径：工具栏、最近修改和 Review 均指向同一 Commit；用户
  只看到“尚未完成、可以继续”，不需理解 receipt 或 step 状态。
- 首次未命中演练作为 authority 证据：Launcher 仍使用安装器显式保留的
  `manual-v2` 映射，没有静默选择 `$HOME` 下的另一数据库。
- 风险变化：PENDING “重复提交或不知道是否已生效”的用户风险下降；
  Recovery 语义分裂仍因 RECOVERY_REQUIRED 代表前台未闭环而保持 `HIGH`。
- `dbc5243` 没有增加错误状态，而是用现有持久 Commit 优先级覆盖瞬时 transport
  文案；删除普通路径中的 “Local Service” 泄漏。新增状态、Runtime、恢复分支、
  Skill/Prompt/Validator 和写入权威仍均为 `0`。这使后台复杂度回到后台，而没有
  建立第二个通知或恢复模型。

### P0 未完成修改前台与 stale 历史收敛（`3883848` / `78528f7`）

- Partial 净变化 `-1`：accepted-not-applied 持续入口与真实 reload/apply/Undo/reload 从
  Partial 关闭；新增长期 Partial `0`。PENDING/RECOVERY_REQUIRED 的统一语言仍为
  `AUTOMATED_ONLY`，没有为了截图人为制造危险中断。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator `0`、
  Provider 调用 `0`、写入权威 `0`。继续复用同一 Proposal、SemanticCommit、inverse Undo、
  stale preflight 与用户系统状态。
- 删除重复表面：同一 accepted Proposal 与 linked PENDING/Recovery Commit 只算一个问题；
  stale 是终态历史，不再占当前待审阅或制造无动作卡片。
- 真实失败推动的是通用当前/历史边界，不是单样本文案：外部测试 Proposal 猜测未知宿主
  version 被安全拒绝；修复测试证据边界后才完成应用。Doctor 继续保留 stale 技术 WARN，
  前台不把终态历史冒充当前故障。
- Desktop 只覆盖最高价值代表矩阵：1000×720、一次 accepted reload、一次 apply/Undo、一次
  最终 reload 与当前/历史分离；没有扩成主题/宿主笛卡尔积。
- 风险变化：Review backlog 与后台工程词泄漏下降；PENDING 后续已关闭，
  Partial 堆积仍因 P1 质量门、P0 RECOVERY_REQUIRED、File Graph Light 和
  Final Release 保持 `HIGH`。

### P1 Attention Now 有界前台 Pilot（`3097c39`）

- Partial 净变化 `-1`：关闭首批确定性时间 Signal 缺少真实前台显示、处置与
  reload/recompute 证据的子项；新增长期 Partial `0`。
- 新增正式状态、Runtime、Detector、Attention 类型、Recovery 分支、Skill/Prompt/Validator
  与写入权威均为 `0`；复用既有 `AttentionShadowSession`、正式 Now 卡片和 Condition 入口。
- 删除重复表面：到期信号只装饰同一“需要回看”卡；accepted-not-applied、Pending/Recovery、
  Anchor/Graph 风险继续由 Review、系统状态和工具栏承接，不复制成 Attention 卡。
- 处置只影响 session 派生标记；正式对象/Waiting/Focus/正文不变。真实 Plugin Manager
  reload 从同一事实重算，未引入 SQLite disposition authority。
- 自动聚焦 `83/83`、Plugin `370/370`、typecheck/build、根级检查 PASS；真实 Desktop
  覆盖显示、两个处置、reload/recompute、正式测试状态恢复与 `0/0/0` 健康。
- 风险变化：Partial 堆积下降；状态和恢复分裂不增加。单个人工样本不能形成真实
  helpful/noise，跨会话 disposition、建议关注、其他 Detector 与 Block Marker 仍阻断 P1。

### P1 Attention 质量边界（`c9919f2`）

- 真实 Desktop 发现并修复一个通用计数错误：打开 Condition 但取消不再计 `acted`；只有
  正式保存或正文导航完成后记录 engagement。
- 4 个独立 session 验证 cancel、later、notRelevant、acted 与 reload/recompute；正式事实
  解除后 Signal 自动失效，再次 reload 不返回。
- `acted != helpful`；不通过持久化掩盖自然样本不足。disposition 保持 session-only，
  reload 从正式事实重算，不建立提醒数据库。
- 新增正式状态、Runtime、Recovery、Attention 类型、Skill/Prompt/Validator、持久权威
  均为 `0`；关闭既有 Partial `2`，新增长期 Partial `0`，净变化 `-2`。
- 风险变化：提醒状态与跨会话权威膨胀风险下降；自然日用 helpful/noise 继续作为 Pilot
  观测，不阻断首发；建议关注和其他 Detector 保持 Shadow。

### P1 Now 三段前台与 Focus 权威（`3d63d5a`）

- Partial 累计净变化 `-3`：关闭来源分区重复、focused Waiting 重复与 Focus 可能被普通容量
  折叠的前台子 Partial，以及“需要回看 / 保持等待”两个 Desktop 代表 Gate；新增长期
  Partial `0`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Attention 类型 `0`、
  Skill/Prompt/Validator `0`、Provider 调用 `0`、写入权威 `0`。
- 删除重复机制：不再分别渲染 Focus/next/waitingReview 三组近义区域；一个纯派生按 object
  identity 去重并收敛为“继续处理 / 需要回看 / 保持等待”。没有建立第二 Now Runtime，
  现有 Dynamic Now Shadow 仍仅作质量对照。
- Focus 全部显示且标为“来自当前关注”；普通 next 才保留 4 项首屏上限。用户权威不被
  UI 容量规则覆盖，一对象只出现一个主问题。
- 自动为纯投影 `5/5`、Plugin `366/366`、根级检查 PASS；Desktop 采用代表矩阵：
  “继续处理”覆盖 Dark 1001×720/733×720，“需要回看”覆盖 Focus Blocked，“保持等待”
  覆盖 Focus Paused。测试只复用一个正式 Task，结束后恢复 Condition/Focus 并确认系统
  健康，没有为截图增加长期测试对象、状态或恢复分支。
- 风险变化：Now 列表噪声与状态组合前台泄漏下降；Partial 堆积仍为 `HIGH`，P1
  Attention helpful/noise、disposition/cooldown 前台 Pilot、Block Marker、P0 原生中文
  IME 与 Final Release 仍阻断发布。

### P2-G Rebind 纠错与显式同步取消安全（2026-07-29，`3a47cf9` / `075e031`）

- Partial 净变化 `-2`：Rebind 最新成功态/纠错指引和显式同步捕获取消安全从 OPEN
  变为 Desktop DONE；新增长期 Partial `0`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator `0`、
  Provider 调用 `0`、平行写入权威 `0`。
- 复用既有 missing/conflict 过滤、受控 Rebind、Backup/Restore、Logseq `readBlock`、
  显式 Block normalizer 和 Local Service 正式写入。没有实现会机械复活旧 Anchor 的
  generic inverse。
- 捕获取消前重新读取当前 Block：删除/NONE 丢弃、修改只发最新内容、读取失败 fail
  closed。真实取消与 reload 后 Service 查询均为零对象，关闭 silent materialization 风险。
- 显式正式化缺少通用用户层删除/Undo 被登记为既有产品合同核对项，不为本次缺陷新增快捷
  删除或第二恢复入口。
- Desktop 只覆盖 Dark 1001×720 的风险代表链、reload 和最终系统诊断；不扩成主题/宿主
  笛卡尔积。旧 `3a47cf9` 图降为历史，精确 `075e031` 五张图成为 CURRENT。
- 风险变化：Recovery 语义分裂不增加；Silent overwrite 风险下降；Partial 堆积保持 HIGH，
  当时仍因 P0 原生中文 IME、P1 Attention/Dynamic Now/Marker 与 Final Release 开放；
  P0-J IME 后由 `a65da34` 关闭。

### P2-E 单步失败合同收口（2026-07-29，`98df827`）

- Partial 净变化 `-1`：P2-E 从 recovery gate OPEN 变为
  `DONE_BOUNDED_RECOVERY_CONCLUSION`；新增长期 Partial `0`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator `0`、
  Provider 调用 `0`。既有 FAILED/STALE/PENDING 与统一 Recovery Kernel 未扩张。
- 只增加一个共享的只读 Proposal shape inspector，使终态重放能验证已审阅 Closure 的
  唯一 step、错误码和 receipt；它不是第二 planner 或第二写入权威。
- 用户层继续收敛为三句合同：没有应用，项目和正文不变；项目状态已变化，需要重新检查；
  已有收据的修改尚未完成，可以继续。内部错误码不进入普通卡片。
- Desktop 矩阵只取精确构建的 Dark/reload/空审阅代表证据；生产入口无法安全制造的
  FAILED/STALE 卡保持 AUTOMATED_ONLY，没有为了形式扩大故障入口或笛卡尔矩阵。

### P0-J 原生中文 IME（2026-07-29，repo HEAD `a65da34`）

- P0-J `PARTIAL→DONE_DESKTOP_REPRESENTATIVE`，长期 Partial 净变化 `-1`；新增长期
  Partial `0`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator `0`、
  Attention 类型 `0`、Provider 调用 `0`、写入权威 `0`。
- 没有为了自动化输入建立第二输入 Runtime：Computer Use 通过 macOS 原生简体拼音逐键
  输入，真实覆盖组合、候选提交、已提交中文中间光标插入、正式建页、保存和 reload。
- 首次临时 Page 路由 reload 失败被保留为验收陷阱，没有把编辑态截图冒充持久化；正式
  Create 路径 reload 读回后才关闭 Gate。
- Desktop 只覆盖 P0-J 需要的 host Light / 754×720 代表链；不扩成所有输入法、主题与
  宿主笛卡尔积。风险变化：Partial 堆积下降，但 P1 Attention/Marker、P0
  RECOVERY_REQUIRED 代表 Gate、File Graph Light host issue 和 Final
  Release 仍使该风险保持 `HIGH`。

### P1 “现在”前台上限

- 关闭 Day 10 的 Now 首屏过载子 Partial `1`；新增长期 Partial `0`。
- 没有新增正式状态、Runtime、Recovery 分支、Attention 类型、Skill/Prompt/Validator
  或写入权威；只在既有正式 Now 投影的渲染层保留前 4 项并折叠其余项。
- 没有用更少但会遗漏刚恢复事项的 Shadow 替代正式投影；Service 原排序、Focus 权威、
  全部对象与操作能力保持。
- Desktop 代表矩阵只覆盖 Light 标准宽度、折叠/展开和两次真实 reload；没有扩成主题、
  宿主和窗口的笛卡尔积。前台阅读量下降，后台状态组合不变。
- 风险变化：前台工程概念泄漏与 Now 列表噪声下降；Partial 堆积仍为 `HIGH`，P1-C
  Dynamic Now、Attention/Block Marker 仍阻断发布；P0 中文 IME 后由 `a65da34` 关闭。

### Day 10 十日回顾与 P1 前台边界

- 十日连续使用 Pilot `OPEN→DONE_REPRESENTATIVE_WITH_OPEN_VARIANTS`，Partial 净变化
  `-1`；新增长期 Partial `0`。
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和 Attention
  类型均为 `0`。
- 真实数据把复杂度风险定位到正式 Now 的 `Focus 1 / Next 10`，而不是 Review backlog：
  Candidate/当前 Proposal 为 `0/0`，22 条历史折叠，Project 只有 2 张卡。
- 没有用第二套 Dynamic Now Runtime 解决列表：现有 Shadow 遗漏刚恢复事项，继续保持
  Partial；后续只在既有投影中研究连续性保护与普通 Next 上限。
- 没有复制确定性风险入口：Graph mismatch、Pending、Recovery、accepted-not-applied
  继续由工具栏/系统状态/Review 承接，不再生成同义 Attention 卡。Block Marker 默认关闭。
- Desktop 矩阵未扩成笛卡尔积：本轮只取日常四页、一次真实 reload、一次隔离 Graph
  fail-closed/return。状态/Recovery/Agent Runtime 风险不升；Partial 堆积仍为 HIGH。

### Day 9 Closure 正常链与共享前台收敛

- 新增正式状态、顶层导航、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和
  新长期 Partial：均为 `0`。
- 合并重复表达：Closure 继续复用共享 HIGH Review、结果卡、最近修改和 inverse Undo，
  没有建立 Closure 专用第二结果页或恢复器；审阅态统一说明“尚未应用”。
- 删除普通路径工程词：Commit/Lifecycle/SQLite/Local Service/Audit 不再出现在应用结果
  与最近修改首屏；技术事实仍留在折叠详情和正式审计。
- 真实 DeepSeek `1` 次一次通过，Validator rejection/retry/abstention `0/0/0`；没有以
  单一成功样本升级 Skill 或增加 Validator 分支。
- Partial 净变化 `-1`：Closure 最新正常链与前台表达代表 Gate 关闭；该时点 recovery
  仍保留在同一个 P2-E Partial，随后由 `98df827` 的有界合同关闭。
- Recovery 语义风险略降：`PENDING` 继续原操作，`RECOVERY_REQUIRED` 只恢复安全一致性，
  恢复后重新发起业务操作。没有为了前向 resume 扩展 Recovery Kernel。

### Day 8 Candidate disposition/cooldown

- 新增正式状态、顶层导航、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和
  新长期 Partial：均为 `0`。
- 合并前台机制：候选卡继续使用唯一 Candidate/disposition 权威；普通首屏由五个并列动作
  压缩为一个主操作、一个暂缓动作和折叠的更多处置；没有新建提醒规则或第二审阅中心。
- 删除工程表达：UUID、原始 type enum、Candidate/Proposal 管线词从普通路径移除；
  完整 source identity 仍在既有技术权威中，操作时照常重验。
- `318baab` 让 Preview 复用已加载的同一 Candidate disposition，而不是扫描后再次制造
  临时 UI 状态。`NO_MORE_LIKE_THIS` 跨普通编辑保持，其他处置按正文版本匹配，避免永久
  吞掉真实变化。
- 自动 `354/354`、typecheck/build PASS；真实 Desktop 完成三种处置、reload、来源普通
  编辑、recompute 与健康复核。Partial 净变化 `-2`，新增 `0`。
- 风险变化：后台工程词泄漏继续下降；Partial 堆积略降；Attention、状态组合和 Recovery
  分裂风险不变。Candidate 主动审阅数据没有被伪装成 Attention helpful/noise。

### Day 7 稳定移动、改名与 Anchor 重入

- 新增正式状态、顶层导航、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威与
  新长期 Partial：均为 `0`。
- 复用既有机制：普通 Logseq Cut/Paste/rename、explicit sync、原 UUID identity、Primary
  Anchor、Now worksite route 与系统状态；没有为“移动过”增加正式状态或独立 Rebind 流程。
- 精确 Plugin 构建 `1c18e9b0ff63` 在 Logseq 0.10.15 File Graph / host Light /
  1001×720 完成移动→改名→sync→reload→Now→打开新位置→系统健康。
- Partial 净变化 `-1`：关闭同一 UUID moved/renamed 代表子 Gate；duplicate/missing/
  conflict 与 Rebind 纠错仍在既有 P2-G Partial 内，没有拆成多个长期 Partial。
- 风险变化：状态膨胀、Recovery 分裂和 Agent Runtime 风险不变；Anchor 复杂度继续留在
  后台，前台只显示“打开正文”和“无需操作”。

### Day 6 Waiting 恢复与 Now 重排

- 新增正式状态、顶层导航、Runtime、Recovery 分支、Skill/Prompt/Validator、写入权威和
  新 Partial：均为 `0`。`ACTIONABLE` 是既有 Condition，不进入新状态模型。
- 合并重复机制：回复到达后的恢复继续复用同一 `BlockConditionController`、
  `changeCondition`、对象版本重验、会话 Undo 和 Block origin route；没有建立独立
  Waiting Recovery。
- 精确构建 `1c18e9b0ff63` 已在 Logseq 0.10.15 File Graph / host Light / 约 1000×720
  完成入口→确认→正式更新→返回同一 Block→Now 重排→真实 plugin reload→系统健康。
  Plugin `353/353` 通过。
- Partial 净变化 `-1`：关闭 Waiting 回复到达后无法原地回到行动的代表链；Dynamic Now
  前台分区、保持等待可见性、Attention helpful/noise 与 Day 7—10 保持开放。
- 复杂度风险：状态/Recovery 分裂不变；Partial 堆积略降。Now 仍列出较多历史测试对象，
  作为既有 P1 Dynamic Now 前台收敛证据，不新增 Attention 或 Marker。
- 只读实数对照又证明不能直接用 Shadow 替换正式 Now：`Next 10` 虽偏长，但
  `Suppressed 10` 会连同刚恢复 Task 一起隐藏。P1-C 继续保持现有 Partial，不新增
  “recently reactivated”状态、跨会话历史或第二 Now Runtime。

### P2-D Release 边界

- 删除“16 类 internal intent 都要形成 16 个前台工作台”的隐含复杂度；代码中的 16 类继续
  作为唯一安全 Router，用户仍只看到四个意图。
- 合并重复用户语义 3 组：reviewAt→Condition、current focuses→summary、stage mapping→
  完整结构。没有删除后台事实或安全检查。
- 批量子对象、正文移动、拆分合并与 external Agent 不建独立 UI/Runtime；由外部 Agent
  处理高上下文调查，Task Copilot 保留 Context/Proposal/Commit/Undo/Recovery 权威。
- Association 和 Project due 保持禁用而不是为了完整率开放无 inverse 的轻操作。
- 新增正式状态、Runtime、Recovery、Skill/Prompt/Validator、用户一级操作：均为 `0`。
  P2-D Partial 数量未假装下降，但完成边界从模糊变为可验收。

### Day 5 Project / Context Recovery 完整代表链

- 新增正式状态、顶层导航、Agent Runtime、Recovery 分支、平行写入权威和新 active Skill：
  均为 `0`；`project-creation-modeling@1.6.0` 取代并退休 1.5.0，不长期并行。
- 三组真实失败驱动 Provider 复验累计 18 次；Pilot 总计 32 次，Validator rejection/retry/
  abstention `0/0/0`。第三组证明目标/当前推进语义和前台句式都正确，没有过度过滤真实未知。
- 真实创建、reload、Context Recovery、feedback clear、Undo 与 0/0/0 健康关闭三个既有
  子 Partial：current-interface 语义、重复句式、Undo 成功消息。新增长期 Partial `0`，
  Partial 净变化 `-3`。
- AI 对刚创建 Project 的增量准确但有限；不新增 Prompt/Skill 补丁。创建完成卡仍有 Commit
  工程词和长结果墙，继续复用现有结果卡/折叠详情做统一压缩，不创建第二结果模型。

### Day 4 Undo 前台结论收敛

- 删除一个重复且相互矛盾的用户结论：当同一卡已有真实撤销入口时，不再显示“无法确认
  撤销资格”，而说明执行时会重验。Application 和 inverse 安全边界未放宽。
- Project 创建 Undo 成功消息不再暴露 Project/Anchor/Audit/Commit；技术证据仍由历史与
  折叠详情保留，不新增第二套结果模型。
- 新增正式状态、Runtime、Recovery 分支、Skill、Prompt、Validator、写入权威和新 Partial：
  均为 `0`。关闭 UI Partial `1`；Partial 净变化 `-1`。
- 自动证据 `352/352`、根级检查 PASS；Desktop exact build `7a0b444821b7` 已验证撤销资格
  结论和健康，成功消息待下一次真实 Project Undo 复验。

### 连续使用 Pilot Day 4 与 Project 创建真实链

- 新增正式状态、顶层导航、Agent Runtime、Recovery 分支、Skill、Prompt、Validator：
  `0`。新增的 `retryable` 只是 Project Grill session error 的派生 UI 标记，不进入 Domain、
  SQLite 或长期模型。
- 关闭一个真实 UX Partial：Page 来源超预算不再被翻译成 Provider 失败，也不再提供必然
  失败的 Retry；保持既有 16 Block Context 边界。
- 新暴露发布阻断：Project/Blank 仍需四个近义确认；完成卡的 Undo 资格与按钮矛盾；
  创建结果/历史墙过长；Undo 成功消息泄漏 Project/Anchor/Audit/Commit；Preview 理解句
  过长；首次 reload 发生一次 `EXPLICIT_SYNC_SUBTREE_READ_FAILED` 的 session 核对风险。
- Provider 累计增至 `14`；Day 4 模型给出两类无依据建议，但用户纠正后未成为正式事实。
  Validator rejection/retry `0/0`；没有以单样本新增 Skill，先把它登记为“过度处方化”
  的独立复验候选。
- Undo 后精确构建 `42e6a91309ba` 的系统状态为 0/0/0、explicit sync clean。过程图因早期
  build 内嵌 commit 仍为 `fbd14eb`，已降为 `HISTORICAL_SOURCE_EQUIVALENT`；文档漂移风险
  没有用误标 CURRENT 掩盖。
- Partial 净变化：关闭 `1`（来源预算错误表达），新增长期 Partial `0`；新发现项进入既有
  UI/P0 可靠性发布阻断，不新增第二状态机或恢复器。

### 连续使用 Pilot Day 1—3 与 P0-J ended boundary

- 新增正式状态、顶层导航、Agent Runtime、写入权威、Recovery 分支、Skill、Prompt、
  Validator：均为 `0`。Pilot 只复用现有 Logseq Graph、Context/Provider、Proposal、
  Commit、Undo、Condition 和 current-ui。
- P0-J ended boundary `OPEN→DONE_DESKTOP_REPRESENTATIVE`；原生中文 IME 在该阶段保持
  OPEN，后由 `a65da34` 关闭。该阶段子 Gate 净下降 `1`，没有为 Desktop 模拟创建长期
  Partial。
- 真实 Provider `2` 次，Validator rejection/retry/abstention `0/0/0`；事实纠正属于
  用户新增业务证据，不创建单样本 Skill 补丁。
- 新暴露的 release blockers：Undo 资格结论与按钮矛盾；最近修改首屏工程词和历史墙；
  单 Task 三次近义确认；事实纠正路径过长。统一缓解方向是复用 Review/Undo/用户状态翻译，
  不是新增 Correction Runtime 或 Recovery 状态。
- UX debt：WAITING 从可行动区退出正确，但缺少安静的“保持等待”确认；datetime-local
  键盘负担高。bounded host issue：File Graph reload 后约 5 秒索引空白再恢复，正文和正式
  DB 均未丢失。
- 风险变化：Partial 堆积仍为 `HIGH` 但净下降；后台工程词泄漏由此前代表页面改善后再次
  被“最近修改与恢复”证明仍为发布阻断；Desktop 矩阵没有扩张为笛卡尔积，本次只固定
  Light/标准宽度/reload 和一条 Waiting 代表链。

### P0-K Block Condition 返回现场与身份失败翻译

- 新增正式状态、顶层导航、Runtime、Skill、Prompt、Validator、Recovery 分支、写入权威和
  新 Partial：均为 `0`。
- 删除重复前台机制：正式 Block 的三种 Condition 继续复用同一
  `BlockConditionController`、唯一正式 `changeCondition` 和同一会话 Undo；没有为 Query
  降级创建第二身份模型或恢复入口。
- Desktop 驱动通用修复：Query 投影 fail-closed 时暴露 `Block / active Primary Anchor`。
  当前把空身份、未管理、关联不唯一、状态缺失、已结束与正式能力不可用统一翻译为用户结果；
  内部 Anchor 判定和安全拒绝不变。该规则覆盖一类身份失败，不是单样本文案补丁。
- 自动证据：Plugin `347/347`、0 skipped、typecheck/build PASS；精确产物内嵌
  `73dc1e26f610`。Desktop exact build 在 Logseq 0.10.15 完成 Query 安全降级和正式测试
  任务的失败→保存→返回→Undo→reload，并以 727×720 关闭该入口窄栏代表 Gate。
- LLM：未调用 Provider；Validator rejection、retry、Skill/Prompt 版本变化不适用。
- Partial 总量净下降 `1`：P0-K 返回现场代表 Gate `PARTIAL→DONE_DESKTOP_REPRESENTATIVE`；
  P0-J 中文 IME/受限视觉、P1 Attention/Marker 和 P2 恢复项在该阶段保持 OPEN；P0-J
  后由 `a65da34` 关闭。后台工程概念泄漏进一步下降，未通过增加说明层掩盖复杂度。

### Project 创建后落地与工作现场路由

- 新增正式状态、顶层导航、Agent Runtime、Skill、Prompt、Validator、Recovery 分支与平行
  写入权威：均为 `0`；新增仅为两个 session-only UI route。
- 合并重复机制：项目列表、创建完成后落地和 Context Recovery 下一步共用 Project
  worksite resolver；Page ownership 复用既有创建 Kernel 的同一 metadata 合同，没有建立
  第二套 identity。
- 前台压缩：Project 首屏从空 Page/工程 properties 改为当前状态、一个推进、成果、来源和
  一个主操作；完整结构折叠。物理 Page metadata 仍保留为单一权威和安全 Undo 边界，不在
  Plugin 首屏重复展示。
- 自动证据：Plugin `345/345`、0 skipped；根级检查、145 条稳定规则、恢复演练 PASS。
  Desktop exact build `bfabf4025f60` 覆盖 Dark/Light 1000×720 与 Light 723×720。
- LLM：无 Provider 调用；拒绝率、重试、Skill/Prompt 版本变化不适用。
- Partial：新增 `0`，关闭一个 Project 落地 UI Partial；P2-C 阶段状态与其他开放 Gate
  不变。后台工程概念泄漏进一步缓解，文档/代码/截图漂移风险因 exact-build CURRENT
  证据下降，但仍阻断 Final Release。

### Project Preview / HIGH Review 前台压缩

- 新增正式状态、顶层导航、Agent Runtime、Skill、Prompt、Validator、Recovery 分支和平行
  写入权威：均为 `0`。
- 删除或合并重复机制：没有删除后台审计；Preview 的散落字段合并为四区，Review 历史继续
  与当前问题分离；Review 首屏系统理解统一截取两句，完整方案、内部状态和完整依据只保留
  在原折叠层。
- Desktop 驱动通用修复：真实 762px 先发现三列不可读，又证明 840/1080 CSS 断点在当前
  Logseq 缩放下不能触发；最终只保留派生 `data-impact-level` 与一个共享 1280 CSS 断点，
  没有建立新 UI 状态。
- LLM：9 次显式 Provider 流程调用、Validator rejection `0`、自动 retry `0`；
  `QUALITY_DEBT_REPEAT_QUESTION=1`。不为该单一样本创建新 Skill 版本或 Prompt 特例，
  后续先研究 answer evidence 与已解决 uncertainty 的通用合同。
- Partial 总量：阶段级新增 `0`；关闭 Preview 与 HIGH Review 两个 UI Partial。P2-C、
  P2-D～G 和 Final Release 的开放项不变。
- 风险变化：后台工程概念泄漏 `MEDIUM → LOW_MEDIUM`（完整 Markdown 不再进入首屏）；
  Desktop 矩阵风险保持 `HIGH`，本轮只采用标准 / 窄栏 / Light 三个代表组合。

### Project 继续工作首屏压缩

- 新增正式状态、顶层导航、Agent Runtime、Skill、Prompt、Validator、恢复分支和平行写入
  权威：均为 `0`。
- 删除或合并重复机制：没有删除后台权威；把原先首屏分散的 Project primary route、
  entry points、调整项目与 Focus 快捷入口合并为“一个主操作 + 一个 Copilot 次操作 +
  更多操作”这一套渐进披露。
- 前台工程词减少：删除“项目重入 / 同一正式投影 / 不保存第二摘要 / 每个 Project /
  可选 Copilot”等实现说明；读取失败和 stale 也改为用户结果，原始错误只在详情中。
- 语义颜色：Context Recovery 使用独立蓝色信息 token，不再借用绿色恢复/成功表面；没有
  新增状态或改变操作权限。
- 自动证据：Plugin `343/343`、typecheck/build、145 条稳定规则和根级恢复演练
  `differences=[]` 全部通过。
- Desktop：exact build `b605e18c21ce` 在真实 Logseq 0.10.15 reload 后，于 Plugin Dark /
  host Light 的 1001×720 和 726×720 均保持主操作、次操作和折叠入口可达，无横向溢出。
- Partial 总量变化：阶段级新增 `0`、关闭 `0`；关闭一个 Project 首屏 UI Partial，但不把
  Project 重入、P1 或 P2 的开放验收项升级为 DONE。后台工程概念泄漏风险保持 `MEDIUM`，
  当前代表首屏进一步缓解。
- LLM/Provider：本 Slice 不调用模型；Validator 拒绝率、模型重试和 Skill 版本变化不适用。

### Project 失联正文的前台翻译

- 新增正式状态、顶层导航、Agent Runtime、Skill、Prompt、Validator、恢复分支和平行写入
  权威：均为 `0`。
- 删除或合并恢复机制：`0`；继续复用既有 Anchor fail-closed、系统状态和 Rebind 入口，只
  替换普通错误层的用户表达。
- 前台工程词减少：该失败路径不再显示 `Anchor / 对象 / 运行时`，只显示原正文连接、正式
  事项是否变化和唯一恢复入口；完整连接事实仍保留在系统状态与诊断层。
- 自动证据：Plugin `343/343`、typecheck/build、145 条稳定规则与根级恢复演练
  `differences=[]` 全部通过。
- Desktop：exact build `971c6db268f7` 在真实 Logseq 0.10.15 reload 后，于 Plugin Dark /
  host Light、1001×720 复现失联测试 Project；点击“打开项目”后零正式写入且用户提示与
  当前代码一致。
- Partial 总量变化：新增 `0`、关闭 `0`。关闭的是一个当前 UI 术语缺陷，不把 Project
  重入、Rebind、P1 或 P2 的开放 Gate 冒充为 DONE；后台工程概念泄漏风险仍为 `MEDIUM`，
  但该代表失败链已缓解。
- LLM/Provider：本 Slice 不调用模型；Validator 拒绝率、模型重试和 Skill 版本变化不适用。

### “现在”标签与状态叙述收敛

- 新增正式状态、顶层导航、Agent Runtime、Skill、Prompt、Validator、恢复分支和平行写入
  权威：均为 `0`。
- 删除重复机制：Now 不再维护独立英文对象类型表，改为与 Migration 共用一个中文标签函数；
  合并重复机制 `1`。
- 通用 `ACTIONABLE` 仍保留原确定性 conclusion、fact、unknown 和 evidence ref，但
  `keyEvidence` 不再重复同一事实；首屏减少一条重复说明，完整事实仍在渐进披露中。
- 前台工程词减少：`Project / MiniProject / Task / Area / Decision / Output` 原始标签、
  卡片对象枚举以及 `Focus / Now Work` 共 8 组表面词不再进入当前“现在”用户路径。
- 自动证据：Application `169/169`、Plugin `343/343`、typecheck/build、145 条稳定规则与
  根级恢复演练 `differences=[]` 全部通过。
- Desktop：exact build `f1d0e1f1cee9` 在真实 Logseq 0.10.15 reload 后通过 1000×720 和
  724×720；为保护测试 Graph 其他内容，只保存“项目”筛选后的专用测试对象画面。
- Partial 总量变化：新增 `0`、关闭 `0`。本轮关闭的是当前 UI 缺陷，不把 Attention、
  Block Marker、P0 宿主或 P2 恢复尾项虚报为 DONE；后台工程概念泄漏风险保持
  `MEDIUM`，但日常 Now 表面证据改善。
- LLM/Provider：本 Slice 不调用模型；Validator 拒绝率、模型重试和 Skill 版本变化不适用。

## 本轮变化（2026-07-26）

### P1 Context Recovery 收敛

- 新增正式状态、顶层导航、Agent Runtime、Recovery Kernel：`0`；只增加机器所有的瞬时
  `frontstageLanguage` 请求合同与统一 Validator 策略，不进入 Domain、SQLite 或 Graph。
- 删除重复机制：取消语言失败后的自动二次 Provider 调用，恢复“一次用户生成 = 一次
  Provider 调用 = 一个 Interaction Evidence event”；Validator failure 继续复用固定
  `UX_OUTPUT_VALIDATION_FAILED`，没有为语言错误新建恢复分支。
- `unified-ux-generator@1.2.0`：`CANDIDATE`。固定当前产品中文前台合同、权限/事实/action
  authority 和 abstain 边界；真实精确 build `GENERATED=1 / REJECTED=0 / INACCURATE=1`，
  无自动 retry。失败时保留确定性 Project 重入投影，由用户显式重试，不覆盖旧可靠内容。
- `recover-context@1.3.0`：`CANDIDATE/DESKTOP_VERIFIED`。把 1.2.0 真实失败提升为通用反身
  边界；原样本不再产生 false unknown，独立真实 Provider 样本仍保留业务 unknown，均
  1 attempt。error/rejection/stale/Light/窄栏代表 Gate 已通过，但样本量不足以晋升 Production。
- `recover-context@1.2.0`：`RETIRED`。运行态和 catalog 只使用 1.3.0，不保留平行 active 版本。
- `unified-ux-generator@1.1.0`：`RETIRED`。原因是自动 repair 会放大 Provider 预算并把一次
  用户交互双计数，单汉字语言检查也可被混合英文绕过；不保留兼容运行分支。
- `project-creation-modeling@1.6.0`：`CANDIDATE/PROVIDER_VERIFIED`。真实 Day 5 Provider
  样本证明 1.5.0 会把页面显示要求收作业务当前推进；1.6.0 用同一通用合同约束 Grill
  uncertainty、Provider output 和 Application Validator；独立真实复验保留业务未知并
  生成可行动当前推进，不引入平行 Runtime。
- `project-creation-modeling@1.5.0`：`RETIRED`。运行态与 catalog 只保留 1.6.0；真实
  Provider/Desktop 复验通过前不晋升 `PROVIDER_VERIFIED`。
- 当前复杂度变化：平行 Runtime/写入权威/恢复入口均未增加；Prompt/Validator 的样本特例
  已收敛为语言和 authority 的通用输出合同。stale 遥测只替换同一 evidence outcome，不
  新建事件状态。P1-G 从 Partial 关闭；全局 Skill 生命周期台账仍未覆盖其他 active Skill。

### P0-H Launcher authority 收敛

- 真实后台重装发现同一 Graph 省略数据库参数会替换既有 database authority；没有新增状态或
  migration 框架，直接修复唯一 Launcher config authority 的合并规则。
- 同一 graphKey 默认保留既有 databasePath；首次安装才使用默认路径，显式绝对路径仍可由
  用户主动替换。运行映射已恢复到原测试数据库，未删除或复制任何正式数据。
- 新增正式状态/恢复入口/并行 authority：`0`；回归覆盖首次安装、无参数重装和第二 Graph，
  Launcher `29/29` PASS。当前构建的真实无参数重装及后续多次受控 Provider 重装也保持
  graphKey/path/inode 与正式计数不变；该 authority 子 Gate 已从自动升级为真实运行 DONE。
- `ca50304` 没有新增 Graph switch 状态机：只调整既有 restricted projection、Graph key、
  discovery generation 与 lease release 的顺序。真实失败样本进入回归，修复后新 Graph
  首帧不再显示旧 Project，切回恢复同一 authority。P0-H Partial 已关闭；新增正式状态、
  recovery 分支、Skill、Prompt、Validator 和平行 Runtime 均为 `0`。

### P2-E Closure Commit 中断收敛

- 新增正式状态、恢复入口、Agent Runtime、Skill、Prompt、Validator、平行写入权威：`0`。
- 受控 post-domain HTTP 500 继续复用既有 Proposal、command receipt、SemanticCommit、
  最近修改与原 Review；可安全续跑时保持原 Commit `PENDING`，不为了场景命名而新建
  `RECOVERY_REQUIRED` 或第二恢复页。
- reload 后用户层只表达“尚未完成，可以继续”和“不要重复提交”；再次确认收口同一 Commit，
  Project 版本没有重复增长。随后继续复用现有 Closure inverse 完成 Undo 与再次 reload。
- 删除/合并的重复机制：`0` 个新机制；本轮把自动 post-domain recovery 证据升级为真实
  Desktop 代表 Gate。该阶段之后 P2-E 尚余 Provider error/stale 与真正不能安全续跑的恢复
  代表链；Provider error 后续由 `7727770` 关闭，stale 又由 `662246a` 当前构建关闭，当前
  只剩真正恢复代表链。
- 真实 Provider：1 attempt，Validator 接受，重试 `0`；输出准确但偏短，未新增 Skill 补丁。
  故障与恢复测试不把 Provider 成功等同于 Slice 完成。

- P0-J 从 `AUTOMATED_ONLY` 收敛为代表性 Desktop partial：共享同一 command/slash 注册内核，
  没有为四条 Slash、六条 palette 或三个 binding 创建场景状态；新正式状态、恢复分支、
  Agent Runtime、Prompt、Skill 与 Validator 均为 `0`。
- 连续 reload 的 palette 重复只在宿主会话内出现，完整 restart 后消失；保留一张
  `HISTORICAL` 缺陷截图，不增加 Plugin 持久去重账本。中文 IME 与 Light/窄栏在该阶段
  继续作为代表性 Gate；IME 后由 `a65da34` 关闭，仍不扩张为全组合矩阵。
- P0-K main Page 使用既有 session-only source token 通过返回 Gate；right-sidebar 不提供
  Plugin Page item 时保持隐藏，没有为宿主缺失 identity 增加 fallback 状态或第二入口。
- P0-K Query / Block reference 在脱敏 Desktop 页确认由宿主接管预览或引用专用菜单；
  继续要求先打开来源 Block，没有增加投影 identity、DOM hack、正式状态或第三套入口。
- P0-K 来源变化继续复用同一 session-only UUID token 和 `OriginRouteController`：移动后按
  UUID 返回新位置，删除后关闭并提示未导航；没有增加位置缓存、同名搜索、投影 fallback、
  正式状态或恢复页面。两次真实 Provider 均为单次 `NO_PROPOSAL`，没有为测试样本增加
  Skill/Prompt/Validator 规则。P0-K 关闭两个 Desktop 子 Gate，未新增 Partial。
- `06b8762` 没有为了前台文案建立新状态或第二消息系统：只在既有 selected Block
  analysis presenter 中统一无需整理/待确认/不可用/中断/失败语言，内部 logger 继续记录
  结构化结果。正式状态、Runtime、Recovery、Skill、Prompt、Validator 与 Partial 增量均为
  `0`；普通路径减少 5 组工程词。
- `eba1c54` 让正常启动/host-ready 恢复依赖既有持久 Copilot 状态，不再另外建立一次性
  “已自动连接”横幅；Graph switch 的 authority 隔离结论保留。删除重复前台结论 `1`，
  正式状态、Runtime、Recovery、Skill/Prompt/Validator 与 Partial 增量继续为 `0`。

### P2-G Restore 真实连续双重失败收敛（2026-07-27）

- 新增正式状态：`0`。
- 新增顶层导航：`0`。
- 新增 Agent Runtime / Prompt 系统 / Recovery Kernel：`0`。
- 复用：既有 Restore `ARMED/RECOVERY_REQUIRED/INVALID` 安全事实、Launcher per-Graph lifecycle gate、Local Service 离线 Restore/Doctor、用户系统状态与同一个恢复入口。
- 新前台状态仍为 `0`：准备/忙碌是 session-only UI 事实；固定确认只用于现有恢复命令，不进入 Domain。
- 恢复执行没有新增路径/快照 ID/SQLite 权限：Launcher 只编排进程，Local Service 从私有互锁推导唯一恢复点；失败保持同一安全锁和同一重试入口。
- 受控 `RECOVERY_REQUIRED` 先升级为 `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`；`fe0b590034ac` 又用真实候选激活失败和自动回滚失败关闭连续双重故障子 Gate。两轮都复用同一互锁、HIGH Review、离线 Restore、Doctor、清锁和重连，没有新增恢复页面或第二 Undo 逻辑。
- 删除/合并的重复机制：恢复成功后不再维护 Plugin 自己的陈旧只读结论，而是复用 bounded runtime recovery 刷新 `featureReady`、Store 与既有投影；健康/恢复页共用用户状态翻译，内部枚举只留技术详情。
- 删除 reload 依赖：Restore failure catch 现在立即复用 `recoverConfiguredServiceRuntime` 重新发现既有 Launcher；无需为该场景增加状态或专用连接器。
- 本轮真实界面问题推动通用合同修复，不增加样本特例、Prompt、Skill 或 Validator；LLM 未调用，拒绝率/重试不适用。
- 仍阻断 P2-G：Light/窄栏、Migration Verify/Activate failure；真实双重失败→HIGH Review→恢复→重连→reload 已关闭，Migration Import 写后响应丢失由后述 Gate 关闭。

### P2-G Migration 写后响应丢失收敛（2026-07-27）

- 新增正式状态、顶层导航、Skill、Prompt、Validator、生产 Recovery 分支、平行 Runtime、
  平行写入权威：均为 `0`。
- 唯一新增合同是既有 Local Service fault port 的 test-only `afterMigrationImport`；生产
  调用者不传，状态仍完全由既有 Migration run/batch ledger 表达。
- Plugin 的 `import-uncertain` 保持 session-only；用户层只显示“结果待确认、先以台账为准”，
  reload 后不持久化第二结果，而由正式 `IMPORTED` batch 重建唯一 Verify 动作。
- 真实 Desktop 完成 Import response loss→ledger→reload→Verify→HIGH Undo；测试库
  `4→5→4`，SemanticCommit Pending/Recovery `0/0`，正常 7 对象 authority 与 Launcher
  已恢复。
- 删除/合并的重复机制：不需要为“响应丢失”建立恢复页、状态表或独立 Undo；继续复用
  Migration ledger、idempotency、Verify 和 Undo。
- Partial 总量净下降 `1`：Migration post-write response-loss / Service-interruption
  代表子 Gate `PARTIAL→DONE`；本轮没有新增 Partial。
- 风险变化：Recovery 语义分裂未上升；Partial 堆积下降但仍为 HIGH，因 Verify/Activate
  failure、P2-E Provider failure、P0/P1 宿主与视觉 Gate 仍阻断发布。
- LLM/Provider 未调用；Validator 拒绝率与模型重试不适用。

### P2-G Migration 窄栏与 Light 宿主边界（2026-07-27）

- 新增正式状态、Runtime、Skill、Prompt、Validator、恢复分支与写入权威：均为 `0`。
- 当前 `7fcdcf5` / Plugin `e2361599fbc9` 在 `722×720` 真实显示 Migration
  只读完成态：主结论、计划摘要、两个 batch、折叠安全边界和关闭动作均可达，无横向溢出。
- 窄栏子 Gate `PARTIAL→DONE`；新增 Partial `0`，Partial 总量净下降 `1`。
- Logseq 0.10.15 File Graph 的设置页真实选中“浅色模式”，随后执行完整 View→Reload
  和完整 quit/reopen；两条链都在 Graph 就绪后恢复深色宿主。该结果保持
  `BOUNDED_HOST_ISSUE/OPEN`，不借设置页或加载页伪报 Light PASS。
- Desktop 矩阵没有扩展为全组合：只验证高风险流程的最终只读态、一个窄栏尺寸和一个 Light
  宿主切换边界。
- 隔离故障 Launcher 退出后，正常 LaunchAgent、Service、原 database authority、1000px
  窗口与深色工作现场均已恢复；用户系统状态读回“可以正常使用”“无需操作”。
- 完整退出后旧 Service PID `49323` 在 lease 到期后停止，Launcher 保持；重新打开后由
  同一 Launcher 启动新 Service PID `52080`，Plugin 自动读回正式能力可用。该证据复核
  P0-H owned shutdown/reconnect，但不重复扩大其完成状态。
- LLM/Provider 未调用；Validator 拒绝率与模型重试不适用。

### P2-G Migration Verify / Activate 自动失败重试收敛（2026-07-27）

- 新增正式状态、顶层导航、Skill、Prompt、Validator、生产 Recovery 分支、平行 Runtime、
  平行写入权威：均为 `0`。
- 仅复用 Local Service 现有 test-only fault port，加入事务前 Verify/Activate hook；
  production caller 不传。失败结果继续完全由既有 run/batch ledger 表达。
- 自动回归证明 Verify failure 保持 `IMPORTING/IMPORTED`，Activate failure 保持
  `VERIFIED/VERIFIED`，同一账本重试成功，SemanticCommit Pending/Recovery `0/0`。
- 删除/合并的重复机制：没有为两个失败动作创建恢复状态、恢复页、第二次导入或独立 Undo；
  继续使用既有幂等 Verify/Activate。
- Partial 总量不变：自动子 Gate 从 `AUTOMATED_ONLY_PARTIAL` 前移为
  `AUTOMATED_DONE_DESKTOP_CONFIRMATION_REQUIRED`，Desktop Partial 未被伪装关闭；
  新增 Partial 为 `0`。
- Desktop 到达会写入插件私有 FileStorage 的最终 Launcher 配对按钮后停下；正常
  descriptor、LaunchAgent、Service、原 authority 和 READY 状态已恢复。没有新增
  CURRENT 截图。
- 风险变化：状态/Recovery/Runtime 分裂未上升；Partial 堆积仍为 HIGH，等待一次有确认的
  隔离 Desktop failure→retry→reload Gate。
- LLM/Provider 未调用；Validator 拒绝率与模型重试不适用。

### P2-G Migration Verify / Activate Desktop 失败重试收敛（2026-07-27）

- 新增正式状态、顶层导航、Skill、Prompt、Validator、生产 Recovery 分支、平行 Runtime、
  平行写入权威：均为 `0`。
- 真实 Logseq 0.10.15 复用安装态中已经存在的私有配对凭据，没有再次写入 FileStorage；
  隔离库完成 Verify failure→原 ledger 重试→Activate failure→原 ledger 重试→reload。
- Verify 失败仍由 `IMPORTING/IMPORTED` 表达，Activate 失败仍由
  `VERIFIED/VERIFIED` 表达；没有创建恢复状态、恢复页、第二批导入或独立 Undo。
- 最终 run `ACTIVATED`、新 batch `VERIFIED`、objects `5`、SemanticCommit
  Pending/Recovery `0/0`；当前 `e2361599fbc9` 构建 reload 后只保留只读历史。
- 正常 LaunchAgent、Service 与原 database authority 已恢复；没有静默替换。
- Partial 总量净下降 `1`：Migration Verify/Activate failure Desktop `OPEN→DONE`；
  新增 Partial `0`。
- 风险变化：Recovery/状态/Runtime 分裂未上升；Partial 堆积仍为 HIGH。该时点阻断项包含
  P2-E recovery，随后已由 `98df827` 的有界 Kernel 结论关闭；当前仍有 P0/P1 宿主与
  视觉 Gate、P2-G Light host Gate 及 Rebind 指引。
- LLM/Provider 未调用；Validator 拒绝率与模型重试不适用。

### 通用深色表面与自定义主题边界（2026-07-27，`d7526f4`）

- 关闭 1 个 UI Partial：深色 Logseq 工作现场中的 Task Copilot 白底。新增功能 Partial `0`。
- 新增正式状态、Runtime、Skill、Prompt、Validator、Recovery 分支、写入权威：均为 `0`。
- 没有创建第二主题 Runtime；继续复用 `theme-mode.ts` 和同一 CSS token 集。只在现有 Logseq
  插件设置增加默认 `auto` 的显示偏好，明确覆盖不进入 Domain、SQLite 或 Graph。
- 真实 Desktop 证明可见宿主读取在 iframe 隔离 + custom.css 强制色时不可用；没有堆叠
  DOM selector、读取 Graph CSS 或猜测颜色，改用用户可解释的一次性显示选择。
- 1001×720、完整 reload、723×720 均 PASS；CURRENT 两张。旧流程截图的业务证据继续有效，
  但其白底不再代表当前主题表达。
- File Graph 自身 Light bounded host issue 仍 OPEN；因此 Partial 总量净下降 `1`，而不是
  把 Light Gate 一并伪装关闭。
- LLM/Provider 未调用；Validator 拒绝率与模型重试不适用。
- `25ddac9` / `4dfe014` 关闭高频壳层发布阻断：删除主面板重复运行条，统一“更多”、启动、知识库切换和系统状态的用户语言；连接恢复只有在正式修改也可用时才报告成功。
- exact build `4dfe014902a3` 已完成后台真实 Plugin reload、默认用户层工程词扫描 `0` 和三张 CURRENT Desktop 截图；工程概念泄漏由 HIGH 降为 MEDIUM，但高级 Review/Grill/Project/Migration/Restore 表面仍阻断发布。
- `e8db32f1af6d` 又把主动结束从通用连接故障中分离：复用既有 reason/lease/状态翻译，不增加正式状态或恢复入口；结束面只保留一个结论与重新启动，100—2500 ms 采样无错误闪烁，重启仍要求正式修改可用。

### UI 信息架构压缩（2026-07-27，`f4acf77`）

- 关闭两个 UI Partial：Review 历史卡淹没当前问题；Closure 逐目标证据把测试材料中的
  Provider/Proposal/Commit 带入普通首屏。当前记录独立显示，历史默认折叠；逐目标证据只在
  用户主动展开后出现，原事实没有被改写或丢弃。
- 合并/删除重复前台机制：Now 每卡一个主动作，Project 入口统一为用户意图，Closure 先显示
  一个安全结论与一个主动作；审阅方案与确认应用在文案上明确分层，内部事务链保持原样。
- 新增正式状态 `0`；新增 Runtime `0`；新增 Skill/Prompt/Validator `0`；新增恢复分支 `0`；
  新增写入权威 `0`；新增 Partial `0`。
- Partial 总量净下降 `2`（均为 UI 表达 Partial），P0/P1/P2 功能 Partial 不伪装关闭。
- 当前风险：后台工程概念泄漏由 MEDIUM 降为 MEDIUM-LOW；Desktop 笛卡尔积仍为 HIGH，但
  本轮只取 Now/Review/Project/Closure 的 Light/Dark/751px 代表矩阵，没有扩张全组合。

### P2-E Provider error 与 Review 压缩（2026-07-27，`7727770` / `662246a` / `cda4f95`）

- 新增正式状态、Runtime、Skill、Prompt、Validator、恢复分支、写入权威与新 Partial：均为
  `0`。Provider error、validator rejection 和 stale 继续复用同一 generation result 合同；
  UI 只翻译为“未完成、原内容不变、重试/重新检查”。
- 删除一个重复前台机制：Closure Review 不再把模型 `finalPreview` 再复制为首屏报告；普通
  首屏从已经通过 Validator 的 Closure 结构生成一句结果与未完成目标数量，完整模型材料
  仍保留在同一“查看完整依据”，没有丢失 Audit/Proposal 事实。
- 真实 Provider 仍使用现有 `design-project@1.3.0` 和统一 Validator；本轮成功 Proposal
  一次通过、Validator 拒绝 `0`、模型重试 `0`。没有为单一样本追加 Skill 或 Validator
  补丁；改动属于通用前台压缩规则。
- Partial 总量净下降 `1`：P2-E Provider error 从 Desktop Partial 变为 DONE；该时点 stale
  与真正 `RECOVERY_REQUIRED` 仍保留。stale 随后由同一 `662246a` current build 关闭，不以
  自动或普通 PENDING 证据冒充真正恢复链。
- 风险变化：前台工程词泄漏保持 MEDIUM-LOW；Partial 堆积仍为 HIGH，但没有上升；Desktop
  矩阵只增加 Light error 与 Dark Review 两个代表场景，没有扩成完整笛卡尔积。
- 随后的 generation stale 复用 P1-G 已证明的本地无日志延迟方法和现有 Object version
  revalidation，没有新增 fault framework。测试 Condition 只经正式 Application Command
  `v21→v22`，随后复用现有 Condition Undo 到 `v23`；旧 LLM 草稿零 Proposal、零 Closure
  Commit，reload 后状态健康。
- generation stale 再使 Partial 净下降 `1`；新增正式状态、Runtime、Skill、Prompt、
  Validator、Recovery 分支和新 Partial仍为 `0`。本轮合计关闭 P2-E 两个 Desktop Partial。
- `cda4f95` 只删除普通标题中的 `Closure Proposal` 工程词；同一
  `design-project@1.3.0`、Context、Validator、Proposal 与 Review Runtime 全部复用。真实
  Provider 一次通过、重试 `0`；没有新增 Skill 版本或样本补丁。当前标题证据由
  `p2-e-closure-review-current-dark-cda4f95.png` 取代旧图。
- Recovery 复杂度没有为“补一张截图”而扩张：`98df827` 固定了 Closure 单步事务的
  有界语义——receipt-backed `PENDING` 续跑原操作；写入前失败终止并重新发起；状态竞争
  转为 stale。`RECOVERY_REQUIRED` 仍只允许多步骤补偿收口。没有第三种恢复入口、临时
  状态、SQLite 注入 Gate 或前向 resume；P2-E 因而关闭一个 Partial，恢复分支净增 `0`。
- `cd59228` 删除一条把 legacy demo-agent flag 当成 V2 Copilot 可用性的平行前台判断；
  待审阅空态复用既有 `v2ProviderAvailable`，没有新增 capability 状态。前台错误结论减少，
  状态组合数不变；新增正式状态、Runtime、Skill、Prompt、Validator、恢复分支和 Partial
  均为 `0`。

### Page Context 用户语言与 File Graph Project identity（2026-07-28，`869127f`）

- 关闭一个代表性 UI Partial；新增正式状态、Runtime、Skill、Prompt、Validator、恢复分支、
  写入权威和新 Partial均为 `0`。
- 没有创建第二套 Page identity：Page Context 复用 Project 创建/工作现场已有的受控
  owner/object metadata，并与唯一 active Primary Anchor、正式对象类型和冲突拒绝共同使用。
- 删除重复前台机制：普通 Page 与 Project Page 都从三个同权按钮收敛为一个突出主操作和
  两个次级意图；内部动作、版本重验和安全链不变。
- 工程词泄漏风险下降：普通路径删除 `Page / HIGH Proposal / SQLite / Graph /
  Primary Anchor / OPEN / vN`；技术事实仍保留在日志、Audit 与诊断中。
- Desktop 矩阵只增加普通 Page 与受控 Project Page 两个高频代表场景，没有扩成主题/
  viewport/宿主笛卡尔积。Partial 堆积仍为 HIGH，但本轮净下降 `1`。
