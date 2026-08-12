# Task Copilot vNext Implementation Reconnaissance

Status: evidence complete before structural changes  
Baseline: `8c01eef5fc6c31d345c44bb3a1411c200109411e` (`v1-final`)  
Runtime: Node `20.20.2`, npm `10.8.2`, Logseq Desktop evidence from `0.10.15`

## 1. Git and repository boundary

- The authoritative outer repository is `/Users/wangrundong/work/任务管理中心-logseq插件`.
- The source baseline was on `feature/task-copilot-mvp`; its HEAD matched the locally known `origin/feature/task-copilot-mvp` ref.
- The old local `main` ref was an ancestor 534 commits behind the verified V1 baseline. There was no locally known `origin/main`; a refresh attempt failed with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`.
- One pre-existing user change exists only in the original worktree: `apps/task-copilot-local-service/package.json` contains a Logseq-generated `logseq.id`. It is not present in the isolated vNext worktree and must not be overwritten.
- `logseq/` is a nested test Graph, ignored by outer `.gitignore` via `/logseq/`; the outer index has no `logseq/**` entries. `./scripts/check-repository-boundary.sh` passed. Inner Graph dirtiness is informational only.
- Local `main`, `vnext`, and annotated tag `v1-final` now point to the verified baseline. The vNext worktree is `/Users/wangrundong/work/logseq-task-manager-vnext`.

## 2. Monorepo and build

| Concern | Current evidence | vNext judgment |
|---|---|---|
| Package manager | npm `10.8.2`; root `package-lock.json`; npm workspaces `apps/*`, `packages/*` | POSSIBLE TRANSPLANT |
| Runtime | root engine `>=20.19 <21`; `better-sqlite3` requires the verified Node 20 runtime | POSSIBLE TRANSPLANT |
| TypeScript | TypeScript `5.9.3`; strict package tsconfigs extend `tsconfig.base.json` | POSSIBLE TRANSPLANT |
| Build | esbuild scripts per app; root `scripts/build-all.mjs` | REWRITE, retaining the small esbuild pattern |
| Test runner | Node test runner through `tsx --test tests/*.test.ts` | POSSIBLE TRANSPLANT |
| Plugin build | `apps/task-copilot-logseq-plugin`, load package root, `logseq.main=dist/index.html` | REWRITE |
| Local Service | Exists; Node HTTP service, SQLite, descriptor/token, 127.0.0.1 | REWRITE around vNext contracts |
| CLI | Exists and calls the Service; no direct SQLite path | REWRITE as the vNext reference client |
| Launcher | Exists; LaunchAgent, lease/heartbeat, owned shutdown, descriptor separation | POSSIBLE TRANSPLANT after contract tests |
| Checks | `./scripts/check.sh` runs install, typecheck, lint, all tests/builds, plugin checks, architecture/rules, recovery rehearsal, repository boundary, diff check | REWRITE for the reduced vNext surface |
| Package/release | Launcher packages Service/native SQLite payload; release zip includes plugin, launcher payload, and runbook | TEMPORARILY KEEP KNOWLEDGE; rebuild only after first slice |

The baseline full check passed before refactor: typecheck, lint, all workspace tests, all builds, plugin metadata/bootstrap/dist checks, 145-rule accounting, recovery rehearsal (`differences: []`), and repository boundary. The known `@logseq/libs@0.0.17` audit result remains 2 high and 1 critical; it is not silently treated as resolved.

## 3. Current domain classification

| Concept | Current location/evidence | Judgment | Reason |
|---|---|---|---|
| Task / MiniProject / Project | `packages/domain/src/index.ts`, `v2.ts`; overlapping V1 Phase and V2 Lifecycle models | REWRITE | Replace with one WorkObject model and split lifecycle/engagement |
| Area | Included in work-object unions and ownership relations | REWRITE | vNext Area is a later `ResponsibilityScope`, not a WorkObject; omit from phase 1 |
| Candidate | `v2-candidate.ts`, `candidates` table, service/UI flows | DELETE | Explicitly removed by decision 14 |
| Proposal | V1 per-operation review plus V2 grouped partial acceptance and persistent ACCEPTED states | REWRITE/DEFER | Phase 1 user commands need typed Operations, not Agent Proposal persistence |
| Session | Creation Session domain/table/UI plus legacy Grill/Prompt flows | DELETE | No phase-1 formal responsibility; AgentRunReceipt is a later boundary |
| Anchor | `Anchor`, `V2Anchor`, SQLite `anchors`, UUID/hash/rebind behavior | POSSIBLE TRANSPLANT | Stable object ID, Graph identity, content hash, and fail-closed observations are validated knowledge |
| Commit | V1 `PENDING/COMPLETED/...` and V2 step ledger | REWRITE | vNext requires explicit PREPARED/KERNEL_APPLIED/GRAPH_APPLIED/COMMITTED states |
| Undo | Inverse commits and user-edit hash protection exist in multiple special paths | POSSIBLE TRANSPLANT KNOWLEDGE | Preserve compensation-commit and reread-before-undo semantics; remove path-specific implementations |
| Recovery | Pending/recovery scanning and specialized recovery routes exist | REWRITE | One vNext deterministic recovery scanner over one ledger |
| SQLite | `packages/persistence/src/sqlite.ts`, schema v16, 3028 lines and many migration/product tables | REWRITE | New schema starts at v1; no V1 database migration |
| Generic relations | `related_to` and SQLite `associations ... RELATED` | DELETE | No typed behavior or phase-1 need |
| Now/attention/health/cohort | Multiple domain, service, UI and governance projections/states | DELETE | No formal phase-1 responsibility; future projections must be rebuildable |

## 4. Graph integration evidence

Current code and runtime records establish the following reusable SDK knowledge:

- Reads: `Editor.getCurrentBlock`, `Editor.getBlock`, `Editor.getPage`, `Editor.getPageBlocksTree`, and `App.getCurrentGraph` have defensive runtime-shape adapters.
- Identity: Block UUID is stable across moves; deletion becomes missing. Restoring via Logseq Undo may require explicit rebind. Page runtime UUID is not assumed stable across reload.
- Mutations: `updateBlock`, `insertBlock(customUUID)`, `moveBlock`, `removeBlock`, and `createPage` have real Desktop evidence. Structural operations require exact parent/order/UUID/content verification and bounded settle.
- Events: one shared `DB.onChanged` stream, UUID coalescing, bounded subtree reads, and debounce have automated and Desktop evidence. `App.onCurrentGraphChanged` and `App.onGraphAfterIndexed` are used for lifecycle recovery.
- Marker handling: TODO syntax is a writing form; the current parser already proves that a bare TODO is not a formal object. Marker changes are not sufficient to bypass Kernel semantics.
- Properties: persisted Block `id::` and Page properties have host-shape differences; normalized keys and exact ownership/commit properties are required. Unknown shapes fail closed.
- Existing managed projection is not the vNext field-level managed-summary contract. It must be rewritten.
- Crash/reload: plugin reload, full quit/reopen, launcher-owned service shutdown/restart, descriptor cleanup, and pending/recovery surfaces have real runtime evidence.

Only the above measured behaviors are candidates for transplant. Capability Lab product code itself is not retained.

## 5. Service and IPC evidence

- The existing Service listens on an OS-selected port at exactly `127.0.0.1` and rejects non-loopback descriptors.
- A high-entropy Bearer token is generated per Service; descriptors are atomically written as non-link `0600` files and removed on shutdown.
- Protocol validation and network authentication exist, but the current API surface is very large and mixes many V1/V2 workflows.
- Plugin discovery supports private Logseq FileStorage descriptors. The proven Launcher uses a stable pairing descriptor, Graph-bound lease/heartbeat, a transient Service descriptor, owner-PID shutdown, reconnect, and last-lease reaping.
- The current Service file is 6507 lines and Service Client is 2154 lines. Numerous workflow-specific prepare/finalize/compensate routes prove the transaction technique but are not an acceptable vNext API.
- Test harnesses cover loopback/auth/protocol mismatch, process shutdown, idempotency, SQLite locking, recovery, and real Service integration.

## 6. Deletion plan

### Explicitly delete

- `apps/logseq-plugin-capability-lab/` product code.
- Existing Plugin UI and all Candidate, Creation Session, Prompt-per-flow, migration, Agent governance, Health/attention, Cohort-like, legacy Now, special AI write, and partial Proposal-apply paths.
- Old schema/migration history and V1 FileStorage formal-state runtime.
- Generic `related_to` / `RELATED` associations and generic CRUD-style operations.
- Old release evidence/docs that describe the current tree as active architecture. Git history and `v1-final` remain the archive.

### Explicitly rewrite

- Domain, Operations, Kernel Application, SQLite Current State, Commit Ledger, Local API, CLI, Plugin, Managed Projection, Undo, and Recovery.
- Root build/check/release scripts and architecture boundary checks for the reduced package map.

### Possible transplant

- Stable ID/checksum helpers.
- Defensive Logseq block/page runtime-shape parsing, UUID/hash checks, DB event debounce, and bounded settle rules.
- `0600` atomic descriptor handling, exact-loopback validation, Bearer client, structured error redaction.
- Launcher lease/heartbeat/owned shutdown knowledge, after the smaller vNext client contract exists.
- SQLite backup/locking test techniques and failure-injection helpers, not the v16 schema or migrations.

### Temporarily retain until replacement exists

No legacy runtime is retained in the vNext worktree. The separate original V1 worktree and `v1-final` tag satisfy comparison and rollback needs. Any code copied into vNext must be re-homed under a vNext responsibility and receive a vNext contract test in the same commit; otherwise it is deleted.

## 7. Target package map

```text
apps/
  kernel-service/       HTTP bootstrap, descriptor, process lifecycle
  task-copilot-cli/     reference API client only
  logseq-plugin/        UI, Graph Adapter, managed projection, kernel client
  launcher/             optional proven lifecycle shell; no domain logic
packages/
  domain/               pure WorkObject/Anchor/Evidence/Ownership invariants
  contracts/            typed Operations, Graph Effects, API wire schemas
  kernel/               validate, prepare, apply, verify, finalize, undo, recover
  sqlite/               current state + append-only ledger persistence
  client/               authenticated loopback client and descriptor validation
  test-support/         fake graph adapter and deterministic failure injection
tests/
  integration/
  failure-injection/
  golden-paths/
```

Dependency direction:

```text
domain <- contracts <- kernel <- kernel-service
                    ^       ^
                    |       +-- sqlite
                    +---------- logseq-plugin Graph Adapter
client <- CLI / Plugin / Launcher
test-support -> contracts + client (tests only)
```

The physical map may be collapsed where that removes ceremony, but Domain must never import SQLite, HTTP, Logseq, React, LLM, MCP, or CLI code.

## 8. First-slice scope

Implement only:

- `WorkObject`, `PrimaryAnchor`, `EvidenceReference`, `PrimaryOwnership`;
- `CREATE_WORK_OBJECT` and `RENAME_WORK_OBJECT`;
- vNext schema v1 current-state tables plus structured commit/operation/graph-effect ledger tables;
- `VALIDATE → PREPARE → KERNEL_APPLY → GRAPH_APPLY → VERIFY → COMMIT`;
- authenticated loopback Service, required CLI queries, Fake Graph Adapter, real Logseq formalize action, minimal managed projection, Audit, Recovery, and compensation Undo;
- failure injection for Graph throw, expected-hash mismatch, user edit before Undo, and crashes after PREPARED/KERNEL_APPLIED/GRAPH_APPLIED.

External Agent, MCP, Skill registry, current_focus, Waiting, Completion/Cancellation, Project KR UI, migration, and enterprise authorization are explicitly deferred.
