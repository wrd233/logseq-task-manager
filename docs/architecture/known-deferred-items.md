# Known Deferred Items

Deliberately deferred from this first slice:

- External Agent, MCP adapter, built-in model/prompt runtime, proposal ranking, and broad skills. Phase 3 uses only the deterministic Fake Agent.
- General System/Agent write authorization. The sole Agent exception is the Proposal-bound, `LOW`-risk `SET_CURRENT_FOCUS` path; generic Agent Commit preparation remains rejected.
- Full Project/MiniProject KR, closure, re-entry, Waiting, Completion, and review UI. Only the nullable current-focus field is included.
- Proposal inbox, ranking, batching, cross-object context gathering, conversational revision UI, and Phase 4 autonomy expansion.
- Automatic manual reconciliation for `RECOVERY_REQUIRED`; the system fails closed and exposes the row.
- Service launcher/auto-start and OS-level secret store. The current descriptor is private mode `0600`; Logseq receives it through native plugin settings then Plugin-private FileStorage.
- Remote sync, multi-user auth, arbitrary ports/hosts, and server capability expansion.
- V1 SQLite or Graph migration. vNext has zero V1 compatibility obligation and no dual write. The internal Phase 2-to-Phase 3 schema upgrade only backfills the new deterministic focus-field UUID so already-formal vNext objects remain usable.
- `@logseq/libs 0.3.4` remains a development dependency and currently leaves one moderate and two high findings in a full development audit. The build copies its pinned browser SDK file into Plugin `dist` so Desktop startup has no CDN dependency; the reported vulnerable transitive development tools are not runtime imports. `npm audit --omit=dev` reports zero production-dependency findings, while the upstream development-tooling findings remain tracked rather than hidden.

These are not represented as implemented in code, tests, or UI.
