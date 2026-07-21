# V2 Primary Ownership Change Contract

## 用户闭环

Primary Ownership 变化只能来自一个已经审阅并接受的 HIGH Proposal。Review Center 仅在 Proposal 同时满足以下条件时显示专用“确认改变主归属”入口：唯一 accepted HIGH group、零正文 Patch、唯一 `CHANGE_OWNERSHIP` operation。

最终确认后，Plugin 只提交 Proposal 版本、Logseq read-scope 观察和固定确认短语。Local Service 从 SQLite 重新读取 child、new owner 与可选 current owner 的版本证据；客户端不提供 OBJECT 权威。child version、new owner version 与精确 current owner 会在同一 SQLite 事务内再次校验。成功反馈明确说明位置、Anchor 与普通 Association 均未改变；并发重复提交在 UI 层禁用，Service 层由稳定 SemanticCommit 与 Application receipt 幂等收敛。

## 单一写入与恢复

正式变化只有一条路径：

`Review Center → Local Service → V2Application.changePrimaryOwner → SQLite transaction`

同一事务更新 child version、唯一 `primary_ownerships` 投影、Audit 与 command receipt。SemanticCommit 只记录一个既有 `DOMAIN_WRITE` step，不引入工作流状态、Graph write 或新的恢复器。未完成 Commit 会锁住该 Proposal 的 review/revalidate，避免先把恢复依据改成 STALE。若进程在 Domain receipt 落库后、Commit step 收尾前中断，重启后用同一 idempotency key 读取 receipt 并完成原 Commit；不会建立平行 Commit 或再次改变版本。若在 Commit 已准备但 receipt 尚未产生时 new owner 版本变化或对象被删除，原子命令零写入，Commit 收口 `FAILED`，Proposal 标记 `STALE`；若对象版本仍有效但类型矩阵不允许，Commit 与 Proposal 都收口 `FAILED`。若进程恰在 Commit 已 FAILED、Proposal 尚未终结的两个事务之间中断，FAILED ledger 的 error code 会在重启重放时幂等补齐 Proposal 终态，且不再调用 Domain 写入。

## 逆向 Commit

已生效的 Ownership Proposal 在 Review Center 显示专用“撤销主归属变化”，不落入会修改正文的通用 Proposal Undo。Local Service 从正向 Proposal 读取审阅前 Owner，从正向 command receipt 读取实际落库后的 child/new Owner/version；两份证据必须完全一致。逆向 Commit 仍只有一个 `DOMAIN_WRITE` step，并调用 `V2Application.undoPrimaryOwnerChange`：正向变化前有 Owner 时恢复该 Owner，原先未归属时删除当前唯一 Ownership。child version、当前 Owner 和待恢复 Owner 的当前版本在同一 SQLite 事务内保护，Object、Ownership、Audit 与逆向 receipt 原子落库。

后续 child 编辑或 Ownership 变化会使 Undo 零写入并将逆向 Commit 安全收口 `FAILED`；不会回退其他人的新变化，也不会新建第二次逆向事务。若进程在逆向 Domain receipt 后、SemanticCommit 收尾前中断，重启使用同一 receipt 幂等完成，并把正向 Commit 标记为 `UNDONE`。正文、位置、Anchor、Association、Lifecycle、Condition 和 Focus 始终不在该逆向范围内。

## 明确不变项

- SQLite 仍是唯一领域状态源，Local Service 仍是唯一正式写入口。
- Logseq Block 位置、Primary Anchor、Lifecycle、Condition、Focus 与普通 Association 均不随 Ownership 变化。
- LLM 只能生成 Proposal，不能直接调用 Ownership command。
- 没有通用 Ownership 写路由；错误确认、stale Proposal、stale child/current owner/new owner 或账本不一致均零写入。

## 当前限制

自动合同已覆盖正向与逆向的确认拒绝、恢复旧 Owner/恢复未归属、后续编辑保护、幂等重放、进程中断恢复和 Plugin 专用交互。真实 Logseq Desktop 的 change → reload → Undo → reload、移动不改归属和错误反馈仍属于集中 Desktop Gate。
