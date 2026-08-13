# MiniProject Governance Failure Injection

| Failure | Proven behavior |
| --- | --- |
| concurrent root/topology edit | curation base hash mismatch; no overwrite |
| stale WorkObject/projection | Proposal invalidated before Commit |
| wrong object kind | MiniProject run/WorkIntent rejected |
| natural write to WorkIntent labels | impossible through `ADD_REFERENCE` enum contract |
| user inference impersonation | Formal actor remains `AGENT`; no `userConfirmed` field |
| target meaning changes | correlation + per-change before/after/Evidence identifies selective changes; no session-wide auto Undo |
| Plugin/Kernel interruption | WorkIntent crash after durable GRAPH_APPLIED restarts at exact verification and then commits; transient Plugin apply retains resumable KERNEL_APPLIED |
| curation UUID/section/readback mismatch | Plugin fails closed; no success receipt |
| Taste conflict | explicit intent/Skill outrank Taste; no automatic profile edit/activation |

Natural curation is intentionally not a Formal Commit. A transport failure after a partial natural insertion is reported as failure and requires fresh inspection; it is never claimed as a successful receipt.
