# Repository Cleanup Record

Date: 2026-08-12  
Baseline archive: annotated tag `v1-final` at `8c01eef5fc6c31d345c44bb3a1411c200109411e`  
Working branch: `vnext`

## Removed from the vNext current tree

- All legacy app runtimes: Capability Lab, V1/V2 Plugin, Local Service, CLI, and Launcher implementations.
- All legacy packages: Application, Domain, Logseq Adapter, Persistence, Service Client, and Shared implementations.
- Candidate entity and review lifecycle.
- Creation Session and legacy Grill/Prompt-per-flow runtimes.
- Partial Proposal acceptance, Proposal groups, persistent ACCEPTED states, and generic update operations.
- Generic `RELATED` associations.
- V1 SQLite schema versions 1–16, migrations, migration UI, and legacy import runtime.
- Agent governance, Health/attention, old Now/Focus, Provider, and special direct-write paths.
- Old product UI, release evidence, migration documentation, runtime reports, skills, and Capability Lab evidence from the current tree.
- Old root build, check, release, and repository narratives that described V1/V2 as current architecture.

## Preserved outside the current tree

- Complete Git history and `v1-final` provide the only V1 code archive.
- The original V1 worktree remains at `/Users/wangrundong/work/任务管理中心-logseq插件` and was not switched or cleaned.
- The pre-existing user edit in that worktree remains untouched.
- The ignored nested `logseq/` Graph remains untouched and outside the vNext worktree.
- Frozen vNext design documents and the evidence-based Implementation Reconnaissance remain in `docs/vnext/` and `docs/architecture/`.

## Transplant policy

No legacy module was copied wholesale. A measured implementation detail may return only when:

1. it serves the first golden path or one required failure path;
2. it is re-homed under a vNext responsibility;
3. it does not retain a V1 API, schema, entity, or migration branch; and
4. a vNext contract test proves the behavior through the new public interface.

## Recovery

Every deletion is recoverable with ordinary Git inspection of `v1-final`. There is no `legacy/`, `old-v1/`, compatibility package, orphan branch, history rewrite, force push, or Graph deletion.
