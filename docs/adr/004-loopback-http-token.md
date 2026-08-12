# ADR 004: Loopback HTTP with a private capability token

Status: Accepted — 2026-08-12

The service listens only on `127.0.0.1`, chooses an ephemeral port, and emits a mode-`0600` descriptor with a random 256-bit token. This boring transport gives CLI and Plugin one boundary. Possession of the token authenticates the local transport but does not grant an actor domain authority.
