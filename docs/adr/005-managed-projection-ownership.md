# ADR 005: Managed projection is a narrow owned subtree

Status: Accepted — 2026-08-12

The natural Logseq block is authoritative user context and is never rewritten. Task Copilot owns only a marked child container and stable title/state children. Exact UUIDs and hashes enable field updates, idempotent replay, and safe refusal when a user edits or expands the owned subtree.
