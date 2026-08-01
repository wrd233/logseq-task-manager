# Visual Gate Request：Worksite Re-entry & Reading Hierarchy

> 请求独立视觉 reviewer 对**当前构建**截图与配套机器证据做出判断。Reviewer 不参与
> 本轮实现结论；必须实际查看像素或真实 Logseq Desktop。

## 构建与运行环境

- 分支/HEAD：`feature/task-copilot-mvp` @ 本 Goal 最后一个原子提交
  （Sprint A `e10123c` → F `824a420` 之后的 HEAD）；
- Logseq：0.10.15；测试 Graph：`logseq/`（嵌套，外层忽略）；
- Plugin 稳定目录：`tmp/releases/task-copilot-wrh-72aad27-r12/task-copilot-plugin`；
- Local Service：READY · schema 12 · objects 21；Doctor PASS（1 条既有 stale Proposal
  warning）；Graph bridge connected；
- 视口/主题：1000×720 与 760×720，Light/Dark（CDP 显式模拟，DPR 1）。

## 证据目录

`tmp/runtime/worksite-reentry-reading-hierarchy/current/`

| 场景 | 目录 |
|---|---|
| Now Light/Dark 1000/760（before/after） | `01/02/03/04` + `sprint-a/` + `sprint-c/` + `sprint-d/` |
| Focus 空工作记录 | `05-now-focus-preview-light-1000/` |
| 次级卡短预览 | `06-now-secondary-expanded-light-1000/` |
| 完整嵌套预览 | `08-now-nested-worksite-light-1000/` |
| 完整预览 + TODO marker | `08b-now-nested-marker-light-1000/` |
| 截断场景 | `12-now-truncated-light-1000/` |
| Overflow menu | `13-now-overflow-menu-light-1000/` |
| 筛选展开 | `13b-now-controls-open-light-1000/` |
| Objects 默认/高级层 | `17/18/18b` |
| Confirmation 宿主隔离 | `19-confirmation-host-isolation-dark-760/` |

每张截图目录内含：`visible-text.txt`、`accessibility-tree.txt`、
`interactive-elements.json`、`ui-state.json`、`computed-style.json`、
`route-and-data.json`；关键场景另有 `source-tree.json` / `performance.json`。

## Reviewer 判断问题（Goal §14.4）

1. 用户能否连续扫描五个标题？
2. 主动作是否打断纵向阅读？（before：primary x=53 在阅读列；after：x=776 独立操作列）
3. Focus 项是否明确但不过度夸张？
4. 工作记录是否帮助恢复上下文（原文/层级/TODO/截断）？
5. 用户原文与系统文案是否容易区分？
6. 是否形成信息墙？（短预览 3 条 + “还有 N 条” vs 完整预览 ≤12 条）
7. 字重/颜色是否节制？（正常卡 0 strong；异常卡 1 strong；accent 只给主按钮）
8. 1000/760 语义是否一致？
9. Objects 是否仍像管理后台？（默认层只显示正式事项）
10. 宿主背景是否竞争？（active surface veil 58%）
11. 有无截断、错位、重叠？（760px shell 无横向溢出）
12. 结论：PASS / FAIL / 需改进 + 最小修改。

## 边界

- 未执行真实鼠标/键盘/VoiceOver 人工 Gate：按上一 Goal 产品负责人惯例为
  owner-accepted risk（本请求不代替该 Gate）；
- 本请求只审查 Worksite Re-entry & Reading Hierarchy，不重新设计整个产品。
