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
Sprint D: IN_PROGRESS
Visual Gate: PENDING (独立视觉 reviewer 才能签发 VISUAL_GATE_PASS)
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

## 返回边界

- 无视觉执行模型只能推进到 `AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` /
  `VISUAL_GATE_READY`；
- 只剩独立视觉 reviewer 时返回 `CONSOLIDATED_VISUAL_CHECKPOINT`；
- 不 push、不提交 Graph/凭据/依赖/构建产物/测试数据、不覆盖用户未提交修改。
