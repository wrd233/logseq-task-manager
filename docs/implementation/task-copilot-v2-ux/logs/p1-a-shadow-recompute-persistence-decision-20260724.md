# P1-A Shadow Recompute 与持久化有界结论（2026-07-24）

结论：`RECOMPUTE_PARITY_AUTOMATED_PASS / NO_SHADOW_PERSISTENCE / VISIBLE_FEEDBACK_REOPEN`

## 代码事实

当前 Plugin runtime 每轮只从 Local Service 的 Object、Proposal、Commit、Primary Anchor 与
Graph binding 正式投影确定性重算 candidate，再进行 reconcile/merge。用户不可见，runtime
没有调用 `markShown`、`setDisposition` 或 `setCooldown`，telemetry 只输出脱敏数量。

fresh `AttentionShadowRepository` 对同一正式 snapshot 重算后，与 reload 前得到相同：

- signal ID、signal type 与 evidence scope hash；
- raw/merged/cooled/active 与一对象一主问题 suppressed counts；
- Dynamic Now count-only current signature。

`firstDetectedAt`、累计 confirmed/detected counters 和 invalidated history 不参与当前用户投影，
也不是 Domain、Focus、Condition、Ownership 或 Audit 权威。因此当前 shadow 不需要 SQLite、
Graph 或 FileStorage derivative，避免建立第二事实源。

## 发现并修复的 session 缺陷

原 reconcile 对同一 evidence 会用 detector 的默认 cooldown 覆盖 repository 中已设置的
`until`。这会让未来可见信号即使不 reload，也可能在普通刷新后提前重现。

现在：

- scope hash 与 cooldown policy 均相同：保留 session `until`；
- evidence scope 改变：解除旧 cooldown，让新事实重新评估；
- rule policy 改变：采用新 policy 并清除不再适用的旧 `until`；
- `NEVER` 的 Recovery/Graph/Anchor 风险继续拒绝 cooldown。

focused 13/13 PASS，Application/Plugin typecheck PASS。

## 有界结论

UX-G008 对“当前未显现 Shadow 是否需要持久化”关闭为否。该结论不授权永久丢弃未来用户
偏好：首批信号开放后，如 Desktop 真实证明 reload 导致已 dismiss/cooldown 的弱提醒反复
出现并显著增噪，才重开一个有期限、可清除、无正文的 derivative store 设计。当前不改 schema。

这不是 Desktop reload 截图证据；宿主 reload 后 telemetry 是否按预期重新出现仍保留在集中
Desktop Gate，但它不再阻塞当前架构决定。
