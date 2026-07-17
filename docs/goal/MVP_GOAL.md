# Task Copilot Logseq Plugin：个人可用 MVP 持续开发 Goal

> **Goal 类型**：跨多轮、可恢复、深度连续执行工程 Goal  
> **首要运行目标**：在单次 Codex 运行中，尽可能完成所有不依赖用户操作的实质工作，优先达到 `AUTOMATION_COMPLETE`，而不是在中间 Slice、Commit 或普通运行时待验证项处停止。  
> **最终成功状态**：`MVP_SUCCESS`  
> **规范基线**：`references/个人事务运行系统-视觉阅读版.pdf`

---

## 0. 当前仓库基线

工作目录：

```text
/Users/wangrundong/work/任务管理中心-logseq插件
```

本地测试 Graph：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/logseq
```

当前已知状态：

```text
外层开发仓库分支：main
外层工作区：clean
remote：未配置
upstream：未配置
push：从未执行，并由本地 pre-push Hook 拒绝

已有本地提交：
c70f54c chore: isolate Logseq plugin development repository
f1ce6c7 test: harden Logseq capability lab boundaries
```

现有 Capability Lab：

```text
apps/logseq-plugin-capability-lab
```

其 Logseq 加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab
```

Capability Lab 已知基础：

- 能被 Logseq Desktop 通过 `Load unpacked plugin` 加载；
- TypeScript、ESLint、esbuild、边界检查已建立；
- 自动测试 13/13 通过；
- 写入限制在 `Task Copilot Lab/` 命名空间；
- 已有页面所有权、资产注册表、清理和只读安全锁定；
- 测试 Graph 被外层 Git 完全忽略；
- 内层 Graph dirty 是正常运行状态，绝不是开发阻塞。

内层 Graph 当前任何文件变化，包括但不限于：

```text
pages/task-copilot-logseq-bridge.md
```

都只能作为运行环境信息，不得阻止外层源码开发、检查或提交。

---

# 1. Goal 的产品定义

本项目不是普通 TODO 插件，也不是给 Logseq TODO 增加字段、日历和看板。

它要实现的是一套嵌入 Logseq 的**个人事务运行系统 MVP**：

- Logseq 承载自然语言正文、Journal、项目说明和上下文；
- 独立领域模型承载对象身份、类型、状态、主归属、关系和版本；
- Audit/Event Store 承载原始内容、历史事件、SemanticCommit、撤销和恢复证据；
- 插件提供 Capture、Inbox、对象抽屉、Proposal Review、Now Work 和 Project Re-entry；
- Agent 只能生成 Proposal，不能直接把推断变成正式事实；
- 正式修改经确定性校验、可拆分审查和可恢复提交后生效；
- 没有真实 LLM 时，基础事务系统仍完整可用；
- 插件关闭后，Logseq 正文仍自然可读。

系统优化的不是字段数量和页面数量，而是：

1. 降低随手捕获成本；
2. 降低中断后的重入成本；
3. 降低重复字段、摘要和状态维护成本；
4. 降低当前工作视图的注意力噪声；
5. 提高 Agent 修改的透明度、保真度和可逆性。

---

# 2. 深度连续执行模式

本 Goal 默认启用：

```text
DEEP_RUN_MODE = true
```

## 2.1 核心执行要求

Codex 的任务不是完成一份计划、一个 Slice 或一次 Commit 后汇报，而是在当前权限和环境允许的范围内，持续调查、设计、实现、测试、修复、提交并进入下一项工作。

以下事项完成后，**不得返回用户，必须记录后立即继续**：

- 阅读完规范；
- 完成一份设计文档或 ADR；
- 完成一个 Package；
- 完成一个纵向 Slice；
- 创建一个本地 Commit；
- 自动测试全部通过；
- 发现一个待人工验证项；
- 某个非核心 SDK 运行时形态尚未确认；
- 某个可选依赖安装失败；
- 某项能力暂时置于 Feature Flag；
- SQLite 方案不可行但存在安全的 JSON/JSONL 替代方案；
- 未接入真实 LLM；
- 测试 Graph dirty；
- 外部进程持续修改测试 Graph；
- UI 尚未达到最终美观程度。

## 2.2 单次运行允许结束的条件

只有以下四种状态允许结束单次运行：

### A. `AUTOMATION_COMPLETE`

所有不依赖用户点击 Logseq Desktop 的实质工作均已尽可能完成，包括实现、自动测试、构建、规则追踪、备份导出、恢复演练准备和人工验收准备。

宣布前必须完成“自动化穷尽检查”。

