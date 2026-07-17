# Capability Research Status

## Statically confirmed

The stable SDK declarations expose plugin lifecycle, toolbar, command palette, slash commands, current context, Page/Block operations, DataScript Query, Settings, FileStorage, and official route/Graph/DB events. The Lab compiles against those declarations without a UI framework.

## Build confirmed

TypeScript, ESLint, 13 pure-function tests, esbuild production output, package metadata, artifact checks, and repository-boundary checks run from the outer repository. Tests cover current/legacy page ownership and stable-ID drift, multiple runtime page-reference shapes, deletion scope, setting changes, legacy round-trip preservation, damaged-registry degradation, multiple historical pages, and storage keys. This confirms source/build integrity, not Desktop behavior.

## Runtime confirmation pending

All GUI and host-integrated behavior remains pending until recorded in `apps/logseq-plugin-capability-lab/docs/RUNTIME_TEST_LOG.md`: entrypoint duplication, context shapes, page/block properties, UUID stability, Settings/FileStorage persistence, event delivery/unload, and multi-page cleanup.

## Known SDK uncertainty

- Runtime Page/Block reference shapes may differ from the narrow declaration shape and require defensive adaptation.
- DataScript property representation can vary by Logseq generation.
- FileStorage location, Graph mobility, sync, and backup behavior are not established by the public type surface.
- Stable `@logseq/libs@0.0.17` carries known audit findings through historical dependencies; a forced 0.3.4 upgrade is not accepted without File Graph compatibility proof.
- A stable editing-focus event is not currently claimed.

## MVP impact

A future MVP must wait for runtime evidence before depending on UUID moves/undo, hidden properties, storage persistence, exact query shapes, or event delivery. The Graph adapter should remain separate from domain logic. DOM observation, private Logseq internals, FileStorage-as-synced-data, and assumptions generalized across File Graph/DB Graph versions remain prohibited foundations.
