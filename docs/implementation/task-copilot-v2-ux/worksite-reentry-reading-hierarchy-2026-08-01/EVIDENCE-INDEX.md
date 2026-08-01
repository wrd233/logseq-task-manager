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

## Sprint B after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-b/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Now Light 1000（含 Focus 空工作记录） | `01-now-light-1000/`、`05-now-focus-preview-light-1000/` | Focus 卡“暂无工作记录” |
| 次级卡短预览 | `06-now-secondary-expanded-light-1000/` | 梅北 3 条 + 还有 4 条 |
| 完整嵌套预览 | `08-now-nested-worksite-light-1000/` | 梅北 7 Block |
| 完整预览 + TODO | `08b-now-nested-marker-light-1000/` | k8s 10 Block + TODO marker |
| 截断场景 | `12-now-truncated-light-1000/` | k8s 3 条 + 还有 7 条 + source-tree.json |
| 760/暗色 | `02-now-light-760/`、`03-now-dark-1000/`、`04-now-dark-760/` | 语义一致 |
| 性能 | `performance.json` | 短预览 107ms、完整 105ms、并发 2 |

真实服务证据：`tc status` READY · schema 12；`tc doctor` PASS；Graph bridge connected。

## Sprint C after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-c/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Now Light 1000 | `01-now-light-1000/` | computed-style：h3 650/18px、status 400 muted、primary 600 |
| Now Dark 1000 | `03-now-dark-1000/` | 语义一致 |
| 结构指标 | `metrics-1000.json` | 布局不回归 |

## Sprint E after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-e/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Objects Dark 1000 默认层 | `17-objects-dark-1000/` | 只显示正式事项；创建器折叠 |
| Objects Light 1000 默认层 | `18-objects-light-1000/` | 同上 |
| Objects 高级层展开 | `18b-objects-advanced-light-1000/` | 新建领域/项目/关联可见 |

## Sprint F after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-f/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Confirmation 宿主隔离 | `19-confirmation-host-isolation-dark-760/` | veil 58% 遮罩、active-surface-shell、无主导航 |

Now 结论文案与相对时间由自动测试覆盖（`userFacingRelativeDateTime` 单测 + 文案断言）。

## 收口证据（2026-08-01）

- `FINAL_ACCEPTANCE_REPORT_2026-08-01.md`：Goal 完成定义逐项（非视觉收口稿）；
- `VISUAL_GATE_REQUEST.md`：独立 reviewer 请求（仓库版 + `tmp/runtime/
  worksite-reentry-reading-hierarchy/VISUAL_GATE_REQUEST.md` 拷贝）；
- 根级 `./scripts/check.sh` 最终 exit 0（typecheck/lint/tests/build/边界/145 rules/
  rehearsal/仓库边界）；
- `tc status` READY · schema 12 · objects 21；`tc doctor` PASS（1 条既有 stale
  Proposal warning）；
- 原子提交：`e10123c`（A）、`2fb414e`（B）、`5ef0040`（C）、`bd8496f`（D）、
  `62ed0dd`（E）、`824a420`（F）。

## Sprint D after 证据（2026-08-01）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-d/`

| 场景 | 文件 | 内容 |
|---|---|---|
| Now Light 1000（shell 降权） | `01-now-light-1000/` | agent-state transparent/muted；筛选折叠无框 |
| 筛选展开态 | `13b-now-controls-open-light-1000/` | 展开后恢复面板 |
| 结构指标 | `metrics-1000.json` | 布局不回归 |
