# Creation Session checkpoints

## CS-CP01 — authority foundation

- schema 16 migration is preflight-snapshot protected;
- strict aggregate validation and graph binding;
- CRUD, optimistic version, command receipts and restart;
- multiple active sessions and filtered list;
- zero formal object/audit write before confirmation.

## CS-CP02 — source and round transaction

- source content is captured only through the bounded Desktop Graph bridge;
- important source snapshots are retained and source change/deletion is explicit;
- refresh retains the prior capture and turns dependent source facts into conflicts;
- one coherent Provider round contains 2–5 questions while multiple dimensions remain;
- every question carries rationale, recommendation and explicit answer state;
- answers commit before the Provider request and survive failure, cancellation, restart
  and retry;
- idempotent replay does not call the Provider again or duplicate consensus;
- Provider output remains proposal-only and produces zero formal Objects/Audit writes.

## CS-CP08 — automated interaction closure

- source scope is visibly confirmed before the first Provider call, Page material gets a
  bounded recognition summary, and up to three references can be added manually;
- resume/check displays added, modified and deleted counts; explicit refresh keeps the
  prior capture and invalidates Provider-style source evidence refs;
- users may answer each question or preserve one whole-round narrative without implicit
  consent for omitted questions;
- Draft supports text, safe deletion, simple parent choice, atomic sibling movement and
  bounded natural-language revision without overwriting direct user edits;
- formal preview states what will and will not happen;
- terminal History is read-only and links to the created object, primary source and the
  existing Review/Undo authority;
- Plugin 528/528, Local Service 201/201 and Node 20 root checks pass.

## Next checkpoint

One consolidated real Provider and Logseq Desktop campaign from `RUNTIME_PLAN.md`, then
the independent judgment required by `VISUAL_REVIEW.md`. Automation does not grant either
runtime or visual PASS.

## CS-CP09 — 无视觉接力收口（2026-08-02）

- 根因：Draft/Proposal 子节点 sibling `order` 为 1 基，Logseq 读回为 0 基数组下标；
  旧 `creationSessionMiniTreeHash` 把原始 order 计入哈希，真实 after-tree 校验必然失败
  （原事务期望 `8b6970e5`、读回 `9f2abdfa`，canonical rank 哈希 = `9f2abdfa`）。
- 修复：ADR 0012 canonical 化（v1）+ 有界 settle + 冻结 legacy 哈希；MiniProject
  prepare/finalize 接受 canonical/legacy 账本哈希，原 PENDING 事务同 Proposal 续跑完成。
- 真实 MiniProject：Commit COMPLETED（step VERIFIED）→ reload → Undo（UNDONE +
  inverse COMPLETED，原树/Journal 精确恢复）→ reload；Pending/Recovery 0。
- 真实 Project：Page 来源 + 真实 DeepSeek 4 轮 → READY Draft → 独立 Page
  `Project/统一监控告警治理` → 会话内最终确认 → Commit COMPLETED（17 节点树精确写入、
  来源页零修改）→ reload → Undo（Page 删除、Object/Anchor 移除、Session 保留
  undoneAt）→ reload；Pending/Recovery 0。
- 额外修复：每会话一个活跃 Proposal（Service 幂等收口）；会话内最终确认（不再强迫
  跳 Review Center 重复审阅）；Provider 共识上下文按 uncertainty 折叠；PRE_COMMIT
  捕获不再使草稿失效；`recent-changes` 把 Creation Session 撤销正确路由到
  `v2-creation-session-undo`。
- 自动回归：Plugin 534/534、Local Service 201/201、Domain 87/87（根级 `check.sh`
  最终复跑见收口提交）。
- 独立视觉复验清单：`NON_VISUAL_HANDOFF_TO_VISUAL_REVIEWER.md`。
