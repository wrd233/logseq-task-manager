# Personal Operations System / Logseq Plugin

This is the authoritative development repository for **Task Copilot**, a local-first personal work operating system embedded in Logseq. It contains both the preserved Capability Lab and the formal MVP plugin.

## Repository layout

- `apps/logseq-plugin-capability-lab/` — preserved SDK experiment; it is not the domain authority.
- `apps/task-copilot-logseq-plugin/` — formal loadable MVP plugin.
- `packages/domain/` — objects, relations, state machines, signals, Proposal operations.
- `packages/application/` — commands, queries, recoverable SemanticCommit and providers.
- `packages/persistence/` — checksummed dual-slot JSON store, atomic filesystem adapter and recovery bundle.
- `packages/logseq-adapter/` — defensive Logseq runtime-shape and FileStorage adapters.
- `docs/goal/`, `docs/mvp/`, `docs/adr/`, `docs/runtime/` — persistent Goal state, traceability and evidence.
- `scripts/` — unified checks for source quality and repository isolation.
- `logseq/` — ignored local Logseq File Graph fixture with its own nested Git repository.

The test Graph is intentionally absent from the outer Git index. Logseq and local automation may freely make it dirty; those runtime changes are not an outer source commit gate.

## Install and check

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci
./scripts/check.sh
```

Run the complete repository workflow from the outer root:

```bash
./scripts/check.sh
```

## Load in Logseq

Build the workspace, open the local `logseq/` Graph in Logseq Desktop, enable Developer mode, and choose **Load unpacked plugin** with the formal plugin path:

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

Do not select `dist/`. The Capability Lab remains separately loadable only for bounded SDK experiments. Follow `docs/goal/PENDING_RUNTIME_TESTS.md` for the consolidated MVP checkpoint.

## Why the Graph is ignored

The Graph is mutable runtime data: Logseq may auto-save pages, plugin experiments create marked blocks, and other local processes may update pages. Tracking it from the outer repository would mix product source with test-fixture state. Its nested `.git` is preserved for local provenance, but neither repository may be pushed while the local pre-push guards are installed.

## Runtime failure diagnostics

The formal plugin has a Diagnostics view with bounded structured logs, copy/export controls and read-only Source Resolver / Inbox Action probes. Inbox failures show a `TC-...` diagnostic ID and explicitly state whether Capture and Logseq content remain safe. See `apps/task-copilot-logseq-plugin/README.md` and `docs/goal/PENDING_RUNTIME_TESTS.md`; a bare numeric source such as `19` is always a defect and must never be treated as a page display name.
