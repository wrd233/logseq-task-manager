# Task Copilot vNext Developer / Agent Guide（RC）

> 工程级手册。普通用户看 `USER_OPERATIONS_GUIDE.md`。

## 1. Repo layout

- `apps/kernel-service`：唯一 Formal 写权威；bind 127.0.0.1；bearer + USER channel。
- `apps/logseq-plugin`：thin UI + trusted Graph Adapter；不写 SQLite。
- `apps/task-copilot-cli`：External Agent 只读/提案客户端 + RC 本地运维（backup/service/doctor，见 `local-runtime.ts`）。
- `packages/*`：contracts / domain / kernel / sqlite / agent / client / test-support。
- `logseq/`：测试 Graph，永远不入 Git。

## 2. CLI JSON

所有命令支持 `--json`；错误也是 JSON `{error:{code,message}}`。Agent 入口：

```sh
task-copilot agent bootstrap --json
task-copilot object context <id> --json
task-copilot agent-run start --purpose current-focus|engagement|miniproject --object <id> --evidence <id>... --json
task-copilot agent-run finish <runId> --result-file result.json --json
task-copilot proposal apply <proposalId> --wait --json
```

Forbidden 永远不变：`CREATE_WORK_OBJECT, SPLIT, MERGE, KIND_CHANGE, PROJECT_OWNERSHIP, COMPLETE_WORK_OBJECT, CANCEL_WORK_OBJECT, REOPEN_WORK_OBJECT, AMEND_CLOSURE, PARKED, HISTORY_MOVE, RAW_GRAPH_WRITE`。

`decision execute` 已从 External CLI 移除：USER decision 只能由 Plugin trusted channel 执行。

## 3. Formal mutations / decisions

- External proposal：先 `startExternalAgentRun`（Evidence ids 必须真实冻结）→ `finishExternalAgentRun`（typed result）→ `proposal apply`。
- 低风险 mutation：Kernel 重查 Evidence hash / target version / skill / taste / snapshot 后才 commit。
- Boundary / USER-only：生成 DecisionPackage，等待 Plugin USER 确认；Agent 不能 compile/execute USER decision。
- 事务：Formal Commit 原子写入 Current State + Ledger；Graph 只通过 Projection Obligation 最终一致。

## 4. Runtime / Diagnostics

- `task-copilot doctor --json`：`database.integrity|foreignKeys|schemaVersion|futureSchema`、`service.*`、`projection.backlog|degraded`、`queue.reconcileQueued|closureQueued`、`deepseekConfigured`。
- `task-copilot maintenance status --json`：reconcile jobs + closure jobs。
- `/v1/projection-health`：projection backlog/degraded；`/v1/projections/system`：runtimeStatus 与 component-aware summary。
- 单实例：SQLite `runtime_leases`（ttl 30s / heartbeat 10s）；same DB second runtime → `KERNEL_INSTANCE_ALREADY_RUNNING`。
- schema：`schema_versions` 最高 22；`SCHEMA_VERSION_TOO_NEW` fail closed。

## 5. Backup / restore semantics

- backup dir = `task-copilot.sqlite` + `manifest.json`；SQLite backup API；无 descriptor/token/env。
- restore 只接受格式 v1、schema ≤22、integrity PASS，且 service 必须停止；temp → verify → atomic rename。

## 6. Closure semantic pipeline

- Stage 1 `computeClosureGate`：CONFLICT issue / Task / intent missing / OPEN descendants / no evidence。
- Stage 2 `ClosureAssessor`：typed `items[] + objectiveJudgment`；strict syntax parser；API `json_schema strict:false` hint。
- Host `aggregateClosureSemanticJudgment`：CONTRADICTED→CONFLICT；UNSATISFIED→NOT_READY；全 UNKNOWN→UNKNOWN；部分 SATISFIED+UNKNOWN→NOT_READY；全 SATISFIED+objective SATISFIED→READY。
- Object GET 只读 cached；`closureAssessmentFresh` false 时 UI 不显示结束按钮。

## 7. Failure recovery

- Graph offline：reconcile/closure/projection fail fast + bounded retry；恢复后自动 drain。
- Kernel crash：SQLite WAL + persistent queue/obligation；restart 后继续。
- USER decision：PENDING/consumed/AUTHORIZED/EXECUTED idempotent；execute 需要 USER channel；restart 不 double apply。
- DeepSeek failure：formal state 不变；closure assessment fail-safe 不 READY；component health 恢复只靠真实成功。

## 8. Tests

`npm run check` = typecheck + lint + 216 tests + build + boundary + taste eval。新增 RC suites：
- `apps/task-copilot-cli/tests/local-runtime.test.ts`
- `packages/sqlite/tests/migration-rc.test.ts`
- `packages/test-support/tests/phase15-closure-semantic.test.ts`
