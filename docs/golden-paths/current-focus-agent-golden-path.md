# Current Focus Agent Governance

Automated integration evidence is in `packages/test-support/tests/phase3-current-focus.test.ts`.

The golden path formalizes a natural Logseq record, freezes the selected source block, runs the deterministic Fake Agent, persists an AgentRun and one LOW Proposal revision, auto-applies `SET_CURRENT_FOCUS`, applies and verifies the stable `当前推进：` Graph field, and records `ACCEPTED`. The WorkObject advances monotonically from version 1 to 2 while title, lifecycle, engagement, identity, and natural source content remain unchanged.

The same test then invokes ordinary user Undo. The compensation Commit restores `currentFocus` to null at version 3, removes only the managed focus field, links `compensationFor`/`compensatedBy`, and records `UNDONE_AFTER_APPLY`. Evidence, AgentRun, Proposal, original Commit, and compensation Commit remain auditable.

The Logseq command is `Task Copilot vNext：让 Agent 更新当前推进`. It requires the current WorkObject saved by explicit formalization and the current selected block as Evidence; it performs no fuzzy lookup and displays Fake Agent, Commit, Evidence, and Undo guidance in its receipt.

## Isolated real Desktop evidence

On 2026-08-13, Logseq Desktop 0.10.15 loaded the rebuilt plugin against `/Users/wangrundong/work/logseq-task-manager-vnext/e2e-runtime/logseq-graph` and the isolated local Kernel. The executor was explicitly the deterministic **Fake Agent**, not a real LLM.

The latest rebuilt-plugin rerun froze the natural block `下一步：准备服务器上架并完成管理口网络配置` through a fresh proof-bound Graph Adapter read as Evidence `evidence-e2cf1977-fea9-468e-9c0d-1d9ae1d4f7a3` with SHA-256 `a1ab9086dca0a57e24a217eabaa8bd62875ce562e27b18df68135052c5737d5b`. AgentRun `agent-run-1457673e-3950-42ac-b2a2-90cbc2ea8910` used the release-approved Skill identity `current-focus-maintenance@0.1.0#ae5fec61a120cfe294f191e1ae37a61f008ac7868be232e6d814189211788813` and produced Proposal `1a82eb3e-8ec6-418c-83c5-1d4abf85e1a7`, Revision 1, `LOW`, containing only operation-contract-v1 `SET_CURRENT_FOCUS`.

Commit `e8a67ca1-1235-48d2-8308-262eb0297919` reached `COMMITTED`, advanced the existing WorkObject from version 5 to 6, and displayed `当前推进：准备服务器上架并完成管理口网络配置` using its stable managed-field UUID. The natural source remained unchanged. User Undo created compensation Commit `2fd73c98-b1f9-4051-8e78-515c30b5f2b8`, restored `currentFocus` to null at version 7, removed only the managed field, preserved the natural note, and recorded Feedback `ACCEPTED` then `UNDONE_AFTER_APPLY`. Evidence, the complete AgentRun receipt, Proposal revision, both Commits, and both Feedback events were independently read from the isolated durable SQLite state after stopping the service; no Recovery record was created.
