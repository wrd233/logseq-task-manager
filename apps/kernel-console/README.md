# Task Copilot Kernel Console V0

Formal World Observer for Task Copilot vNext.

## Run

The console is served by the Kernel Service itself at `/console` when built:

```bash
npm run build --workspace @task-copilot/kernel-console
npm run start --workspace @task-copilot/kernel-service
```

Then open `http://127.0.0.1:<kernel-port>/console`.

## Development

```bash
npm run typecheck --workspace @task-copilot/kernel-console
npm test --workspace @task-copilot/kernel-console
npm run build --workspace @task-copilot/kernel-console
```

## Boundaries

- Console reads the Formal World only through Kernel Service HTTP API.
- It never reads SQLite directly and never performs Formal mutations.
- The only persistent writes are object read baselines (`/v1/console/viewed`).
- Search returns Formal WorkObjects, not raw natural blocks.
