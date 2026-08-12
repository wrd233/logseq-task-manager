# First Golden Path

## Automated integration

`packages/test-support/tests/golden-path.test.ts` starts the real HTTP service on a temporary SQLite database and uses the public Client plus Fake Graph Adapter:

```text
natural record
-> explicit CREATE_WORK_OBJECT
-> PREPARED / KERNEL_APPLIED
-> deterministic Graph effect
-> exact Graph readback
-> COMMITTED
-> CLI-compatible audit
-> compensation Undo
-> natural source preserved
```

## Real Logseq Desktop evidence — 2026-08-12

Material scope was the isolated Graph under ignored `e2e-runtime/`; the user's existing Graph and original V1 working tree were not modified.

1. Logseq loaded the local `Task Copilot vNext 0.2.0` plugin and showed `Task Copilot vNext 已就绪。`.
2. The descriptor was configured through native Plugin Settings, validated, and copied to Plugin-private FileStorage. The token was not written to Graph or logs.
3. Natural block `检查核心交换机配置备份` was selected and the explicit command `正式化当前记录` was invoked.
4. Logseq displayed an owned child container, stable title block, and stable state block while leaving the source text unchanged.
5. UI reported `已正式化；Commit 676fcf16-cc7b-4610-8170-b4a2e60425f6`.
6. CLI `object list --json` showed the formal Task; `commit show ... --json` showed `COMMITTED` with matching projection hash `abe46590`.
7. `撤销最近一次正式化` reported compensation Commit `cba95c89-1fd2-4a2b-8006-e176ca99b8dc`.
8. Fresh Logseq inspection showed the natural block still present and its managed container absent.
9. CLI showed the WorkObject removed from current state, the original Commit still `COMMITTED` with `compensatedBy`, the compensation Commit `COMMITTED` with `compensationFor`, and an empty recovery queue.

An earlier real adapter mismatch caused the first Commit to remain `KERNEL_APPLIED`. After correcting Logseq's implicit `id::` identity-line normalization, the Plugin recovery command re-applied idempotently, verified the existing tree, and completed that Commit. This is retained as real lifecycle evidence rather than hidden.
