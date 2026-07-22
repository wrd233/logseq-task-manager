# V2 Commit / Undo 真实进程故障 Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`，`V2-COMMIT-001` 与 `E2E-10` 可收口为 `DONE`

## 测试边界

- 使用专用 Test Graph 页面和一个普通 Block；Proposal 是单组 MEDIUM Formalization，最终正文为 `[任务] Process fault source 20260722`。
- 两次故障都通过真实终止 Local Service 进程制造；没有 fault API、测试专用状态、第二写入口或新的恢复协议。
- 进程重启沿同一 SQLite、同一 Proposal、同一 SemanticCommit 与同一 Block UUID 恢复。

## Commit 进程故障

1. Proposal 经真实 Service validate、submit、Review 进入 `ACCEPTED`；审阅仍未改变正文或对象。
2. 既有 `/commit/prepare` 先持久化正向 SemanticCommit；状态为 `PENDING`，Graph/Domain 两步均为 `PREPARED`，Object 仍不存在。
3. 终止 Local Service 后，插件切入 Runtime Diagnostics，显示 `RESTRICTED` 与 `formal writes false`，没有显示假成功或开放正式写入口。
4. 同一 SQLite 重启并 reload 插件后，Review Center 仍显示 `ACCEPTED` 与“确认最终提交”。用户确认后复用同一 semantic_commit_id；没有第二 Commit。
5. 结束时 Proposal `APPLIED`，Task 与 active Primary Anchor 各一，Graph/Domain 两步均 `VERIFIED`，正向 Commit `COMPLETED`。

## Undo 进程故障

1. 对上述正向 Commit 调用既有 `/undo/prepare`；逆向 Commit 为 `PENDING`，Graph/Domain 两步均 `PREPARED`。
2. 再次真实终止 Local Service；插件保持 `formal writes false`，没有改写 Graph 或删除 Domain 投影。
3. 同一 SQLite 重启并 reload 后，“撤销本次生效”仍可见。用户显式确认后沿同一逆向 semantic_commit_id 完成。
4. 正文恢复为普通文本并保留稳定 `id::` 身份；测试 Object 和 active Anchor 均为 0；正向 Commit 为 `UNDONE`，逆向 Commit 为 `COMPLETED`，四步全部 `VERIFIED`。
5. 再次 reload 后仍显示“原 Commit 已撤销”且不再提供重复 Undo；`PENDING/RECOVERY_REQUIRED=0`。

## 收尾证据

- Doctor：`PASS`；SemanticCommit `COMMIT_HEALTHY`，Graph bridge `CONNECTED`。
- 专用测试页在校验 page UUID、目标 Block UUID 和唯一空占位 Block 后删除；`getPage` 返回 null。
- SQLite 保留 Proposal、Audit 和 SemanticCommit 历史作为恢复证据；测试 Object/Anchor 当前投影已由 Undo 精确移除。
- 脱敏机器证据：`docs/testing/v2-commit-undo-process-fault-desktop-2026-07-22.json`。