### B. `CONSOLIDATED_RUNTIME_CHECKPOINT`

确有一个或少数几个关键运行时结果，使所有剩余实质工作都依赖用户操作；所有与这些结果无关的工作已经完成。

不得因为出现第一个待人工验证项就停止。必须把运行时验证合并为尽可能少的集中检查点。

### C. `MVP_SUCCESS`

最终验收、真实 Desktop 验证、恢复演练和小规模 Pilot 均完成。

### D. `BLOCKED`

必须严格符合本文件第 20 节“真实阻塞定义”，并证明不存在安全替代方案。

## 2.3 不允许的结束理由

禁止以这些理由结束：

- “本轮已经完成很多”；
- “为了控制范围”；
- “建议下一轮继续”；
- “先请用户验证所有能力矩阵”；
- “一个 Slice 已完成”；
- “已经提交代码”；
- “某个可选能力不确定”；
- “等待更完整需求”——规范已经足以支持合理决策时不得等待。

---

# 3. 跨会话可恢复机制

在仓库中建立并持续维护：

```text
docs/goal/MVP_GOAL.md
docs/goal/MVP_STATUS.md
docs/goal/MVP_CHECKPOINTS.md
docs/goal/MVP_DECISIONS.md
docs/goal/MVP_BLOCKERS.md
docs/goal/MVP_ACCEPTANCE_MATRIX.md
docs/goal/PENDING_RUNTIME_TESTS.md
```

每次 Codex 会话开始时，必须按顺序读取：

1. 根目录 `AGENTS.md`
2. `docs/goal/MVP_GOAL.md`
3. `docs/goal/MVP_STATUS.md`
4. `docs/goal/MVP_CHECKPOINTS.md`
5. `docs/goal/PENDING_RUNTIME_TESTS.md`
6. 当前 Slice 相关 ADR
7. `docs/mvp/REQUIREMENTS_TRACEABILITY.md`
8. 与当前工作相关的 Package 级 `AGENTS.md`

每次会话结束前，必须更新状态文件，使另一轮 Codex 不依赖聊天上下文即可继续。

`MVP_STATUS.md` 至少包含：

```yaml
goal_state:
current_slice:
last_completed_commit:
last_successful_check:
implemented:
remaining_automatable_work:
runtime_checks_pending:
acceptance_progress:
active_risks:
user_actions_required:
resume_instruction:
```

---

# 4. 规范读取与权威关系

完整阅读：

```text
references/个人事务运行系统-视觉阅读版.pdf
```

重点章节：

- 01 愿景、边界与不可变原则；
- 02 核心术语；
- 03 对象语义契约；
- 04 关系、归属与层级；
- 05 生命周期与三轴状态；
- 06 对象迁移；
- 07 信息分层与权威来源；
- 08 Logseq Anchor；
- 09 审计与回滚；
- 10 捕获、分诊与正式化；
- 11 Proposal 与 SemanticCommit；
- 12 部分接受；
- 13 注意力视图；
- 14 自然语言与信息密度；
- 15 渐进披露；
- 16 Agent 权限；
- 18 总体架构和数据模型；
- 19 Logseq 插件与适配层；
- 21 冲突、备份与恢复；
- 22 核心场景；
- 23 黄金样例；
- 24 验收与测试；
- 25 ADR 治理。

创建：

```text
docs/mvp/SPEC_BASELINE.md
docs/mvp/MVP_SCOPE.md
docs/mvp/REQUIREMENTS_TRACEABILITY.md
docs/mvp/RULE_COVERAGE.md
```

要求：

- 提取本轮适用规则 ID；
- 每条适用 `MUST` 必须映射到代码、数据约束、UI、测试、人工检查或明确延期 ADR；
- 不复制整份 PDF 充数；
- 不得修改规则含义；
- 规范矛盾必须进入 ADR；
- Capability Lab 是技术证据，不是领域语义权威；
- PDF 中的原则优先于实验代码的偶然实现。

规范约束链：

```text
愿景
→ 合法对象
→ 合法关系
→ 合法状态变化
→ 信息权威
→ 合法语义操作
→ 用户审查
→ 合法视图
→ 架构实现
→ 场景与测试反向验证
```

---

# 5. Git 与仓库策略

从 `main` 创建：

```text
feature/task-copilot-mvp
```

要求：

- 不设置 upstream；
- 不配置 remote；
- 不 push；
- 不改写现有两个 Capability Lab 提交；
- 不重置或清理内层 Graph；
- 不要求内层 Graph clean；
- 不把 `logseq/`、`node_modules/`、`dist/`、缓存、日志、测试数据库或真实 Graph 数据提交；
- 每个本地 Commit 必须可构建并通过与其范围相符的测试。

