# V2 Now Work Project / Area 筛选 Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`

## 用户闭环

- 在真实 Logseq Desktop 中将一个无 Graph Anchor 的 Area 和一个带 active primary Anchor 的 Project 加入 Focus，完整列表保持 Area rank 0、Project rank 1。
- 选择 `Area + 按类型分组` 时只显示 Area；选择 `Project + 按类型分组` 时只显示 Project，分组标题和卡片类型一致。
- 两个局部视图均明确提示“筛选不会改变正式状态”，且隐藏基于局部列表的上移/下移入口；用户必须回到 `全部 + 混排` 才能调整完整 Focus 顺序。
- Project 卡片保留“打开正文”入口；Logseq API 读回 `Project/Now Work Project 筛选验收 20260722` 的真实页面 UUID，与 SQLite active primary Anchor 的 `external_id` 一致。

## 权威与零写入证据

- 筛选前后 Local Service `/now-work` 始终返回同两个 object_id：Area v3 与 Project v2；`focus_selections` 始终为两行、rank 分别为 0/1。
- 点击 Area、Project 和按类型分组后，`audit_events` 仍为 4 条；筛选没有产生 Application Command、Receipt、Graph 写入或领域状态变化。
- 测试 Project 通过既有 `Plugin → Local Service → Logseq page verification → Application → SQLite` 原子入口创建；没有绕过正式写路径。
- 本 Gate 没有新增表、状态、协议、扫描器、恢复路径或第二权威，只验证既有会话级 view state。

## 真实证据

- SQLite 最终对象：Area `OPEN / ACTIONABLE / v3`；Project `OPEN / ACTIONABLE / v2`。
- Focus：Area rank 0、Project rank 1；筛选前后完全一致。
- Anchor：Project 有一个 `primary_text / active` Anchor，`external_id=6a60ad08-1e54-49d2-9c00-5aed8a464c22`；Area Anchor 为 0。
- Audit：`create_object, edit_area, edit_area, create_project_with_page`；筛选没有新增 Audit。
- 脱敏机器证据：`docs/testing/v2-now-work-project-area-filter-desktop-2026-07-22.json`。

## 范围边界

本 Gate 完成 `V2-VIEW-001` 的 Project / Area 类型筛选与按类型分组 Desktop 验收。键盘操作、深浅主题和 Review Center 整体视觉 Gate 仍未完成，因此 `V2-VIEW-001` 保持 `DESKTOP_PARTIAL_PASS`。
