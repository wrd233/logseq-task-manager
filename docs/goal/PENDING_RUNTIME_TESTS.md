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

## 下一次集中 Desktop 检查

以下项目必须在 V2 相应自动 Gate 完成后合并执行，不设置中间人工检查点；预计总时长不超过 30 分钟：

1. 首次启用：空 Graph、欢迎页三入口、reload、无自动扫描/迁移/模型调用；
2. Local Service 不可用/协议不兼容时，正文仍可编辑，正式语义写入明确受限；
3. SQLite 初始化、持久化、backup/restore 与 Doctor；
4. copied-data migration Scan/Preview、小批 Commit、中断继续、重复导入和单批 Undo；
5. object_id、Primary Anchor、Commit 链和 Legacy mapping 证据完整；
6. Slice C 完成后验证 Proposal review → SemanticCommit → inverse Commit；
7. Slice D 具备完整安全配置后验证真实 DeepSeek 冒烟与审阅，不以 Mock 替代。

## 已知限定

- Logseq 0.10.15 删除后 Undo 只恢复正文，不恢复可解析的原 Anchor 身份；显式 rebind 是已验证路径。
- V1 Proposal “接受”与“提交”分离且视觉层级不足；OPEN + ACCEPTED 不代表正式状态。
- DeepSeek live Gate 当前缺完整 Provider/Base URL/Model/Key reference 配置，不阻塞 Slice A-C。