建议 Commit 序列：

```text
docs: freeze task copilot MVP goal and specification
feat: establish task copilot domain kernel
feat: add recoverable domain and audit persistence
feat: implement Logseq capture and inbox flow
feat: add object drawer and lifecycle workflow
feat: implement proposal review and semantic commits
feat: add now work and project re-entry views
test: complete export recovery and MVP acceptance
fix: address runtime and pilot feedback
release: prepare task copilot MVP candidate
```

完成一个 Commit 后不得因此返回，立即继续下一项。

---

# 6. 目标仓库结构

优先建立：

```text
任务管理中心-logseq插件/
├── AGENTS.md
├── apps/
│   ├── logseq-plugin-capability-lab/
│   └── task-copilot-logseq-plugin/
├── packages/
│   ├── domain/
│   ├── application/
│   ├── persistence/
│   ├── logseq-adapter/
│   └── shared/
├── docs/
│   ├── goal/
│   ├── mvp/
│   ├── adr/
│   └── runtime/
├── scripts/
├── package.json
└── logseq/                         # 外层 Git 完全忽略
```

可以采用 npm workspaces，但不要为了架构美观引入重型 monorepo 工具。

要求：

- 单一 npm 包管理器；
- 不产生冲突 lockfile；
- 根级检查能覆盖 Capability Lab 和正式插件；
- 正式插件可直接被 Logseq `Load unpacked plugin`；
- Capability Lab 保留为实验工具，不改名成正式产品。

---

# 7. 不可违反的架构边界

依赖方向：

```text
Interaction
    ↓
Application
    ↓
Domain
    ↓
Ports

Adapter / Persistence 实现 Ports
```

推荐分层：

```text
Interaction Layer
  Logseq Plugin UI

Application Layer
  Capture / Review / Object / View / Re-entry / Export Services

Domain Layer
  Objects / Relations / State Machines / Rules / Semantic Operations

Agent Orchestration Layer
  Provider / Context Selection / Proposal Generation

Adapter Layer
  Logseq / Filesystem / Optional LLM

Persistence Layer
  Domain Store / Audit Store / Proposal Store / Backup / Export
```

强制规则：

- Domain 不得 import `@logseq/libs`；
- Domain 不得读写 Block；
- UI 不得直接写 Store；
- Adapter 不得复制状态机；
- UI 不得自行判断迁移和状态是否合法；
- Agent Provider 不得直接改 Logseq 或数据库；
- 所有正式状态变化通过 Application Command；
- 所有查询通过明确 Query Service；
- Interaction、Adapter 和 Persistence 不得形成第二套领域语义；
- 前端 ViewModel 只是投影，不是状态权威。

---

# 8. 运行时不确定性的处理

Capability Lab 已能加载，不得重新做完整脚手架实验。

阅读：

```text
apps/logseq-plugin-capability-lab/docs/CAPABILITY_MATRIX.md
apps/logseq-plugin-capability-lab/docs/MANUAL_TEST_GUIDE.md
apps/logseq-plugin-capability-lab/docs/RUNTIME_TEST_LOG.md
apps/logseq-plugin-capability-lab/docs/FINDINGS.md
apps/logseq-plugin-capability-lab/docs/DECISIONS.md
```

创建：

```text
docs/runtime/MVP_RUNTIME_ASSUMPTIONS.md
```

将能力标记为：

```text
CONFIRMED_BY_RUNTIME
CONFIRMED_BY_AUTOMATION
DEFENSIVELY_SUPPORTED
UNVERIFIED
DO_NOT_DEPEND_ON
```

对未验证行为：

1. 记录假设；
2. 集中放入 RuntimeShapeAdapter；
3. 返回结构化错误；
4. 增加诊断 Probe；
5. 必要时使用 Feature Flag；
6. 追加到 `PENDING_RUNTIME_TESTS.md`；
7. 继续所有不依赖该结果的工作。

不要因为下列事项中断：

- Page/Block 的某种返回形态未实测；
- UUID 移动语义未完全确认；
- FileStorage 物理位置未知；
- 事件可能重复；
- Settings 同步特征未知。

只有插件完全无法加载、无法读取主动选择块、无法安全持久化等才属于真实阻塞。

---

# 9. MVP 对象范围

完整支持：

- Capture；
- Task；
- MiniProject；
- Project。

最小支持 Area：

