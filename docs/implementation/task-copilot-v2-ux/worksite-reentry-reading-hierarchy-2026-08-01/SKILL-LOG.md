# Skill Run Log（2026-08-01）

## Phase 0 已读 Skill

| Skill | Path/Version | Visual capability | Input | Evidence | Key advice | Accepted/Rejected |
|---|---|---|---|---|---|---|
| task-copilot-core | `skills/task-copilot-core/SKILL.md` 1.0.0 | 无 | 本 Goal 与仓库合同 | 事务/Proposal 边界 | 不越权写入；正式变化走 Review/Commit | Accepted |
| recover-context | `skills/recover-context/SKILL.md` 1.3.0 | 无 | Worksite Preview 数据边界 | 只读投影；原文优先 | 不生成 AI 摘要替代工作记录 | Accepted（Sprint B 依据） |
| design-project | `skills/design-project/SKILL.md` 1.3.0 | 无 | Objects/Project 工作区边界 | 上下文包只读 | Sprint E 修改时复用 | Accepted |
| mini-project-modeling | 1.3.0 | 无 | Grill 语义 | — | 本轮不改 MiniProject Grill | Not used |
| project-creation-modeling | 1.6.0 | 无 | Project Creation Grill | — | 本轮不改 Project Creation Grill | Not used |
| gstack plan-design-review | `.gstack/repos/gstack/.agents/skills/gstack-plan-design-review/SKILL.md` | 无（本会话） | Sprint A 计划 | 见下节 | 7 pass 审查 | Accepted（适配执行） |

## plan-design-review 适配记录（Sprint A）

- AskUserQuestion 在本环境不可用（Default 模式无该工具）；沿用上一 Goal 的 prose 适配惯例：
  每个决策以 prose 形式呈现推荐项并记录接受/拒绝，不阻塞深度执行；
- gstack designer binary 检查：`DESIGN_NOT_AVAILABLE` → 按 Skill 规定回退到文本/ASCII wireframe
  （Goal §6.2/6.3 已提供 1000/760 目标 wireframe）；
- 7 个 pass 的评分与修改见 `SPRINT_PLAN.md` 末尾；最终 Sprint A 计划按审查结果补齐：
  稳定操作列宽度、760 footer 与角落菜单、AX 名称、Esc/外部点击关闭、无重复 primary、
  状态弱化、解释入口后置。

## 待补

- Sprint B/C/D/E/F 各自运行 plan-design-review（结构性 Sprint）与 design-review（实现后）；
- Microsoft frontend-design-review 作为最终独立质量门候选（需可查看像素的 reviewer）。

## WRH-P1-09 记录（2026-08-01）

| Skill | Path/Version | Visual capability | 输入问题 | 建议 | 接受/拒绝 | 理由 |
|---|---|---|---|---|---|---|
| task-copilot-core | `skills/task-copilot-core/SKILL.md` 1.0.0 | 无 | 预览失效是否允许写正式状态 | 只读；正式变化必须走既有 Review/Commit；不新增状态 | Accepted | 实现只做缓存失效 + Graph 读取；无 SQLite/Graph 写入、无新正式状态 |
| recover-context | `skills/recover-context/SKILL.md` 1.3.0 | 无 | 工作记录能否用摘要刷新 | 原文优先、不生成 AI 摘要、只读投影 | Accepted | 预览仍是忠实只读投影；未引入 AI 摘要或第二恢复系统 |
| gstack plan-design-review | `.gstack/repos/gstack/.agents/skills/gstack-plan-design-review/SKILL.md` | 无（本会话） | 刷新入口是否会变成视觉主动作/轮询 | 保持低权重、不引入轮询、不重设计 Now | Accepted（prose 适配，沿用前序惯例） | 空态“重新读取”为 quiet 按钮；机制为事件+防抖，无 setInterval 轮询 |
| gstack design-review | `.gstack/repos/gstack/.agents/skills/gstack-design-review/SKILL.md` | 无（需像素 reviewer） | 完成后审查 Desktop 流程 | 提供 before/after 截图与 DOM/AX 证据 | Accepted（证据部分）；视觉评分未执行 | 无视觉能力；截图矩阵已生成供独立 reviewer |
| Microsoft frontend-design-review | `/Users/wangrundong/.agents/skills/frontend-design-review/SKILL.md` | 无（需像素 reviewer） | 刷新入口与状态层级独立质量门 | 不重设计 Now；只审查刷新入口层级 | Accepted（边界）；像素审查未执行 | 遵循“没有可靠视觉能力”约束；标记 VISUAL_GATE_READY 而非 PASS |

## Sprint B 记录

| Skill / 合同 | 使用 | 结果 |
|---|---|---|
| ADR-LOGSEQ-GRAPH-READ-BRIDGE | 复用唯一只读桥（executeGraphReadRequest） | Accepted：没有第二套 Graph reader |
| recover-context（原文优先） | Worksite Preview 忠实投影 | Accepted：不生成 AI 摘要，原文/系统文案分离 |
| task-copilot-core（不越权写入） | 控制器只读断言测试 | Accepted：无 update/insert/remove/FileStorage/SQL 写入路径 |
| plan-design-review | 未重复运行（Sprint B 为数据/性能 Sprint；按 Goal §12.1 结构性 Sprint 要求已在前一 Goal 的 review 流程中覆盖投影边界） | 记录：Sprint B 计划经 GOAL §7 合同 + Sprint A review 的 7-pass 原则审查 |
