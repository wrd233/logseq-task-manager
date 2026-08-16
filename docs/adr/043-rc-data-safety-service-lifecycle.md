# ADR 043 — RC Data Safety and Service Lifecycle

- 状态：accepted
- 日期：2026-08-16

## 1. 决定

RC 前新增本地运维入口，全部走 `task-copilot` CLI，不引入 daemon framework：

- `backup create`：SQLite backup API；备份目录含 `task-copilot.sqlite` + `manifest.json`（formatVersion 1 / schemaVersion / createdAt / appVersion / sizeBytes / integrity）；不含 descriptor/token/Graph/env。
- `backup inspect <dir>`：manifest/schema/integrity 校验；future schema 拒绝。
- `backup restore <dir> --yes`：active runtime 拒绝；临时文件 → integrity → atomic rename；失败保留现有 DB。
- `service start|stop|status`：pid/descriptor/lease 真实语义；stale pid 不报 running；stop 只杀 descriptor pid。
- `doctor [--json]`：DB integrity / foreign_key_check / schema / future schema / service / Graph / queue / DeepSeek configured。

## 2. Security defaults

- Kernel state dir 0700；DB 0600；service 进程 umask 077。
- backup dir 0700、backup DB 0600、manifest 0600。
- `POST /v1/user-decisions/:id/execute` 要求 trusted USER channel；External CLI 不再暴露 `decision execute`。
- `GET /v1/status` 只返回 `deepseekConfigured` boolean，不返回 key。

## 3. Migration gate

- `SqliteStore` 支持 schema ≤22；更高版本 `SCHEMA_VERSION_TOO_NEW`，拒绝迁移和 runtime writer。
- v16–v21 历史 fixture 自动迁移到 v22，integrity + foreign_key_check 通过。

## 4. 验收

- `apps/task-copilot-cli/tests/local-runtime.test.ts`
- `packages/sqlite/tests/migration-rc.test.ts`
- 12-cycle restart soak + 12-day 103-object long soak（`docs/experience/RC_PREFLIGHT_EVALUATION.md`）
