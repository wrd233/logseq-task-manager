# P2-A MiniProject Grill Service — Automated Evidence — 2026-07-24

## Scope

This gate covers a Local Service vertical route for session-only MiniProject Grill turns. It uses the
same authenticated loopback Service and Logseq Graph read bridge as the product runtime. Provider
content is mocked here; this is not a real DeepSeek or Logseq Desktop UI acceptance result.

## Implemented chain

1. Client supplies only formal MiniProject identity/version and up to four bounded user answers.
2. Service requires one OPEN MiniProject and its active Primary Anchor.
3. Graph read bridge reads only that exact Block subtree with children; Context Package combines the
   subtree with SQLite formal objects and relations.
4. Machine authority derives facts, real unclassified material, four safety dimensions, priority,
   focus, readiness, evidence scope, source fingerprint, Prompt/Skill version, and Provider provenance.
5. `mini-project-modeling@1.0.0` asks the largest current uncertainty without emitting a Proposal or
   operation. The strict Grill Validator rejects invented evidence and fields.
6. After Provider completion, Service rechecks object version, Primary Anchor identity, and a fresh
   subtree `scopeHash`. Any source change discards the draft.
7. The response remains `SESSION_DRAFT_ONLY`; no Graph, SQLite, Proposal, Commit, Focus, or Ownership
   write occurs.

## Automated evidence

```text
Application Grill contract: 4/4 PASS
Grill generator + authority builder + Skill focused tests: 7/7 PASS
Local Service focused two-turn/stale route: PASS
Local Service full suite: 108/108 PASS, 0 skipped
Service Client full suite: 12/12 PASS, 0 skipped
Local Service and Service Client typecheck: PASS
```

The route test proves:

- first turn focuses the boundary exposed by loose subtree material;
- a bounded user answer becomes an opaque-referenced session fact;
- second turn advances to outcome rather than repeating a fixed field sequence;
- a changed Graph subtree after Provider use returns `GRILL_SOURCE_STALE` and no draft;
- unknown client uncertainty IDs fail before Graph read and Provider;
- formal Service status is byte-for-byte unchanged across successful turns.

## Open gates

- real DeepSeek semantic quality and failure behavior;
- Plugin entry, multi-turn state, loading/error/stale/reload and return to the source Block;
- final Structure Preview and zero-loss checks;
- handoff through existing Proposal Review, one SemanticCommit, Undo and Recovery;
- privacy-safe Grill interaction evidence and version feedback;
- Desktop Light/Dark/sidebar/zoom/narrow-column evidence.