- 创建和编辑；
- 作为 Project 主归属；
- 列表和选择；
- 不要求完整 Area 工作台。

预留但不完整实现：

- Decision；
- Output；
- Resource；
- ExternalArtifact；
- PersonRef。

所有正式对象至少拥有：

```text
object_id
object_type
version
phase
condition
created_at
updated_at
source_or_creation_event
primary_text_anchor? 
```

对象 ID：

- 稳定；
- 不复用；
- 不依赖页面名、Block 路径或正文哈希；
- 选择 ULID、UUIDv7 或其他方案并记录 ADR。

对象类型由治理语义决定，不由文本长度、子块数量或标题格式决定。

---

# 10. 三轴状态模型

必须分别实现：

## 10.1 Phase

Task：

```text
CLARIFY
READY
ACTIVE
COMPLETED
CANCELLED
ARCHIVED
```

MiniProject：

```text
DEFINING
READY
ACTIVE
CLOSING
COMPLETED
CANCELLED
ARCHIVED
```

Project：

```text
IDEA
DEFINING
PLANNED
ACTIVE
CLOSING
COMPLETED
CANCELLED
ARCHIVED
```

Area：

```text
ACTIVE
DORMANT
RETIRED
```

## 10.2 Condition

```text
ACTIONABLE
WAITING
BLOCKED
PAUSED
NONE
```

## 10.3 Signal

动态计算至少支持：

```text
OVERDUE
REVIEW_DUE
STALE
NO_NEXT_ACTION
UNASSIGNED
CONFLICT
```

约束：

- `ACTIVE + WAITING` 合法；
- WAITING 必须有 `waiting_for`、`expected_result`、`review_at`；
- BLOCKED 必须有 blocker 或阻塞说明；
- PAUSED 必须有原因；
- Signal 不得作为永久手填标签；
- 非法流转返回包含 `rule_refs` 的领域错误；
- UI 不得绕过领域服务。

---

# 11. 关系、归属和 Anchor

关系至少支持：

```text
primary_ownership
parent_task
parent_work
depends_on
blocks
sourced_from
contextualized_by
produces
related_to
```

约束：

- 同一工作对象同一时刻最多一个直接主归属；
- `depends_on` 禁止循环；
- 物理位置不等于主归属；
- 视图聚合不改变主归属；
- Task 可直接归属 MiniProject、Project 或 Area；
- 不得为了结构完整创建空 MiniProject。

Anchor 至少保存：

```text
anchor_id
object_id
adapter
graph_id
external_id
role
content_hash
last_seen_at
status
cached_page_ref
```

role 至少：

```text
primary_text
source
context
event
output
```

要求：

- object_id 是对象身份权威；
- Block UUID 是首选外部锚点；
- 页面改名不改变对象身份；
- 块移动后对象应尽量仍可打开；
- 块删除不删除领域对象；
- Anchor missing 产生冲突；
- 提供重新绑定入口；
- 文字替换不得自动改变类型、归属或位置；
- 正文不暴露大段机器属性；
- 插件关闭后正文仍可读。

---

# 12. 持久化策略

通过 Port 抽象：

```text
DomainStore
AuditStore
ProposalStore
BackupStore
```

先做一次限时技术实验并形成 ADR。

优先方案：

1. Logseq 插件环境可稳定运行、无需本机 native 编译的 SQLite/WASM；
2. 若不稳定，则使用：
   - 版本化 JSON Domain Store；
   - Append-only JSONL Audit Store；
   - 临时文件 + 原子 rename；
   - checksum；
   - schema migration；
   - 自动备份；
   - 可迁移 Repository 接口。

禁止：

- 强行引入未经运行验证的 native addon；
- 全部语义塞入无约束 metadata；
- 只放内存；
- 只用 UI LocalStorage；
- 把完整数据写进普通正文属性；
- 静默覆盖未知 Schema。

必须具备：

```text
schema_version
migration
backup
export
corruption_detection
recovery_report
deterministic_tests
pending_commit_recovery
```

---

# 13. 七个核心界面

不要先做 Kanban、Calendar、Gantt 和统计仪表盘。

## 13.1 Capture 入口

入口：

- Toolbar；
- Command Palette；
- Slash Command；
- 正式 API 支持时提供上下文菜单或快捷键。

行为：

- 捕获当前块；
- 不要求填写字段；
- 保存原始文本快照；
- 保存 UUID、来源页面和时间；
- 创建 Capture；
- 轻量反馈；
- 不移动正文；
- 不自动创建 Task。

## 13.2 Inbox

显示：

