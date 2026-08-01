# Skill Log — Global Object Directory

## 已读取的仓库 Skill

| Skill | 版本 | 用途 | 结论 |
|---|---|---|---|
| task-copilot-core | 1.0.0 | 外部上下文/Proposal 边界 | 本 Goal 不产生外部 Agent Proposal；保持“Proposal 非事实、提交≠应用” |
| recover-context | 1.3.0 | 重入/恢复上下文 | 目录只做快速发现与打开原文，不替代 Project Re-entry |
| design-project | 1.3.0 | Project 设计/Closure 机器形状 | Sprint D 的 Project Closure 入口沿用既有 HIGH Proposal 链 |
| mini-project-modeling | 1.3.0 | MiniProject Grill | 目录不复制 Grill；只保留“梳理小项目”次级入口 |
| project-creation-modeling | 1.6.0 | Project 创建 Grill | 目录不复制创建流程；“新建项目/升级为项目”保持次级入口 |

## plan-design-review（2026-08-01，适配审查）

执行方式说明：本仓库与宿主环境没有 gstack 的 `sections/review-sections.md`，
且当前会话不在 Plan mode、无 AskUserQuestion 工具；按 Skill 的 interactive fallback，
以 prose 决策简报完成设计审查，并把限制与建议记录在本日志。审查输入：

- Goal §4 核心信息模型、§6–11 功能与安全合同；
- 不可变边界：Lifecycle/Condition/Focus/Now 语义分离、Proposal/Review/Commit 安全链、
  Anchor/Durable Origin 唯一恢复、UI 不写 Store、760px 可用；
- 当前基线证据（22 对象、51 可见按钮、4px 溢出、行内平铺操作）。

### 推荐方案 A：紧凑目录行 + 次级 overflow（采纳）

- 页面名“全部事项”，说明“查看任务、小项目、项目和其他正式记录。”；
- 顶部一条工具区：标题搜索（250ms 防抖）+ 注意力 chips（全部/当前关注/在 Now）+
  类型/Lifecycle/Condition 下拉 + 排序下拉 + 清除 + 结果数量；
- 每行：标题（有 Anchor 时可点击打开原文）+ 类型 · Lifecycle（OPEN 时才显示 Condition）
  + 低权重关注/Now 标记 + 小字更新时间/期限 + 显式“打开原文” + “更多”overflow
  （关注切换、取消/重开/完成/归档/调整项目/查看详情按类型与 Lifecycle 动态提供）；
- 760px：工具区换行堆叠，行内单列，无横向滚动；
- 空/加载/失败均为 scoped state，不污染全局 banner。

理由：连续浏览成本最低；操作后置符合“前台克制”；信息轴（类型/状态/注意力/来源/操作）
可分区；760px 不依赖宽表格；可扩展 50+ 行。

初始评分：IA 7 / 布局 6 / 层级 7 / 交互 6 / 响应式 7 / 可访问性 6 / 约束 8 →
修正后：IA 9 / 布局 9 / 层级 8 / 交互 9 / 响应式 9 / 可访问性 9 / 约束 9。

### 被拒绝方案 B：宽表格（列：类型/Lifecycle/Condition/Focus/Now/更新/操作）

拒绝理由：Goal 明确“不依赖横向大表格才能使用”“不形成按钮墙”；760px 下表格必换行或
横向滚动；与认知审计“后台控制台感”结论冲突。

### 被拒绝方案 C：全尺寸卡片（复制 Now 卡样式）

拒绝理由：Goal 明确“全部事项不应复制 Now 的大卡片和推荐依据”；50+ 卡片滚动疲劳更高；
卡片视觉权重会与 Now 竞争。

### 决策记录

| 决策 | 结论 |
|---|---|
| 用户层名称 | “全部事项”（替换“正式事项与创建”）；技术文档保留“正式对象” |
| 列表 vs 表格 vs 卡片 | 紧凑行列表 |
| 操作层级 | 默认行内只保留标题/状态/标记/打开原文；维护操作进“更多”overflow |
| Condition 显示 | 仅 OPEN；非 OPEN 默认只显示 Lifecycle，历史 Condition 进技术详情 |
| 关注/Now 标记 | 低权重文本/chip，不用强边框/高饱和色；语义可区分 |
| 打开原文 | 显式“打开原文”按钮 + 有 Anchor 时标题可点击；复用 Durable Origin |
| 筛选持久化 | 默认 session-only；不持久化正式事实；reload 保留由 Sprint E 决定 |
| 排序 | 默认“最近更新”；提供标题/类型/Lifecycle/期限/关注优先 |

## 后续审查计划

- Sprint E 结构性收口后运行 gstack `design-review` 与 Microsoft
  `frontend-design-review` 的适配版（STRUCTURAL_REVIEW_PASS / VISUAL_GATE_PENDING）；
- 最终 `VISUAL_GATE_PASS` 只由独立视觉 reviewer 根据
  `VISUAL-GATE-REQUEST.md` 与证据包签发，Codex 不代签。
