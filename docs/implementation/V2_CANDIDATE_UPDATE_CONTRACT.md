# V2 Candidate 更新已有对象合同

## 目标

待整理中的 Candidate 可以由用户选择一个已有 Block 型正式对象（Task、MiniProject、Decision、Output），编辑目标的完整最终正文，并生成可审阅 Proposal。来源 Candidate 保持只读；生成 Proposal、接受语义组都不写 Graph 或正式对象。

## 单一权威与写入路径

```text
Candidate(SQLite authority) + 来源 Block(Logseq authority)
→ 用户选择已有对象与编辑最终正文
→ POST /candidates/{id}/update
→ READY Proposal(SQLite authority)
→ Review + scope revalidation
→ 既有两步 SemanticCommit(Graph write + Domain write)
→ synchronize_explicit_object
```

- 不新增表、状态机、扫描器、Commit 类型或恢复器。
- Proposal 只有一个 MEDIUM 组、一个目标 Block Patch 和一个 `REWRITE_BLOCK`；modify scope 同时锁定目标 Block hash/version 与对象 version，read scope 锁定 Candidate 来源。
- Service 从最终显式正文唯一解析对象类型和标题，并从 SQLite 重读对象和 active Primary Anchor；Plugin 在请求前重读来源与目标 Block，并拒绝 stale、类型变化、来源即目标和无 active Anchor。
- Commit prepare 将 Patch 的 before/after 解析结果与对象正文、对象版本和 active Anchor→object_id 绑定交叉验证；Application 同步命令继续携带预期 object_id，prepare 后发生 Anchor 绑定变化时进入既有补偿路径，不会更新另一对象。
- Commit 沿用现有 PENDING Graph/Domain steps、补偿和 restart replay。目标对象沿用同一 object_id/anchor_id；不会创建第二对象。
- Undo 沿用逆向 Commit：Graph 恢复审阅前正文，Application 再同步同一对象并推进版本；不会删除已有对象。后续编辑或对象变化继续零覆盖拒绝。

## 当前证据

- Application：`accepted object update plan couples one reviewed Block rewrite to one versioned existing object`。
- Local Service：`UPDATE Candidate proposes, commits, and undoes a versioned existing object without creating a second object`，包含 stale target 零 Proposal/零正式写入。
- Plugin：`Candidate update rereads source and target, then creates only one existing-object Proposal request`、`Candidate update dialog selects one existing Block object and explains Proposal-only behavior`、`Plugin Candidate UPDATE Commit rewrites the existing Anchor without issuing a new identity`。

## 当前限制

- 只支持具有 active Block Primary Anchor 的四类对象；Area 与 Project 不使用 Block 改写入口。
- UPDATE 必须保留目标 Marker；Lifecycle 变化继续走既有 Marker/Lifecycle 专用入口，避免一个正文更新 Proposal 暗含第二种状态变更语义。
- 最终正文由用户明确编辑，不自动拼接 Candidate 原文，避免模型或字符串规则静默覆盖目标。
- 真实 Logseq Desktop 的选择、Diff、Commit、Undo、reload 与 stale 交互仍需集中 Gate；在此之前 E2E-12 保持 `DESKTOP_PARTIAL_PASS`。
