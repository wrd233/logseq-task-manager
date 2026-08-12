# ADR 001: Kernel Service is the sole formal writer

Status: Accepted — 2026-08-12

SQLite formal state and Commit Ledger are mutated only behind Kernel application methods hosted by the loopback service. Plugin, CLI, and future Agents use the same semantic HTTP API. This prevents split authority and keeps authorization, validation, inverse semantics, and recovery in one boundary.
