# P2-G Backup/Restore 产品入口自动 Gate

日期：2026-07-26
状态：`RESTORE_FRONTSTAGE_STATE_DELTA_ROUNDTRIP_DESKTOP_DONE_FAILURE_GATE_OPEN`

## 结论

在不增加第二恢复器、数据库写入口或客户端路径权限的前提下，已经把既有
Local Service Backup/Restore 安全链接到插件“更多 → 备份与恢复”：

```text
读取当前 Graph 最近快照
→ 只显示时间、正式事项数量和校验结果
→ 会话 token 选择
→ Service 再校验
→ 用户单独确认最终影响
→ flush 正文同步并检查 PENDING / RECOVERY_REQUIRED
→ 固定 Restore 确认
→ 自动创建恢复前恢复点
→ 原子切换 SQLite
→ Service 自停
→ Launcher 自动重建同一 Graph Service
```

当前构建已经关闭 Restore 产品入口的真实 Desktop 正常往返 Gate：目录、二次校验、未确认
零请求、可辨认状态变化、旧快照逐字段读回、恢复点反向 Restore、Service 自停、Launcher
同 Graph 重连、reload 与构建身份都已在最新 Logseq 中通过。失败注入、恢复失败后的用户层
Recovery、Light/窄栏和 Migration 仍未完成，故 `P2-G` 和完整 Goal 继续 `IN_PROGRESS`。

## 首轮 Desktop 反馈（历史缺陷，不计 DONE）

commit `6415dd14b568` 的首轮真实运行已证明：

- 最新入口可在 Logseq 0.10.15 到达并创建 4 项正式事项的校验 PASS 快照；
- 未勾选最终确认时 Backup 数保持 1、Service PID 不变；
- 正确确认后 Backup 数变为 2，说明恢复前恢复点已建立；
- owned Service PID 从 `45082` 变为 `45196`，Plugin 自动回到
  `Runtime READY / Store READY`。

但首轮成功画面仍保留上一次“请先单独确认”的错误提示，形成成功与失败并列的矛盾表达。
该画面不进入 CURRENT 截图，也不能用于关闭 Desktop Gate。`6ae8f2fcebd0` 在每个
Backup/Restore 用户动作开始时清理上一动作 feedback，并已完成下面的最新构建重跑。

## 最新 Desktop 证据

环境：

- branch `feature/task-copilot-mvp`；
- commit / Plugin build `6ae8f2fcebd0`；
- Plugin build time `2026-07-26T12:16:56+0800`；Plugin / Service / Launcher
  version 均为 `0.1.0`；
- Logseq Desktop `0.10.15`，测试 Graph `logseq`，Dark，`994×700`；
- Launcher PID `44964`；Restore 前 owned Service PID `47467`，Restore 后 `47600`；
- 使用专用 SQLite 测试库；无 Provider/LLM 调用，无 Key、token、路径或私人正文进入截图。

真实操作与结果：

1. reload 后进入“更多 → 备份与恢复”，读到两个四项正式事项、完整性校验通过的快照；
2. 选择最新快照，Service 再校验并显示最终影响：SQLite 正式状态会被替换、Logseq 正文
   不改写、当前状态先保存为恢复点；
3. 未勾选单独确认时界面只显示“未执行”，Service PID 与目录保持不变；
4. 勾选后正式 Restore，Plugin 自动回到 `Runtime READY / Store READY`，成功提示中不再
   残留上一动作错误；
5. owned Service PID `47467 → 47600`，证明原 Service 自停、Launcher 为同一 Graph
   重建受管 Service；
6. Plugin Manager reload 后目录从两个变为三个校验通过快照，证明恢复前恢复点跨 reload
   可读；
7. 系统状态显示 `Commit 6ae8f2fcebd0 / Logseq 0.10.15`，
   `Pending / Recovery / Source Conflict = 0/0/0`。

CURRENT 截图为 `p2-g-13`～`p2-g-17`。首轮矛盾成功画面未保存为 CURRENT。

## 状态差异与反向 Restore Desktop 证据

在同一测试 Graph、同一构建继续执行：

1. 通过真实 Now Work“更新状态”把测试 Task 从 `ACTIONABLE v5` 正式更新为
   `PAUSED v6`，原因只使用脱敏测试文本；
2. CLI 经 Local Service 有界搜索读回 `OPEN / PAUSED v6`，证明差异已经进入 SQLite
   单一正式权威；
