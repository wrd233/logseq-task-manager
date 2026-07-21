# V2 Candidate Review Desktop Runtime Report

> 日期：2026-07-22
>
> Logseq：Desktop 0.10.15
>
> 状态：`CREATE_CANDIDATE_DESKTOP_PASS / E2E-12_PARTIAL`。新建显式对象的四处置、Proposal、Review、Commit、Undo 与 reload 已通过；`UPDATE` Candidate 的“更新已有对象”专用 Proposal 仍未实现，因此 E2E-12 不升级为 DONE。

## 1. 隔离环境

- 专用测试 Graph：仓库 ignored `logseq/`；未修改用户正式 Graph。
- 修复后干净 SQLite：`tmp/runtime/v2-desktop/candidate/task-copilot-v2-candidate-fixed.db`。
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

## 5. Gate 结论

- `CREATE` Candidate 的 Desktop/视觉/状态闭环：PASS。
- Candidate/Proposal 分离和 accepted-not-applied：PASS。
- later / ordinary / stable same-recommendation suppression：PASS。
- Commit / Undo / reload：PASS。
- 仍未通过：`UPDATE` Candidate 必须在用户确认目标对象后生成“更新已有对象”的专用 Proposal；不能用 `object.text` 或直接 Graph 写入伪装完成。
