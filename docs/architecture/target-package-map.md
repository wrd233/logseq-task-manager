# Target Package Map

The vNext repository deliberately has a small number of deep modules.

| Package | Owns | May depend on |
| --- | --- | --- |
| `packages/domain` | WorkObject, lifecycle/engagement, Anchor/Evidence/Ownership value contracts | Nothing infrastructural |
| `packages/contracts` | Closed semantic operation registry, Graph contract, stable portable hash | Domain types |
| `packages/sqlite` | Schema v1, normalized current state, append-only structured Ledger | Domain and contracts |
| `packages/kernel` | Validate/prepare/apply/verify/commit, recovery, compensation Undo | Domain, contracts, SQLite |
| `packages/client` | Authenticated HTTP transport; Node descriptor reader and browser-safe entry point | Public contracts only |
| `packages/test-support` | Fake Graph Adapter and vertical integration evidence | Public clients/contracts |
| `apps/kernel-service` | `127.0.0.1` HTTP process, descriptor/token lifecycle, route mapping | Kernel and SQLite |
| `apps/task-copilot-cli` | Reference read/audit/recovery client | Client only |
| `apps/logseq-plugin` | Explicit user commands and real Logseq Graph Adapter | Browser client and contracts |

Enforced negative boundaries:

- Domain imports no HTTP, SQLite, Logseq, or Client code.
- Plugin and CLI import no SQLite implementation.
- Kernel imports no Logseq SDK.
- Only Kernel Service constructs `SqliteStore` in production.

`scripts/check-boundaries.mjs` checks these constraints on every full verification run.
