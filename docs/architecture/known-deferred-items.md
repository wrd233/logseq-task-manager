# Known Deferred Items

Deliberately deferred from this first slice:

- External Agent, MCP adapter, built-in model/prompt runtime, proposal ranking, and broad skills. Phase 4 uses only deterministic Fake Agents for current focus and Engagement reconciliation.
- General System/Agent write authorization. The only Agent exceptions are Proposal-bound LOW-risk `SET_CURRENT_FOCUS` and `ACTIONABLE ↔ WAITING`; generic Agent Commit preparation remains rejected.
- PARKED transitions, Project/MiniProject Closure, Project KR settlement, child-disposition planning, review UI, waiting reminders, and scheduling. Phase 5 intentionally closes only Tasks.
- Restart/offline reconciliation of marker changes. Online `DB.onChanged` ingestion of `TODO → DONE` is supported; changes made while the Plugin is stopped are not scanned on startup because there is no durable last-seen marker baseline yet.
- A cancellation marker convention. The adapter can parse known marker strings, but Phase 5 does not assume that `CANCELED`/`CANCELLED` is a stable host workflow contract. Cancellation preserves natural source marker/text and projects `CANCELLED` in the managed block.
- Agent-authored completion drafts and richer Closure UI. Completion needs no Skill or Proposal in Phase 5; user commands generate the minimal record directly.
- Proposal inbox, ranking, batching, cross-object context gathering, conversational revision UI, and broader autonomy expansion.
- Automatic manual reconciliation for `RECOVERY_REQUIRED`; the system fails closed and exposes the row.
- Service launcher/auto-start and OS-level secret store. The current descriptor is private mode `0600`; Logseq receives it through native plugin settings then Plugin-private FileStorage.
- Remote sync, multi-user auth, arbitrary ports/hosts, and server capability expansion.
- V1 SQLite or Graph migration. vNext has zero V1 compatibility obligation and no dual write. Internal vNext schema upgrades deterministically backfill the focus and Waiting projection UUIDs so already-formal vNext objects remain usable.
- `@logseq/libs 0.3.4` remains a development dependency and currently leaves one moderate and two high findings in a full development audit. The build copies its pinned browser SDK file into Plugin `dist` so Desktop startup has no CDN dependency; the reported vulnerable transitive development tools are not runtime imports. `npm audit --omit=dev` reports zero production-dependency findings, while the upstream development-tooling findings remain tracked rather than hidden.

These are not represented as implemented in code, tests, or UI.
