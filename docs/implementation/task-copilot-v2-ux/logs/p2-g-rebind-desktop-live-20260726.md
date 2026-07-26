# P2-G Rebind Desktop Live Gate — 2026-07-26

## 结论

`REBIND_IDENTITY_FREE_CAPTURE_MAIN_CHAIN_DESKTOP_DONE_P2G_STILL_IN_PROGRESS`

当前 Rebind 用户链已在真实 Logseq Desktop 中完成：

`Anchor missing → 用户系统状态 → 受控选择窗口 → 新建替换正文 → 阅读预览 → 单独确认 → Service Rebind → 自动同步恢复 → reload → 健康`

这只关闭 Rebind 正常主链与“目标已有正式连接”的安全拒绝门；P2-G 的专用
Recovery/Undo 引导、Restore 和 Migration 产品化仍 OPEN，完整 Goal 继续
`IN_PROGRESS`。

## 运行身份

- branch：`feature/task-copilot-mvp`
- current commit：`344c705ec44613c05f39f80c7f974bf87d3c5140`
- Plugin build：2026-07-26 11:46:09 +0800，`dist/index.js` 616,513 bytes
- Logseq Desktop：0.10.15
- Graph：本地 `logseq` 测试 Graph
- Launcher / Local Service：真实已安装 runtime，Service READY、formal writes true
- theme / viewport：Dark，994×700
- Provider：本 Slice 不调用 Provider
- 密钥与正文：截图无密钥、token；保存前确定性裁切到 Task Copilot 模态框，未重绘界面

## 首轮真实运行：安全拒绝发现产品竞态

1. 删除合成 Task `xxx` 的旧正文，reload 后用户状态显示一个正式事项与正文失去连接；
2. 新建显式 `[任务] Rebind Desktop Gate 20260726` 并打开 identity-free 阅读预览；
3. 用户选择失效事项、勾选单独确认并提交；
4. Service 拒绝：新 Block 已被普通显式同步先物化，已经有正式正文连接；Rebind 零写入。

这证明 Service 的唯一 Primary Anchor 边界有效，也暴露旧操作说明不可依赖：用户刚新建的
显式替换 Block 会与自动物化竞态。没有放宽 Service 规则；实现改为 5 分钟受控捕获窗口。

## 实现后的真实运行

1. 删除合成 `Rebind Desktop Gate 20260726` 的旧正文并 reload；
2. 用户系统状态显示一个失效正文，并只提供“开始重新连接”；
3. 点击后 Plugin 先 flush 既有显式同步，再短时 pause 自动物化并隐藏主 UI；
4. 用户新建 `[任务] Rebind Capture Target 20260726`；
5. 提交前 Service 回读 `matching_objects=0`，证明该 Block 未被抢先物化；
6. 重新打开 Task Copilot，捕获卡说明 5 分钟上限、取消/提交后的恢复语义；
7. 阅读预览只显示目标标题/类型、候选事项和翻译后的连接状态；DOM 仍只持有
   session-local `candidate:<index>`；
8. 用户选择失效事项、勾选影响确认并提交；
9. Service 正式 Rebind 成功，Plugin 恢复显式同步并排空捕获窗口内的 pending change；
10. Service 回读只有一个匹配正式对象：旧 Anchor `replaced`、新 Anchor 唯一 `active`；
11. Plugin Manager reload 后用户系统状态为“可以正常使用”，无需操作；
12. 技术诊断显示 commit `344c705ec446`、Pending/Recovery/Source Conflict `0/0/0`、
    explicit sync `pending:0 / transportReady:true / reconciliationRequired:false`。

## 自动证据

- focused Rebind / capture：9/9 PASS；
- Plugin：284/284 PASS；
- Plugin typecheck：PASS；
- root `./scripts/check.sh`：PASS；
- stable rule coverage：145；
- recovery rehearsal：PASS，differences `[]`；
- existing Service confirmation、version/hash revalidation、old Anchor history和单一 SQLite
  authority未改变。

## 当前截图

- `p2-g-07-rebind-capture-entry-dark-994x700.jpg`
- `p2-g-08-rebind-capture-window-dark-994x700.jpg`
- `p2-g-09-rebind-capture-preview-dark-994x700.jpg`
- `p2-g-10-rebind-capture-success-dark-994x700.jpg`
- `p2-g-11-rebind-capture-reload-clean-dark-994x700.jpg`
- `p2-g-12-rebind-capture-build-identity-dark-994x700.jpg`

首轮 `p2-g-01`～`p2-g-06` 是 commit `46b45c3` 的真实发现/安全拒绝/既有未物化 Block
成功链，现登记为 `HISTORICAL` 或 `SUPERSEDED`，不代表当前 UI。

## 交互评估

- 主结论清楚：正式事项仍在，正文位置需要重新确认；
- 不要求用户读取 UUID、Anchor ID、hash 或数据库路径；
- 新建替换 Block 的自动物化竞态已由用户主动、短时、可自动恢复的捕获窗口消除；
- 后台暂停可以复杂，前台只呈现一个任务和一个主动作；
- 安全拒绝发生在确认前；Service 仍拒绝已有正式连接的目标；
- 当前缺口：Rebind 尚无“一键撤销到旧正文”的专用用户入口；旧 Anchor 历史可用于再次
  Rebind，但 Recovery/Undo 引导仍需产品化，因此不把 P2-G 或整体 Goal 标为完成。