- 未处理 Capture；
- 来源和时间；
- 原文摘要；
- Proposal 状态；
- 快捷操作。

支持：

- 打开来源；
- 手工正式化；
- 生成 Demo Proposal；
- 关联现有对象；
- 标记无需行动；
- 暂缓。

## 13.3 对象抽屉

显示：

- 自然语言正文；
- 类型；
- Phase；
- Condition；
- Signal；
- 主归属；
- 下一步；
- due/review；
- Waiting/Blocked；
- 来源和上下文；
- 最近事件。

支持：

- 编辑；
- 合法状态流转；
- 设置 Waiting/Blocked/Paused；
- 完成；
- 打开正文；
- 查看审计；
- 撤销最近 Commit。

## 13.4 Proposal Review

必须显示：

- 原文；
- 建议正文；
- 可读 Diff；
- SemanticOperation；
- 操作影响；
- 依赖；
- rule_refs；
- rationale；
- uncertainty。

支持：

- 单项接受；
- 单项拒绝；
- 编辑后接受；
- 全部拒绝；
- 合法部分接受；
- 最终影响预览；
- Commit；
- Undo。

## 13.5 Now Work

只投影：

- ACTIONABLE；
- REVIEW_DUE；
- OVERDUE；
- NO_NEXT_ACTION；
- 少量高价值 CONFLICT。

默认隐藏：

- 完整历史；
- 已完成对象；
- 全部内部属性；
- 低价值关联；
- 大量正文。

## 13.6 Project Re-entry

生成：

- 项目定位；
- 当前状态；
- 最近三项关键变化；
- 当前推进；
- 未决问题；
- 阻塞和等待；
- 一个建议恢复动作；
- 最多三个关键入口。

无 LLM 时也能通过领域数据和事件生成基础版本。

## 13.7 Audit / Recovery

最低支持：

- Commit 列表；
- before/after；
- Undo；
- pending/recovery_required；
- Anchor conflict；
- Backup/Export；
- Recovery report。

---

# 14. Proposal、部分接受与 Agent 边界

Proposal 不是事实。

至少实现 SemanticOperation：

```text
rewrite_content
create_object
update_object
set_primary_ownership
set_phase
set_condition
set_dates
add_relation
remove_relation
link_anchor
move_content
resolve_capture
```

每项至少包含：

```text
operation_id
operation_type
target
payload
preconditions
dependencies
risk_level
rule_refs
rationale
confidence
status
```

状态：

```text
PROPOSED
ACCEPTED
REJECTED
EDITED
BLOCKED
COMMITTED
```

必须跑通：

- 接受 rewrite；
- 拒绝 move；
- 拒绝 ownership；
- Commit 仍然合法；
- 拒绝归属时对象进入 UNASSIGNED/CLARIFY，而不是偷偷选择其他归属；
- 不满足依赖的 Operation 进入 BLOCKED；
- UI 解释阻止原因。

AgentProvider 至少实现：

### NoAgentProvider

- 明确显示 Agent disabled；
- 所有基础能力仍可用。

### DeterministicDemoProvider

- 固定输入产生可预测 Proposal；
- 用于 Review、部分接受、Commit 和 UI 测试；
- 不伪装成智能推理。

### ExternalAgentProvider 接口

- 可只提供接口和关闭状态；
- 不提交 Token；
- 不默认发送 Graph；
- 发送前可预览最小上下文；
- 输出必须通过 Schema 和领域校验。

确定性代码必须负责：

- 唯一性；
- 状态流转；
- 关系约束；
- Commit；
- Undo；
- Recovery。

---

# 15. SemanticCommit、审计与恢复

Logseq 与 Store 不共享数据库事务，因此实现**可恢复原子提交**：

1. 校验对象版本和 Anchor；
2. 计算最终 Operation 集；
3. 保存 before snapshot；
4. 写入 pending SemanticCommit；
5. 执行 Logseq 正文操作；
6. 验证 Logseq 结果；
7. 更新 Domain Store；
8. 追加 DomainEvent；
9. 标记 Commit completed；
10. 失败时 compensation；
11. compensation 失败时标记 `conflict/recovery_required`。

要求：

- 不允许“部分成功但显示成功”；
- Audit 保存 before/after；
- Undo 通过逆向 SemanticCommit；
- Undo 仍需版本检查；
- 正文被用户二次编辑后不得强行覆盖；
- 冲突显示来源、时间和两个版本；
- 禁止最后写入获胜；
- 插件启动时扫描 pending Commit；
- 支持故障注入。

至少测试：

