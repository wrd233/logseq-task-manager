# Phase 4 Failure Injection

The Phase 4 integration suite exercises failures at the cross-medium boundary, not only contract parsing.

| Injection | Expected result | Proof |
| --- | --- | --- |
| Target version changes before apply | Proposal invalidated; zero Engagement mutation | `stale target/Graph race/later edit` integration case |
| Managed Graph projection changes | Apply/Undo fails closed; user content preserved | race and old-Undo cases |
| Referenced Evidence content changes | Proposal invalidated; zero mutation | stale Evidence case |
| A newer target-bound Evidence record appears | Older Engagement judgment invalidated by Evidence watermark | new Evidence case |
| Graph Adapter throws after Kernel state changes | Commit stays `KERNEL_APPLIED`; restart reports `RESUME_GRAPH_APPLY` | Graph-throw case |
| Graph differs after effect application | Commit becomes `RECOVERY_REQUIRED` | post-prepare Graph race case |
| Wrong Skill hash/version | Apply rejected; no new semantic Commit | wrong-Skill case |
| Malformed or PARKED Agent output | Durable FAILED AgentRun, no Proposal, no Commit | malformed-output case |

Recovery reuses the existing deterministic state machine. `KERNEL_APPLIED` is pending work, never success; only a matching Graph result and fresh snapshot reach `COMMITTED`. Phase 4 adds no best-effort overwrite or hidden retry path.
