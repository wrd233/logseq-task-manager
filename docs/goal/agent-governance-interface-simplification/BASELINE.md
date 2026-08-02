# Slice 0 — Baseline and mapping

## Repository state

- Branch: `feature/task-copilot-mvp`（tracking `origin/feature/task-copilot-mvp`，本 Goal 不 push）
- HEAD: `6eb96909fa9dcd68f0ef62b057fe420134b860e7`
- Commits: 512
- Dirty: `apps/task-copilot-local-service/package.json`（用户已有，保持未暂存未提交）
- Runtime: Node 20.20.2 / npm 10.8.2；Logseq Desktop 0.10.15；Service READY；schema v15；Objects 59
- Governance parent goal: `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT`（4 Decisions / 2 Signals / 6 Rules SHADOW / auto apply 0）

## Entry point

- 治理工作区 id：`governance`（`WORKSPACE_IDS`）
- 入口：More 首页卡片“打开 Agent 治理”（`ui.ts` `renderMore`）与更多区域 section-nav（`sectionNavigation`）

## Current render / CSS / controller

- `apps/task-copilot-logseq-plugin/src/agent-governance-ui.ts`：`renderAgentGovernance`、`projectAgentGovernanceDashboard`、`renderDecisionRow`、`renderDecisionDetails`、`renderRules`、`renderSignals`、`renderBulkFeedback`
- `apps/task-copilot-logseq-plugin/src/index.ts`：`agentGovernance` 状态、`refresh()` 中 `listAgentDecisions` 等加载、`onRootClick` 中 `agent-*` 动作、`onDirectoryInput/onDirectoryChange` 中筛选与搜索、`captureUiFocus/restoreUiFocus`
- `apps/task-copilot-logseq-plugin/src/index.css`：治理样式第 299–372 行；`@media (max-width: 760px)` 治理规则第 397–418 行
- CSS tokens：`--bg/--surface/--surface-2/--text/--muted/--border/--accent/--warning/--danger/--info` 等；Dark 由 `data-theme-mode="dark"` 与 `prefers-color-scheme` 驱动

## Current DOM information architecture

```text
Agent 治理（governance workspace）
├─ header.agent-governance-head
│  ├─ eyebrow + h2 + 说明
│  └─ .agent-run-state（模式 + 写入边界 + 观察说明 + 3 个常驻开关按钮）
├─ .agent-metrics（6 格：24h / 7d / 自动应用 / 需要人工 / 执行失败 / 批量采样）
├─ .agent-bulk-feedback（≥2 选中时）
└─ .agent-governance-layout
   ├─ .agent-decision-stream（筛选 select + 搜索 input + 决策行）
   │  └─ 行：常驻“选择”按钮 + 主按钮（状态标记 / Outcome 标题 / evidenceSummary / 来源·规则·时间 / 右侧执行状态 + riskRoute）
   │     └─ 展开：4 等宽卡片（判断依据 / 反向信号 / 最接近备选 / 上下文与规则）+ 打开来源 + 事件历史（默认 open）+ 完整反馈表单（默认展开）
   └─ aside.agent-governance-side（常驻）
      ├─ 当前授权（规则列表）
      ├─ 弱信号
      └─ 导出治理证据（3 个常驻按钮：30 天 Skill / 60 天 / 180 天）
```

## Current user action map

`view governance`、`agent-governance-refresh`、`agent-decision-detail`、`agent-decision-select`、`agent-decision-selection-clear`、`agent-rule-pause`、`agent-global-pause`、`agent-observation-toggle`、`agent-expanded-context-toggle`、`agent-source-open`、`agent-feedback-submit`、`agent-bulk-feedback-submit`、`agent-export-skill`、`agent-export-review`、`agentDecisionFilter`、`agentDecisionSearch`。

## Current tests

- `tests/agent-governance-ui.test.ts`：dashboard 排序与指标、筛选搜索、选中详情/反馈/批量、loading/error/empty/export、More 入口与 shell。
- `tests/agent-governance-change-queue.test.ts`：观察队列 latest-value / 容量 / 失败隔离。
- 服务与领域：`apps/task-copilot-local-service/tests/agent-governance-*.test.ts`、`packages/domain/tests/agent-governance-*.test.ts`（本 Goal 不改动领域与服务语义）。

## Current screenshot flow

- 物理 Logseq Desktop 0.10.15（正式 Plugin 加载路径 `tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin`）。
- 1000×720（普通）与物理 720×520（窄宽）窗口；Light/Dark 通过插件外观偏好切换并 reload。
- 提交至 `docs/goal/agent-decision-governance/screenshots/`：light / dark / bulk / detail / empty / failure，共 6 张。
- 限制：无自动化截图流水线；实现 Agent 不评价视觉。

## Target information architecture（本 Goal）

```text
Agent 治理
├─ 状态行：观察中 · 自动写入关闭 · 扩展联想开启    [设置 → Popover：观察/扩展联想/全局暂停]
├─ 紧凑摘要：过去 24 小时处理 N 条 · 需要查看 N · 异常 N · 正式写入 0   [24h/7d]
├─ Tabs：决策（默认） | 规则 | 复盘
├─ 决策：筛选/搜索 + 全宽 Decision 流（来源标题 → Agent 判断 → 主状态·时间·中文规则弱化）
│   ├─ 批量模式（显式进入）：复选框 + 已选数量 + 取消 + 兼容分组批量反馈
│   └─ 展开详情：Agent 的判断 / 为什么 / 对正式系统的影响 + 打开来源 + 技术详情（折叠）+ 事件历史（折叠）+ 快速反馈
├─ 规则：中文名称 / 当前权限·命中数 / 暂停恢复 / 全局模式与版本摘要
└─ 复盘：Review Signal 用户化 + 导出复盘素材（类型/范围选择）
```

## Slice 0 evidence

- 基线命令与文件清单见本文件；基线 commit 后进入 Slice A。
- 原始用户详细设计文档本轮不在工作区；权威契约已由 `docs/goal/agent-decision-governance/GOAL.md`（Design-to-reality differences）与 `DECISIONS.md` 冻结记录，不视为缺口。
