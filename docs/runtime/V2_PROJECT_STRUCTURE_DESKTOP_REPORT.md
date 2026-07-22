# V2 Project 当前接口 Desktop Runtime Report

日期：2026-07-22
结论：`V2-PROJECT-001 DONE`

## 环境与边界

- Logseq Desktop 0.10.15；Node 20.20.2 Local Service；schema v12。
- 使用被忽略的专用 Test Graph 页面、全新隔离 SQLite 与私有 0600 descriptor；未接触正式领域库。
- Provider 关闭；本 Gate 未调用模型。descriptor token、Key、Authorization 和完整本地路径未写入报告或测试证据。

## 真实纵向结果

1. 从 Plugin 创建一个 Project 与 Primary Anchor。SQLite 初始 Project 为 v2，并带可重入默认摘要和一个当前推进。
2. 在 Project 重入页打开结构化编辑器，录入两项 Objective、一个 Deliverable、两个并行 Work Stage、当前摘要和两个当前推进。
3. “生成 HIGH Proposal”后 Project 仍为 v2；Review Center 明示 `UPDATE_PROJECT_INTERFACE / HIGH`，接受语义组仍不写正式状态。
4. 独立最终确认后，一个 Domain-only SemanticCommit 完成，Project 为 v3；同一屏读出完整聚合，Graph、位置与归属未变化。
5. 终止并重启真实 Logseq renderer 后，从同一 SQLite 读回 v3 全量聚合。
6. Review Center 的专用 Undo 恢复审阅前完整聚合，Project 为 v4；正向 Commit 为 `UNDONE`，逆向 Commit 为 `COMPLETED`。
7. 再次 renderer reload 后仍读回 v4 默认摘要/当前推进；Objectives、Deliverables、Stages 精确为空，没有残留部分更新。

## reload 中发现并修复的缺陷

renderer 故障会遗留一个最长 15 秒的 Graph-read claim。新 renderer 立即连接时，Service 正确返回 `GRAPH_READ_BRIDGE_ALREADY_CONNECTED`，但旧 Controller 把任何 claim 错误都当作 Service 死亡，导致 `READ_ONLY_SAFE_MODE / RESTRICTED`。

修复保留原职责边界：GraphReadBridgeController 只对该唯一、明确可恢复的远端错误做每秒一次、最多 20 次的有界接管重试；其他 transport failure 仍第一次失败即停止并进入受限态。没有增加协议、表、持久队列、扫描器或第二连接路径。自动测试覆盖短暂冲突恢复、永久冲突封顶和普通 Service 死亡不重试。修复后真实 renderer 故障复测保持同一 Local Service PID，Plugin 直接回到 `Runtime READY / Store READY`，v4 Project 可读。

## 一致性与恢复证据

- Project 最终版本：v4，结构与审阅前默认聚合一致。
- SemanticCommit：Project create `COMPLETED`；Project interface forward `UNDONE`；inverse `COMPLETED`。
- Pending / Recovery Required：0。
- `PRAGMA integrity_check`：`ok`；`PRAGMA foreign_key_check`：无记录。
- 机器可读脱敏证据：`docs/testing/v2-project-structure-desktop-2026-07-22.json`。

## 清理

测试结束后清除插件私有 descriptor value、停止隔离 Service，并仅清理精确匹配的测试页和隔离 Runtime；正式 Graph 与正式 SQLite 未修改。
