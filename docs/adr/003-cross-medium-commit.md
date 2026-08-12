# ADR 003: Explicit cross-medium Commit protocol

Status: Accepted — 2026-08-12

SQLite and Logseq cannot share one database transaction. Every formal change therefore follows validate, prepare, Kernel apply, Graph apply, verify, commit. `KERNEL_APPLIED` is pending, not success. Durable intermediate stages and deterministic Graph effects make restart recovery explicit.
