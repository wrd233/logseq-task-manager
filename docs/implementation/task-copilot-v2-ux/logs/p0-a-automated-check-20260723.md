# P0-A 自动化证据摘要

日期：2026-07-23
运行时：Node 20.20.2 / npm 10.8.2

## 定向 TDD

- `BlockFocusController`：4 项测试通过；
- 覆盖 active Primary Anchor → Focus 追加、移出后恢复原 rank、in-flight 重复提交拒绝、
  missing Anchor 零写入；
- Bootstrap：两项 Block context menu 只注册一次，真实 UUID payload 转发到 callback。

## Plugin Gate

- `npm --workspace @task-copilot/logseq-plugin run typecheck`：PASS；
- `npm --workspace @task-copilot/logseq-plugin test`：132/132 PASS，0 fail，0 skip。

## 根级 Gate

- `PATH=/opt/homebrew/opt/node@20/bin:$PATH ./scripts/check.sh`：PASS；
- typecheck、lint、全部 workspace tests、全部 builds、plugin package/bootstrap/dist、
  boundaries、145 条规则覆盖、acceptance rehearsal 全部通过；
- recovery rehearsal：`differences: []`；
- npm audit 仍为 2 high / 1 critical，属于 ADR-0007 已公开例外，本轮未 force fix；
- ignored `logseq/` dirty 只作信息展示，不进入外层提交。

## Desktop Gate

- 独立 Local Service/CLI：READY，schema v12，provider disabled；
- 真实 Logseq Desktop：filesystem descriptor 路径返回
  `SERVICE_DESCRIPTOR_PATH_INVALID`；
- 结论：P0-A 自动化代码成立，但正式 Desktop Focus/Undo 不可在连接受限状态下伪报完成；
  转入 P0-H descriptor private handshake。
