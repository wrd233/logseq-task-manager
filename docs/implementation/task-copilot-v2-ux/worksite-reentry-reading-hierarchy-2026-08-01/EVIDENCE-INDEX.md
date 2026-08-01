# Evidence Index（2026-08-01）

## 当前 before 证据（本次 Phase 0 生成）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Now Light 1000 | `01-now-light-1000/` | screenshot + visible-text + AX + interactive + ui-state + computed-style + route/data |
| Now Light 760 | `02-now-light-760/` | 同上 |
| Now Dark 1000 | `03-now-dark-1000/` | 同上 |
| Now Dark 760 | `04-now-dark-760/` | 同上 |
| Objects Dark 1000 | `17-objects-dark-1000/` | 同上 |
| Objects Light 1000 | `18-objects-light-1000/` | 同上 |
| 结构指标 | `metrics-1000.json` / `metrics-760.json` | 每卡 DOM 顺序、primary 数量/坐标、标题 Y、卡片高度、shell/workspace 宽度 |

截图均在 Logseq Desktop 0.10.15 + r11 稳定 Plugin + `logseq/` 测试 Graph 的真实运行态获取；
CSS 视口经 Cmd+0 归位后由 CDP 显式模拟（1000×720 / 760×720，Light/Dark）。

## 交接包 baseline（历史证据，不替代当前代码）

`/tmp/task-copilot-reentry-handoff/.../references/current-baseline/`

## 上一 Goal 收口证据

`docs/implementation/task-copilot-v2-ux/cognitive-ux-hardening-2026-08-01/`
（FINAL_ACCEPTANCE_REPORT、VISUAL_GATE_RESULT、METRICS_COMPARISON、CUX_BASELINE、CUX_ISSUE_MATRIX）

## 后续将生成

- 每个 Sprint 的 before/after Desktop bundle（继续写入 `tmp/runtime/worksite-reentry-reading-hierarchy/`）；
- Visual Gate Request 包（`10-VISUAL-GATE-REQUEST.md` 对应的 21 张截图矩阵）；
- Final Acceptance Report 与独立 Visual Gate Result。

## Sprint A after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-a/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Now Light 1000 | `01-now-light-1000/` | 两区卡片：内容列 + 右侧操作列 |
| Now Light 760 | `02-now-light-760/` | footer primary + 角落 ⋯ |
| Now Dark 1000 | `03-now-dark-1000/` | 同上 |
| Now Dark 760 | `04-now-dark-760/` | 同上 |
| Overflow menu | `13-now-overflow-menu-light-1000/` | 打开态：更新状态/期限/关注/排序在角落菜单 |
| 结构指标 | `metrics-1000.json` / `metrics-760.json` | after 坐标/高度/顺序 |

桌面服务证据：`tc status` READY · schema 12 · objects 21；`tc doctor` PASS（stale
Proposal warning 1 为既有）。
