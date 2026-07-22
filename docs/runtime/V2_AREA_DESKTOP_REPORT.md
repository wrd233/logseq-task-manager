# V2 Area 受控创建与编辑 Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`

## 用户闭环

- `Projects / 对象` 工作区现在提供受 Local Service 可写状态约束的 Area 创建表单；空值、Service 受限和请求期间重复点击均不会产生正式写入。
- 真实创建 `健康与可持续节奏` 后，插件立即显示同一 Area：`OPEN / ACTIONABLE / v1`；SQLite 只有一个 `AREA` 对象。
- 通过就地对话框编辑责任描述后，同一 `object_id` 从 v1 进入 v2，并写入 `edit_area` Audit/Receipt。
- 在 v2 对话框打开后，使用另一个合法 Service Client 先将对象更新为 v3；旧对话框保存时显示“不会静默覆盖”错误，SQLite 保留 v3 和新正文。运行验收发现错误后仍保留过期对话框，已改为冲突时关闭旧上下文，让用户从最新 v3 重新编辑。

## 权威与复杂度

- 创建和编辑均为 `Plugin → Local Service → V2Application → SQLite`；没有 Plugin 直写 Store。
- 编辑复用现有 `objects` / `audit_events` / `command_receipts` 与乐观版本保护，未新增表、状态轴、SemanticCommit 类型、扫描器或恢复路径。
- Area 页面在规范中是可选 Anchor；本闭环没有自行发明 `Area/<名称>` 约定。两种可能页名均在 Logseq API 中返回 `NOT_FOUND`，SQLite Anchor 计数为 0。

## 真实证据

- 最终 SQLite：1 Area，v3，`OPEN`，0 Anchor；Audit 为 `create_object, edit_area, edit_area`，Receipt 计数为 1/2。
- Doctor：`PASS`，`integrity=ok`，11 PASS / 1 WARN / 0 FAIL / 2 INFO；唯一 warning 是该临时库尚无 Backup，Graph bridge 为 connected。
- stale 保存后，用户试图提交的旧文本未出现在 SQLite。
- 脱敏机器证据：`docs/testing/v2-area-controlled-desktop-2026-07-22.json`。

## 范围边界

本 Gate 完成 V2 Area 的最小正式支持：创建、编辑、列表与版本冲突保护。Project 归属 Area 的 Domain/Proposal/Commit 能力已存在；后续同一真实 Area 已通过 Now Work 类型筛选与分组 Gate，证据见 `docs/runtime/V2_NOW_WORK_PROJECT_AREA_FILTER_DESKTOP_REPORT.md`。键盘和深浅主题仍属 `V2-VIEW-001` 剩余 Desktop Gate。
