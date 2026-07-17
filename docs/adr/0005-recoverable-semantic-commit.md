# ADR-0005：跨 Logseq 与 Domain Store 的可恢复 SemanticCommit

- 状态：accepted
- 日期：2026-07-17
- 影响规则：AUD-EVT-001、AUD-RBK-001、COM-ATM-001、SYN-CON-001、SYN-CON-002

## 决策

Application 先冻结接受操作并准备正文 before/after，再写入 `PENDING` Commit；随后执行 Logseq 正文、校验结果、应用领域变更/事件并标记 `COMPLETED`。任何失败都会逆序补偿；补偿无法完成时保存 `RECOVERY_REQUIRED`。启动时扫描 `PENDING/RECOVERY_REQUIRED`，仅在 before/after 可证明时自动补偿。

Undo 创建新的逆向 SemanticCommit，不删除历史；正文在提交后被用户再次编辑时停止撤销，禁止最后写入获胜。

## 验证

Application 测试覆盖成功、Domain 失败、补偿成功/失败、重启恢复和 Undo；Adapter 使用 hash 与 Graph identity 作为前置检查。
