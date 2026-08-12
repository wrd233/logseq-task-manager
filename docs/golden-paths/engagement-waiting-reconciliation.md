# Engagement Waiting Reconciliation Golden Path

## Automated proof

`packages/test-support/tests/phase4-engagement.test.ts` proves both directions, actionable-query membership, exact-condition Undo, natural-text preservation, durable Agent/Proposal/Commit/Feedback records, Evidence-watermark invalidation, malformed output failure, and the three required race/failure paths. The full Node 20.20.2 verification passes 58/58 tests.

## Real Logseq Desktop proof

On 2026-08-13, Logseq Desktop 0.10.15 loaded the rebuilt `Task Copilot vNext 0.2.0` plugin against the isolated Graph under `e2e-runtime/logseq-graph` and the isolated local Kernel. The executor was explicitly the deterministic Fake Agent.

For WorkObject `d5a40613-dfd5-4c5f-8d87-1ca07f479cc4`, selected Evidence `evidence-197de1c8-fb2e-42d7-9842-334a2c66aa80` produced AgentRun `agent-run-f9a2605d-5e96-4b92-adc6-adba947b6537`, Proposal `b95586f0-1150-4383-8518-45e153354352`, and Commit `a0bae384-3114-4783-821e-055870780b09`. The object changed `ACTIONABLE → WAITING`, the managed projection visibly showed `等待：等待网络组分配 VLAN 和网关信息`, and the 12-second warning receipt displayed the object, transition, reason, Evidence, and Undo guidance.

Evidence `evidence-d16dfc7c-73c4-4f37-91e1-8725c21a1ccf` then produced AgentRun `agent-run-fd4c9ddc-9e4f-4f91-9f1b-8f1f55807cdd`, Proposal `2cd86002-c54c-4b5d-8c64-e78be254c414`, and Commit `a115b41a-2893-4035-8754-f7a5cf0ab8d4`. The object changed `WAITING → ACTIONABLE`, the Waiting field disappeared, and the actionable query included it again.

The Plugin's `Cmd+Shift+U` Undo shortcut created compensation Commit `65570717-ec70-483e-8334-a9b499ab23f0`, restoring the exact original description, `since`, null `reviewAt`, and Evidence list at monotonically increasing version 10. A final fresh Evidence run committed `afc71282-c124-4e30-80fe-534fc2fa8b30`, returning the object to ACTIONABLE at version 11. Durable SQLite inspection found `ACCEPTED`, `UNDONE_AFTER_APPLY`, and the final `ACCEPTED` Feedback events, two actionable objects, and zero open Recovery records.

Screenshots are retained in the ignored isolated runtime as `phase4-enter-waiting.jpeg`, `phase4-leave-waiting.jpeg`, and `phase4-undo-restores-waiting.jpeg`. They support the operator observation but are not presented as independent visual acceptance.
