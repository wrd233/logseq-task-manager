# Slice C：Proposal 安全闭环实施计划

## 目标

把解释性和高影响变化收敛成一个连续用户流程：理解上下文 → 阅读最终结果与文本/语义 Diff → 按语义组接受、拒绝、调整或暂缓 → 明确提交 → 显示已生效和 Undo。Proposal 始终不是事实，所有正式写入统一经过 Local Service。

## 实施序列

| 阶段 | 交付 | 失败边界 | 当前状态 |
|---|---|---|---|
| C0 | V2 Proposal Schema、两文件渲染、Validator | shape、scope、hash、risk、dependency | 自动基础完成 |
| C1 | SQLite proposals/proposal_groups + submit/read | 非法 Proposal 零持久化；重复 ID 冲突 | 自动基础完成 |
| C2 | Review Center 待审阅 + 四处置 + 语义组部分接受 | 高影响独立确认；依赖链不可拆 | 自动基础完成；Desktop 待验收 |
| C3 | Stale/version/scope revalidation | Block/Object 变化阻止提交 | 自动基础完成；Desktop 待验收 |
| C4 | SemanticCommit Graph → Domain → Audit | Partial Failure 不显示成功 | ledger 可复用；编排待实施 |
| C5 | inverse Commit / Undo / Recovery | 不覆盖后续编辑 | V1 证据可复用；V2 待实施 |

## C0 已建立的合同

- `proposal.json` 固定 `schemaVersion=v2`，包含 source、read/modify scope、preconditions、语义操作组、版本/hash 与状态；运行时 Validator 接受 `unknown`，不会因畸形 JSON 泄漏 500。
- `proposal.md` 确定性包含上下文、理解摘要、修改目标、修改逻辑、最终预览、语义影响、高影响操作、未决问题及版本/来源摘要。
- 文本 Patch 必须位于 modify scope，before/after hash 必须匹配正文；语义操作目标也必须位于 modify scope。
- 高影响 operation 不能降为 MEDIUM/LOW；group/operation ID 唯一，依赖必须存在且无环。
- 部分接受以语义组为单位；接受依赖链后半段、单独接受不可独立组或未单独确认 HIGH 组都会失败。
- `/proposals/validate` 只验证并返回两文件，不写 Graph、SQLite 对象或 Proposal 元数据，不代表 submit/commit 已开放。

## C1/C2 已建立的合同

- schema v4 只增加 `proposals` / `proposal_groups`；v1/v2/v3 升级均要求预先校验的备份，禁止静默升级。
- `POST /proposals/submit` 只接收已通过同一 runtime Validator 的 `READY` Proposal；同 ID 同内容幂等重放，同 ID 异内容整包冲突。
- `GET /proposals` 与 `GET /proposals/{id}` 返回确定性两文件、语义状态与乐观并发 `updatedAt`。
- `POST /proposals/{id}/review` 按语义组写入接受、拒绝或暂缓；调整仍保留为 revise Proposal，不伪装成原地改写。
- Review UI 在同一上下文展示最终预览、文本 Diff、语义 Diff 和分组决定；HIGH 组使用插件内独立确认。
- UI 明确提示“已接受但尚未生效”；C3/C4 未完成前不提供假 Commit，审阅决定不写入正文或对象表。

## C3 已建立的合同

- 只有 `ACCEPTED` / `PARTIALLY_ACCEPTED` 且至少有一个已接受语义组的 Proposal 可重验；未接受组不扩大 modify scope。
- 必须重验全部 read scope 和已接受组实际引用的 modify target；缺少期望 version/hash 也是 stale，不将“无证据”当成未变化。
- Plugin 通过有界按 ID 重读 Block/Page；Block hash 是当前正文 CRC32，Page hash 是 UUID/name/originalName/updatedAt 投影 CRC32。不扫描页或 Graph。
- OBJECT 证据由 Local Service 从当前 SQLite 自行读取，客户端只能上报 BLOCK/PAGE，不能伪造对象版本。
- 缺失、无观察、版本变化或 hash 变化会把 Proposal 持久化标记为 `STALE`；成功重验是只读的，不刷新 Proposal `updatedAt`。
- Review UI 在原上下文显示“提交前检查”与具体 stale target；检查通过仍明示未生效。C4 最终 Commit 必须在准备账本时再次执行同一重验，不把早先检查当成写入权限。

## Gate 纪律

- C0 自动通过不等于 Proposal 已进入正式审阅中心；
- C4 未在准备账本时再次执行 C3 重验前不得开放 Commit；
- 未完成 C4/C5 故障与 Undo Gate 前不得标记 Slice C complete；
- Desktop 必须证明用户一次连续审阅即可理解“建议、已接受、正式生效、可撤销”，不重复 V1 Pilot 的接受/提交割裂。
