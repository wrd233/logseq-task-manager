# ADR 013: Bounded Natural Curation

Status: Accepted (Phase 7)

## Decision

Phase 7 exposes one natural-content intent: `ADD_REFERENCE`. It can add a block reference under `[资源]` or `[支撑交付物]` on the target MiniProject root. It cannot submit markdown, replace text, move content, delete history, or address another object.

The Kernel-hosted broker transports a fresh natural snapshot and typed curation. The Plugin verifies root UUID, content hash, direct-child topology hash, section identity, fresh custom UUIDs, and referenced block existence; it applies, re-reads, and verifies. Conflicts fail closed.

Formal Commit Ledger remains Formal-only. Successful natural writes create a small CurationReceipt with before/after hashes, created UUIDs, Skill/Taste identities, AgentRun, and governance correlation. No second event-sourcing system is introduced.
