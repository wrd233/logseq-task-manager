# Goal Status: Task Copilot Worksite Re-entry & Reading Hierarchy

> 来源：`/Users/wangrundong/.codex/attachments/b93473dd-cf1d-4c78-9324-165fca55a4c8/goal-objective.md`
> （与交接包 `01-GOAL-Task-Copilot-Worksite-Reentry-and-Reading-Hierarchy.md` 一致）

## 状态

```text
Goal Status: ACTIVE
Phase 0: COMPLETE (2026-08-01)
Sprint A: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint B: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint C: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint D: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint E: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Sprint F: DESKTOP_BEHAVIOR_PASS (VISUAL_GATE_READY)
Performance/Accessibility 回归: COMPLETE（根级 check exit 0）
WRH-P1-09（Worksite Preview Graph Refresh）: IMPLEMENTED + DESKTOP_BEHAVIOR_PASS
  （AUTO_REFRESH_PASS / MANUAL_RELOAD_PASS / NO_POLLING / NO_DOMAIN_WRITE /
  DESKTOP_BEHAVIOR_PASS；VISUAL_GATE_READY —— 独立视觉 reviewer 未执行）
状态: VISUAL_GATE_READY —— 只剩独立视觉 reviewer（CONSOLIDATED_VISUAL_CHECKPOINT）
Visual Gate: PENDING (独立视觉 reviewer 才能签发 VISUAL_GATE_PASS)
最终交付: FINAL_ACCEPTANCE_REPORT_2026-08-01.md + VISUAL_GATE_REQUEST.md +
§16.1 五份命名报告（NOW_READING_PATH / WORKSITE_PREVIEW_CONTRACT /
SEMANTIC_HIERARCHY / PERFORMANCE / ACCESSIBILITY）
补充场景: 长标题、Waiting、Reload 恢复、Review 相对时间（sprint-g/）
```

Phase 0 完成清单：

1. 已阅读交接包 00—12 全部文件与仓库根 `AGENTS.md` / `CONTEXT.md`；
2. 已阅读上一 Goal Final Acceptance Report、Visual Gate Result、Metrics、Desktop Gate
   （`cognitive-ux-hardening-2026-08-01/`）；
3. 已核对分支/HEAD/工作区：`feature/task-copilot-mvp` @ `72aad27311cb3a60e535e3920e9995306a30aa23`，
   唯一未提交修改为用户既有 `apps/task-copilot-local-service/package.json`（logseq id，保留不提交）；
4. 已核对 Plugin（r11 `c807376` 稳定目录）、Local Service（launcher PID 1059 拥有、
   `tmp/runtime/manual-v2/task-copilot.sqlite`）、Logseq `0.10.15`、测试 Graph `logseq/`；
5. 已阅读 `skills/**/SKILL.md`（task-copilot-core、recover-context、design-project、
   mini-project-modeling、project-creation-modeling）；
6. 已定位 Now card、Graph Read Bridge、source anchor、route、Objects workspace、Active Surface 实现；
7. 已确认当前构建与本包 baseline 截图结构相符（标题→状态→查看依据→主按钮→更多操作）；
8. 已生成当前 before 截图与机器证据（`tmp/runtime/worksite-reentry-reading-hierarchy/current/`）；
9. Sprint A 已按 gstack `plan-design-review` 适配审查（见 `SKILL-LOG.md`）；
10. 已建立本目录基线文档：`BASELINE.md`、`ISSUE-MATRIX.md`、`EVIDENCE-INDEX.md`、
    `SKILL-LOG.md`、`METRICS-BASELINE.md`。

## WRH-P1-09 原子缺陷修复 Sprint（2026-08-01）

真实用户复现：Now 卡片 Worksite Preview 先读为空后，来源 Block 下新增子 Block
不会自动更新，loaded-empty 也没有手动“重新读取”。根因：

1. 预览缓存键为 `anchor@v{objectVersion}`，普通子 Block 变化不触发失效；
2. 既有 `DB.onChanged` 只服务 Explicit Sync，没有传给 Worksite Preview；
3. loaded-empty 分支没有“重新读取”按钮。

修复（不重设计 Now、不动事务安全）：

- 新增 `WorksiteChangeRouter`：复用同一 `DB.onChanged`，对变化 Block 做有限父链
  （8 层/块、单批 64、并发 2）或反向索引识别受跟踪 Anchor，按对象 350ms 防抖
  仅失效对应预览；无第二个全局监听器、无轮询、无 SQLite/Graph 写入；
- Controller 增加 stale 标记、generation 竞态保护、dispose 与 metrics；
- 可见卡自动重读，折叠卡只标记 stale，展开/再进入时读取；
- loaded-empty / stale 增加低权重“重新读取”，loading 无重复点击；
- 真实 Desktop 完成 A（空态→三条自动更新）、B（折叠不读、展开读最新）、
  C（空态/有记录/error 重试）、D（删除/移入/移出）；
- Plugin 466/466、application 174/174、根级 check PASS；
- 证据：`tmp/runtime/worksite-reentry-reading-hierarchy/wrh-p1-09-worksite-graph-refresh/`。

实验环境说明：Desktop 导航实验误删了测试 Graph 的 2026-07-28 日志页；已从证据与
SQLite 精确重建 RedHat 任务子树及两个 P2-G 任务锚点（原 UUID），object version
2→3→4 仅来自恢复期 `observe_primary_anchor`，流程期间零 audit 写入。用户已确认
该实验环境损失可接受。

## 返回边界

- 无视觉执行模型只能推进到 `AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` /
  `VISUAL_GATE_READY`；
- 只剩独立视觉 reviewer 时返回 `CONSOLIDATED_VISUAL_CHECKPOINT`；
- 不 push、不提交 Graph/凭据/依赖/构建产物/测试数据、不覆盖用户未提交修改。
