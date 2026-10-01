# Target Package Map

The integrated workbench keeps a small number of deep packages. Formal task semantics remain in the Kernel; work views and materials live in feature modules inside one Logseq plugin.

| Package | Owns | May depend on |
| --- | --- | --- |
| `packages/domain` | WorkObject, lifecycle/engagement, Anchor/Evidence/Ownership value contracts | Nothing infrastructural |
| `packages/contracts` | Closed semantic operation registry, Graph/Agent contracts, stable portable hash | Domain types |
| `packages/agent` | Versioned Skill loader and deterministic Fake Agent executor | Public contracts only |
| `packages/sqlite` | Schema v22, normalized current state, Closure history, Ledger, evidence, governance, maintenance and projection obligations | Domain and contracts |
| `packages/kernel` | Validate/prepare/apply/verify/commit, recovery, compensation Undo | Domain, contracts, SQLite |
| `packages/client` | Authenticated HTTP transport; Node descriptor reader and browser-safe entry point | Public contracts only |
| `packages/test-support` | Fake Graph Adapter and vertical integration evidence | Public clients/contracts and app entry points under test |
| `apps/kernel-service` | `127.0.0.1` composition root, descriptor/token lifecycle, route mapping | Agent, Contracts, Kernel, and SQLite |
| `apps/task-copilot-cli` | Read/audit/recovery client and local service, backup/restore lifecycle | Client; SQLite only in `local-runtime.ts` for lifecycle operations |
| `apps/kernel-console` | Local diagnostic and governance UI | Browser client and contracts |
| `apps/logseq-plugin` | One plugin: work views, external Markdown materials, task UI and real Logseq Graph Adapter | Browser client and contracts; local editor and Markdown libraries |

Plugin internals are arranged as `features/work-view`, `features/materials`, and `features/task-center`, with shared `host` and `workspace` modules. The composition root only installs settings, modules and navigation. Materials use independent per-document records; presentation layouts are scoped by Graph and root block. Neither presentation module writes formal task state or synchronizes layout to source. See [integration guide](../integration/README.md).

Enforced negative boundaries:

- Domain imports no HTTP, SQLite, Logseq, or Client code.
- Primary Ownership is a pure Domain invariant: one owner, no Project nesting, no cycles, and at most `Project -> MiniProject -> Task` depth.
- Plugin imports no SQLite implementation. CLI opens SQLite only through its local lifecycle module; business operations use the Client.
- Kernel imports no Logseq SDK.
- Kernel Service owns formal SQLite transactions; CLI lifecycle operations provide backup, restore and diagnostics.
- Generic writes authorize only the configured `USER/local-user`; the two narrow Agent writes are composed at the Service boundary and must pass operation-specific Proposal policy. Self-asserted Agent or System actors are rejected independently of bearer-token authentication.

`scripts/check-boundaries.mjs` checks these constraints on every full verification run.