3. 在 Desktop 选择 `12:19:22` 的变化前快照并正式 Restore；Service 重启后逐字段读回
   `OPEN / ACTIONABLE v5`，Now Work 同一 Task 再次显示“当前可以继续推进”；
4. Restore 自动产生的 `12:30:01` 恢复点保存了 `PAUSED v6`；在 Desktop 选择该恢复点
   反向 Restore 后逐字段读回 `OPEN / PAUSED v6` 和原测试原因；
5. 为不把测试 Graph 留在人工暂停态，选择反向过程自动保存的 `12:31:04` 恢复点再次
   Restore，最终逐字段回到 `OPEN / ACTIONABLE v5`；
6. 最终 owned Service PID 为 `50907`，Plugin Manager reload 后系统状态
   READY、`0/0/0`、`reconciliationRequired:false`。

CURRENT `p2-g-18` 显示旧快照恢复后同一 Task 回到 Now Work；`p2-g-19` 显示完整往返及
最终 cleanup 后的当前构建与健康态。状态读回只记录 title/type/version/lifecycle/condition，
不把 Object/Anchor identity、数据库路径或正文写入报告。

## 复用与新增边界

- 复用 `V2SqliteStore.restoreOffline` 的候选校验、恢复点校验、原子切换、
  激活后 Doctor 与失败回滚；
- 复用 `/backup/restore/apply` 的服务端 Backup ID、固定
  `RESTORE_AND_STOP_SERVICE` 确认、descriptor 删除和 Service 自停；
- 复用 Launcher child exit 清理、Plugin lease recovery、restricted 状态与
  explicit sync pause/resume；
- 新增只读 `GET /backups`：最多返回最近 20 个服务端快照的时间、校验状态、
  schema 版本和对象数量，不返回路径；
- 新增 Plugin `BackupRestoreController`：DOM 仅保存 `snapshot:<index>`，
  Backup ID 只在会话内映射，取消和 Graph switch 清空；
- Plugin 执行前复用 owned shutdown policy：存在 `PENDING`、
  `RECOVERY_REQUIRED` 或正文 reconciliation 时转到“最近修改与恢复”，Restore
  不开始。

没有新增表、状态权威、恢复算法、SQLite 路径输入、Backup ID 输入、LLM 调用、
Proposal 类型或 test-only fault。

## 自动证据

- Local Service 全套测试：PASS；
- Plugin：`288/288` PASS；
- Local Service、Plugin、Service Client typecheck：PASS；
- Controller 测试证明：
  - 用户状态不包含 Backup ID 或数据库路径；
  - 非法快照和未知 token 不能进入确认；
  - 正式 Restore 对同一服务端快照再次校验；
  - 固定确认短语不进入 DOM；
  - 创建快照后重新读取有界目录；
  - 取消后会话映射清空；
- UI 测试证明：
  - 正常/非法快照有不同用户表达；
  - 最终影响、自动恢复点和自动重启明确；
  - 无 `backup_*`、`.db`、`objectId` 或固定确认短语泄漏。

## Desktop Gate

必须使用专用测试数据库与当前最新 Logseq 构建完成：

已关闭：

- [x] 创建/读取当前快照目录；
- [x] 选择快照并二次校验；
- [x] 未勾选确认时零 Restore 请求；
- [x] 正确确认后自动创建恢复点、Service 自停；
- [x] Launcher 自动重启同一 Graph Service；
- [x] reload 后恢复前状态快照仍可见且校验 PASS；
- [x] 成功/失败 feedback 不并列；
- [x] Key、token、路径和私人正文不进入截图。

新增关闭：

- [x] 在当前产品 UI 下制造可辨认、可撤销的正式状态变化，再 Restore 旧快照并逐字段
  读回状态差异；
- [x] 对自动恢复点执行反向 Restore，证明 `ACTIONABLE v5 ↔ PAUSED v6` 正反往返；
- [x] 最终恢复测试环境原基线并 reload，系统健康 `0/0/0`。

仍开放：

- [ ] 注入 Restore 失败并验证原库保持、恢复点保留和用户层 Recovery；
- [ ] Light、窄栏与必要主题视觉。

因此标记 `RESTORE_FRONTSTAGE_STATE_DELTA_ROUNDTRIP_DESKTOP_DONE`，仍不宣称 Restore
失败链、P2-G 或整体 Goal 完成。
