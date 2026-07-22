# V2 E2E-16 Domain Failure Compensation Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`，E2E-16 可收口为 `DONE`

## 测试边界

- 使用全新隔离 SQLite、私有 0600 descriptor 和专用 Test Graph 页面；没有接触正式领域库。
- 通过既有 `/objects/synchronize` 在同一 Block UUID 上建立冲突 Anchor，作为确定性 Domain materialization failure；没有 fault API、测试状态、直接 SQLite 写入或第二恢复路径。
- Proposal 仍经 Service Validator、Plugin Review、MEDIUM 接受和独立最终确认；接受阶段正文和目标对象均未变化。

## 真实故障闭环

1. 首轮 Proposal 携带合成 Block version；`ensurePersistentIdentity` 写入 `id:: UUID` 后，提交前重验将其安全标为 `STALE`，未建立 Commit。该结果证明版本保护先于正式写入。
2. 同一稳定身份 Block 的第二个 Proposal 不再声称合成版本。用户在 Desktop 接受并确认后，Plugin 先把普通正文写成 `[任务] ...`，Service 再因既有 active Anchor 冲突返回 `COMPENSATION_REQUIRED`。
3. Plugin 没有报告成功，明确显示“领域写入失败，正文已安全恢复；未报告成功”，并把正文恢复为原普通内容；稳定 `id:: UUID` 保留。
4. Proposal 终态为 `FAILED`；SemanticCommit 终态为 `FAILED / DOMAIN_WRITE_FAILED`，`GRAPH_WRITE=COMPENSATED`、`DOMAIN_WRITE=PREPARED`。冲突注入对象仍是唯一对象，没有产生目标 Task 或重复 Anchor。
5. Doctor 回到 `PASS`，SemanticCommit 为 `COMMIT_HEALTHY / 0`。Plugin reload 后仍显示失败终态和同一恢复提示，不再提供 Commit 或 Undo。

## 收尾与复杂度

- Test Graph 页面在精确核对 page UUID、目标 Block UUID和两个空占位 Block 后删除；按 page name 删除后的 `getPage/getBlock` 均为 null。
- 私有 descriptor 已清除，Local Service 正常停止，隔离运行目录已从工作区移入系统废纸篓，可恢复。
- 本 Gate 只复用已有 Proposal、版本重验、两步 SemanticCommit、Graph 补偿、FAILED 终态和 Doctor；没有新增表、状态、协议、扫描器或恢复机制。
- 脱敏机器证据：`docs/testing/v2-e2e16-domain-failure-compensation-desktop-2026-07-22.json`。
