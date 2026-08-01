# Goal Status: Task Copilot Global Object Directory & Lifecycle Visibility

> 来源：`/Users/wangrundong/.codex/attachments/cf49affc-31fc-462c-ba35-b7835ad980ff/goal-objective.md`

## 状态

```text
Goal Status: ACTIVE
Phase 0: COMPLETE (2026-08-01)
Sprint A: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint B: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Recommended initial status: DRAFT → ACTIVE
```

激活条件已满足：

- Phase 0 当前基线核验完成（见 `BASELINE.md`）；
- 未发现与本 Goal 冲突的正在收口 Goal：V2 底座（MVP_SUCCESS/COMPLETE）、
  Cognitive UX Hardening（COMPLETE，ACCEPTED_WITH_FOLLOWUPS）、
  Worksite Re-entry & Reading Hierarchy（VISUAL_GATE_READY，只剩独立视觉 reviewer）
  均已收口或处于非冲突状态；本 Goal 正是其
  `Objects 工作区进一步去后台化` 与 `正式对象全量可见` 的承接目标。

## Phase 0 完成清单

1. 已阅读根 `AGENTS.md`、`CONTEXT.md`、`docs/implementation/current-status.md`、
   `v2-traceability-matrix.md`、`open-decisions.md`、`docs/goal/MVP_STATUS.md`、
   `docs/runtime/V1_MVP_PILOT_REPORT.md`、相关 ADR 与局部 AGENTS.md；
2. 已阅读仓库 `skills/**/SKILL.md`（task-copilot-core、recover-context、
   design-project、mini-project-modeling、project-creation-modeling）；
3. 已阅读上一 Goal 最终合同（Cognitive UX Hardening Final Acceptance、
   Worksite Re-entry GOAL_STATUS / Final Acceptance / Evidence、Cognitive Audit README）；
4. 已核对 branch / HEAD / worktree：`feature/task-copilot-mvp` @ `cbc8442`；
   唯一未提交修改为用户既有 `apps/task-copilot-local-service/package.json`（保留不提交）；
5. 已核对 Plugin（tmp/releases WRH 构建 `cbc8442` 稳定目录）、Local Service
   （Launcher pid 1033 / Service pid 29787、`tmp/runtime/manual-v2/task-copilot.sqlite`）、
   Logseq `0.10.15`、测试 Graph `logseq/`；
6. 已定位“正式事项”入口与渲染代码（`ui.ts renderObjects`、`sectionNavigation`、
   `index.ts model()` 的 v2Objects / nowWork / anchors 加载）；
7. 已统计当前对象数量与类型分布（22 个对象、12 Task / 6 MiniProject /
   2 Project / 2 Output，全部 OPEN+ACTIONABLE；2 Focus、27 Anchor、0 Primary Ownership）；
8. 已核对 Lifecycle / Condition / Focus / Now / Anchor 数据来源
   （SQLite objects / focus_selections / anchors / primary_ownerships；
   `/now-work` 查询投影；`/focus` 尚无只读列表端点）；
9. 已核对加入／移出 Focus 的现有 UI 入口（Now 卡、Project Re-entry、Block 右键），
   以及对象列表缺少关注入口；
10. 已核对生命周期操作（取消/重开/完成小项目/项目路由）、关闭对象仍显示旧 Condition
    （代码路径确认，当前数据无关闭对象）、无归档 UI（领域已支持 COMPLETED/CANCELLED→ARCHIVED）；
11. 已核对打开原文链路（`v2-open-primary-anchor` + Durable Origin + OriginRouteController）；
12. 已生成 before 截图与机器证据（Light/Dark × 1000/760 + 原生 1440，见
    `tmp/runtime/global-object-directory/baseline/`）；
13. 已按 plan-design-review 适配审查形成推荐方案与被拒绝方案（见 `SKILL-LOG.md`）；
14. 已建立本目录基线文档：`BASELINE.md`、`ISSUE-MATRIX.md`、`EVIDENCE-INDEX.md`、
    `SKILL-LOG.md`、`QUERY-PROJECTION-CONTRACT.md`、`VISUAL-GATE-REQUEST.md`。

## 实施分段（原子边界）

- Sprint A：全局目录查询投影 + 打开原文 + 生命周期显示合同 + 非 OPEN 隐藏 Condition + 基础紧凑列表；
- Sprint B：标题搜索 + 全部/关注/Now + 类型/Lifecycle/Condition 筛选 + 排序 + 清除/计数/空态；
- Sprint C：Focus 与 Now 管理闭环（含 Service `GET /focus` 只读端点）；
- Sprint D：次级维护与详情层（overflow、生命周期操作、Closure/归档核验）；
- Sprint E：响应式、可访问性、视觉收口与 50+ 对象性能；
- 收口：根级检查、Desktop Gate、机器证据、VISUAL_GATE_REQUEST。

## 进度记录

- Sprint A（`6bd165a` 文档基线 / `d668da1` 实现）：全局目录只读投影
  （`global-object-directory.ts`，纯函数）、入口改名“全部事项”、紧凑目录行、
  非 OPEN 隐藏 Condition、行内操作移入“更多”、打开原文真实 Desktop 通过
  （锚点路由跳转 + 主 UI 隐藏）。Plugin 479/479、根级 check PASS。
  证据：`tmp/runtime/global-object-directory/sprint-a/`。
- Sprint B（未提交）：标题搜索（250ms 防抖 + IME composition 保护）、
  全部/当前关注/在 Now、类型/状态/当前情况筛选、六种排序、清除/计数/空态；
  真实 Desktop 复验搜索“发布”→1/22、类型→12/22、空态、清除与标题排序。
  “当前关注”在 Sprint C 接通正式 `GET /focus` 前按合同显示 0/22。
  证据：`tmp/runtime/global-object-directory/sprint-b/01-default…08-empty`。

## 返回边界

- 无视觉执行模型只能推进到 `AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` /
  `VISUAL_GATE_READY`；
- 只剩独立视觉 reviewer 时返回 `CONSOLIDATED_VISUAL_CHECKPOINT`；
- 不 push、不提交 Graph/凭据/依赖/构建产物/测试数据、不覆盖用户未提交修改；
- 不把 DOM/CSS/AX 证据冒充 `VISUAL_GATE_PASS`。
