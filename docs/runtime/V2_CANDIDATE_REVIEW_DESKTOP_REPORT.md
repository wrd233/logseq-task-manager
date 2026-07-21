# V2 Candidate Review Desktop Runtime Report

> 日期：2026-07-22
>
> Logseq：Desktop 0.10.15
>
> 状态：`CREATE_CANDIDATE_DESKTOP_PASS / UPDATE_CANDIDATE_DESKTOP_PASS / E2E-12_DONE`。新建显式对象的四处置、Proposal、Review、Commit、Undo 与 reload 已通过；UPDATE 也已在真实 Logseq Desktop 完成目标选择、Diff、accepted-not-applied、Commit、reload、Undo、再次 reload 与 stale 零写入。

## 1. 隔离环境

- 专用测试 Graph：仓库 ignored `logseq/`；未修改用户正式 Graph。
- 修复后干净 SQLite：`tmp/runtime/v2-desktop/candidate/task-copilot-v2-candidate-fixed.db`。
- UPDATE 隔离 SQLite：`tmp/runtime/v2-desktop/candidate-update/task-copilot-v2-candidate-update.db`，由已验收 Association Desktop 库通过 SQLite backup 复制，仅复用其已有 Block 对象作为更新目标。
- Local Service：loopback + 0600 私有 descriptor，Graph ID `logseq-v2-desktop-20260720`。
- 测试页：`V2 Candidate Formalization Fixed 20260722`。
- 正文权威仍在 Logseq；Candidate 表没有正文副本。

## 2. 四处置与原文优先 — PASS

插件关闭时在一个专用页建立 TASK、MINI_PROJECT、DECISION、OUTPUT 四个显式 Block，重新启用后手动扫描当前页：

- 预览处理 6 个 Block，发现 4 个 Candidate；确认前 SQLite 为 Object 1 / Candidate 0 / Proposal 0，确认后仅 Candidate 增至 4，Object 与 Proposal 均不变；该 Object 是前一独立测试记录，不属于本批。
- Review Center 按“原始内容 → 进入原因 → 建议 → 来源”展示，正文由 Plugin 有界瞬态重读。
- 实际点击后 SQLite 读回 `LATER`、`DISMISSED`、`NO_MORE_LIKE_THIS`；这三条均未创建 Object、Proposal 或 SemanticCommit。
- 本地截图：`tmp/runtime/v2-desktop/candidate/candidate-four-dispositions-source-first.png`。

## 3. Desktop 暴露并关闭的提前物化缺陷

首次正式化运行发现：Candidate 为 Block 建立原生 `id::` 后，Logseq `DB.onChanged` 把插件自身属性写入重新送入显式同步，导致 Review/Commit 前 Object 已出现。该运行保留在 ignored `task-copilot-v2-candidate.db` 作为失败证据，不用于通过声明，也未手工改库。

修复复用现有 Explicit Sync Controller：

- `id::` 写入前按 Block UUID + 去身份属性正文 hash 建立 10 秒有界回声窗口；
- 窗口内所有完全相同观察均被抑制，避免旧的在途读取先消费一次性 token；
- 首个不同正文立即取消窗口并正常同步，不隐藏用户后续编辑；
- timer 在替换、失败取消、到期和 dispose 时清理，不形成无界状态；
- 自动测试真实经过 `registerExplicitSyncEvents`，覆盖“旧 traversal 在途 → upsert `id::` → 真 echo”竞争窗口。

没有新增表、协议、扫描器、写入路径或恢复机制。

## 4. 修复后完整正式化闭环 — PASS

干净数据库起点为 Object 0 / Candidate 0 / Proposal 0 / SemanticCommit 0：

| Desktop 步骤 | SQLite 真实结果 |
| --- | --- |
| 离线新建 `[任务] Candidate Commit 边界修复 20260722`，启用后扫描并保存 | Object 0 / Candidate 1 / Proposal 0 / Commit 0 |
| 点击“生成 Proposal”，等待真实 DB 事件队列完成 | Object 0 / Candidate 1 / Proposal READY 1 / Commit 0 |
| 接受语义组 | Object 0 / Proposal ACCEPTED / Commit 0 |
| 提交前检查 | scope 与版本通过；仍为 Object 0 |
| 勾选最终确认并 Commit | Object 1 / Proposal APPLIED / Candidate RESOLVED / forward Commit COMPLETED |
| 勾选 Undo 确认 | Object 0 / Candidate PENDING 且清空 active Proposal / forward Commit UNDONE / inverse Commit COMPLETED |
| 关闭并重新启用 Plugin | Object 0；原文优先 Candidate 卡片从 SQLite + Logseq 重新出现 |

