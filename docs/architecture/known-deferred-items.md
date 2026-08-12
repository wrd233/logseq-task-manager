# Known Deferred Items

Deliberately deferred from this first slice:

- External Agent, MCP adapter, built-in model runtime, proposal ranking, and broad skills.
- Full Project/MiniProject KR, closure, re-entry, Waiting, Completion, current focus, and review UI.
- Undo of `RENAME_WORK_OBJECT`; create compensation is complete, rename itself is implemented and version/hash guarded.
- Automatic manual reconciliation for `RECOVERY_REQUIRED`; the system fails closed and exposes the row.
- Service launcher/auto-start and OS-level secret store. The current descriptor is private mode `0600`; Logseq receives it through native plugin settings then Plugin-private FileStorage.
- Remote sync, multi-user auth, arbitrary ports/hosts, and server capability expansion.
- Legacy SQLite or Graph migration. vNext has zero compatibility obligation and no dual write.

These are not represented as implemented in code, tests, or UI.
