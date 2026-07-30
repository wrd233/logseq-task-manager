# P0 未完成修改前台与 Undo Desktop Live Gate（2026-07-30）

## 环境

- Branch：`feature/task-copilot-mvp`
- 前台统一实现：`38838487863d`
- stale 历史收敛：`78528f74d807`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`（测试环境）
- Theme：host Light / Plugin Dark
- Viewport：`1000×720`
- Service：Launcher owned，schema `12`，正式写入可用
- 测试 Page：`Pilot Day 8 Review Backlog`
- 测试 Block：`Verify Task Copilot shows one primary issue for unfinished changes #TaskCopilotPilot`

没有使用 Provider；API Key、Service token 和普通正文未进入截图、仓库或报告。

## 自动证据

- TDD red：stale 方案仍显示为 `待审阅 (1)` 并占据当前问题区；
- TDD green：stale 方案从当前计数和当前卡片移除，保留在默认折叠历史；
- Plugin：`371/371` PASS；
- Plugin typecheck/build：PASS；
- `78528f7` 完整根级 `./scripts/check.sh` PASS：typecheck、lint、全仓测试、
  build、plugin package/bootstrap/dist、architecture boundary、145 条稳定规则覆盖与
  recovery acceptance rehearsal 均通过。

## 真实操作链

1. 通过 CLI 只把一个 HIGH Proposal 提交到既有 Review；Object/Commit 均未创建。
2. 在 Logseq 中审阅方案，确认“审阅方案”只记录判断，正文仍为 TODO。
3. 使用 Logseq Plugin Manager 执行真实“重载”；工具栏仍只显示一个尚未应用问题，
   Review 保持“方案已审阅，等待确认应用”。
4. 第一次确认应用被正式预检判为 stale，零写入。原因是外部测试 Proposal 在 Graph
   snapshot 没有提供宿主版本时错误猜了 `version: 1`；产品没有猜测或覆盖正文。
5. 基于同一 UUID 和可见正文 hash 重新创建 Proposal，不再伪造未知宿主版本；CLI
   validate=`VALID`、submit 仍为 `proposalStored=true / formalWritesExecuted=false`。
6. 重新审阅并确认应用：正文 `TODO → [任务]`，Service Object `13 → 14`，结果卡明确已应用、
   可撤销。
7. 从同一结果卡执行 inverse Undo：正文 `[任务] → TODO`，Object `14 → 13`，结果卡明确
   “已撤销；历史证据仍保留”。
8. 再次真实 Plugin Manager reload：短暂连接检查自动恢复；用户系统状态显示正式状态与
   当前知识库已连接、没有未完成修改或正文连接冲突。
9. `78528f7` 构建重载后，第一次 stale 方案不再占当前待审阅：当前区为空，24 条历史默认
   折叠；技术 Doctor 仍诚实保留 1 条 stale 历史 WARN，但它不是可继续或待恢复修改。

## 状态证据

| 时点 | Proposal | Object | Graph | 用户前台 |
|---|---|---:|---|---|
| 审阅后、应用前 | `ACCEPTED`，0 linked Commit | 13 | TODO 未变 | 一个主问题：等待确认应用 |
| 第一次预检 | `STALE` | 13 | TODO 未变 | 没有应用，请重新检查 |
| 重验应用后 | `APPLIED` | 14 | `[任务]` | 已应用，可撤销 |
| inverse Undo 后 | 原 Commit `UNDONE`，逆向完成 | 13 | TODO 恢复 | 已撤销，历史保留 |
| reload 后 | 无 current Proposal / Pending / Recovery | 13 | TODO 保持 | 可以正常使用，无需操作 |

最终 CLI：Service `READY`，schema `12`，Object `13`；Doctor `0 FAIL`，Anchor/Commit/Graph
均健康；Graph bridge 回读测试 Block 的可见正文 hash 为 `6554a92f`。

## 当前截图

| 文件 | Commit | 场景 | 状态 |
|---|---|---|---|
| `p0-accepted-not-applied-current-3883848.jpg` | `3883848` | 审阅后尚未应用 | CURRENT_AT_3883848 |
| `p0-accepted-not-applied-reload-current-3883848.jpg` | `3883848` | 真实插件重载后仍尚未应用 | CURRENT_AT_3883848 |
| `p0-unfinished-frontstage-applied-current-3883848.jpg` | `3883848` | 正式应用成功 | CURRENT_AT_3883848 |
| `p0-unfinished-frontstage-undone-current-3883848.jpg` | `3883848` | inverse Undo 成功 | CURRENT_AT_3883848 |
| `p0-unfinished-frontstage-final-health-current-3883848.jpg` | `3883848` | Undo 后 reload 与系统健康 | CURRENT_AT_3883848 |
| `p0-stale-proposal-archived-current-78528f7.jpg` | `78528f7` | stale 只在折叠历史，当前区为空 | CURRENT |

## Gate 结论

- accepted-not-applied：`PARTIAL → DONE_DESKTOP_REPRESENTATIVE`；
- stale 零写入与当前/历史分离：`DONE_DESKTOP_REPRESENTATIVE`；
- apply→Undo→reload：`DONE_DESKTOP_REPRESENTATIVE`；
- PENDING / RECOVERY_REQUIRED 新用户语义：自动化 PASS，仍为 `AUTOMATED_ONLY`，没有在
  健康 Graph 中制造危险中断来借截图升级；
- P0 总状态：仍为 `IN_PROGRESS_DESKTOP_GATES`，等待 PENDING/Recovery 代表 Gate 与最终
  P0 视觉汇总。

复杂度变化：新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator
`0`、写入权威 `0`；关闭长期 Partial `1`，新增长期 Partial `0`，净变化 `-1`。
