# P2-B MiniProject Restructure Proposal Route — Automated Evidence — 2026-07-24

结论：`SERVER_OWNED_REVIEW_ROUTE_PASS / FORMAL_GRAPH_WRITE_CLOSED / DESKTOP_OPEN`

## 已证明

- Preview handle 是不透明 session capability：TTL 30 分钟、容量 64、LRU、Service close/restart 清空；
- Proposal route 只接受 `objectId / expectedVersion / previewHandle`，不接受 preview、正文、operation、
  UUID 或 scope；
- Service 使用 handle 内部的已验证 preview 与 answers，重新读取并前后重验 Object、Primary Anchor
  和完整 subtree scope hash；来源变化返回 stale，过期/跨 session 返回 expired；
- Proposal ID 与新 Block UUID 由 Service 对当前 Graph/source/preview 确定性生成；
- Domain 拒绝重复创建 UUID、越界父级/相邻位置、hash 不匹配、风险降级与无变化移动；
- 只写一个 READY HIGH Proposal + Group；不再次调用 Provider，不改 Graph、对象、Anchor、Focus、
  Ownership、Lifecycle 或 Condition；
- Plugin 显示 loading/error，成功后进入“待我确认”；没有结构 Commit 或应用按钮。

## 自动 Gate

- focused Local Service route/session/source tests：55/55 PASS；Local Service 全量 113/113；
- focused Plugin controller/UI：58/58 PASS；Plugin 全量 239/239，typecheck/build PASS；
- Application 135/135、Domain 42/42；根级 `scripts/check.sh` PASS、0 skipped、rule coverage 145、
  recovery rehearsal differences `[]`。

## 未声明

结构 Proposal 接受后的多步骤 Graph ledger、insert/move Desktop identity、逆序 compensation、Undo、
Recovery 和完整 Desktop route 尚未实现。因此本证据不声明 P2-B 完成，也不允许用通用单 Block
Commit 执行该 Proposal。
