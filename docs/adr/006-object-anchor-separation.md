# ADR 006: WorkObject identity is independent of Graph anchor

Status: Accepted — 2026-08-12

WorkObject stores semantic identity and lifecycle/engagement state. PrimaryAnchor is a separate relation carrying Graph identity, source hash, and projection UUIDs. Moving or rebinding work context therefore does not redefine the formal object ID.
