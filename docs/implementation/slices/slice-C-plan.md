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
| C4 | SemanticCommit Graph → Domain → Audit | Partial Failure 不显示成功 | 自动基础完成；最终 Review UI 已接入；Desktop 待验收 |
| C5 | inverse Commit / Undo / Recovery | 不覆盖后续编辑 | 自动基础完成；重启续跑与补偿入口已接入；Desktop 待验收 |

## C0 已建立的合同

- `proposal.json` 固定 `schemaVersion=v2`，包含 source、read/modify scope、preconditions、语义操作组、版本/hash 与状态；运行时 Validator 接受 `unknown`，不会因畸形 JSON 泄漏 500。
- `proposal.md` 确定性包含上下文、理解摘要、修改目标、修改逻辑、最终预览、语义影响、高影响操作、未决问题及版本/来源摘要。
- 文本 Patch 必须位于 modify scope，before/after hash 必须匹配正文；语义操作目标也必须位于 modify scope。
- 高影响 operation 不能降为 MEDIUM/LOW；group/operation ID 唯一，依赖必须存在且无环。
- 部分接受以语义组为单位；接受依赖链后半段、单独接受不可独立组或未单独确认 HIGH 组都会失败。
- `/proposals/validate` 只验证并返回两文件，不写 Graph、SQLite 对象或 Proposal 元数据，不代表 submit/commit 已开放。

## C1/C2 已建立的合同

- schema v4 只增加 `proposals` / `proposal_groups`；schema v5 仅解除 immutable Audit 对当前 Object 投影的外键依赖；v1..v4 升级均要求预先校验的备份，禁止静默升级。

## C4/C5 已建立的闭环

- 最终确认仍在当前 Review 卡片内；点击后先重验 scope，再建立 PENDING Commit，写 Graph、校验 after hash、写 Domain/Audit，全部完成才显示“已生效”。
- 服务中断后，同一 intent 允许 Graph 仍为 before 或已写成 after：前者继续写，后者跳过重复写并 finalize；其他 hash 一律拒绝。
- Undo 是新的 inverse Commit，不删除历史。它要求原 Object、版本、Primary Anchor 和 Graph hash 全部未变化，且没有 Ownership、Focus 或额外 Anchor。
- Undo 成功删除 SQLite 当前 Object/Anchor 投影并恢复正文；Audit 与两个 Commit 均保留，正向 Commit 标记 `UNDONE`。
- Domain/Undo 失败只在正文仍等于本事务写入值时补偿；发现后续编辑时保留 `RECOVERY_REQUIRED`，不覆盖用户正文。
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

## C4 已建立的正式化基础

- 当前受控纵向 Slice 只执行“一个 accepted 语义组 + 一个 Block Patch + 同 Block 一个 `CREATE_OBJECT`”；其他操作返回 unsupported 且零写入，不把未完成操作假装成通用 Commit。
- prepare 重复 C3 scope/version/hash 重验，以 PENDING 账本发行 Service-owned object_id；prepare 完成时 Graph 和对象数均未变。
- Plugin controller 在 Patch 前再读 before hash，写入后再读 after hash，然后才请求 Service finalize；不把 `updateBlock` 返回当作成功证据。
- finalize 经 Application Command 创建 Object + Primary Anchor + Audit + Receipt，再将 Graph/Domain steps 均标记 VERIFIED 并收口 Commit，最后将 Proposal 标记 `APPLIED`。
- Domain 写入冲突时，已 VERIFIED 的 Graph step 必须转入 `RECOVERY_REQUIRED`；Plugin 只在正文仍等于 after hash 时逆写 before text，校验后由 Service 标记 `COMPENSATED` / Commit `FAILED` / Proposal `FAILED`。
- finalize 网络结果不确定时最多幂等重试一次；不在未知服务结果下盲目补偿。后续编辑会阻止补偿并保留 `RECOVERY_REQUIRED`。
- 正式 Review UI 暂不开放 Commit 按钮：C5 inverse Commit/Undo 和重启恢复入口未完成前，不向用户暴露一个“可生效但不可撤销”的日常入口。

## Gate 纪律

- C0 自动通过不等于 Proposal 已进入正式审阅中心；
- C4 未在准备账本时再次执行 C3 重验前不得开放 Commit；
- 未完成 C4/C5 故障与 Undo Gate 前不得标记 Slice C complete；
- Desktop 必须证明用户一次连续审阅即可理解“建议、已接受、正式生效、可撤销”，不重复 V1 Pilot 的接受/提交割裂。
