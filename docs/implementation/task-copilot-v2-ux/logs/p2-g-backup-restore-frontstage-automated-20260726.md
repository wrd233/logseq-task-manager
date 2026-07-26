# P2-G Backup/Restore 产品入口自动 Gate

日期：2026-07-26
状态：`RESTORE_FRONTSTAGE_AUTOMATED_DESKTOP_OPEN`

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

当前只关闭自动 Gate。首轮真实 Restore 暴露用户层 feedback 清理缺陷，修复后的完整
Desktop 重跑尚未完成，因此 `P2-G` 和完整 Goal 继续 `IN_PROGRESS`。

## 首轮 Desktop 反馈（修复中，不计 DONE）

commit `6415dd14b568` 的首轮真实运行已证明：

- 最新入口可在 Logseq 0.10.15 到达并创建 4 项正式事项的校验 PASS 快照；
- 未勾选最终确认时 Backup 数保持 1、Service PID 不变；
- 正确确认后 Backup 数变为 2，说明恢复前恢复点已建立；
- owned Service PID 从 `45082` 变为 `45196`，Plugin 自动回到
  `Runtime READY / Store READY`。

但首轮成功画面仍保留上一次“请先单独确认”的错误提示，形成成功与失败并列的矛盾表达。
该画面不进入 CURRENT 截图，也不能用于关闭 Desktop Gate。当前修复在每个
Backup/Restore 用户动作开始时清理上一动作 feedback；必须重建并完整重跑后再判定。

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

## Desktop Gate（仍 OPEN）

必须使用专用测试数据库与当前最新 Logseq 构建完成：

1. 创建当前快照并在 UI 中出现；
2. 快照后产生一项可辨认、可恢复的正式状态变化；
3. 选择旧快照并完成二次校验；
4. 未勾选确认时零 Restore 请求；
5. 正确确认后自动创建恢复点、Service 自停；
6. Plugin 显示受限/重连状态而非陈旧 READY；
7. Launcher 自动重启同一 Graph Service；
8. reload 后读回旧快照状态；
9. 恢复前状态作为新快照仍可见且校验 PASS；
10. Graph 正文没有被 Restore 改写；
11. Provider/Key/私人正文没有进入日志或截图。

失败注入、恢复点反向 Restore 和窄栏/Light 视觉可在主链通过后集中验证；在此之前
不得把 Restore 标记为 Desktop DONE。
