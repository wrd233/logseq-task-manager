# P2-G Restore 手工恢复状态投影自动 Gate

## 结论

`23ae7bd` 把既有 Restore 恢复互锁投影到用户系统状态，但只完成
`RECOVERY_STATUS_PROJECTION_AUTOMATED_ONLY`：它让用户能区分恢复点已确认、尚未确认
与安全记录无法读取，不执行恢复、不清除安全锁，也不开放正式写入。

## 复用与复杂度边界

- Launcher 只读现有按 database path 隔离的 sidecar，不打开 SQLite。
- 对 Plugin 只返回 `CLEAR/ARMED/RECOVERY_REQUIRED/INVALID`、恢复点是否已确认和记录时间；路径、Graph ID、Backup ID 不进入响应。
- Client 严格拒绝额外字段、矛盾状态和非法时间。
- Plugin 只在 Launcher 已广告能力且 ensure 明确被 Restore 互锁拒绝时读取；旧 Launcher 保持原 fail-closed 文案。
- 前台复用“用户系统状态”，只有一个“重新核验”动作；无新导航、无新正式领域状态、无新 Recovery Kernel。
- `RECOVERY_REQUIRED` 只说明恢复点在切换前曾通过确认；真正执行前仍必须重新校验，因此界面不承诺“当前必然可恢复”。

## 自动证据

- Launcher manager/service：`25/25`。
- Service Client：`13/13`。
- Plugin：`327/327`。
- Shared Restore interlock：`9/9`。
- 根级 `./scripts/check.sh`：PASS；typecheck、lint、全套测试、构建、包边界、Plugin 完整性、145 条规则覆盖与恢复演练 `differences=[]` 均通过。
- 凭据扫描：相关变更无 API Key 模式。

## 未关闭

- 没有受控的手工恢复执行命令；“重新核验”只刷新读取。
- 没有真实双重回滚失败 Desktop 注入。
- 没有新 Desktop 截图；`p2-g-44`～`46` 只代表 `0c4526d` 的自动回滚交互，不代表 `23ae7bd` 的手工恢复投影。
- 手工恢复执行必须由受控 Local Service 维护进程拥有 SQLite 和 Doctor；Launcher 继续只管理进程生命周期。

P2-G 与整体 Goal 继续 `IN_PROGRESS`。
