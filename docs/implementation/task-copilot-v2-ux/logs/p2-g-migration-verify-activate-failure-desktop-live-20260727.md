# P2-G Migration Verify / Activate 失败重试 Desktop Gate（2026-07-27）

## 结论

`Migration Verify/Activate failure Desktop` 已从 `OPEN` 升级为 `DONE`。

真实 Logseq 链在隔离测试数据库中完成：

`Import → Verify 受控失败 → 原 ledger 重试 Verify → Activate 受控失败 → 原 ledger 重试 Activate → reload`

两个失败都没有创建半状态、第二恢复页或第二写入权威：

- Verify 失败后，run/batch 保持 `IMPORTING/IMPORTED`，正式对象仍可读；
- 同一 run/batch 重试 Verify 后进入 `VERIFIED/VERIFIED`；
- Activate 失败后，run/batch 保持 `VERIFIED/VERIFIED`；
- 同一 run 重试 Activate 后进入 `ACTIVATED`；
- SemanticCommit `Pending/Recovery` 全程为 `0/0`；
- 完成页只保留只读迁移历史，没有再次开放 scan、Review、Import、Undo 或 Activate。

P2-G 与完整 Goal 仍为 `IN_PROGRESS`：Migration 的 Light host Gate、Rebind 最新纠错／
整库恢复指引及其余 Final Release 项仍开放；窄栏代表性 Gate 后续已由本文末尾补充关闭。

## 运行边界

- 分支：`feature/task-copilot-mvp`
- 当前仓库 HEAD：`e2361599fbc9`
- Logseq：`0.10.15`
- Graph：专用 File Graph
- 主题／窗口：Dark，`1000×720`
- 数据库：隔离的 Migration response-loss 测试库
- 输入：脱敏专用 Recovery Bundle
- Provider 调用：`0`

故障动作开始时加载的 Plugin artifact 为 `2148f42b00cb`。从该 artifact 到当前
`e2361599fbc9` 的唯一 Plugin 变化是与 Migration 无关的空 Review 文案；Migration
控制器、用户状态翻译、Service 调用和渲染路径均无变化。完成后重新构建并 reload 当前
`e2361599fbc9`，由同一正式 ledger 读回最终只读完成态。本文不把旧 artifact 的中间画面
登记为 CURRENT；CURRENT 截图只记录精确当前构建的 reload 结果。

## 安全连接与 authority

本轮复用了安装态中已经存在的同一 loopback 地址、Graph key 和私有配对凭据；没有点击
“安全连接”，没有写入新的 Plugin FileStorage 访问配置，也没有建立新的持久访问权。

隔离运行只在本轮临时使用：

- 既有 Launcher 协议；
- Node 20；
- test-only `beforeMigrationVerify` / `beforeMigrationActivate` fault hook；
- 隔离数据库；
- 同一正式 Migration run/batch ledger。

生产调用者不传 fault hook。故障 Launcher 退出后已完成：

1. 删除临时文件选择位置中的 Recovery Bundle 副本；
2. 恢复正常 LaunchAgent；
3. 恢复原 Graph → database authority；
4. reload 当前 Plugin；
5. 读回正常 Launcher 与 Service；
6. 确认没有故障进程残留。

没有删除、替换或迁移用户数据库。

## Desktop 操作与用户结果

### Verify failure

1. 在既有 PREVIEWED 计划中重新选择同一脱敏 Bundle；
2. 只读重验材料与恢复基线；
3. 选择一项并通过既有 HIGH Import 确认；
4. Import 成功，界面显示“已导入，尚未验证”；
5. 第一次 Verify 触发事务前受控故障；
6. 用户层显示“本批需要检查”，并要求以正式迁移台账为准；
7. run/batch 保持 `IMPORTING/IMPORTED`；
8. 点击同一 Verify 重试，进入 `VERIFIED/VERIFIED`。

失败没有被误报为成功，也没有重复 Import。

### Activate failure

1. 从同一 VERIFIED run 进入既有独立 HIGH Activation 确认；
2. 第一次 Activate 触发事务前受控故障；
3. 用户层显示“启用结果待确认”，并说明可对同一计划安全重试；
4. run/batch 保持 `VERIFIED/VERIFIED`；
5. 再次确认并重试同一计划；
6. run 进入 `ACTIVATED`；
7. reload 后只显示“V2 已启用”和只读历史。

失败没有重新创建恢复点、导入批次或 Migration run。

## 正式状态证据

最终隔离库读回：

- run：`ACTIVATED`
- 新批次：`VERIFIED`，`imported_count=1`
- 历史批次：原 `UNDONE` 记录仍保留
- objects：`5`
- SemanticCommits：`COMPLETED=13`、`UNDONE=11`
- SemanticCommit Pending：`0`
- SemanticCommit Recovery：`0`

CURRENT 截图：

- `../current-ui/screenshots/p2-g-migration-verify-activate-retry-current-dark-e236159.png`

截图对应精确当前构建 `e2361599fbc9`，显示 reload 后：

- “一次性迁移已完成 · 只读历史”；
- “V2 已启用”；
- 当前计划 2 项已审阅、1 项已迁移并验证；
- 旧 UNDONE 与新 VERIFIED 批次同时可读；
- 没有新的写入动作。

## 复杂度变化

- 新增正式状态：`0`
- 新增顶层导航：`0`
- 新增 Skill／Prompt／Validator：`0`
- 新增生产 Runtime：`0`
- 新增生产 Recovery 分支：`0`
- 新增写入权威：`0`
- 新增 Partial：`0`
- 关闭 Partial：`1`
- Partial 总量：净下降 `1`

用户恢复语义继续复用“尚未完成，可以继续”：失败由正式 ledger 表达，重试仍走既有幂等
Application command。没有为 Verify 或 Activate 发明专用恢复状态、页面或 Undo。

## 仍开放

1. Migration Light 代表性宿主 Gate；
2. P2-G Rebind 最新纠错／整库恢复指引 Desktop；
3. P2-G 其余发布验收与完整 Goal。

## 后续视觉代表 Gate

同日当前 repo `7fcdcf5` / Plugin `e2361599fbc9` 又完成：

- `722×720` 窄栏：只读完成态的主结论、计划摘要、两个 batch、折叠安全边界和关闭动作
  均可读，无横向溢出；该子 Gate `PARTIAL→DONE`；
- Light：Logseq 0.10.15 File Graph 设置页已选中“浅色模式”，随后执行完整
  `View → Reload` 和完整 quit/reopen。加载页短暂为浅色，但两条链在 Graph 就绪后都
  恢复深色宿主；严格记录为 `BOUNDED_HOST_ISSUE/OPEN`，没有用设置页或加载页冒充
  Plugin Light PASS；
- owned lifecycle：退出后旧 Service PID `49323` 在 lease 到期后停止，Launcher 保持；
  重新打开后同一 Launcher 启动新 Service PID `52080`，Task Copilot 自动连接同一
  `manual-v2` authority 并恢复正式能力；
- 环境恢复：窗口恢复约 1000px、故障 Launcher 停止、正常 LaunchAgent/Service 与原
  database authority 恢复，用户系统状态显示“可以正常使用”“无需操作”。

CURRENT 证据：

- `../current-ui/screenshots/p2-g-migration-final-current-narrow-720-7fcdcf5.png`
- `../current-ui/screenshots/p2-g-light-mode-selected-host-remains-dark-bounded-7fcdcf5.png`
- `../current-ui/screenshots/p2-g-light-mode-full-restart-remains-dark-bounded-1364235.png`
