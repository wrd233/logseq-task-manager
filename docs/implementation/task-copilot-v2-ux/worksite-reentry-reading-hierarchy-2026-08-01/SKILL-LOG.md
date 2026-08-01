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

## Sprint B 记录

| Skill / 合同 | 使用 | 结果 |
|---|---|---|
| ADR-LOGSEQ-GRAPH-READ-BRIDGE | 复用唯一只读桥（executeGraphReadRequest） | Accepted：没有第二套 Graph reader |
| recover-context（原文优先） | Worksite Preview 忠实投影 | Accepted：不生成 AI 摘要，原文/系统文案分离 |
| task-copilot-core（不越权写入） | 控制器只读断言测试 | Accepted：无 update/insert/remove/FileStorage/SQL 写入路径 |
| plan-design-review | 未重复运行（Sprint B 为数据/性能 Sprint；按 Goal §12.1 结构性 Sprint 要求已在前一 Goal 的 review 流程中覆盖投影边界） | 记录：Sprint B 计划经 GOAL §7 合同 + Sprint A review 的 7-pass 原则审查 |
