# Agent Governance 前端减法 Decisions

## AGI-D-001 — 复用现有渲染、状态与动作链，不引入路由框架

次级视图（决策 / 规则 / 复盘）是治理工作区内部的模块级状态 `agentGovernanceView`，默认 `decisions`。刷新与 rerender 保持当前视图；不新增 URL 路由或全局导航。

## AGI-D-002 — 设置与运行控制进入 Popover

Agent 观察、扩展联想、全部写入暂停三个开关从页头常驻卡移入“设置 / 运行控制”Popover（渲染为右对齐的局部分区，使用现有 token，避免固定 overlay 溢出）。页头只保留一行紧凑状态与“设置”按钮；严重状态（观察关闭 / 全局暂停）在状态行以警告 tone 表达。

## AGI-D-003 — Decision 行三行扫描结构

`[来源标题]`（安全回退：未命名来源）→ `Agent 判断/建议：动作` → `主状态 · 时间 · 中文规则（弱化）`。不显示常驻选择框；批量反馈显式进入后显示复选框、已选数量和取消入口。

## AGI-D-004 — 单一主状态

列表层只保留一个主状态（已记录 / 需要查看 / 异常 / 观察中 / 已自动处理 / 未执行等）。Outcome、Execution Status、Risk Route 只在详情与技术详情中分别解释。

## AGI-D-005 — 详情自然语言三段落 + 折叠技术详情

详情按“Agent 的判断 / 为什么 / 对正式系统的影响”组织；判断依据、反向信号、最接近备选并入“为什么”；Rule ID、Skill 版本、Context Tier、Tokens、截断、Source UUID、事件码、快照证据全部进入默认折叠的“技术详情”；事件历史默认折叠。

## AGI-D-006 — 快速三档反馈

默认“正确 / 基本正确 / 错误”三按钮；正确一键提交（`rating=CORRECT, action=THIS_DECISION_ONLY`）；基本正确 / 错误展开修正类型、处理范围与备注。Undo 与反馈保持分离。

## AGI-D-007 — 规则与复盘独立视图

规则视图以中文名称、实际权限、命中数、暂停 / 恢复为主体；全规则同模式时只在顶部汇总一次；同 Skill 版本只在顶部或技术详情显示。复盘视图把机器表达用户化（“可能值得以后复盘”），导出合并为“导出复盘素材”单入口 + 类型 / 范围选择。

## AGI-D-008 — 无选中时全宽

未选中 Decision 时不渲染右侧规则 / 弱信号 / 导出墙；三者分别进入规则视图、复盘视图和复盘导出入口。

## AGI-D-009 — 边界抽取

新增 `agent-governance-copy.ts`（用户语言与状态合成）与 `agent-governance-presenter.ts`（纯投影 / 指标 / 排序）；渲染与动作仍集中在 `agent-governance-ui.ts` 与既有 `index.ts` 动作链。CSS 治理段重构但仍留在 `index.css`，避免新文件加载链。

## AGI-D-010 — 自动化视图合同

渲染测试覆盖视图切换、默认折叠、批量模式、安全回退、单主状态、键盘语义；响应式与溢出通过 headless Chrome 静态 fixture 在 720×520 / 1024×720 / 1440×900 验证 `documentElement.scrollWidth <= clientWidth` 与治理根容器相同约束；Light/Dark 截图用同一 fixture 生成，作为独立视觉审阅证据。

## AGI-D-011 — 窄宽 app-shell 宽度修正

视口检查发现 `@media (max-width: 760px)` 下 `.app-shell { width: 100vw }` 在带经典滚动条环境中会产生横向溢出（100vw 包含滚动条宽度）。改为 `width: 100%`（配合 `margin: 0`），在 overlay 与经典滚动条环境中均不溢出；这是本 Goal 范围内为满足 720×520 无横向滚动硬合同的最小全局样式修正。
