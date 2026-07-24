# P1-A Attention Signal 纯模型与影子仓库自动证据（2026-07-24）

结论：`PARTIAL_AUTOMATED_PASS / RUNTIME_AND_PERSISTENCE_OPEN / USER_VISIBLE_FORBIDDEN`

## 已实现

- Application 层纯派生 Attention Signal candidate/record；
- first detected / last confirmed / invalidation 生命周期；
- urgency / certainty / context relevance；
- proposed display level/surface；
- merge target / cooldown / shown count / user disposition；
- rule / Skill / Prompt / model version provenance；
- 仅含机器引用与 hash 的 evidence scope；
- bounded session repository、显式 clear 和结构化 metrics。

## 安全边界

- repository 只接受 `SHADOW / NONE`，拒绝任何用户可见 level/surface；
- 没有 Object/Condition/Lifecycle/Focus/Ownership 写接口；
- 没有 Proposal/Commit/Graph/SQLite/FileStorage 端口；
- source fact 只允许 bounded machine code、opaque reference、timestamp、SHA-256 fingerprint；
- 类型中没有完整正文、summary 或自然语言 evidence 值；
- `COMMIT_PENDING / COMMIT_RECOVERY_REQUIRED / Graph mismatch` 所需的不可冷却能力由
  `cooldown.policy = NEVER` 表达，repository 拒绝为该记录设置 cooldown；
- 达到容量时只可淘汰 invalidated 历史；若 active 仍超限则显式失败，不静默丢弃主问题。

## 自动 Gate

- required fields 与 no-full-text shape；
- 首次检测、重复确认和事实消失失效；
- 新 scope hash 解除 cooldown，但仍保持 `SHADOW / NONE`；
- shown/disposition 结构化记忆；
- Recovery 不可冷却；
- capacity、clear、metrics；
- visible candidate 和 plaintext-shaped evidence 拒绝；
- Application tests 75/75、0 skipped；
- Application typecheck PASS。

## 未完成

- 尚未实现 P1-B deterministic detector、merge/priority；
- 尚未接 Local Service / Plugin runtime；
- 尚未持久化，reload 后不会保留 first detected/disposition；
- UX-G008（SQLite derivative table vs recomputable cache）保持开放；
- P0 Desktop Gate 未完成前不得在 Now/Toolbar/Block 显示这些记录。
