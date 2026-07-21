# V2 Primary Ownership Desktop Runtime Report

> 日期：2026-07-22
>
> Logseq：Desktop 0.10.15
>
> 状态：`OWNERSHIP_CHANGE_UNDO_DESKTOP_PASS`。Primary Ownership 的外部 Proposal、HIGH 审阅、版本重验、Commit、reload、Undo 与再次 reload 全部通过；真实跨页移动不改变 Ownership 仍作为独立 Anchor Gate 待验收。

## 1. 隔离环境

- 专用 Test Graph：仓库 ignored `logseq/`；未修改用户正式 Graph。
- SQLite：复用 Association Gate 的隔离库 `tmp/runtime/v2-desktop/association/task-copilot-v2-association.db`，schema v10。
- Local Service：loopback + 0600 私有 descriptor；结束时 descriptor 已清理。
- child：TASK `obj_20260721164223658_cdcfa30bfe7149cca7996f0f3d4d042f`，提交前 v5。
- clean owner：PROJECT `obj_20260721172917897_414d8884faa2498484229920775128b1`，全程 v2，Primary Anchor 全程 active。
- 与本 Gate 并存的普通 Association 始终为 1，用于证明两种关系没有互相冒充或覆盖。

## 2. 首次真实尝试发现的缺陷与安全停写 — PASS

首次以真实 Project page 作为 owner 时，Proposal 进入最终确认后被正确标为 `STALE`，Ownership 保持 0。调查确认通用显式 Block reconciliation 把 Project 的 page UUID 当成 Block UUID 读取，错误地把 Project Primary Anchor 观察为 `missing`，Project v2→v3；版本保护因此阻止了旧 Proposal，没有产生静默覆盖或错误归属。

修复没有新增扫描器、状态或写入路径：`ExplicitSyncController` 复用 Local Service 的对象只读投影，仅对 parser 管理的 TASK / MINI_PROJECT / DECISION / OUTPUT 执行 Block reconciliation；PROJECT / AREA page Anchor 留给各自 page workflow。TDD 先复现 Project page 被 `readBlock` 的失败，再证明只读取 Task Block。插件 typecheck、93 项插件测试和 build 均通过。

截图：`tmp/runtime/v2-desktop/ownership/01-page-anchor-stale-safe-stop.png`。

## 3. Proposal-only 与两阶段 HIGH 审阅 — PASS

修复后通过真实 CLI 对新 Proposal 执行 `validate → submit`：

- Validator 返回 `VALID`；submit 返回 `proposalStored=true`、`formalWritesExecuted=false`；
- SQLite 为 Proposal `READY`、Ownership 0、Task v5、Project v2、Association 1；
- Desktop 接受唯一 HIGH 语义组后 Proposal 为 `ACCEPTED`，但 Ownership 仍为 0；
- 提交前版本与 scope 检查通过后，仍需要独立的最终 Primary Ownership 确认。

截图：`tmp/runtime/v2-desktop/ownership/02-accepted-no-write.png`。

## 4. Commit 与 reload — PASS

最终确认后：

- Proposal 变为 `APPLIED`；
- `primary_ownerships` 只出现一条 child → clean owner；
- Task v5→v6，Audit 为 `change_primary_owner 5→6`；Project 保持 v2；
- 正向 `proposal-commit:*` 为 `COMPLETED`；
- 两个相关 Primary Anchor 的 object_id、external_id 与 active 状态不变；普通 Association 仍为 1；
- Logseq 插件真实 reload 后，Projects / 对象页从 SQLite 重新显示 `TASK → PROJECT / 唯一主归属`，并与普通 Association 分区显示。

截图：

- `tmp/runtime/v2-desktop/ownership/03-ownership-committed.png`
- `tmp/runtime/v2-desktop/ownership/04-reload-ownership.png`

## 5. 专用 Undo 与再次 reload — PASS

在同一 Proposal 卡片点击“撤销主归属变化”，勾选独立确认后：

- 恢复审阅前的未归属状态，`primary_ownerships=0`；
- Task v6→v7，Audit 为 `undo_primary_owner_change 6→7`；
- 正向 Commit 为 `UNDONE`，`ownership-undo:*` 逆向 Commit 为 `COMPLETED`；
- 正文、位置、Project v2、Primary Anchor 与普通 Association 均未变化；
- 再次 reload 后 Primary Ownership 区域消失，普通 Association 仍可读。

截图：

- `tmp/runtime/v2-desktop/ownership/05-ownership-undone.png`
- `tmp/runtime/v2-desktop/ownership/06-reload-undone.png`

## 6. 结束状态与 Gate 结论

- SQLite `integrity_check=ok`；Ownership 0、Association 1、Pending / Recovery Required Commit 0。
- Local Service 正常停止，0600 descriptor 已删除。
- 根级 `./scripts/check.sh`：362 tests、145 rules、0 skipped；全部构建、边界检查与恢复演练 PASS。
- Primary Ownership change/reload/Undo/reload：PASS。
- accepted 不等于 applied、HIGH 组确认与最终确认、版本保护：PASS。
- Anchor、Association、位置与正文非影响面：PASS。
- 真实移动后 Ownership 保持、故障注入 Desktop：仍由各自 E2E Gate 验收；本报告不替代它们。
- 新增复杂度：一个最小只读对象类型过滤 seam；它修复了真实失败 Gate，并消除了 Block 与 page Anchor 的职责重叠，没有第二权威、第二写入路径或新用户概念。