Logseq 源文件保留自然正文和原生身份：

```text
- [任务] Candidate Commit 边界修复 20260722
  id:: 6a5f991a-53f9-466a-ac34-ee03648f48d0
```

关键本地截图：

- `candidate-proposal-ready-object-zero.png`
- `candidate-commit-resolved.png`
- `candidate-undo-reopened.png`
- `candidate-reload-pending.png`

均位于 ignored `tmp/runtime/v2-desktop/candidate/`，不进入 Git。

## 5. UPDATE 真实 Desktop 闭环 — PASS

在专用页 `V2CandidateUpdateDesktop20260722` 中以普通显式 TASK Block 作为来源，选择已有 TASK `Desktop Paste Event Probe 20260722` 作为目标：

| Desktop 步骤 | 真实结果 |
| --- | --- |
| 保存 Candidate | Candidate `PENDING`；目标仍为版本 4；无新 Proposal/Commit |
| 首次生成 UPDATE Proposal | Logseq 持久化 `id::` 后身份版本变化被误报 stale；目标、Proposal 和 Commit 均零写入 |
| 修复后重试 | 复用现有 Candidate rediscovery 刷新 identity-only 版本；正文 hash 变化仍拒绝 |
| 选择目标并编辑最终正文 | 审阅卡显示红/绿文本 Diff 与 `REWRITE_BLOCK`语义 Diff |
| 接受语义组 | Proposal `ACCEPTED`；目标仍为版本 4，正文未变 |
| 提交前检查 + 独立最终确认 | 同一 object_id 更新为 `Desktop Paste Event Probe UPDATED 20260722`，版本 4→5；Proposal `APPLIED`，Candidate `RESOLVED`，正向 Commit `COMPLETED` |
| Plugin reload | SQLite 和 Logseq 正文均保持新值，已生效卡可重读且提供 Undo |
| 独立 Undo 确认 | 同一 object_id 恢复旧正文，版本 5→6；正向 Commit `UNDONE`，逆向 Commit `COMPLETED`，Candidate 重开为 `PENDING` 并清空 active Proposal |
| 再次 reload | 旧正文、版本 6 与重开 Candidate 稳定读回；Pending/Recovery Commit = 0，`integrity_check=ok`，foreign key 无错误 |

Desktop 暴露的 identity-only 假 stale 修复不新增表、状态、协议或写入路径：它复用已有 `discoverCandidate`，仅当去除 Logseq `id::` 后的正文 hash 未变时刷新 Candidate 版本；正文真实改动仍保持 stale 零写入。

关键本地截图位于 ignored `tmp/runtime/v2-desktop/candidate-update/`：

- `24-proposal-created.png`：修复前 identity-only stale 明确反馈；
- `31-proposal-bottom.png`：红/绿文本 Diff 与 `REWRITE_BLOCK`；
- `36-update-committed.png`：最终 Commit 生效；
- `39-applied-card-after-reload.png`：reload 后已生效卡与 Undo 入口；
- `41-update-undone.png`：Undo 逆向 Commit 生效；
- `42-after-undo-reload.png`：再次 reload 后 Candidate 重开。

## 6. Gate 结论

- `CREATE` Candidate 的 Desktop/视觉/状态闭环：PASS。
- Candidate/Proposal 分离和 accepted-not-applied：PASS。
- later / ordinary / stable same-recommendation suppression：PASS。
- Commit / Undo / reload：PASS。
- UPDATE 真实 Desktop 已通过：用户明确选择现有 Block 对象并编辑完整最终正文；来源与目标重读后只生成单组 `REWRITE_BLOCK` Proposal，READY/ACCEPTED 零正式写入，最终复用既有 SemanticCommit 更新同一 object_id，Undo 恢复旧正文而不删除对象。
- identity-only 版本刷新和真正正文 stale 零写入均已有自动与 Desktop 证据；没有新增表、状态机、Commit 类型或恢复器。
- `E2E-12` 的原文优先、四处置、Candidate/Proposal 分离、CREATE 与 UPDATE 闭环已满足，可升级为 `DONE`。审阅中心更广的筛选、键盘和主题 Gate 仍由 `V2-VIEW-001` 独立跟踪，不回退本 E2E。
