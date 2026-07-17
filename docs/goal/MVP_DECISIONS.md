# MVP Decisions

| ID | Decision | Status | Evidence |
|---|---|---|---|
| ADR-0001 | Timestamp + random entropy stable local IDs | accepted | `docs/adr/0001-stable-object-identifiers.md` |
| ADR-0002 | Checksummed dual-slot JSON plus atomic filesystem adapter | accepted | `docs/adr/0002-recoverable-json-persistence.md` |
| ADR-0003 | Vanilla TypeScript Logseq UI | accepted | `docs/adr/0003-vanilla-logseq-ui.md` |
| ADR-0004 | Explicitly defer non-goal semantic families | accepted | `docs/adr/0004-mvp-deferred-semantics.md` |
| ADR-0005 | Recoverable Saga SemanticCommit and inverse Commit Undo | accepted | `docs/adr/0005-recoverable-semantic-commit.md` |

## Runtime decisions

- FileStorage physical location and sync behavior are `DO_NOT_DEPEND_ON`.
- `move_content` remains a visible, independently reviewable high-impact operation, but the formal Adapter returns `MOVE_RUNTIME_UNVERIFIED` until Desktop evidence exists.
- NoAgent is the default. Demo is local and deterministic; it never presents itself as LLM reasoning.
- npm audit findings inherited from `@logseq/libs@0.0.17` are recorded risk, not silently “fixed” through an unverified breaking SDK upgrade.