- Logseq 成功、Domain 失败；
- Logseq 失败、Domain 未提交；
- Audit 不可写；
- 对象版本冲突；
- Anchor missing；
- Undo 时正文已变化；
- 插件重启发现 pending；
- compensation 失败；
- recovery report。

---

# 16. UI 与信息密度

可调查 Preact、Lit 或 Vanilla TypeScript，并记录 ADR。

选择标准：

- Logseq Main UI 稳定；
- 易维护 Proposal Review；
- 包体积合理；
- 支持组件测试；
- 不依赖 DOM hack；
- Reload 正确卸载。

视觉要求：

- 中文优先；
- 自然语言优先；
- D1/D2 默认信息密度；
- D3/D4 历史放在展开层；
- 空栏目不渲染；
- 没有背景不显示“背景”；
- 没有风险不显示“风险”；
- 简单 Task 不套 Project 模板；
- 技术字段放在次级区域；
- 高影响操作显式确认；
- 错误必须告诉用户下一步；
- 键盘可操作；
- 悬浮卡、抽屉和独立工作区共享同一 ViewModel。

---

# 17. 纵向切片与连续推进

## Slice 0：Goal、规范和技术边界

- 复制本 Goal 到仓库；
- 创建 Goal 状态文件；
- 提取规则；
- 建追踪矩阵；
- 建 ADR；
- 创建正式插件空壳；
- 构建通过；
- 尽可能验证加载前置。

完成后立即进入 Slice 1。

## Slice 1：Domain Kernel

- 对象；
- 三轴状态；
- 主归属；
- 关系；
- 状态机；
- rule_refs；
- 纯函数测试。

完成后 Commit，立即进入 Slice 2。

## Slice 2：Persistence / Audit / Recovery

- Stores；
- Schema；
- Migration；
- Backup；
- Export；
- Corruption；
- SemanticCommit 基础；
- 故障注入；
- Recovery。

完成后 Commit，立即进入 Slice 3。

## Slice 3：Capture → Inbox → 手工正式化

形成真实闭环：

```text
当前块
→ Capture
→ Inbox
→ 创建 Task
→ Anchor
→ 对象抽屉
```

需要 Desktop 验证的项写入待测清单，不得立即停止；继续 Slice 4。

## Slice 4：对象抽屉与工作流

- 编辑；
- Phase；
- Condition；
- Waiting；
- Blocked；
- Paused；
- Signal；
- 主归属；
- 来源；
- 事件。

继续 Slice 5。

## Slice 5：Proposal → Partial Acceptance → Commit → Undo

使用 Demo Provider 跑通完整闭环和故障注入。

继续 Slice 6。

## Slice 6：Now Work 与 Project Re-entry

实现两个克制投影视图和无 LLM 降级。

继续 Slice 7。

## Slice 7：Export / Restore / Acceptance Automation

- JSON/JSONL；
- Markdown Summary；
- Anchor Report；
- Backup Bundle；
- 临时 Store 恢复；
- 比较恢复结果；
- 自动验收报告；
- 人工测试清单。

完成自动化穷尽检查后，才允许进入 `AUTOMATION_COMPLETE` 或合并 Runtime Checkpoint。

## Slice 8：Desktop 验收与 Pilot

用户执行集中 Runtime Checkpoint 后：

- 记录结果；
- 修复；
- 自动回归；
- 选择少量真实副本事务；
- Pilot；
- 修复反馈；
- 最终验收；
- `MVP_SUCCESS`。

---

# 18. 十项 MVP 验收门槛

## TST-MVP-001 Capture

从当前 Logseq Block 创建 Capture，无需额外字段，保存原文与来源。

## TST-MVP-002 Independent Object

Task/MiniProject 状态存在 Domain Store，正文不出现大量属性。

## TST-MVP-003 Anchor

块移动后对象仍可打开；删除块不删除对象，而是产生可处理冲突。

## TST-MVP-004 Three-axis State

Task 可为 `ACTIVE + WAITING`，记录等待信息，并在到期后产生 `REVIEW_DUE`。

## TST-MVP-005 Partial Acceptance

接受 rewrite，拒绝 move 和 ownership，仍形成合法 Commit。

## TST-MVP-006 Audit and Undo

正文和状态变化可查看 before/after，并可安全撤销。

## TST-MVP-007 Now Work

只显示 Actionable 和高价值注意项，不倾倒完整历史。

## TST-MVP-008 Re-entry

Project 生成符合规范的重入包。

## TST-MVP-009 Export and Restore

恢复包能重建对象、关系、事件和 Anchor Report。

## TST-MVP-010 No-Agent Degradation

