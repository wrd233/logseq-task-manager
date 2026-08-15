# Golden Path：Context → Evidence → Governance Issue / Formal Commit

> 状态：2026-08-15；自动化集成测试通过，真实 Logseq Desktop 0.10.15 的
> anchor → observer → queue → focus formal commit 已用 CDP 验证（证据在
> gitignored `/tmp/tc-phase10-real/background-evidence.json` 与 `background-screenshot.png`）。

## 1. Real background maintenance（正式路径）

1. 在 `logseq/` 测试 Graph 创建 synthetic page + Primary Anchor block。
2. `POST /v1/commits/commit` CREATE：commit `COMMITTED`，ProjectionObligation `PENDING`。
3. Plugin graph gateway 心跳后 obligation 自动 `VERIFIED`。
4. 通过 plugin `Editor.updateBlock` 修改 anchor 内容。
5. Plugin source observer quiet-period 聚合，`recordSourceChange`：
   - `source_coverage` hasUncovered=true；
   - `reconcile_jobs` 持久化 `source_block_uuid`。
6. Built-in maintenance loop 认领 job：
   - `READ_TARGET_SNAPSHOT` + `READ_EVIDENCE`；
   - freeze 唯一 `maintenance-evidence:<jobId>`；
   - 读取 active Context Associations（只读不 freeze）；
   - narrow focus proposal → `applyProposalFormal` → Formal Commit + ProjectionObligation。
7. 验证 API：`object.version` 递增、`currentFocus` 更新、evidence 仅 1 条、
   job 最终 `CONFIRMED_CHANGE`，投影 obligation 可重试/最终收敛。

真实 run 示例 ID（本次验证）：`workObjectId=cf159a49-…`、`createCommitId=003f53ff-…`、
`focusCommitId=ff8da65e-…`（formalVersion 2，Graph timeout 后 obligation 持久，等待重试）。

## 2. Context ≠ Evidence

- 3 条 source block 建立 Context Association；
- conflict reconciliation 只 freeze 1 条真正支撑判断的 source；
- `GET /v1/evidence?object=<id>` 长度 == 1。

## 3. Conflict / Issue / coverage

- source 同时包含“只能等”与“还可以继续”；
- engagement dimension CONFLICT issue OPEN，`evidenceIds.length == 1`；
- coverage 完成，job `DONE / CONFLICT`；
- `POST /v1/issues/:id/resolve` 后 OPEN surface 为空，历史仍在。

## 4. Fault notes

- Graph apply timeout 时 Formal Commit 不回滚，obligation 变为 retryable `FAILED`；
- Kernel/plugin 断开后 obligation 保持持久，重连后按 `nextAttemptAt` 重试；
- source observer 通过 owner 抑制 system projection writes，不会自触发。
