# P2-C Blank Project Creation — Service + Real Provider Gate

Date: 2026-07-25

## Result

The Blank Project creation entry now crosses an authenticated Local Service route, receives a
server-built zero-object Context Package, invokes the configured real DeepSeek Provider, and returns
one validated `SESSION_DRAFT_ONLY` Grill turn.

Sanitized final evidence:

```json
{
  "gate": "PASS",
  "readiness": "CONTINUE",
  "focus": "outcome",
  "authorityBoundary": "SESSION_DRAFT_ONLY",
  "skillName": "project-creation-modeling",
  "skillVersion": "1.0.0",
  "model": "deepseek-v4-flash",
  "attempts": 1,
  "durationMs": 16720,
  "objectCount": 0
}
```

The credential was resolved through the existing Keychain reference. No credential, prompt, model
content, local path, token, or response body was emitted into this evidence.

## Failure and recovery evidence

Two earlier real responses were rejected before the final PASS:

1. an unsupported top-level `format` field;
2. a string-array `unknowns` shape.

Both returned `GRILL_TURN_VALIDATION_FAILED`, created no Object, and used disposable isolated
SQLite files that were removed after the run. The fix strengthened the final machine
`outputContract` with an exact top-level allowlist and readiness-specific JSON shape. The Validator
was not relaxed.

## Automated evidence

- authenticated Service route returns the machine focus and versioned Skill;
- caller-provided `materials` is rejected with HTTP 400 before Provider use;
- formal object count remains zero;
- generator prompt test locks the wrapper prohibition and object-array shape;
- Local Service typecheck passes.

## Remaining P2-C boundary

- Blank Service + real Provider turn: PASS.
- Blank Plugin/Desktop multi-turn UI: OPEN.
- Page server-owned Graph-source route and post-Provider scope revalidation: AUTOMATED PASS.
- MiniProject server-owned Object/Anchor/Graph-source route: IMPLEMENTED, dedicated bridge/stale
  test OPEN.
- final reading preview, Review, prepare/page/finalize, failure/recovery/Undo/reload/return: OPEN.
- overall UX productization Goal: IN_PROGRESS.
