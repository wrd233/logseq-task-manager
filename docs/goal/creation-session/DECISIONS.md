# Creation Session decisions

| ID | Decision |
|---|---|
| CS-D01 | SQLite is the sole pre-creation authority; no temporary Graph or formal writes. |
| CS-D02 | Exactly four durable statuses; request/failure states live inside rounds. |
| CS-D03 | One primary source plus at most three references with identity, hierarchy, hashes, and availability. |
| CS-D04 | Session title and final object title are independent. |
| CS-D05 | Important drafts are bounded revisions with stable node identity, provenance, operation, and user-edit flags. |
| CS-D06 | Final creation and Undo reuse existing Proposal/Semantic Commit/recovery. |
| CS-D07 | Existing transient paths coexist until complete replacements pass regression and Desktop gates. |
| CS-D08 | Answers persist before Provider invocation; failure cannot erase stable consensus or draft. |
| CS-D09 | Formal preparation requires fresh `PRE_COMMIT` captures and exactly one machine-validated `HIGH` Proposal group. |
| CS-D10 | MiniProject in-place creation retains every source subtree node exactly once; other MiniProject placements create a new tree. |
| CS-D11 | Project Creation Session always creates an independent Page in the first vertical and leaves every source unchanged. |
| CS-D12 | Object, Primary Anchor, Audit, and Session `CREATED` become one final SQLite domain step; Undo retains and marks the Session. |
| CS-D13 | MiniProject tree verification uses a versioned canonical sibling-order normalizer (`task-copilot-creation-tree-canonical-v1`) on both expected and actual sides; the frozen legacy hash exists only to recognize pre-ADR ledger rows; after-write verification uses a bounded settle (≤5 attempts, <2s) and remains fail-closed. ADR 0012. |
| CS-D14 | One active formal Proposal per Creation Session: repeated “生成正式审阅方案” returns the existing READY/IN_REVIEW/ACCEPTED/APPLIED proposal instead of creating duplicates. |
| CS-D15 | Normal single-object creation confirms inside the Creation Session: the same HIGH Proposal is accepted and committed from the in-session impact surface; Review Center remains the history/recovery authority and is not a mandatory second hop. |
| CS-D16 | Provider context packages collapse consensus history to the latest entry per uncertainty, so resolved unknowns are never presented as current gaps (full history remains in the Session). |
