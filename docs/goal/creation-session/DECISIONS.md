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
