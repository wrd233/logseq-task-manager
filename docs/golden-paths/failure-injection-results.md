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
| External Agent fabricates USER utterance | Client has Kernel bearer but no Plugin `userChannelToken` | `POST /v1/user-events` returns `TRUSTED_USER_CHANNEL_REQUIRED`; no `TrustedUserEvent` or `UserDecision` | `phase11-user-decision.test.ts` + real Desktop chain |
| Trusted event replay | Same `TrustedUserEvent` compiled twice | Second compile returns `STALE`; exactly one `UserDecision` exists | `phase11-user-decision.test.ts` |
| Stale package presentation | Event revision differs from package `presentationRevision` | Compile returns `STALE`; WorkObject version unchanged | `phase11-user-decision.test.ts` |
| Prefix / quoted / conditional acknowledgment | “同意这个说法但先别执行”“他说同意” | `NEEDS_CLARIFICATION`; no Formal mutation | `phase11-user-decision.test.ts` |
| Governance issue cross-dimension resolve | `current_focus` judgment lists an `engagement` issue id | Issue stays `OPEN`; only same-dimension judgment resolves it | `phase10-context-governance.test.ts` |
| Execution profile scope overreach | Profile excludes a data scope or caps items/chars | Context Pack contains only scoped, capped, truncated items | `phase10-context-governance.test.ts` |
| DeepSeek incomplete judgment | Missing handles / unbalanced JSON | Strict parser throws; no auto-fill, no semantic repair, no Formal mutation | `packages/agent/tests/agent.test.ts` |
| Discovery invalid target | `ASSOCIATE_EXISTING` names a missing WorkObject | Run becomes `PARTIAL`; source stays `UNRESOLVED`; no association or Graph write | `phase12-discovery.test.ts` |
| Discovery prompt injection | Source text instructs auto-CREATE/auto-纳入 | Source treated as data; `NO_CANDIDATE`; no candidate, package, USER event, or object | `phase12-discovery.test.ts` |
| Stale candidate source | Source changed after mature package was presented | Old trusted “纳入” returns `USER_DECISION_STALE`; package/decision STALE; no CREATE | `phase12-discovery.test.ts` |
| Duplicate discovery | Same source set run twice | One candidate identity merges; no duplicate candidate or package | `phase12-discovery.test.ts` |
| Discovery Graph offline | No Graph Adapter connected | Run `FAILED` with `GRAPH_ADAPTER_OFFLINE`; zero candidates/writes | `phase12-discovery.test.ts` |
| Organize-today while paused | global maintenance pause active | Explicit one-off runs; `pauseRespected=true`; pause stays set afterwards | `phase12-discovery.test.ts` |
| Discovery scope cap | 7 sources with maxContextItems=3 | `PARTIAL` with remaining=4, cursor continues twice, 7 sources covered without duplicates | `phase12-5-hardening.test.ts` |
| Unchanged discovery rerun | Same source hash processed before | Prefilter marks `ALREADY_COVERED`; counting executor proves no second remote call | `phase12-5-hardening.test.ts` |
| Wrong candidate attach | Model returns a nonexistent candidateId | Source stays `UNRESOLVED/CANDIDATE_ATTACH_INVALID`; no candidate invented | `phase12-5-hardening.test.ts` |
| Maturity gate | Candidate has kind+title but only KEEP_OBSERVING | No DecisionPackage; organize output only shows READY candidates | `phase12-5-hardening.test.ts` |
| DeepSeek malformed WorkIntent | `proposedWorkIntent` returned as prose string | Strict parser rejects batch (`DEEPSEEK_RESULT_NOT_OBJECT`), no semantic repair | `scripts/eval-discovery-restraint.ts` |
| Materialized candidate rediscovered | Same source set re-observed after CREATE | Judgment suppressed as `ALREADY_COVERED`; no duplicate candidate | `phase12-discovery.test.ts` + real chain |

No case silently overwrote user content or deleted Ledger history. The failure hooks exist only at the Kernel's system-boundary option and are not exposed through the public HTTP API.
