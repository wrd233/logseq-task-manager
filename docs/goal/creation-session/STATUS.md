# Creation Session status

Updated: 2026-08-02（无视觉接力收口后）

Overall: `IN_PROGRESS`

> 2026-08-02：真实 Logseq Desktop 0.10.15 已完成 MiniProject（Page-end 新树与
> 来源 Block 原位两种放置）、Project（Page 来源独立页）的 Commit → reload →
> Undo → reload 工程闭环，并完成“用户后续编辑后 Undo 拒绝、不静默删除”的真实
> Desktop 证据。树校验根因与修复见
> `CHECKPOINT_2026-08-02_NONVISUAL_RECOVERY.md` 与 ADR 0012。剩余唯一 Gate 为独立
> 视觉复验（`NON_VISUAL_HANDOFF_TO_VISUAL_REVIEWER.md`）；无视觉模型不代签视觉通过。

| Phase | State | Current evidence |
|---|---|---|
| 0 Baseline and ADR | DONE | Existing paths inspected; ADR 0010 records authority and ADR 0011 freezes the formal Proposal/commit/Undo bridge. |
| 1 Session foundation | AUTOMATED_DONE | Domain, Application, schema 16, SQLite repository, Local Service CRUD, client, restart/idempotency/no-formal-write, Graph-owned source capture, bounded add-reference, visible drift/deletion counts, explicit refresh, durable 2–5-question rounds, per-question or whole-round answer-first Provider transactions, retry/cancel/failure retention and replay are implemented. Desktop remains consolidated into Phase 5. |
| 2 Draft Tree | AUTOMATED_DONE | Strict stable node/revision model, sparse important-history retention, source revalidation capture, MiniProject/Project Provider validator, Local Service/client generation, inline text/parent edits, atomic non-drag sibling movement, safe Agent-leaf deletion, natural-language revision, adoption, idempotency, restart/failure retention and user-edit conflict protection are automated. Plugin renders a responsive Logseq-style tree with Markdown/Page references, provenance, operation plan and conflicts. |
| 3 MiniProject vertical | RUNTIME_STRUCTURAL_PASS | 真实 Desktop 两种放置：① Page-end 新树——原 PENDING 事务经同一 Proposal 续跑完成 → reload → Undo → reload；② 来源 Block 原位——源根 UUID 保留改写、3 个原材料子 Block 原 UUID/原文逐项保留、9 个结构节点新建 → reload → Undo 精确恢复（文本/父子/顺序/UUID）→ reload。树校验根因（sibling order 基差异）已修复并复算证实（ADR 0012）。视觉仍待独立复验。 |
| 4 Project vertical | RUNTIME_STRUCTURAL_PASS | 真实 Desktop：Page 来源 → 真实 DeepSeek 多轮 Grill → READY Draft → 独立 Project Page → 会话内最终确认（同一 HIGH Proposal）→ Commit（Page 树精确写入、来源页零修改）→ reload 保持 → 真实 Undo（Page 删除、Object/Anchor 移除、Session 保留 undoneAt）→ 再次 reload 后 Pending/Recovery 0；用户后续编辑后 Undo 明确拒绝且不删除（changed-page 保护真实证据）。视觉仍待独立复验。 |
| 5 Unified entry/runtime | RUNTIME_STRUCTURAL_PASS | 会话内最终确认已接入：正常单对象不再强迫跳 Review Center 重复审阅同一 HIGH 方案（接受/Commit 复用同一 Proposal、同一回执与同一 Commit/Undo 内核；Review Center 保留为历史与恢复入口）。Provider 上下文按 uncertainty 折叠为最新状态；重复“生成正式审阅方案”由 Service 幂等收口为每会话一个活跃 Proposal。真实 Provider/Desktop 主链已跑通；独立视觉复验仍待执行。 |

Phase 1 preserves the key authority boundary: Provider output is a validated proposal
for questions, consensus and draft hints. It cannot create a formal Object, write Audit,
or bypass the existing Application Command and Commit kernels.

The pre-existing `apps/task-copilot-local-service/package.json` modification is outside
this Goal and is not modified, staged, or committed.

Checkpoint `CS-CP03`: Node 20 root `./scripts/check.sh` passes after Plugin integration;
the new controller/renderer suite adds six focused tests and the existing Plugin UI
compatibility suite remains green.

Checkpoint `CS-CP04`: ADR 0011 and the `CREATION_SESSION_V1` Proposal/accepted-plan
validator are implemented. SQLite now has one atomic final domain step that couples
Object, Primary Anchor, Audit, Receipt, and Session `CREATED`; exact Undo deletes only
an unchanged formal projection and retains the Session with `undoneAt`. Focused
Proposal and persistence rollback/idempotency tests pass. Graph-step execution is not
yet connected, so neither formal vertical is marked automated complete.

Checkpoint `CS-CP06`: the Project path now reuses the existing Proposal review and
SemanticCommit ledger end to end. The Plugin creates only an independently owned Page
with deterministic Draft UUIDs, verifies the exact tree before Domain finalization,
compensates a Domain conflict, replays interrupted finalization, and performs inverse
Domain removal plus exact Page deletion for Undo. A mid-tree failure removes the Page
only when the remaining tree is a strict transaction-owned prefix; changed/unknown
content is preserved. Plugin 517/517 and Local Service 198/198 pass before the root gate.

Checkpoint `CS-CP07`: the MiniProject path now freezes one complete reviewed Block tree
for both new-tree and source-in-place placement, and reuses the same Proposal,
SemanticCommit, Domain and inverse-commit authorities. The Plugin applies deterministic
UUIDs and order, verifies the exact after-tree before Domain finalization, restores the
exact before-tree on interruption or Domain conflict, and refuses Undo after later user
changes. Page-end staging is removed only while it remains transaction-owned and exact.
Plugin 523/523 and Local Service 200/200 pass before the root gate.

Checkpoint `CS-CP08`: the remaining interaction contract is automated end to end. The
first Provider call now waits for explicit source-scope confirmation; Page sources get
a bounded recognition summary, up to three manual references and visible added/modified/
deleted drift counts. Whole-round natural answers remain one preserved user statement
without turning unanswered questions into consent. Draft edits support inline text,
simple parent changes, atomic sibling movement, safe deletion and bounded natural-language
revision while preserving user-edited nodes. Preview shows explicit will/will-not impact,
and terminal History exposes the created object, primary source and the existing Review/
Undo authority without mutating a terminal Session. Plugin 528/528, Local Service 201/201
and the Node 20 root `./scripts/check.sh` pass; 145 stable rules and the export/restore
rehearsal remain green. Only the consolidated real Provider/Desktop/visual campaign remains.

Checkpoint `CS-CP09`（无视觉接力收口）: 真实 Logseq Desktop 0.10.15 完成
MiniProject（Page-end + 原位）与 Project 的 Commit → reload → Undo → reload 闭环，
并补齐用户编辑后 Undo 拒绝的真实 Desktop 证据；根因（Draft 1 基
与读回 0 基 sibling order 的哈希差异）与修复（canonical 化 + 有界 settle + legacy
账本兼容）记录在 ADR 0012；重复 Proposal、会话内最终确认、Provider 共识折叠等缺陷
已修复并有自动回归。根级检查待最终复跑。独立视觉复验见
`NON_VISUAL_HANDOFF_TO_VISUAL_REVIEWER.md`，不得由无视觉模型代签。
