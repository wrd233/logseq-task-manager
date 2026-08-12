# Known Deferred Items

Deliberately deferred from this first slice:

- External Agent, MCP adapter, built-in model runtime, proposal ranking, and broad skills.
- System and Agent write authorization policies; the current Kernel rejects both actor types at the domain boundary.
- Full Project/MiniProject KR, closure, re-entry, Waiting, Completion, current focus, and review UI.
- Automatic manual reconciliation for `RECOVERY_REQUIRED`; the system fails closed and exposes the row.
- Service launcher/auto-start and OS-level secret store. The current descriptor is private mode `0600`; Logseq receives it through native plugin settings then Plugin-private FileStorage.
- Remote sync, multi-user auth, arbitrary ports/hosts, and server capability expansion.
- Legacy SQLite or Graph migration. vNext has zero compatibility obligation and no dual write.
- The development-only `@logseq/libs 0.3.4` type SDK currently leaves one moderate and two high findings in a full development audit. It is absent from the runtime bundle and `npm audit --omit=dev` reports zero production vulnerabilities; the upstream development-tooling finding remains tracked rather than hidden.

These are not represented as implemented in code, tests, or UI.
