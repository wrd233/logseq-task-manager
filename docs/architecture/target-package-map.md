# Target Package Map

The integrated workbench keeps a small number of deep packages. Formal task semantics remain in the Kernel; work views and materials live in feature modules inside one Logseq plugin.

| Package | Owns | May depend on |
| --- | --- | --- |
| `packages/domain` | WorkObject, lifecycle/engagement, Anchor/Evidence/Ownership value contracts | Nothing infrastructural |
| `packages/contracts` | Closed semantic operation registry, Graph/Agent contracts, stable portable hash and pure managed projection/closure construction | Domain types |
| `packages/agent` | Versioned Skill loader and deterministic Fake Agent executor | Public contracts only |
| `packages/sqlite` | Schema v23, normalized current state, Closure history, Ledger, evidence, governance, maintenance and projection obligations | Domain and contracts |
| `packages/kernel` | Formal commit + projection obligations; supported legacy prepare/complete, recovery and compensation Undo | Domain, contracts; consumer-defined storage ports (SQLite only in tests) |
| `packages/client` | Authenticated HTTP transport; Node descriptor reader and browser-safe entry point | Public contracts only |
| `packages/test-support` | Fake Graph Adapter and vertical integration evidence | Public clients/contracts and app entry points under test |
| `apps/kernel-service` | `127.0.0.1` composition root, descriptor/token lifecycle, route mapping | Agent, Contracts, Kernel, and SQLite |
| `apps/task-copilot-cli` | Read/audit/recovery client and local service, backup/restore lifecycle | Client; SQLite only in `local-runtime.ts` for lifecycle operations |
| `apps/kernel-console` | Local diagnostic and governance UI | Browser client and contracts |
| `apps/logseq-plugin` | One plugin: work views, external Markdown materials, task UI and real Logseq Graph Adapter | Browser client and contracts; local editor and Markdown libraries |

Plugin internals are arranged as `features/work-view`, `features/materials`, and `features/task-center`, with shared `host` and `workspace` modules. The plugin composition root installs settings, navigation and feature modules, and starts `PluginRuntime` only when tasks are enabled. Runtime owns connections, Graph Gateway, source observation and Graph/generation identity refresh; task-center owns markers, menus and user commands. `block-identity.ts` exposes scoped read-only queries without exposing its Map. Work-view imports the identity query, never task-center UI. Materials use independent per-document records; presentation layouts are scoped by Graph and root block. Neither presentation module writes formal task state or synchronizes layout to source. Work-view sources and drafts pass through a per-scope read queue and UUID renderer; semantic state changes advance the public version, DOM repaint does not. Host implements the shared FileIO contract rather than importing materials. See [integration guide](../integration/README.md) and [round 04 results](../refactoring/round-04-results.md).

Backend application capabilities define structural ports in the Kernel and Service, with the same SQLite connection supplied by `server.ts`. `FormalStore` no longer inherits Context/Reading APIs. `ContextStore` and `ReadingStore` belong to `ContextAssociations` and `UserReading`; Kernel forwarding methods were removed after migration. Service `DiscoveryStore`, `ExternalAgentStore`, `DogfoodScopeStore`, `ServiceApplicationStore`, Projection/Closure/Maintenance capabilities match actual consumer needs; coordinators import no complete SQLite implementation or `Parameters<SqliteStore[...]>`. The concrete store is confined to the Service composition/lifecycle root. ContextAssociations and UserReading own application state; ClosureReadiness explicitly maintains assessments before pure assembly; ProjectionDelivery delivers obligations for Kernel verification. ProjectionCoordinator reads captured formal snapshots and narrow coordination capabilities. Maintenance and closure assessment serialize their ticks and finish claimed jobs before database shutdown.

Enforced negative boundaries:

- Domain imports no HTTP, SQLite, Logseq, or Client code.
- Primary Ownership is a pure Domain invariant: one owner, no Project nesting, no cycles, and at most `Project -> MiniProject -> Task` depth.
- Plugin imports no SQLite implementation. CLI opens SQLite only through its local lifecycle module; business operations use the Client.
- Kernel imports no Logseq SDK. Contracts import no Node, SDK, database or Client infrastructure.
- Shared Runtime cannot import feature controllers; task UI cannot import Worker or source-observer implementations. Host cannot import feature modules.
- Formal Kernel and the Service application/query capabilities cannot import the SQLite implementation; the Service composition root supplies the ports.
- Work-view cannot import task-center modules, including re-exports and literal dynamic imports in `.ts` / `.mjs`.
- Kernel Service owns formal SQLite transactions; CLI lifecycle operations provide backup, restore and diagnostics.
- Generic writes authorize only the configured `USER/local-user`; the narrow Agent writes are composed at the Service boundary and must pass operation-specific Proposal policy. Self-asserted Agent or System actors are rejected independently of bearer-token authentication.

`scripts/check-boundaries.mjs` scans every Service source module except the exact composition root `server.ts`; the CLI SQLite exception is exactly `local-runtime.ts`. AST checks include value/type imports, re-exports, ImportType, literal dynamic import/require, relative imports, package subpaths and TypeScript aliases. Tests and build output are outside production-source scope. Twelve negative tests include remaining/future application modules and alias bypasses; the actual source scan runs in the full gate. No filename list of selected coordinators grants the rest of the app a bypass.
