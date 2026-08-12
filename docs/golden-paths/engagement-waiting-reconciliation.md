# Engagement Waiting Reconciliation Golden Path

## Automated proof

`packages/test-support/tests/phase4-engagement.test.ts` proves both directions, actionable-query membership, exact-condition Undo, natural-text preservation, durable Agent/Proposal/Commit/Feedback records, Evidence-watermark invalidation, malformed and wrong-operation output failure, and the required race/failure paths. The versioned Skill's eight Eval cases are executable tests. Final Node 20.20.2 verification results are recorded in the completion audit.

## Real Logseq Desktop proof

On 2026-08-13, Logseq Desktop 0.10.15 loaded the final rebuilt `Task Copilot vNext 0.2.0` plugin against the isolated Graph under `e2e-runtime/logseq-graph` and a fresh isolated local Kernel under `e2e-runtime/kernel-final-v3`. The executor was explicitly the deterministic Fake Agent.

For WorkObject `8e5ee56b-b94d-4dd4-82aa-173390e1e640`, frozen Evidence `evidence-1ec6ea95-faf6-4f56-aacc-dffb449d9a02` produced AgentRun `agent-run-dab4c2f4-6ee5-4b62-8069-271bc9bcee8f`, Proposal `02be8bd2-2798-426e-8a8b-fbee235d0b4a`, and Commit `e34a926e-dd75-4f2f-8c07-edcd6dca2e96`. The object changed `ACTIONABLE → WAITING`; the final one-block managed projection visibly showed the state and `等待：等待网络组分配 VLAN 和网关信息` together. The 12-second warning toast appeared in Logseq's notification area with the object, before/after transition, reason, exact Evidence ID, Evidence-view route, and Undo shortcut.

The `Task Copilot vNext：查看最近一次 Agent 依据` command displayed the immutable frozen content, Evidence ID, SHA-256 `ec442f843a2b2cadb26dce2216cb41c7d9c843e94b7c61cd1f6646367f6bb0e3`, and freeze time rather than reopening the mutable source block. Evidence `evidence-8ce74491-0479-4ebc-b44b-5405845f6a2e` then produced AgentRun `agent-run-1098a86b-2961-402a-9044-0b76a330600c`, Proposal `a8120e4c-a09b-42f7-8b41-3c354bc56301`, and Commit `2c7a168d-a2d2-4994-8f79-a063c6034a31`. The object changed `WAITING → ACTIONABLE` and the Waiting lines disappeared.

The Plugin's `Cmd+Shift+U` shortcut created compensation Commit `8bbd8a29-6357-42f1-8dae-de0643b0d477`, restoring the exact original description, `since`, null `reviewAt`, and Evidence list at version 4. A final fresh Evidence run committed `4c513cc7-372a-46bd-8eaa-7b5d898532cb`, returning the object to ACTIONABLE at version 5. Durable SQLite inspection found the three `ACCEPTED` events, `UNDONE_AFTER_APPLY`, membership in the actionable query, and zero open Recovery records.

Screenshots are retained in the ignored isolated runtime as `phase4-final-enter-waiting.jpeg`, `phase4-final-leave-waiting.jpeg`, and `phase4-final-undo-restores-waiting.jpeg`. They support the operator observation but are not presented as independent visual acceptance.
