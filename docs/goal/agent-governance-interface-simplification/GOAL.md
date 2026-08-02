# Agent Governance 前端信息架构减法 Goal

## Product outcome

把当前“多个面板同时展开的 Agent 综合控制台”重构为以“最近 Agent 决策”为唯一日常主体、按需渐进展开规则、复盘、系统控制和技术诊断的高信息密度治理界面。用户进入页面后首先理解：Agent 最近处理了什么；哪些内容真正需要自己看；Agent 对某条原始记录作出了什么判断；是否对正式任务系统产生了影响。

本 Goal 不重新设计 Agent 系统、不重写治理模型、不改变 Agent 治理的业务语义、安全边界、Shadow 门槛、写入权限与领域状态机。当前仍为 EXPERIMENT / SHADOW；14 天 / 200 条真实 Decision 门槛与独立视觉结论仍然有效；不得将任何规则提升到 Guarded Apply 或 Auto Apply；不得用 Fixture、截图或 UI 测试伪造真实证据积累。

## Authority order

1. 用户提供的《Task Copilot Agent 决策治理模块详细设计文档》（CP-0 已完整阅读，本 Goal 目录执行期间原始附件不在工作区，权威契约见 `docs/goal/agent-decision-governance/GOAL.md` 的 Design-to-reality differences 与 `DECISIONS.md`）；
2. 既有 Domain、ADR 与 Safety Contract；
3. 当前代码、运行进程与 Desktop 证据；
4. 本目录与 `docs/goal/agent-decision-governance/` 的状态文档。

## Frozen baseline（2026-08-02）

| 项目 | 执行事实 |
|---|---|
| branch | `feature/task-copilot-mvp` |
| HEAD | `6eb96909fa9dcd68f0ef62b057fe420134b860e7` |
| commit count | 512 |
| dirty | `apps/task-copilot-local-service/package.json`（用户已有，不恢复、不暂存、不提交） |
| governance parent goal | `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT`（CP-5 时间门槛进行中） |
| schema | v15；Objects 59；4 Decisions；2 Review Signals；6 Rules 全部 SHADOW；自动应用 0 |
| remote | 不 push；不配置 remote |
| build/runtime | Node `20.20.2` / npm `10.8.2`；Logseq Desktop `0.10.15` |

## Delivery slices

- Slice 0：基线与映射（本目录 + BASELINE.md）。
- Slice A：决策 / 规则 / 复盘次级视图 + 默认决策 + 设置入口 + 键盘/ARIA。
- Slice B：页头与态势减法（状态行、紧凑摘要、范围切换、零值弱化）。
- Slice C：Decision 流重构（来源主标题、单一主状态、显式批量模式、无选中全宽）。
- Slice D：详情与反馈渐进披露（Agent 的判断 / 为什么 / 对正式系统的影响；技术详情与事件历史折叠；快速三档反馈）。
- Slice E：规则与复盘归位（规则独立视图、全局模式摘要、Review Signal 用户化、导出合并）。
- Slice F：响应式、无障碍、Light/Dark 截图、文档与追踪矩阵收口。

## Terminal states

- `NONVISUAL_FRONTEND_IMPLEMENTATION_COMPLETE`
- `CONSOLIDATED_NONVISUAL_FRONTEND_CHECKPOINT`
- 严格定义的 `BLOCKED`

视觉结论只能达到 `VISUAL_GATE_READY` / `READY_FOR_INDEPENDENT_REVIEW`，执行 Agent 不得自授视觉 PASS。

## Complex boundaries (red lines)

禁止：新建完整 Design System；为 Tabs/Drawer 引入大型 UI 框架；新全局一级导航；重写 Agent Decision Governance 后端；第二套 Rule Authority；新增领域状态；改变 Shadow/Guarded 状态机；外部模型回灌；新 Agent 编排器；可视化规则编辑器；大量用户可配置密度参数；为每个小区域独立建页；把内容改成更多卡片；为截图写永久业务分支。

允许有边界的局部抽取：`agent-governance-view.ts` / `agent-governance-presenter.ts` / `agent-governance-copy.ts` / `agent-governance.css`，只处理 Agent Governance，不重构整个 Plugin UI。
