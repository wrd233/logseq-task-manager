# Pending Runtime Tests

V1 `RT-MVP-001B..004` 已在 Logseq Desktop 0.10.15 通过；四项 copied-data Pilot 已于 2026-07-20 执行，结论为 `V1_MVP_PILOT_PARTIAL`。V1 现已冻结，不再通过扩建 V1 来追求 Pilot 成功。

## 已完成

| ID | Topic | Status |
|---|---|---|
| RT-MVP-001B | Source Resolver、Inbox 六动作、Diagnostics、reload | PASS |
| RT-MVP-002 | Proposal / Commit / Undo / Now / Re-entry | PASS |
| RT-MVP-003 | UUID move/delete/undo、Anchor conflict/rebind | PASS WITH DOCUMENTED LOGSEQ UNDO LIMITATION |
| RT-MVP-004 | FileStorage reload / backup / recovery | PASS |
| V1-PILOT | Capture / Task / MiniProject / Project copied-data Pilot | PARTIAL — 详见 `docs/runtime/V1_MVP_PILOT_REPORT.md` |
| V2-DEEPSEEK-L4 | 当前块、READY/NO_PROPOSAL、直接/调整后/部分接受、拒绝、日志与 Diagnostics | PASS — 详见 `docs/runtime/V2_DEEPSEEK_PROVIDER_L4_DESKTOP_REPORT.md` |
| V2-REASONED-LIFECYCLE | Task 空原因拒绝、取消、显式重开、reload、Service 中断读回、Lifecycle Undo | PASS — 详见 `docs/runtime/V2_REASONED_LIFECYCLE_DESKTOP_REPORT.md` |
| V2-UC28 | MiniProject Agent loading/失败/成功、三问回填、独立遗留 Proposal/Commit/Undo、非空保护 | PASS — 详见 `docs/runtime/V2_MINI_PROJECT_CLOSURE_DESKTOP_REPORT.md` |
| V2-MIGRATION | copied-data Scan/Preview、恢复点、小批 Import、重放、重启续作、Verify、Undo、重试、Activate 与只读面板 | PASS — 详见 `docs/runtime/V2_MIGRATION_COPIED_DATA_DESKTOP_REPORT.md` |
| V2-SQLITE-RESTORE | v2 快照、v3 恢复点、固定确认、停服受限、同库重启、Plugin 读回与 Doctor | PASS — 详见 `docs/runtime/V2_SQLITE_RESTORE_DESKTOP_REPORT.md` |
| V2-FIRST-RESTRICTED | 三入口首次启用、Service unavailable/protocol mismatch、reload 与普通 Graph 正文可编辑 | PASS — 详见 `docs/runtime/V2_FIRST_RUN_RESTRICTED_DESKTOP_REPORT.md` |

## 下一次集中 Desktop 检查

以下项目必须在 V2 相应自动 Gate 完成后合并执行，不设置中间人工检查点；预计总时长不超过 30 分钟：

1. object_id、Primary Anchor、Commit 链和 Legacy mapping 证据完整；copied-data 迁移、SQLite Restore 与 first-run/restricted 已通过，不重复执行；
2. Proposal 暂缓/多组依赖组合与真实 Commit process-fault 恢复交互；
3. Slice D L3/L4 已通过，不重复消耗在线额度；E2E-23 中取消、认证失败和限流继续保留非破坏性自动证据，除非真实运行自然出现对应失败才补在线分类。

## 已知限定

- Logseq 0.10.15 删除后 Undo 只恢复正文，不恢复可解析的原 Anchor 身份；显式 rebind 是已验证路径。
- V1 Proposal “接受”与“提交”分离且视觉层级不足；OPEN + ACCEPTED 不代表正式状态。
- DeepSeek L3/L4、Desktop Review Center 与默认日志/Diagnostics 已通过；安全错误在线分类只剩不宜主动制造的取消、认证失败和限流，保持 `AUTOMATED_PLUS_LIVE_PARTIAL`。
