# V2 原因化取消与显式重开自动化报告

日期：2026-07-22
状态：`AUTOMATED_PASS / TASK_DESKTOP_PASS`

## 已证明

- `OPEN → CANCELLED` 不能再通过无原因的通用 Domain transition；空原因、超长原因、错误版本和非法源状态均零写入。
- `COMPLETED / CANCELLED → OPEN` 只能通过显式 reopen 命令并记录原因；Marker 移除仍不会自动重开。
- 对象页只创建或修订一个带版本 Proposal。原因、动作和目标 Lifecycle 在同一语义组中，Task 为 MEDIUM；Project/MiniProject 为 HIGH。
- Review 接受不会改变正式对象。最终 Commit 需要与已审阅动作匹配的 `CANCEL_OBJECT` 或 `REOPEN_OBJECT`，错误确认不会建立 SemanticCommit。
- 正式生效复用现有单步 `DOMAIN_WRITE` SemanticCommit、Application Command、SQLite Object/Audit/Receipt；原因保留在 `APPLIED` Proposal。
- 正文、Anchor、Condition、Focus、Ownership 和 Association 均不随取消/重开变化。
- Plugin 已提供对象页入口、原因表单、审阅卡片、提交前重验、专用最终确认、busy/error/success 反馈；原因化 Lifecycle 不会误走正文 formalization Commit，并提供独立的 Lifecycle inverse Commit/Undo。
- Lifecycle Undo 会复用现有 SemanticCommit ledger 与 Object version protection：取消可恢复到 `OPEN`，重开可恢复到原 `COMPLETED` / `CANCELLED`，Project/MiniProject 的 Closure 快照只在恢复时重新验证并写回。

## 自动证据

- Domain：原因、版本、合法源状态和显式重开矩阵。
- Application：取消/重开命令的幂等 Receipt 与 Audit command。
- Proposal：提交 Validator 与 accepted-plan 对动作、原因、版本、风险和零 Graph Patch 的约束。
- Local Service：真实临时 SQLite 中完成 `OPEN → CANCELLED → OPEN`；Proposal 创建/接受阶段 Object 不变、SemanticCommit 为 0；错误确认零 ledger；终态 Proposal 被拒绝后同一版本可生成新 Proposal；外部 Proposal 伪造对象类型在 Commit 前被拒绝；Lifecycle 正向 Commit 与 inverse Commit 均覆盖 prepare 后中断、领域回执后中断、重启续作和幂等重放；MiniProject `COMPLETED → OPEN` 清除当前 Closure，Undo 恢复精确 Closure 快照。
- Plugin：对象入口、原因对话框、Review 专用 Commit 分类、Lifecycle Undo 按钮和最终确认渲染；全部插件测试通过。

## Desktop 补证

- Task 已在 Logseq Desktop 0.10.15 完成空原因拒绝、取消/重开 Proposal、accepted-not-applied、最终确认、Service 中断后读回、cold reload、原因可读和 Lifecycle Undo；详见 `docs/runtime/V2_REASONED_LIFECYCLE_DESKTOP_REPORT.md`。
- Project/MiniProject HIGH 接受与最终确认继续由各自 Closure/高影响 Gate 证明，不以 Task MEDIUM 证据替代。
- 本轮 Service 中断位于正式回执落盘之后；prepare-before-receipt 等内部窗口继续由自动 fault tests 证明。

因此 Task 原因化 Lifecycle 已标记 Desktop PASS，剩余高影响对象不在本报告中扩张结论。

## 复杂度结论

没有新增表、Schema、扫描器、补漏器、恢复器、写入路径或用户状态概念。实现复用 Proposal、Review、Object version、SemanticCommit 和现有 SQLite authority；原因留在唯一 Proposal 机器表示，避免在 Object 或 Markdown 中形成第二份可编辑权威。
