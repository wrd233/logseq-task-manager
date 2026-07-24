# P2-B Structural SemanticCommit 自动证据（2026-07-24）

## 本轮边界

- 已实现：Accepted HIGH 结构 Proposal 的专用 planner、prepare ledger、逐 step Graph 观察核验、
  完整最终结构指纹、故障进入 RECOVERY_REQUIRED、逆序补偿核验与 FAILED/replay。
- 未实现：Plugin 对真实 Logseq `insertBlock/moveBlock/removeBlock` 的正式 executor、完成态 Undo、
  Desktop identity/reload/Graph switch Gate。因此 UI 仍不提供正式应用按钮。

## 安全事实

- 每个 CREATE_BLOCK/MOVE_BLOCK 对应一个既有 SQLite `GRAPH_WRITE` step；无新表或第二恢复账本。
- Client 不能上传正文、位置或成功证据；Service 通过瞬态 Graph read bridge 自行观察。
- Proposal 保存来源 scope hash、完整来源结构指纹、预期最终结构指纹。
- MOVE 的执行前位置与失败后补偿回原位置分开，避免前序 CREATE 改变相邻关系后误判。
- 所有 step VERIFIED 且完整最终指纹一致后才 `COMPLETED/APPLIED`。
- 失败按逆序补偿；完整来源指纹恢复后为 `FAILED`，不冒充 APPLIED。

## 自动证据

- Application：137/137 PASS；覆盖操作上限、唯一 HIGH 组、前向引用、混合操作、共享指纹、
  正向顺序和逆向计划。
- Local Service：114/114 PASS；覆盖 stale 零账本、prepare/replay、逐 step verify、最终 APPLIED、
  对象版本不变、失败后逆序 compensation、补偿前拒绝、FAILED/replay。
- Local Service 与 Service Client typecheck：PASS。

## 当前结论

结构事务的机器状态与恢复合同已经可以支撑下一步真实 executor，但尚无 Desktop 证据，不能把
P2-B 标为 DONE，也不能开放正式应用。
