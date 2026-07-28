# Task Copilot V2 复杂度台账

> 状态：`ACTIVE`
> 适用范围：UX 产品化 Goal P0 / P1 / P2 / Final Release
> 原则：控制复杂度是交付完整 Goal 的方法，不是删减 Goal 的理由。

## 当前发布阻断台账

| 风险 | 等级 | 当前证据 | 统一缓解措施 | 阻断发布 |
|---|---|---|---|---|
| Partial 长期堆积 | HIGH | P1-G、P0-H、P2-E receipt-backed Commit 中断续跑、Provider error 和 generation stale、P2-G 真实连续双重 Restore→人工恢复、Migration 写后响应丢失、Verify/Activate failure retry、窄栏与通用深色表面已关闭；P0 其余宿主 Gate、P1 Attention/Marker、P2-E 真正 RECOVERY_REQUIRED、File Graph Light host issue 与 Rebind 指引仍 OPEN | 暂停新正式对象/导航/Slice；每轮优先把已有 `PARTIAL/SHADOW/PROTOTYPE/AUTOMATED_ONLY` 升级为有代表性 Desktop 证据的 DONE | 是 |
| Recovery 语义分裂 | HIGH | Commit、Rebind、Restore、Migration 内部账本精细，但前台曾有分散术语与入口 | 所有场景只翻译为：未应用、可继续、已应用可撤销、需重新连接、需手工恢复；统一进入系统状态/最近修改/备份恢复，不创建第二 Recovery Kernel | 是 |
| 状态组合膨胀 | MEDIUM | 正式 Lifecycle/Condition/Focus 与 Proposal/Commit/Anchor/Service 等运行事实同时存在 | 新 UI 状态必须派生且 session-only；一对象只显示一个按数据安全、恢复、阻塞、时间的优先结论；新正式状态需单独证明不可替代性 | 是 |
| Agent / LLM 平行小系统 | MEDIUM | Context Recovery、Grill、Creation、Closure、Cross-object 都有场景差异 | 共享 Context Package、Fact/Inference/Unknown、Action Authority、Grill Turn、Preview Handle、Proposal Factory、Validator、Interaction Evidence 与 Provider/stale 处理；Skill 不得重建运行时 | 是 |
| Skill/Prompt/Validator 补丁化 | MEDIUM | `unified-ux-generator`/`recover-context` 已建立首组 CANDIDATE/RETIRED 台账与真实 Provider 指标；其他 active Skill 仍需统一收敛 | 只保留 `EXPERIMENTAL/SHADOW/CANDIDATE/PRODUCTION/RETIRED`；晋升看固定样本、真实 Provider、拒绝/重试/abstain/helpful-noise/越权；旧版退休而非永久兼容 | 是 |
| Desktop 验收笛卡尔积 | HIGH | 宿主、主题、宽度、错误和恢复组合已很多 | 三层代表矩阵：高频日常覆盖 Block/Page/sidebar/Query-reference/Light-Dark/窄栏/reload/Graph switch；复杂操作覆盖 Preview/HIGH/Commit/reload/Undo/stale/Recovery；低频高风险覆盖正常、一种失败、自动回滚、手工入口、restart | 是 |
| 文档/代码/截图漂移 | HIGH | 历史 Desktop 证据多，最新安全提交可能没有新 UI | 截图必须记录 commit 并分 `CURRENT/HISTORICAL/SUPERSEDED`；自动-only 安全修复不借用旧截图升级 Desktop 状态；每轮同步 status/progress/acceptance/plan/current-ui | 是 |
| 后台工程概念泄漏 | MEDIUM | `4dfe014` 的最新 Desktop 已证明“现在”移除重复运行条、“更多”使用用户维护语义、系统状态默认折叠工程诊断；高级 Review/Grill/Project/Migration/Restore 表面仍需逐场景复核 | 默认只显示一个主结论、1—2 条依据、一个主操作、最多两个快速处置；版本/ID/checksum/机器理由只进技术详情/Audit；以代表性复杂链继续压缩而不新增说明层 | 是 |

## 本轮变化（2026-07-28）

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
  `HISTORICAL` 缺陷截图，不增加 Plugin 持久去重账本。中文 IME 与 Light/窄栏继续作为
  代表性 Gate，不扩张为全组合矩阵。
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
- 风险变化：Recovery/状态/Runtime 分裂未上升；Partial 堆积仍为 HIGH，但阻断项已收敛为
  P0/P1 宿主与视觉 Gate、P2-E 真正 RECOVERY_REQUIRED、P2-G Light host Gate 及 Rebind 指引。
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
- Recovery 复杂度没有为“补一张截图”而扩张：代码事实表明真正
  `RECOVERY_REQUIRED` 只允许补偿收口，现有 Closure 自动续跑发生在 receipt-backed
  `PENDING`。前向 resume 若要支持，必须明确改变 Recovery Kernel 的安全合同；用户决定前
  不增加第三种恢复入口、临时状态或 SQLite 注入 Gate。风险仍为 HIGH，且继续阻塞 P2-E
  整体 DONE。
- `cd59228` 删除一条把 legacy demo-agent flag 当成 V2 Copilot 可用性的平行前台判断；
  待审阅空态复用既有 `v2ProviderAvailable`，没有新增 capability 状态。前台错误结论减少，
  状态组合数不变；新增正式状态、Runtime、Skill、Prompt、Validator、恢复分支和 Partial
  均为 `0`。
