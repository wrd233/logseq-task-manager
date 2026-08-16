# Phase 17 — ProjectIntent & Multi-turn Conversation Golden Path

> 状态：2026-08-16 实机验证
> 环境：Logseq Desktop 0.10.15 + repo `logseq/` + `/tmp/tc-demo` Kernel

## GP17-1：ProjectIntent recommendation → Trusted USER

1. External Agent 从 Project ObjectContext 看到 children 但缺少稳定 Objective。
2. Agent 只建议能由现实支撑的 Objective；证据不足时不生成 KR。
3. Agent 创建 `UPDATE_PROJECT_INTENT` DecisionPackage（绑定 formal version + intent revision）。
4. 用户从 Plugin「待我确认」点「确认」。
5. 执行后 ProjectIntent revision+1，Now / ObjectContext / WorkMap 立即更新；无需用户口头同步。

证据：`phase17-project-intent.test.ts`；实机 `/tmp/tc-phase17-ux/project-daily.json`。

## GP17-2：Project Re-entry with ProjectIntent

- Morning：`object context <project>` 第一屏可见 Objective、currentPhase、1–3 child frontier。
- UI Object Surface 顶部显示目标/阶段/结果边界，不埋在正式状态详情。
- Now Project card 显示 `目标：…；当前：…`。
- WorkMap Project 行 secondary line 显示 currentPhase。

证据：`/tmp/tc-phase17-ux/ui/v3-object-project.png`、`v3-workmap.png`。

## GP17-3：Multi-turn MiniProject conversation

1. “聊聊这个” → Agent 现实诊断，不全文复述 pack。
2. “下一步是什么” → 给判断和唯一缺口。
3. “可以，按你说的改” → External Proposal 低风险 apply（current_focus）→ `COMMITTED`。
4. harness 刷新 ObjectContext，下一轮基于 formalVersion N+1。
5. “只是聊不要改” session 保持 0 mutation；用户纠正后 Agent 放弃旧判断。

证据：`/tmp/tc-phase17-ux/multiturn-eval.json`。

## GP17-4：ProjectIntent boundary handoff and resume

1. 用户表达“最终最重要的是平台稳定上线”。
2. Agent 不把讨论当授权；输出 boundaryDecision。
3. harness（confirmBoundary=true）通过 Plugin trusted channel 确认并执行。
4. 下一轮 Agent refresh 后基于新 ProjectIntent 继续，无需用户说“我已经点了”。

## GP17-5：Workspace coexistence

- Side panel 宽度 clamp(320px,44vw,460px)，不与 Logseq 主工作区重叠超过合理范围。
- 打开 panel 后 Logseq right sidebar 仍可用；小窗口 960×640 可操作。
- 截图：`/tmp/tc-phase17-ux/ui/v3-*.png`（不入 Git）。
