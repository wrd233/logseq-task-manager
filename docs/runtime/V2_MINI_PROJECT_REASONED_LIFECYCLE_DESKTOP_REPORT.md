# V2 MiniProject HIGH 原因化 Lifecycle Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`，MiniProject 原因化取消、重开与 Lifecycle Undo Desktop Gate 完成

## 隔离边界

- 使用全新隔离 SQLite 与专用 Test Graph 页面；测试对象由现有显式同步入口基于精确 Block UUID、去身份正文 hash 和 `[MiniProject]` 语法建立。
- 测试对象始终使用同一 object_id、active anchor_id 与 Block UUID；没有直接写 SQLite、没有 Provider 调用，也没有修改用户正式 Graph。
- 本 Gate 只验证原因化 `CANCEL / REOPEN`，不替代已完成的 MiniProject 三问 Closure / DONE Gate。

## 取消

1. 对 OPEN MiniProject 打开“取消 MINI_PROJECT”；空原因在插件内明确拒绝，对话框保持可修正，Proposal 数量仍为 0。
2. 填写原因后只创建一个 `READY` Proposal；组风险为 `HIGH`，正文、Object 和 Anchor 未变化。
3. 独立确认接受 HIGH 组后，Proposal 为 `ACCEPTED`，对象仍为 `OPEN v3`，Commit 数为 0。
4. 再执行专用“确认取消对象”，对象才变为 `CANCELLED v4`；Proposal `APPLIED`，正向单步 Domain SemanticCommit `COMPLETED`。
5. plugin reload 后完整原因和“撤销取消”仍可读，active Anchor 保持原 UUID；Graph 正文未改。

## 显式重开与 Undo

1. CANCELLED 对象只提供“重开 MINI_PROJECT”；空原因同样零 Proposal 拒绝。
2. 填写重开原因后生成另一个独立 HIGH Proposal；接受后对象仍为 `CANCELLED v4`，没有新增 Commit。
3. 专用最终确认后对象为 `OPEN v5`，重开 Proposal `APPLIED`，正向 Commit `COMPLETED`；Condition 仍 `ACTIONABLE`、Closure 仍为空、Anchor 仍 active。
4. reload 后完整原因与“撤销重开”恢复；用户确认 Lifecycle Undo 后对象为 `CANCELLED v6`。
5. 重开正向 Commit 为 `UNDONE`，逆向 `lifecycle-undo:*` Commit 为 `COMPLETED`；再次 reload 后显示“原 Commit 已撤销”，不再提供重复 Undo。

## 收尾与复杂度

- Graph 正文始终为 `[MiniProject] Lifecycle Gate 20260722` 加稳定 `id::`；Lifecycle 操作没有改写正文、Anchor、Condition、Focus、Ownership 或 Closure。
- `PENDING/RECOVERY_REQUIRED=0`；Doctor `PASS`，SemanticCommit `COMMIT_HEALTHY`，Graph bridge `CONNECTED`。
- 专用页面在校验 page UUID、目标 Block UUID 和唯一空占位 Block 后删除；隔离 Service/数据库在证据固化后清理。
- 只复用现有 Proposal、HIGH Review、对象版本、Lifecycle Application Command、SemanticCommit、Receipt 与 Undo；没有新增表、状态、协议、扫描器或恢复路径。
- 脱敏机器证据：`docs/testing/v2-mini-project-reasoned-lifecycle-desktop-2026-07-22.json`。
