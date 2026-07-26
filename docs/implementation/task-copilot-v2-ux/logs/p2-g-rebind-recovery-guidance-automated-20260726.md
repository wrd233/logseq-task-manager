# P2-G Rebind Recovery / Undo 用户指引自动 Gate

日期：2026-07-26
状态：`REBIND_RECOVERY_GUIDANCE_AUTOMATED_DESKTOP_OPEN`

## 架构结论

Rebind 的正式 receipt 同时保留旧 Anchor 与新 Anchor，旧 Anchor 进入 `replaced`，新 Anchor
成为唯一 `active`。但触发 Rebind 的常见原因正是旧正文 missing 或 conflict；把旧 Anchor
机械恢复为 active 会把用户重新带回已经不可用或不唯一的正文。

因此当前证据不支持新增“通用撤销 Rebind”：

- 不新增平行 inverse command、第二恢复器或绕过 Proposal/Commit/Recovery 的写入口；
- 不把“receipt 中仍有旧 Anchor”误解为“旧 Anchor 当前仍适合成为主正文”；
- 不删除正式事项、当前正文或旧连接历史；
- 不让 Plugin 自己改 Anchor 表。

## 用户恢复路径

成功态现在明确区分两种意图：

1. **只是选错正文**：选中正确 Block，再次进入 5 分钟受控 Rebind。既有版本/hash 重验、
   单独确认、唯一 active Anchor 与旧历史保留规则继续生效；
2. **需要回退整个正式状态**：进入 Backup/Restore 只读目录，再走快照校验、最终影响确认、
   recovery point、原子 Restore 与 Launcher 同 Graph 重连。

成功态不再使用含糊的“处理另一个”，也不展示一个会把 missing Anchor 复活的“撤销”按钮。

## 自动证据

- success renderer 明确说明选错目标时不要删除正式事项或历史；
- 主动作进入 `v2-rebind-capture`，而不是绕过捕获窗口直接预览；
- 完整状态回退只打开 `backup-restore-open`，打开目录本身零写入；
- renderer 不包含“撤销重新连接”或“恢复旧连接为主正文”；
- 既有 Rebind Domain/Application/Persistence/Service 命令均未改变。

真实 Desktop 仍需在下一次可控 Rebind 场景中验证新成功态、重新选择正文入口和
Backup/Restore 路由。该自动 Gate 不关闭 P2-G，也不把“不提供不安全通用 Undo”解释为
降低恢复目标。
