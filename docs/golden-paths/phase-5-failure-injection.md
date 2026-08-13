# Phase 5 Failure Injection

| Injection | Expected result | Automated proof |
| --- | --- | --- |
| Completion Graph throw after Kernel apply | No success; `KERNEL_APPLIED`; `RESUME_GRAPH_APPLY`; no formal Closure history yet | `Graph failure and marker race never become Closure success` |
| Marker/projection race | No overwrite; `RECOVERY_REQUIRED`; user marker/content preserved | same integration case and Graph Adapter race test |
| Double complete | second transition rejected; no second effective Closure | explicit completion integration |
| AGENT or SYSTEM attempts any Closure operation | authorization rejected before Closure/Ledger mutation | governance integration loop |
| Undo after later Amendment | `UNDO_TARGET_CHANGED`; current state preserved | cancellation/amend/reopen integration |
| Reopen with stale version | version mismatch; no ReopenRecord | cancellation/amend/reopen integration |
| Amendment targets wrong Closure ID | rejected; original Closure/lifecycle unchanged | cancellation/amend/reopen integration |
| Cancellation Graph throw | pending `KERNEL_APPLIED`; same recovery semantics as completion | cancellation failure integration |
| Completion marker response lost | retry recognizes safe partial state and converges same effect | real Graph Adapter response-loss test |
| MiniProject/Project completion | Task-only Domain error | Domain and Kernel integration tests |

Every case is checked at the cross-medium boundary. A prepared or Kernel-applied transaction is not presented as completed business state, and current effective Closure queries include only committed, uncompensated records.
