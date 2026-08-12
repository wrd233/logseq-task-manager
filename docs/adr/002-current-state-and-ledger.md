# ADR 002: Normalized current state plus append-only Commit Ledger

Status: Accepted — 2026-08-12

The system is not event sourced. SQLite keeps directly queryable current tables and a structured, append-only Ledger describing formal changes. This supports simple reads while preserving audit, recovery stages, inverse information, and compensation links.
