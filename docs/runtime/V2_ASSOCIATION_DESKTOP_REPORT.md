# V2 Association Desktop Runtime Report

> 日期：2026-07-22
>
> Logseq：Desktop 0.10.15
>
> 状态：`ASSOCIATION_DESKTOP_PASS`。普通 `RELATED` Association 的选择、显式确认、错误、成功、SQLite 持久化与 Plugin reload 读回均通过；Primary Ownership 的 HIGH Proposal Desktop Gate 仍独立待验收。

## 1. 隔离环境

- 专用 Test Graph：仓库 ignored `logseq/`；未修改用户正式 Graph。
- 干净 SQLite：`tmp/runtime/v2-desktop/association/task-copilot-v2-association.db`，启动时 schema v10。
- Local Service：loopback + 0600 私有 descriptor，Graph ID `logseq-v2-desktop-20260720`。
- 测试页：`V2 Association Desktop Gate 20260722`。
- 正式对象：一个 TASK 来源与一个 OUTPUT 目标；两者均由真实 Logseq DB 事件经 Local Service 物化并绑定唯一 active Primary Anchor。

## 2. 显式确认与失败边界 — PASS

在 Projects / 对象页选择 TASK → OUTPUT，但不勾选“确认添加普通 Association，不改变归属”即提交：

- UI 显示“请明确确认普通 Association 不改变 Primary Ownership”，没有静默失败；
- SQLite `associations=0`；来源/目标版本保持 4/2，`primary_ownerships=0`；
- 表单可立即修正重试。

截图：`tmp/runtime/v2-desktop/association/association-confirm-required-zero-write.png`。

## 3. 正式写入与非影响面 — PASS

重新选择同一方向、勾选确认并提交后：

- SQLite 只新增一条 `TASK source → OUTPUT target / RELATED / ACTIVE`；
- 来源对象版本 4→5，目标对象保持 v2；Audit 仅新增 `add_association 4→5`；
- `primary_ownerships=0`、`focus_selections=0`；两个 Primary Anchor 的 object_id、external_id 与 active 状态均未变化；
- UI 明示成功，并显示“当前已有 1 条普通 Association”及可读的方向列表。

截图：`tmp/runtime/v2-desktop/association/association-created.png`。

## 4. Plugin reload — PASS

从 Logseq 插件管理器真实 reload Task Copilot，重新进入 Projects / 对象页：

- Runtime / Store 均 READY；
- 同一条方向、kind 与 status 从 Local Service / SQLite 重新显示；
- SQLite 仍为 Association 1、Object 2、Primary Ownership 0、Focus 0，来源/目标版本仍为 5/2。

截图：`tmp/runtime/v2-desktop/association/association-reload.png`。

## 5. Gate 结论

- 选择、方向与影响说明：PASS。
- 缺确认零写入及可修正错误：PASS。
- 单一 SQLite 事务、版本保护与 Audit：PASS。
- Primary Ownership、位置、Anchor、Lifecycle 与 Focus 非影响面：PASS。
- Plugin reload 后读回：PASS。
- 未新增表、状态、扫描器、恢复路径或用户概念；本轮只验收既有 schema v9/v10 与 Local Service 单写入口。
