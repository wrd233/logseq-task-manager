# RC Preflight Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-16 Phase 20 首轮。记录 RC 前置的实测数据与已修问题。

## 1. Backup / Restore

- `task-copilot backup create`：SQLite backup API（不是裸 copy），目录 0700、DB 0600；manifest：formatVersion 1 / schemaVersion / createdAt / appVersion / database / sizeBytes / integrity；secret audit 扫 manifest + SQLite 文本。
- `backup inspect`：校验 manifest、schema 匹配、integrity_check、future schema 拒绝。
- `backup restore --yes`：active runtime 拒绝；restore 到临时文件 → integrity → atomic rename；原 DB 保留为 `.pre-restore-*`。
- 实测：active writer 时 restore 返回 `BACKUP_RESTORE_ACTIVE_RUNTIME`；stop 后 restore 成功且旧数据在 side file。
- tests：`apps/task-copilot-cli/tests/local-runtime.test.ts`。

## 2. Service lifecycle

- `task-copilot service start/stop/status` 人类输出 + `--json`。
- stale descriptor（dead pid）→ status `descriptorStale=true`，不冒充 running；stop 只杀 descriptor pid。
- 12-cycle restart soak（start→status→backup→stop）全部通过；最终 doctor integrity PASS、service stopped。
- Node24 下 better-sqlite3 v11 出现 native GC assertion → 升级 v12.6.2 后消失；平台支持矩阵按 engines 声明。

## 3. Migration

- fixtures：v16/v17/v18/v19/v20/v21 → v22，数据（work object）不丢，integrity + foreign_key_check PASS。
- future schema（99）→ `SCHEMA_VERSION_TOO_NEW`，不迁移、不启动 writer。
- malformed DB → fail closed。
- tests：`packages/sqlite/tests/migration-rc.test.ts`。

## 4. Doctor

- `task-copilot doctor [--json]`：DB exists/integrity/foreign keys/schema/future；service running/pid/baseUrl/health；Graph connected；reconcile/closure queue；DeepSeek configured（boolean）。
- 人类输出不打印 secret。

## 5. Long soak（Phase20 首轮）

- 103 Formal WorkObjects（8 Projects / 25 MiniProjects / 70 Tasks），synthetic clock Day1–12。
- Day8 再次 provider failure + recovery；每天 source bursts 与 drain。
- Day12 终态：HEALTHY；Now 3；Confirmation 0；OPEN packages/candidates/issues 0；closure assessments 43 DONE；历史 failed jobs 10 保留不洗白。
- 资源/增长基线（12 天后）：SQLite 274 pages / ~1.1MB；work_objects 103；commits 115；reconcile_jobs 53；closure_assessment_jobs 51；closure_assessments 37；decision_packages 3；evidence 11；projection_obligations 8；无 freelist 膨胀，无 leak/runaway 迹象。
- 证据：`/tmp/tc-soak20/dogfood.json`（harness `tmp/phase20-soak.mts`）。

## 6. DeepSeek structured output

- API 实测：`text.format json_schema` + `strict:false` 支持；strict:true 被 API 拒绝。
- Closure assessor 已加 structured-output hint；host parser/validation 未删。
- 最新 final 40-case：falseReady 0 / falseNotReady 0 / readiness 39/40 / CONFLICT recall 8/8 / attribution 23/24 / format failure **0/40**（此前一次历史 run 为 1/40，均为 fail-safe null）。
- 修复：marker regex 允许 `{\n "kind"` 空白。

## 7. 已修 RC 问题

- user-decisions execute 现要求 trusted USER channel；CLI `decision execute` 移除。
- DB/state/backup/log 权限收紧。
- dead code 删除：`ProjectionCoordinator.closureAssessment`、`KernelClient.listObjectAnchors`、`SqliteStore.resolveClosureRecord`。
- `ClosureAssessmentCoordinator.scan()` 现在 startup 时执行一次，不再是 tests-only。
- component-aware health：closure DEEP 连续失败时 More 显示“完成情况评估暂时不可用”，不误导为全系统故障。