禁用 Agent 后，捕获、对象编辑、状态流转、手工 Proposal/Review、视图仍可用。

每项必须具有：

- 自动测试或明确 Desktop 人工测试；
- 对应规则 ID；
- 实测证据；
- 已知限制。

“代码存在”不等于通过。

---

# 19. 测试与质量门槛

## 19.1 Domain

- 对象契约；
- 状态矩阵；
- Condition 门槛；
- Signal 计算；
- 主归属唯一；
- 依赖循环；
- 关系合法性；
- Operation 依赖图；
- Schema 验证。

## 19.2 Application

- Command 输入输出；
- 版本冲突；
- rule_refs；
- SemanticCommit；
- compensation；
- Undo；
- Recovery。

## 19.3 Persistence

- Migration；
- Corruption；
- Backup；
- Restore；
- Append-only Audit；
- Pending Commit Recovery。

## 19.4 Logseq Adapter

自动测试使用 Fake Port，Desktop 做真实测试：

- Block CRUD；
- UUID；
- 页面改名；
- Block 移动；
- Block 删除；
- Unicode；
- 10 万字符长文本；
- Plugin Reload；
- Event Duplicate；
- Missing Anchor；
- Runtime Shape 异常。

## 19.5 UI

- 空状态；
- Loading；
- Error；
- Partial Acceptance；
- 高影响确认；
- Undo；
- No Agent；
- Runtime Shape Error；
- 无空栏目；
- 键盘基本可用性。

## 19.6 随机与性质测试

至少执行 100 组部分接受组合，验证：

- 不产生非法状态；
- 拒绝独立操作不会被偷偷应用；
- 依赖被正确阻止；
- Commit 后领域约束仍满足。

## 19.7 恢复演练

必须真实执行一次：

1. Export；
2. 在临时 Store 导入；
3. 对比对象；
4. 对比关系；
5. 对比事件；
6. 生成 Anchor Report；
7. 输出恢复差异。

不得在真实测试 Graph 上做不可恢复清空。

---

# 20. 真实阻塞定义

只有以下情况可以设为 `BLOCKED`：

- 正式插件无法加载；
- 无法读取用户主动选择的 Block；
- 无任何可恢复的持久化方案；
- 无法建立稳定 object_id 和 Anchor；
- 无法构建或测试 Domain Kernel；
- SemanticCommit 失败无法检测、补偿或标记冲突；
- 规范存在不可调和且可能破坏数据的冲突；
- 根级构建和测试基础设施完全不可运行。

下列永远不是阻塞：

- 内层 Graph dirty；
- 外部页面变化；
- 某个运行时字段尚未确认；
- FileStorage 位置未知；
- SQLite 不可用；
- 没有真实 LLM；
- DB Graph 未支持；
- 可选 UI 尚不完美；
- 某个正式 API 不支持上下文菜单；
- npm audit 存在 SDK 历史依赖漏洞，但当前功能可继续在本地测试。

---

# 21. 人工 Runtime Checkpoint 延迟与合并

发现待人工验证时：

1. 写入 `PENDING_RUNTIME_TESTS.md`；
2. 标记影响范围；
3. 使用防御性 Adapter 或 Feature Flag；
4. 继续所有无关工作；
5. 只有所有剩余实质工作都依赖人工结果时才返回。

`CONSOLIDATED_RUNTIME_CHECKPOINT` 必须：

- 聚合为尽量少的主题；
- 总时长不超过 30 分钟；
- 给出准确插件路径；
- 每步写明预期结果；
- 说明是否写 Graph；
- 给出清理办法；
- 指定需要用户反馈的字段；
- 说明失败时复制哪些日志；
- 给出用户回复后的恢复指令。

不得把整个 Capability Matrix 原样丢给用户。

---

# 22. 并行子 Agent

可以并行委派相互独立的工作：

- 规则提取和追踪；
- Domain 设计审查；
- Persistence 和恢复测试；
- Logseq Adapter 审查；
- UI 可访问性和信息密度审查；
- 故障注入与安全审查；
- TODO/FIXME 与规则覆盖审查。

要求：

- 明确文件边界；
- 避免并行修改同一文件；
- 主 Agent 等待全部结果；
- 主 Agent 审查并整合；
- 统一运行检查；
- 子 Agent 结论未经验证不得视为完成。

---

# 23. 统一检查入口

完善：

```text
./scripts/check.sh
```

至少执行：

