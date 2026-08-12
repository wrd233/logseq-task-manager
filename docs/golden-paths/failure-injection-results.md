# Failure Injection Results

| Case | Injection | Observed invariant | Test/evidence |
| --- | --- | --- | --- |
| Graph apply failure | Fake Adapter throws after Kernel apply | No completion response; commit remains `KERNEL_APPLIED`; restart returns `RESUME_GRAPH_APPLY` | `packages/test-support/tests/golden-path.test.ts` |
| Expected source hash mismatch | Fresh snapshot differs from operation precondition | No WorkObject write; structured row becomes `RECOVERY_REQUIRED` | `packages/kernel/tests/kernel.test.ts` |
| Rename apply race | Managed state changes after prepare but before Adapter apply | Adapter rechecks the complete projection hash and refuses the field update | Real Graph Adapter contract test |
| Undo after user edit | Projection hash changed after original commit | Compensation becomes `ABORTED`; WorkObject and Graph are preserved | Kernel test plus real-adapter expanded-container test |
| Crash after `PREPARED` | Stage hook throws | Restart returns `ABORT_PREPARED` | Kernel test |
| Crash after `KERNEL_APPLIED` | Stage hook throws | Restart returns `RESUME_GRAPH_APPLY` | Kernel test |
| Crash after `GRAPH_APPLIED` | Stage hook throws | Restart returns `VERIFY_GRAPH`; fresh verification reaches `COMMITTED` | Kernel test |
| Real Logseq runtime mismatch | Logseq inserted implicit `id::` identity lines | UI did not claim success; row remained `KERNEL_APPLIED`; corrected Adapter recovered the existing tree to `COMMITTED` | Real Desktop run, 2026-08-12 |
| Agent Evidence changes before apply | Fresh selected-block SHA-256 differs from the frozen dependency | Proposal becomes `INVALIDATED`; zero new Commit/Ledger row and zero current-state write | `phase3-current-focus.test.ts` |
| Caller fabricates Evidence material | Snapshot proof is missing, malformed, or signed with a different capability | Kernel rejects Freeze before persistence; bearer authentication alone cannot manufacture trusted Graph Evidence | `phase3-current-focus.test.ts` plus real Graph Adapter proof-contract test |
| Agent Graph Adapter throws | Fake Adapter throws after governed Kernel apply; Plugin reports the failure | UI cannot claim success; non-conflict failure remains `KERNEL_APPLIED` and restart returns `RESUME_GRAPH_APPLY` | `phase3-current-focus.test.ts` |
| Agent Graph race | Managed projection changes after Proposal prepare | Adapter refuses the effect; reported failure becomes `RECOVERY_REQUIRED` | `phase3-current-focus.test.ts` |
| Old Agent Undo after later formal edit | A later Rename Commit advances the WorkObject | Old Undo fails `UNDO_TARGET_CHANGED` and cannot overwrite the later edit | `phase3-current-focus.test.ts` |

No case silently overwrote user content or deleted Ledger history. The failure hooks exist only at the Kernel's system-boundary option and are not exposed through the public HTTP API.
