# Task Copilot V2 交互优化：设计到代码映射

> 基线提交：`d6ef86e`
> 缺口类型只使用 Goal 规定的九类枚举。

## 映射矩阵

| 设计目标 | 当前入口 / 代码 | 可直接复用 | 缺口类型 | 风险 | 建议实现 |
|---|---|---|---|---|---|
| P0-1 四项主导航 | `ui.ts` 六个 `Workspace`；`renderApp` | 各工作区 query/renderer | UI_ORCHESTRATION | 隐藏能力而不提供“更多”会造成不可达 | 新增用户级 `now/review/projects/more` 导航；现有 objects/reentry 合并到项目，migration/audit/diagnostics 收入更多 |
| P0-2 工具栏统一入口与角标 | `bootstrap-shell.ts` 固定 `TC` | toolbar registration、主 UI 打开 | DERIVED_DATA | 把 OPEN/Focus 计数误作介入数量 | 新建 intervention summary query；恢复风险优先 `↻`，否则显示确定性介入数 |
| P0-3 Block 右键菜单 | 尚未注册；SDK 有 `registerBlockContextMenuItem` | Focus、Anchor open、Candidate、Condition Handler | UI_ORCHESTRATION | SDK 菜单不能按对象状态动态移除注册项；Query/引用 payload 差异 | 稳定注册少量用户意图入口，动作时按 UUID 解析正式对象并路由；Desktop 验证排序/引用/Query |
| P0-4 Page 菜单 | 尚未注册；SDK 有 `registerPageMenuItem` | 当前页 Candidate、Project 创建/重入 | UI_ORCHESTRATION | Page payload 只有 string；Project Page 身份需重验 | 三个稳定 Page 意图入口，动作时解析页面与 Project Anchor |
| P0-5 斜杠与快捷动作 | 只有 `Task Copilot: Open`；命令面板 5 个英文入口 | command registration、显式 parser | UI_ORCHESTRATION | 斜杠直接正式写入会绕过现有 parser/Proposal | 先注册中文创建模板与三个可配置命令；创建仍走正文 + 正式同步/Proposal 边界 |
| P0-6 “暂时做不了” | Now Work 分散的 WAITING/BLOCKED/PAUSED 表单 | `changeCondition`、版本/幂等/Audit | UI_ORCHESTRATION | 字段遗漏或状态恢复时自动 Focus | 一个紧凑路由器选择三种意图，再复用现有 command；成功回原 Block |
| P0-7 低风险接受并应用 | `v2-low-risk-apply.ts` + Review card；自动/真实 Desktop 已闭环 | Proposal Validator、revalidate、SemanticCommit、Undo | UI_ORCHESTRATION | 错误合并高影响组；重复点击；中断误报成功 | DONE：只对 READY/LOW/唯一单 Block CREATE/REWRITE 连续编排；后台完整链、busy、stale/transport/recovery 文案与 Undo 保留 |
| P0-8 accepted-not-applied | Proposal `ACCEPTED` + Commit 状态已有 | Proposal/Commit query | DERIVED_DATA | 低风险静默遗忘；高影响未完成不可见 | 派生 intervention item；低风险连续提交，高影响在工具栏/待我确认顶部持续显现 |
| P0-9 结果、Undo、最近修改 | 当前 `message/error`、Proposal card Undo、Audit workspace | Audit/Receipt/SemanticCommit/inverse Commit | UI_ORCHESTRATION | Toast 消失后 Undo 不可发现；后续编辑时误覆盖 | 新建用户层 action result 与 recent changes projection，不新增权威 |
| P0-10 Service 自动启动/结束 | Node 进程手启；filesystem descriptor；Plugin 私有 reader；beforeunload 只清理 Plugin | runner、descriptor、health、safe close、Restore stop | SERVICE_PRODUCTIZATION | 进程所有权、跨 Graph、崩溃、secret/path 泄漏 | 先做受控 launcher/handshake spike；明确 Plugin-owned process；安全 shutdown endpoint；fail closed |
| P0-11 系统状态 | `runtime-diagnostics.ts` 工程网格 | Doctor component report、restricted model | UI_ORCHESTRATION | 将 HTTP 200 当健康；详情泄密 | 建立结论/影响/安全/动作四段式系统状态，技术诊断二级展开 |
| P0-12 完成后路由 | 主 UI 全屏 overlay；部分操作留在当前 workspace | Anchor open、workspace state | UI_ORCHESTRATION | 动作后丢失 Block/Page 发起现场 | 新增 origin route token（session-only）；成功/失败/恢复均按来源返回 |
| P1-1 注意力信号数据层 | Application `attention-shadow.ts` 纯模型 + bounded session repository；Plugin `attention-shadow-runtime.ts` 只读会话编排；V2 Domain 仍无 Signal | due/review/Proposal/Commit/Anchor/Doctor facts | DERIVED_DATA | 形成第二套 Inbox 或第二权威 | PARTIAL_RUNTIME_SHADOW：invalidation/cooldown/provenance/capacity/clear/count telemetry PASS；UI/SQLite 未开放 |
| P1-1b 确定性 detector/merge | Application `attention-detector.ts` 第一波 pure detector + Plugin structured projection adapter | object/proposal/commit/anchor/Graph binding facts | DERIVED_DATA | 多问题轰炸、恢复风险被 due 遮住 | PARTIAL_RUNTIME_SHADOW：一 subject 一主问题、data risk priority、cooldown 与自动 exclusion PASS；尚无用户显现 |
| P1-2 检查调度 | 显式同步事件、5 分钟 Anchor reconciliation、workspace query | 事件控制器与 Service query | DERIVED_DATA | 全 Graph 扫描、重复 LLM、编辑卡顿 | 局部事件检查 + 低频 timer + 现场刷新；宽检索独立后台 job |
| P1-3 影子模式 | session repository 仅接受 SHADOW/NONE 与机器引用/checksum；Plugin READY refresh 已接只读 runtime | structured logger、规则/Prompt 版本 | DERIVED_DATA | 未展示数据却无限积累私人正文 | 512 容量/Graph switch clear/count-only telemetry 已实现；跨 reload 位置与 Desktop 读回仍待验证 |
| P1-4 状态翻译层 | Application `status-narration.ts` + Plugin `status-narration-runtime.ts`；System、Proposal Review、Recent Changes、Now Work 与 Anchor repair 已消费统一契约 | Condition/due/review/blocker/Project current interface/Proposal/Commit/Anchor/System facts | UI_ORCHESTRATION | LLM 杜撰下一动作；字段式输出；另建恢复入口 | PARTIAL_UI_AUTOMATED：事实/推断/未知与 next-action eligibility 已锁定；Now 使用版本匹配 Object 并只复用 Condition Handler；Anchor 问题卡复用既有 Rebind 预览/确认/重校验且不导出身份；Commit/Undo 仍由既有 Handler 判定；待 Desktop 与 LLM draft protocol |
| P1-5 “现在”动态编排 | Application `dynamic-now-shadow.ts` SHADOW 三段 + Plugin count-only runtime 对照；正式 UI 仍是 Focus/Next/Waiting Review | `v2-now-work.ts`、Focus、Condition/due/blocker、status narration | UI_ORCHESTRATION | 退化为所有 OPEN 列表 | PARTIAL_RUNTIME_SHADOW：三段 inclusion/exclusion、容量、Focus ownership 与 privacy PASS；建议区为空，待 Desktop 对照与 UI Gate |
| P1-6 Block 轻标记 | `block-marker-prototype.ts` + 默认关闭 setting；官方 `onBlockRendererSlotted(exact UUID)` + `provideUI(slot)` | active primary Anchor、Object Condition/Lifecycle、Focus | NEEDS_DESKTOP_PROTOTYPE | 编辑态、Query/引用、主题、性能、正文污染 | PARTIAL_PROTOTYPE_AUTOMATED：LINE/DOT/ICON/TINT/PHRASE 五候选、100 Block harness、slot 清理/容量/identity guard PASS；不写正文、不用 macro/DOM observer；待真实 Desktop 比较，未全局发布 |
| P1-7 Project 顶部重入条 | Application `reentry-projection.ts` + Plugin `reentry-runtime.ts` 已替换生产 Project workspace 的展开式卡片；`project-page-head-action.ts` 接入 main Page Head 单动作 | schema v12、Condition、Focus、Ownership、Anchor、Commit | UI_ORCHESTRATION | 与现有 Project workspace 产生不同事实；无 page payload 的 sidebar slot 误路由 | PARTIAL_UI_AUTOMATED：Recovery 优先、最多三个 Focus 直属进入点、Association 仅背景、上下文不足显式承认；主 Page 点击重验 Page/Anchor/Object 后只显示同一 Project，sidebar 隐藏；待 Desktop |
| P1-8 Task 轻量恢复 | Application Task reentry 纯投影；现有 Now Work card + Anchor open 尚未接线 | title/parent evidence/Condition/Ownership/Anchor/Commit | UI_ORCHESTRATION | 强制生成垃圾摘要 | PARTIAL_AUTOMATED：精确 Condition/parent/owner 分层；ACTIONABLE 且无正文上下文时只打开原文 |
| P1-9 LLM 状态叙述/当前接口 | Application `unified-ux-output.ts`、Local Service `llm-ux-output.ts` + `project-context-recovery.ts`、Plugin `project-context-recovery-controller.ts`、`recover-context@1.0.0` | Provider、Schema、Validator、Proposal Review、Context Package Skill catalog | LLM_SKILL | 模型覆盖正式事实或写入 | PARTIAL_UI_AUTOMATED：Project 路由只接收 object/version，服务端构造正式 facts 与只读动作；Plugin 仅显式触发、保留确定性基线、前后重验 Project、Graph/reconnect 清空、动作再次匹配当前投影；待真实 Provider/Desktop |
| P1-10 交互日志与版本 | Application `interaction-evidence.ts` session buffer；P1-G Provider provenance；Plugin `structured-logger.ts`/Runtime Diagnostics；Local Service `process-output.ts` | bounded strict allowlist、skill/prompt/model version | DERIVED_DATA | 保存私人正文、对象身份、Prompt、模型原始输出、异常正文/stack/cause、路径或 Key | PARTIAL_LIVE_SERVICE：P1-G 结构事件、Plugin diagnostics/export 与 Service daemon output 均排除自由文本异常/路径；五种可撤回 session disposition、版本噪声汇总与 `DO_NOT_REPEAT` Provider 前抑制已通过自动及真实 DeepSeek/Service Gate；opaque handle 不导出。Desktop 反馈交互、跨会话留存价值与用户可见 dashboard 仍开放 |
| P2-1 MiniProject Grill Me | Application `grill-session.ts`/`grill-preview.ts`；Service `mini-project-grill.ts`/`llm-grill-turn.ts`/`llm-grill-preview.ts`；Plugin `mini-project-grill-controller.ts`/session UI；`mini-project-modeling@1.2.0` | Context Package、Graph read bridge、Provider、Proposal | LLM_SKILL | 固定问卷；超范围读取；自动写入 | BOUNDED_VERTICAL_SLICE_DONE：精确子树、四轮真实 DeepSeek 自适应 focus、Validator retry、5/5 canonical 零丢失预览和 Block origin Desktop PASS；回答历史避重、stale/error/session 边界自动 PASS；P2-C 及跨场景质量继续开放 |
| P2-2 MiniProject 原位重构 | Application Proposal + dedicated Commit planner；Service session handle/Proposal/prepare/step verify/recovery；Plugin Preview→Review→Commit/inverse Undo；Domain HIGH `CREATE_BLOCK`/`MOVE_BLOCK`；ADR-0007 | Graph patch ledger、SemanticCommit、Undo | DOMAIN_EXTENSION | 原始事实丢失、部分 Commit | BOUNDED_VERTICAL_SLICE_DONE：一个 HIGH Proposal、原材料 no-rewrite/no-delete、8-step Commit/reload、真实 divergence→Recovery、拓扑修正后 8-step inverse Undo/reload、recent-changes 折叠和返回根 Block Desktop PASS；P2-G 用户化 Recovery 与其他结构形态继续开放 |
| P2-3 Project 创建 Grill Me | Application `PROJECT_CREATION` Grill/Preview/Proposal planner；Service 三来源 source rebuild、Preview handle、Proposal-bound prepare/finalize/compensate/inverse Undo；Plugin Blank/Page/MiniProject 统一 Grill session、专用 Review、controlled Page executor、Recovery/Undo；`project-creation-modeling@1.1.0` | Project create Application command、schema v12、GrillPreviewSessionStore、Proposal Review、SemanticCommit Page evidence | LLM_SKILL | 绕过页面原子性；固定大问卷；创建前伪造 Object ID；跨重启丢 Page identity；删除复用 Page 或含用户正文 Page | IN_PROGRESS_FORMAL_CHAIN_AUTOMATED_DESKTOP_OPEN：Blank Grill/Preview 真实 `deepseek-v4-flash` PASS；三来源用户入口、Proposal/Review、原子 Project+Anchor+reviewed structure、restart-safe failure compensation、dedicated/reused Page 安全差异和专用 Undo 自动 PASS；直建 UI/action bypass 已移除；当前 commit 的 Desktop/reload/failure/Recovery/Undo/截图仍 OPEN |
| P2-4 Project 结构操作 | Project interface、Ownership、Association、Lifecycle 已分路径 | 现有风险与专用 Commit/Undo | UI_ORCHESTRATION | 将结构操作错误降级为轻操作 | 路由层按影响分类；Ownership/Closure 保持 HIGH |
| P2-5 Closure | Project/MiniProject Closure 已完成 | Closure Schema、Provider draft、Review/Commit | UI_ORCHESTRATION | 现有三问/字段仍像表单 | 先从证据起草并给阅读预览，用户只处理真实判断 |
| P2-6 跨对象观察 | Application `cross-object-shadow.ts` + Attention detector；Service `cross-object-observation-provider.ts`/live gate；Plugin session shadow runtime | machine-owned bounded Context Package、versioned subjects/scope/evidence/provenance；既有 Attention invalidation/cooldown | LLM_SKILL | 弱候选泛滥、正文泄露、自动 Ownership/Focus、模型自授 confidence | PARTIAL_SHADOW_PROVIDER_REPEAT_PASS：五类 fixed draft、2–8 subject、2–16 evidence、每轮 8 条，只进 `LLM_CROSS_OBJECT/INFERENCE/SHADOW/NONE`；真实 DeepSeek 三轮 15/15 case-runs，confidence 机器 LOW/MEDIUM；无 UI/persistence/Proposal/写入，待 real-context/stale/error/feedback 后再决定正式 Skill 与确认链 |
| P2-7 Recovery/Rebind/Restore/Migration 向导 | Plugin Diagnostics/Audit/Migration + `v2-anchor-rebind.ts` + `backup-restore-controller.ts` + `migration-scan-controller.ts`；既有 Service/CLI 安全链 | 既有安全链全部复用 | SERVICE_PRODUCTIZATION | 新向导形成第二恢复器；路径/UUID/Backup ID 暴露 | PARTIAL：Rebind 常规主链与 Restore 状态差异正反往返 Desktop DONE；Rebind 纠错指引自动 Gate 把选错正文路由回受控 Rebind、整库回退路由到 Backup/Restore，不复活 missing/conflict 旧 Anchor。Migration ledger 用户阶段翻译与 session-only Recovery Bundle 只读 scan 已自动完成，且不暴露 run/hash/backup/object/evidence identity；逐项 Review、正式状态机与 Desktop 仍 OPEN；新 Rebind 指引 Desktop 与 Restore failure/Recovery 也 OPEN |
| LLM 统一 UX 输出协议 | `materializeUnifiedUxOutput` 深模块 + `LocalLlmUxOutputGenerator` | Provider runtime、machine provenance | LLM_SKILL | 在 Domain 中引入 Provider 语义 | DONE_CONTRACT：协议只在 Application/Service LLM seam；Domain 未改；自由模型 provenance 被替换、越界 ref/未知动作/歧义 authority fail closed，输出暂不持久化 |
| 四级显现与一对象一主问题 | 当前 UI 可同时显示多 badges/字段 | Now Work facts、Doctor severity | DERIVED_DATA | 隐藏真正恢复风险 | 纯函数 merge/priority/invalidation，PENDING/RECOVERY 永不冷却 |
| 用户 Focus 权威 | Focus 已是独立 Application command | 完整复用 | REUSE_AS_IS | Copilot 建议误调用 `selectFocus` | LLM/Signal 只提出建议，只有用户命令调用 Focus 写入 |
| 正文权威与关闭后可读 | 当前成立 | Graph Adapter、SemanticCommit | REUSE_AS_IS | Block UI 写回 Markdown | 所有轻标记用注入 UI，不写正文 |
| SQLite 单一领域权威 | 当前成立 | Service/Application/Persistence | REUSE_AS_IS | 为 UX 新增第二 Store | UI cache/Signal 均明确派生；正式变化仍经 Local Service |
| 不做移动端/团队/云/全量扫描 | 当前无相关实现 | 现有 desktop-only scope | OUT_OF_SCOPE | 顺手扩张范围 | 路线图和检查清单持续拒绝 |

## 关键判断

### 可以不改 Domain 的 P0

P0 的绝大多数内容属于 `UI_ORCHESTRATION` 或 `SERVICE_PRODUCTIZATION`。Focus、Condition、due、Proposal、Commit、Undo、Audit、Anchor、Doctor、Backup 和 Restore 已有可信命令与恢复边界。应先证明仅编排现有 Handler 能把高频链路压缩到 1—2 个明确决定。

### 需要先原型的 P1/P2

- Block renderer slot 的真实视觉与性能；
- Plugin 启动/管理 Node 子进程的运行承载；
- 多 Block 原位重构的 patch scope；
- 注意力信号持久化位置；
- LLM 统一 UX 输出协议是否只需 Application 类型，还是需要受约束持久化元数据。

### 不得借 UX Goal 重开的决定

- V2 取代 V1；
- SQLite 唯一正式状态源；
- Proposal 不是事实；
- LLM 只生成 Proposal；
- 高影响操作独立确认；
- SemanticCommit/Undo/Recovery 单一路径；
- Project current interface 为 schema v12 单 JSON aggregate；
- `@logseq/libs` 当前 pin 与公开风险。
