# Slice C：Proposal 安全闭环实施计划

## 目标

把解释性和高影响变化收敛成一个连续用户流程：理解上下文 → 阅读最终结果与文本/语义 Diff → 按语义组接受、拒绝、调整或暂缓 → 明确提交 → 显示已生效和 Undo。Proposal 始终不是事实，所有正式写入统一经过 Local Service。

## 实施序列

| 阶段 | 交付 | 失败边界 | 当前状态 |
|---|---|---|---|
| C0 | V2 Proposal Schema、两文件渲染、Validator | shape、scope、hash、risk、dependency | 自动基础完成 |
| C1 | SQLite proposals/proposal_groups + submit/read | 非法 Proposal 零持久化；重复 ID 冲突 | 待实施 |
| C2 | Review Center 待审阅 + 四处置 + 语义组部分接受 | 高影响独立确认；依赖链不可拆 | Domain 自动规则完成；持久化/UI 待实施 |
| C3 | Stale/version/scope revalidation | Block/Object 变化阻止提交 | 待实施 |
| C4 | SemanticCommit Graph → Domain → Audit | Partial Failure 不显示成功 | ledger 可复用；编排待实施 |
| C5 | inverse Commit / Undo / Recovery | 不覆盖后续编辑 | V1 证据可复用；V2 待实施 |

## C0 已建立的合同

- `proposal.json` 固定 `schemaVersion=v2`，包含 source、read/modify scope、preconditions、语义操作组、版本/hash 与状态；运行时 Validator 接受 `unknown`，不会因畸形 JSON 泄漏 500。
- `proposal.md` 确定性包含上下文、理解摘要、修改目标、修改逻辑、最终预览、语义影响、高影响操作、未决问题及版本/来源摘要。
- 文本 Patch 必须位于 modify scope，before/after hash 必须匹配正文；语义操作目标也必须位于 modify scope。
- 高影响 operation 不能降为 MEDIUM/LOW；group/operation ID 唯一，依赖必须存在且无环。
- 部分接受以语义组为单位；接受依赖链后半段、单独接受不可独立组或未单独确认 HIGH 组都会失败。
- `/proposals/validate` 只验证并返回两文件，不写 Graph、SQLite 对象或 Proposal 元数据，不代表 submit/commit 已开放。

## Gate 纪律

- C0 自动通过不等于 Proposal 已进入正式审阅中心；
- 未完成 C3 版本重验前不得开放 Commit；
- 未完成 C4/C5 故障与 Undo Gate 前不得标记 Slice C complete；
- Desktop 必须证明用户一次连续审阅即可理解“建议、已接受、正式生效、可撤销”，不重复 V1 Pilot 的接受/提交割裂。
