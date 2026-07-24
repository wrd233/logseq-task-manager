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
| P1-4 状态翻译层 | Application `status-narration.ts` 首轮确定性对象契约；现有 UI 仍用 Now Work `reason` 与零散 message | Condition/due/review/blocker/Project current interface facts | UI_ORCHESTRATION | LLM 杜撰下一动作；字段式输出 | PARTIAL_AUTOMATED：事实/推断/未知与 next-action eligibility 已锁定；待接 ViewModel 并扩 Commit/Anchor/System |
| P1-5 “现在”动态编排 | Now Work 三段：Focus/Next/Waiting Review | `v2-now-work.ts`、Service query | UI_ORCHESTRATION | 退化为所有 OPEN 列表 | 改为继续处理/需要回看/保持等待；一对象一主问题；高质量建议动态插入 |
| P1-6 Block 轻标记 | 尚无；SDK 有 block renderer slot | Anchor/Object/attention projection | NEEDS_PROTOTYPE | 编辑态、Query/引用、主题、性能、正文污染 | 独立只读 UI prototype；先不全局上线；关闭 Plugin 后无 Markdown 残留 |
| P1-7 Project 顶部重入条 | 独立 Project 重入 workspace；schema v12 aggregate | Project current interface、Now Work、Anchor | UI_ORCHESTRATION | 与现有 Project workspace 产生不同事实 | Page slot 只读组合同一投影；上下文不足明确承认 |
| P1-8 Task 轻量恢复 | Now Work card + Anchor open | title/parent/Condition/Ownership/recent Audit | UI_ORCHESTRATION | 强制生成垃圾摘要 | 逐层取事实，够用即停；不足只打开原文 |
| P1-9 LLM 状态叙述/当前接口 | DeepSeek Proposal provider、Project aggregate | Provider、Schema、Validator、Proposal Review | LLM_SKILL | 模型覆盖正式事实或写入 | 新 Skill 使用统一 UX 输出；模型只起草 Proposal；关键变化用户确认 |
| P1-10 交互日志与版本 | `structured-logger.ts`；Provider provenance | bounded logger、skill/prompt/model version | DERIVED_DATA | 保存私人正文或 Key | 记录场景/处置/版本/时长，完整正文只在显式授权样本中保存 |
| P2-1 MiniProject Grill Me | 三问 Closure Agent；`design-project` Skill | Context Package、Provider、Proposal | LLM_SKILL | 固定问卷；超范围读取；自动写入 | 新 `mini-project-modeling` Skill，自适应对话状态只产生结构 Proposal |
| P2-2 MiniProject 原位重构 | 单 Block formalization Commit；无多 Block重构产品流 | Graph patch ledger、SemanticCommit、Undo | DOMAIN_EXTENSION | 原始事实丢失、部分 Commit | 先 prototype 多 Block patch scope；若现有 Proposal op 不足，最小扩展正式操作并保持一次 Commit |
| P2-3 Project 创建 Grill Me | 当前 Project 原子创建直接表单 | Project prepare/finalize、schema v12 | LLM_SKILL | 绕过页面原子性；变成固定大问卷 | Grill Me 只形成创建 Proposal；最终仍复用 prepare/page/finalize |
| P2-4 Project 结构操作 | Project interface、Ownership、Association、Lifecycle 已分路径 | 现有风险与专用 Commit/Undo | UI_ORCHESTRATION | 将结构操作错误降级为轻操作 | 路由层按影响分类；Ownership/Closure 保持 HIGH |
| P2-5 Closure | Project/MiniProject Closure 已完成 | Closure Schema、Provider draft、Review/Commit | UI_ORCHESTRATION | 现有三问/字段仍像表单 | 先从证据起草并给阅读预览，用户只处理真实判断 |
| P2-6 跨对象观察 | Context Package、Project relation projections | read-only scope、Proposal submit | LLM_SKILL | 弱候选泛滥、自动 Ownership | 影子模式先评估；候选数量上限；只进待我确认 |
| P2-7 Recovery/Rebind/Restore/Migration 向导 | CLI/Diagnostics/独立 workspace | 既有安全链全部复用 | SERVICE_PRODUCTIZATION | 新向导形成第二恢复器；路径/UUID 暴露 | 只包装既有 API/ledger；统一用户语言；高风险确认不压缩 |
| LLM 统一 UX 输出协议 | 当前 Proposal Schema 不等同 UX narration schema | Provider runtime、machine provenance | DOMAIN_EXTENSION | 在 Domain 中引入 Provider 语义 | 新协议放 Application/Service LLM 边界；正式 Domain 继续只认 Proposal |
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
