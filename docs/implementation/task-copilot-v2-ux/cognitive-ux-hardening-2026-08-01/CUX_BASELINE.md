# CUX Baseline（2026-08-01）

> 依据：`AGENTS.md`、Goal 目标文件、`docs/implementation/current-status.md`、traceability matrix、
> 交接包 `Task-Copilot-Cognitive-UX-Hardening-无视觉模型交接包`（已解压到
> `~/.codex/attachments/4c802414-6f29-4569-b825-8dd50d6c88f9/handover/`）。

## 环境事实

| 项目 | 当前值 | 证据 |
|---|---|---|
| 日期 | 2026-08-01（Asia/Shanghai） | 本会话 |
| 分支 | `feature/task-copilot-mvp`（跟踪 `origin/feature/task-copilot-mvp`） | `git status --short --branch` |
| HEAD | `179a6bc62537a38711f06466d03201d3f5b6b5a0`（feat(ux): harden active cognitive flows） | `git log --oneline -8` |
| 工作区 | 仅用户既有 `apps/task-copilot-local-service/package.json` 修改（4+/1-），未暂存 | `git diff --stat` |
| 嵌套 Graph | `logseq/` 被外层忽略；dirty 只作信息展示，不提交 | check.sh 输出 |
| Logseq | `0.10.15`，正在运行（Renderer PID 76825） | `defaults read` + `ps` |
| Launcher | `com.task-copilot.launcher` LaunchAgent PID 1059 运行中 | `launchctl list` |
| Local Service | `~/Library/Application Support/Task Copilot/bin/service.js`，DB `tmp/runtime/manual-v2/task-copilot.sqlite`，descriptor `runtime/1560878c9a97b680fcb51466602c1b88.service.json`，owner PID 1059 | `ps aux` |
| Node（检查用） | `/opt/homebrew/opt/node@20/bin/node` v20.20.2；默认 node v25.6.1 不受支持 | `node --version` |
| 根级检查 | `PATH=...node20 ./scripts/check.sh` → **PASS**（typecheck/lint/tests/build、Plugin/架构边界、145 rules、恢复演练、仓库边界） | 本会话输出 |
| 安装包 | 稳定 r8 payload（commit `89288614258c`）为审计时安装；当前 HEAD 构建尚未装入 Desktop | 状态文档 + VERIFICATION.md |

## 历史证据兼容性

- 审计基线 `08825d8` → 原型 `9cb2927` / `d4b4613` → 审计地图 `d025ca4` → 当前 `179a6bc` 已合并全部原型，并新增：
  - `beginUiAction()`：每个新动作清空 `message` / `latestError` / `recentActionCommitId` 及 Candidate/Provider 面板瞬时结果；
  - `scoped-outcome.ts`：`actionId + scope + kind(notice/error/result) + lifecycle`，`outcomeForScope` 阻止跨工作区残留；
  - `durable-origin-storage.ts`：按 Graph key 持久化 OriginRouteToken（PAGE/BLOCK + pageUuid + pageName fallback），启动时 `restoreBusinessOriginForCurrentGraph` 只读回内存；
  - `renderApp`：任何 `actionDialog` 存在时只渲染 `active-surface-shell`，底层工作区不进入 DOM。
- 因此本轮的“仍开放”清单必须以当前 HEAD 重新判定，不能直接沿用审计结论。

## 当前复验表（结构事实）

| CUX ID | 当前状态 | 依据（代码/测试） | Gate |
|---|---|---|---|
| CUX-P0-01 | 部分存在：无候选被当作 error | `prepareV2ExplicitCandidateDiscovery` 在 `candidates.length===0` 时 throw；面板渲染红色“这次检查没有完成”；ready 空分支存在但不可达 | REPRODUCED_CURRENT（结构） |
| CUX-P0-02 | 部分实现：持久化+读回已有；reload 后自动恢复路由/fallback 缺失 | `durable-origin-storage.ts` + `restoreBusinessOriginForCurrentGraph`；启动仅装入内存，不导航 | PARTIAL（结构）；Desktop 未复验 |
| CUX-P1-01 | 已实现（结构）：所有 dialog 均为 active surface；确认面 1 checkbox + 1 primary + 1 cancel | `renderApp`、`renderActionDialog`、`ui.test.ts:2807` 活动面测试 | IMPLEMENTED（结构）；Desktop 复验待做 |
| CUX-P1-02 | 部分实现：Grill 已隔离底层工作区；但首屏仍先显示长理解/事实/推断，问题和输入不在首位 | `renderActionDialog` grill 分支（`ui.ts:1421-1521`） | PARTIAL（结构） |
| CUX-P1-03 | OPEN：对象工作区仍暴露 SQLite/Anchor/Association/Lifecycle/Primary Ownership/大写类型/版本号 | `ui.ts:436-457`（areaCreator、associationCreator、ownershipList、object-row） | OPEN（结构） |
| CUX-P1-04 | 基本实现：新动作清瞬时结果、scope 过滤、取消下载不再假成功；残余点是“无候选→error” | `beginUiAction`、`scoped-outcome.ts`、`export-diagnostics` 文案 | IMPLEMENTED（结构），随 P0-01 收口 |
| CUX-P2-01 | OPEN：Now 首屏筛选/卡片/披露密度未动 | `renderNow`（`ui.ts:278-394`） | OPEN |
| CUX-P2-02 | OPEN：Provider 失败只有“重试/查看系统状态”，无结构化分类 | `providerState.message` 渲染 | OPEN |
| CUX-P2-03 | OPEN_MANUAL_GATE：datetime-local AX 输入链 | 历史审计 06/07 | 人工 Gate |
| CUX-P3-01 | OPEN：Block 右键入口仍埋在长原生菜单；命令面板已有高频入口（历史 P0-J） | bootstrap 注册 | OPEN |
| CUX-P3-02 | OPEN：Review eyebrow 直接显示原始 `record.updatedAt` ISO | `ui.ts:753` | OPEN |

## Skill 可用性（本会话）

- gstack `plan-design-review`：`/Users/wangrundong/.gstack/repos/gstack/plan-design-review/SKILL.md`（已读；无 AskUserQuestion 环境，采用 prose 适配执行，记录于 SKILL_RUN_LOG）。
- gstack `design-review` / Microsoft `frontend-design-review`：同仓库 Skill 可用性需按需确认；当前会话不冒充视觉判断。
- 仓库专用：`skills/{task-copilot-core,recover-context,mini-project-modeling,project-creation-modeling,design-project}/SKILL.md` 已读。

## 结论

当前 HEAD 已解决审计中“聚焦确认隔离”“跨动作瞬时结果清理”“Durable Origin 持久化”的结构主体；
真正剩余的实质工作集中在：P0-01 空结果中性化、P0-02 reload 自动恢复与 fallback、P1-02 单问题首屏、
P1-03 日常层术语后置，以及 P2/P3 尾项。后续 Sprint 按此推进，每个 Sprint 保留独立视觉 Gate。
