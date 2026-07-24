# ADR-0007：MiniProject 原位重构使用独立多步骤结构 SemanticCommit

## 决策

MiniProject 零丢失重构不复用现有“单 Block text patch + 单对象写入”Commit planner，也不在
Plugin 内直接串联 Logseq API。预览确认后先形成一个独立 HIGH Proposal 组，其中只包含：

- `CREATE_BLOCK`：机器生成新 Block UUID，记录父级、前一相邻 Block、正文和 hash；
- `MOVE_BLOCK`：保留原 Block UUID/正文/hash，记录原父级/相邻位置和目标父级/相邻位置。

原材料禁止使用 `REWRITE_BLOCK` 或 `DELETE_CONTENT`。未归类材料不产生移动操作。Proposal 必须
读取当前 MiniProject Object version，并把 root 与所有被移动 Block 放入 modify scope；其他来源
材料进入 read scope。Proposal 同时固化完整来源 scope hash、来源结构指纹、预期最终结构指纹，
并分开保存 MOVE 的“执行前位置”与“补偿回原位置”。全部结构操作是一个不可拆 HIGH 组。

专用 prepare 为每项操作建立一个 `GRAPH_WRITE` step；Service 不执行 Graph 写入，只通过瞬态
Desktop bridge 重读整棵子树，把观察到的 before/after 位置推进为 `APPLIED/VERIFIED`。全部 step
VERIFIED 且最终结构指纹一致后才能完成 Commit 并标记 Proposal `APPLIED`。写入或核验失败进入
同一账本的 `RECOVERY_REQUIRED`，按逆序核验补偿；完整来源结构恢复后收口 `FAILED`，不能假成功。

## 代码事实

- Domain Proposal 原本支持多项 `textPatches`/`semanticOperations`，且已有 HIGH `MOVE_BLOCK`；
- Application `planAcceptedV2ProposalCommit`、Local Service 通用 Commit route、Service Client 和
  Plugin executor 都明确只支持一个 Block patch；
- `@logseq/libs` 暴露 `insertBlock(customUUID)`、`moveBlock` 和 `removeBlock`；官方宿主实现与
  真实 Logseq Desktop 0.10.15 已共同证明：无 options 的 `moveBlock` 放到目标 sibling 之后，
  `children: true` 放到目标首个 child，首个 child 插入使用 `sibling: false, before: true`；
- 现有 SemanticCommit step ledger 已复用于多步骤结构状态；没有新增表、第二恢复器或 Graph
  权威副本。自动故障注入已覆盖 prepare replay、stale 零账本、逐步 verify、完整最终指纹、失败
  逆序补偿、补偿前拒绝、恢复后 FAILED、终态 replay 和对象版本不变。

## 后果

现有单 Block Proposal/Commit/Undo 路径保持不变，通用 Commit planner 继续 fail closed。专用
Service planner/ledger/verify/recovery 与防御性 Plugin executor 已自动闭环；executor 在每次
宿主写前后都由 Service 重读、核验账本与结构指纹，重放不会重复写入，失败按逆序补偿。

真实 Desktop 的隔离 Capability Lab 已通过同一会话内 A/B/C → C/A/B → A/B/C 的 move/restore：
三个 custom UUID 与语义正文保持不变，宿主只为 custom UUID Block 增加精确 `id::` 属性行。
同时确认 File Graph 的 Page runtime UUID 即使存在 `id::` 也会在 reload 后变化，页面属性键还会
从 kebab-case 暴露为 camelCase；因此跨 reload 不能把 Page runtime UUID 当稳定身份，必须经过
独立 Rebind，且未知/冲突 registry 继续 fail closed。

本 ADR 仍未关闭：正向完成后的产品级 inverse SemanticCommit/Undo、正式 Review→Commit UI 与
跨 reload Rebind 尚未完成。若任何 identity、正文或补偿观察不匹配，保持
`RECOVERY_REQUIRED`，不得覆盖用户正文或伪报成功。