- Package metadata；
- TypeScript；
- ESLint；
- Domain tests；
- Application tests；
- Persistence tests；
- UI tests；
- Capability Lab build；
- MVP Plugin build；
- Dist integrity；
- Repository boundary；
- Rule coverage；
- Git diff --check。

增加或完善：

```text
scripts/check-rule-coverage.*
scripts/check-mvp-boundaries.*
scripts/build-all.*
```

检查绝不要求内层 Graph clean。

---

# 24. 自动化穷尽检查

宣布 `AUTOMATION_COMPLETE` 前，必须：

1. 搜索 `TODO`、`FIXME`、`stub`、`placeholder`、`not implemented`；
2. 搜索 skipped/only/placeholder 测试；
3. 检查所有适用 MUST 的落点；
4. 检查全部 Slice 完成定义；
5. 检查所有失败测试和警告；
6. 检查每个 Feature Flag 的原因；
7. 验证每个待人工项确实不能自动验证；
8. 实际执行临时 Store 导出恢复；
9. 检查 Silent Overwrite 风险；
10. 检查 Pending Commit Recovery；
11. 检查插件卸载或关闭后正文可读性；
12. 检查外层 Git 状态；
13. 运行根级完整检查；
14. 搜索仍可独立完成的实质工作。

发现仍可独立完成的事项时，必须继续，不得返回。

---

# 25. Pilot 和最终成功

自动化与 Desktop 验收通过后，用户选择少量真实副本事务：

- 一个 Capture；
- 一个 Task；
- 一个 MiniProject；
- 一个 Project。

Pilot 观察：

- 捕获摩擦；
- Inbox 清理负担；
- Proposal 审查负担；
- 信息密度；
- Now Work 噪声；
- Re-entry 恢复效果；
- Waiting/Review 提醒；
- Undo 和冲突体验；
- 是否仍需手工维护大量字段；
- 是否发生数据异常。

只有同时满足以下条件才可宣布 `MVP_SUCCESS`：

1. 十项 MVP 验收通过；
2. 所有适用 MUST 有落点；
3. 高影响操作无越权；
4. 100 组部分接受性质测试通过；
5. 恢复演练通过；
6. 正文在插件关闭后可读；
7. 无已知 Silent Overwrite；
8. Desktop 人工验收完成；
9. 小规模 Pilot 完成；
10. Pilot 关键问题已修复或被明确接受；
11. 自动检查全部通过；
12. 外层仓库 clean；
13. 全部仅本地 Commit；
14. 明确未 push。

---

# 26. 非目标

本 Goal 不实现：

- 团队协作；
- 登录；
- 云同步；
- 企业权限；
- 日历；
- Gantt；
- 复杂 Kanban；
- 工时统计；
- 移动端；
- DB Graph 完整兼容；
- Git/Zotero 正式集成；
- MCP Server；
- 独立 Web 前端；
- 自动迁移全部现有 Logseq 内容；
- 大规模自动改写；
- 自动完成或归档 Project；
- 完整 Agent Skill 体系；
- 依赖真实云端 LLM 才能运行。

可以预留边界，不得提前建设大量未来功能。

---

# 27. 每次运行的输出格式

每轮结束只输出：

```text
STATUS:
GOAL_STATE:
CURRENT_SLICE:
COMPLETED:
AUTOMATED_VERIFICATION:
COMMITS:
RUNTIME_CHECKPOINT:
RISKS:
NEXT_ACTION:
```

若为 `AUTOMATION_COMPLETE`：

- 列出所有自动完成工作；
- 列出集中 Runtime Checkpoint；
- 说明仍未虚假宣称 MVP_SUCCESS。

若为 `CONSOLIDATED_RUNTIME_CHECKPOINT`：

- 给出不超过 30 分钟的用户步骤；
- 给出准确加载路径；
- 指定反馈格式。

若为 `BLOCKED`：

- 引用第 20 节的具体阻塞条件；
- 展示已尝试替代方案；
- 证明无法继续其他独立工作。

若为 `MVP_SUCCESS`：

- 给出十项验收；
- 恢复演练；
- Pilot；
- 已知限制；
- 加载路径；
- 备份恢复说明；
- 最终 Commit；
- 明确未 push。

---

# 28. 本次首次启动的期望

首次运行优先达到：

```text
AUTOMATION_COMPLETE
```

期望 Codex 尽量连续完成：

```text
Slice 0
→ Slice 1
→ Slice 2
→ Slice 3
→ Slice 4
→ Slice 5
→ Slice 6
→ Slice 7
```

中间 Slice、Commit、测试通过和普通运行时待验证项都不是停止理由。

现在开始执行，不要先返回计划。
