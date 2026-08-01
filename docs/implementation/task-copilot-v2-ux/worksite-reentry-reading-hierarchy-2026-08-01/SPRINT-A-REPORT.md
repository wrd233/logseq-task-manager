# Sprint A Report: Now Card Reading Path

> 2026-08-01；当前 HEAD `72aad27311cb3a60e535e3920e9995306a30aa23` + 本 Sprint 原子提交。

## 状态

```text
WRH-P1-01 / WRH-P1-02 / WRH-P1-07 / WRH-P1-08: DESKTOP_BEHAVIOR_PASS
Visual Gate: VISUAL_GATE_READY（独立视觉 reviewer 未签发）
```

## 解决的问题

- 标题下方纵向状态/依据/主按钮/更多操作打断扫描（WRH-P1-01）；
- 更多操作 disclosure 占据主阅读路径（WRH-P1-02）；
- 760px 按钮纵向堆叠、语义分区不稳定（WRH-P1-07）；
- overflow menu 的 AX 名称、Esc、外部点击、焦点返回（WRH-P1-08）。

## 未修改的安全合同

Proposal/Commit/Undo/PENDING/RECOVERY 语义、SQLite/Local Service 权威、UI 不直接写
Store、正文仍由 Logseq 持有、无第二编辑器/恢复系统/平行 Runtime；未提交用户既有
`apps/task-copilot-local-service/package.json`。

## 实现

- `apps/task-copilot-logseq-plugin/src/ui.ts`：Now 卡片分为 `.now-card-content`
  （eyebrow→标题→状态→解释）与 `.now-card-actions`（角落 ⋯ + 唯一主动作）；
  “查看依据”改为内容区末尾的“为什么现在显示它”；正常状态移除与标题同级 strong；
  more summary 使用 `aria-label="更多操作"` 与 `aria-expanded`；
- `apps/task-copilot-logseq-plugin/src/index.css`：宽屏 grid 两列 + 固定
  `--now-action-column: 156px`；≤760px 转块布局、primary footer 右对齐、⋯ 角落绝对定位；
- `apps/task-copilot-logseq-plugin/src/index.ts`：Escape 关闭菜单并聚焦 summary、
  点击外部关闭、toggle 同步 aria-expanded；
- `apps/task-copilot-logseq-plugin/tests/ui.test.ts`：+3 测试（分区/单 primary/文案与
  aria；CSS 合同；菜单键盘接线）。

## 自动检查

- Plugin tests：413/413 PASS（含新增 3 项）；
- 根级 `./scripts/check.sh`：PASS（typecheck/lint/tests/build、Plugin/架构边界、
  145 rules、acceptance rehearsal、仓库边界、git diff --check）。

## Desktop 行为证据（真实 Logseq 0.10.15）

- 构建装入稳定目录 `tmp/releases/task-copilot-wrh-72aad27-r12/task-copilot-plugin`，
  Logseq iframe 指向该目录；完整 quit/reopen 后保持；
- Local Service：`READY`、schema 12、objects 21；Doctor PASS，仅既有 stale Proposal
  warning 1（非本 Sprint 引入）；
- 真实输入验证：鼠标点击 summary 打开（aria-expanded=true）；Escape 关闭且焦点回到
  summary；点击菜单外部关闭（aria-expanded=false）；
- 机器证据 bundle（visible-text / AX / interactive / ui-state / computed-style /
  route-data）：`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-a/`
  （01/02/03/04 now 四场景 + 13 overflow menu）。

## 指标对比

| 指标 | before | after |
|---|---|---|
| 1000px primary 坐标 | x=53（左列，阅读路径内） | x=776（右侧独立操作列），与标题同排 |
| 1000px 首卡高度 | 235px | 155px |
| 1000px 第二张卡标题 y | 624 | 549（首屏可见第二张标题） |
| 760px 首卡高度 | 235px | 188px |
| 760px primary | x=39 标题正下方 | x=639 footer 右对齐；⋯ 固定角落 (x=691) |
| 每卡 primary 数 | 1 | 1 |
| 主阅读列控件数 | 3（依据+按钮+更多） | 0（全部进入操作区/footer） |
| 760px 横向溢出 | 无 | 无（shell 758≤760） |

## 已知限制

- 独立视觉 reviewer 未执行：视觉权重、间距、对比度最终由 Visual Gate 判定；
- 760px 下工作记录占位（Sprint B）与状态/字重预算（Sprint C）尚未实施；
- VoiceOver 手工 Gate 按上一 Goal 惯例仍为 owner-accepted risk，不冒充 PASS。
