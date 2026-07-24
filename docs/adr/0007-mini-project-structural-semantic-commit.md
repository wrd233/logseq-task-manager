# ADR-0007：MiniProject 原位重构使用独立多步骤结构 SemanticCommit

## 决策

MiniProject 零丢失重构不复用现有“单 Block text patch + 单对象写入”Commit planner，也不在
Plugin 内直接串联 Logseq API。预览确认后先形成一个独立 HIGH Proposal 组，其中只包含：

- `CREATE_BLOCK`：机器生成新 Block UUID，记录父级、前一相邻 Block、正文和 hash；
- `MOVE_BLOCK`：保留原 Block UUID/正文/hash，记录原父级/相邻位置和目标父级/相邻位置。

原材料禁止使用 `REWRITE_BLOCK` 或 `DELETE_CONTENT`。未归类材料不产生移动操作。Proposal 必须
读取当前 MiniProject Object version，并把 root 与所有被移动 Block 放入 modify scope；其他来源
材料进入 read scope。全部结构操作是一个不可拆 HIGH 组，接受后仍不能落地，直到专用
prepare/apply/verify/compensate/undo ledger 和 Desktop move/insert identity Gate 完成。

## 代码事实

- Domain Proposal 原本支持多项 `textPatches`/`semanticOperations`，且已有 HIGH `MOVE_BLOCK`；
- Application `planAcceptedV2ProposalCommit`、Local Service 通用 Commit route、Service Client 和
  Plugin executor 都明确只支持一个 Block patch；
- `@logseq/libs` 暴露 `insertBlock(customUUID)`、`moveBlock` 和 `removeBlock`，但当前正式 Adapter
  仍以 `MOVE_RUNTIME_UNVERIFIED` 拒绝移动，不能把 SDK 类型当 Desktop 证据；
- 现有 SemanticCommit step ledger 可表达多步骤状态，但每一步的结构 before/after 证据与逆序
  补偿尚未实现。

## 后果

现有单 Block Proposal/Commit/Undo 路径保持不变。新的结构 Proposal 可以进入 Review，但通用
Commit planner 会继续 fail closed。后续专用 executor 必须逐步写入并验证，任一步失败都逆序
恢复；若后续编辑阻止补偿，则保持 `RECOVERY_REQUIRED`，不得覆盖用户正文或伪报成功。
