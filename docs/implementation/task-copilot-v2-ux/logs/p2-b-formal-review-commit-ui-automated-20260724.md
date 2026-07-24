# P2-B Formal Review → Commit / Undo UI 自动证据

日期：2026-07-24

## 结论

MiniProject 原位重构已从“可创建 HIGH Proposal，但没有用户正式应用入口”推进到
专用 Review → confirm → recoverable structure Commit → result → independent inverse Undo
的 Plugin 纵向链。该链只调用 Local Service 拥有的 plan/ledger/verify/recovery 协议，
Plugin 不自行推导结构状态。

本证据仅关闭正式 UI 与自动路由缺口，不声称完整 P2-B Desktop PASS。

## 安全边界

- 只有“单一已接受 HIGH 组 + 零 text patch + 全部为 `CREATE_BLOCK`/`MOVE_BLOCK`”
  的 Proposal 使用专用结构 Commit；其他 Proposal 不会误入。
- 用户必须显式确认最终阅读预览、删除数为 0、UUID/正文保留和整树重验。
- 每个 Graph 写入前后都回到 Service 账本；`STALE` 在零写入前结束。
- 失败且已补偿时明确告知“已恢复原结构”；人工恢复时指向同一 Commit，
  不鼓励重建 Proposal。
- Undo 是新的 inverse SemanticCommit；只有整棵子树仍等于已应用结果时才开始。
  失败 Undo 会用 forward steps 恢复到撤销前的已应用结构，不覆盖后续编辑。
- 成功后仅在仍有 session origin 时返回原 Block/Page；否则留在 Review 显示结果。

## 自动证据

- Plugin UI focused：52/52 PASS；新增用例证明专用 Commit、busy 防重入、确认边界、
  独立 Undo、FAILED Undo 告知，且不暴露通用 Commit/Undo。
- Plugin 全量：247/247 PASS。
- Plugin typecheck：PASS。
- 正式 Graph executor 的正常、replay、forward compensation、inverse Undo 和
  inverse failure recovery 回归由同一全量 Gate 覆盖。

## 仍待真实 Desktop

1. 真实 MiniProject Block 进入 Grill、最终预览和 Proposal Review；
2. 用正式按钮执行 Commit，核对 Graph/SQLite/Audit 与完成后返回原 Block；
3. reload 后读回已应用结果，执行 inverse Undo，再 reload 核对原结构；
4. Page runtime identity 变化时进入 Rebind/fail-closed，不自动认领未知 Page。
