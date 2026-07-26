# Current UI Map

> 截至 2026-07-26：所有未在本目录索引的既有 Desktop 截图默认 `HISTORICAL`；下表的 `OPEN` 表示尚无
> 与当前代码 Commit 对齐的真实截图，不代表功能未实现。

| 场景 | 最新实现状态 | 当前截图 | 下一次取证 Gate |
|---|---|---|---|
| 工具栏 / 现在 / 待我确认 / 项目 / 更多 | 已实现，部分历史 Desktop 通过 | OPEN | 集中 P0/P1 Desktop Gate |
| Block / Page 现场入口 | 已实现，宿主位置仍有开放项 | OPEN | main/sidebar/Query/reference/中文输入 |
| Service 状态 / reload / quit | 最新构建 restart 后 mounted diagnostics 自动刷新 READY；历史 quit owned shutdown 通过 | CURRENT：P2-C Undo 后 restart 健康态 | Graph switch 与 raw reload 交互收口 |
| Project Page Head / Context Recovery | 已实现并有真实 Provider Gate | OPEN | loading/error/stale/feedback、主题与窄栏 |
| Block Marker | 默认关闭 prototype | OPEN | 编辑/TODO/Query/sidebar/Zoom/主题/性能 |
| MiniProject Grill / 原位重构 | 一个纵向链历史 Desktop 通过 | OPEN | 最新构建回归与多材料质量样本 |
| Project Creation Grill | Blank、Page 两种关系与 MiniProject 演化功能链均真实 Provider→Preview→HIGH Review→create→reload/restart→Undo→健康 PASS；`7a7492a407ed` 已复验 MiniProject Undo 精确返回来源根 Block | CURRENT：Page dedicated Undo/健康、reuse readiness/Preview/返回现场/Undo/健康；MiniProject Grill/Preview/Review/create/reload/来源返回/健康 | Light/窄栏与集中宿主视觉 Gate；Project 新页 ownership metadata 仍过于前台 |
| Project 结构操作路由 | 16 类分类；MEDIUM 当前摘要、LIGHT Condition 与 HEAVY 完整当前接口均完成正式链；无 inverse 的 Association 安全禁用 | CURRENT：`p2-d-05`/`06` MEDIUM；`p2-d-07`～`10` HEAVY；`p2-d-11`～`13` LIGHT Condition | Association/其余 LIGHT、其他 HEAVY 类型与 Light/窄栏 |
| Project Closure 证据 | 确定性 Application→Service→Plugin 只读预览；候选、unknown 与用户判断分离；reload 后重算 | CURRENT：`p2-e-01`～`04`，`ec1a70d848d6` | 真实 Provider→HIGH Proposal→Review→Commit→Recovery/Undo |
| Recovery / Rebind / Restore / Migration | Rebind 受控选择主链已完成；纠错指引自动 Gate 不复活 missing/conflict 旧 Anchor；Restore 正常往返已完成；Migration 已完成 ledger、session-only scan、逐项 Review、恢复基线/Import/Verify/Undo 与 HIGH Activation 正常主链 | CURRENT：Rebind `p2-g-07`～`12`；Restore `p2-g-13`～`19`；Migration scan `p2-g-20`～`25`、Review/Preview `p2-g-26`～`29`、Import/Verify/Undo `p2-g-30`～`37`、Activation `p2-g-38`～`42` | Rebind 新成功态；Restore failure/Recovery；Migration 失败/中断恢复、完成后全局入口收敛、视觉 Gate |
| Attention Signal | Shadow runtime | OPEN | 首批确定性 Signal 开放门通过后 |

权威进度仍以 `current-status.md`、`09_PROGRESS_REPORT.md` 和
`10_ACCEPTANCE_REPORT.md` 为准；本表只回答“当前界面是否有最新真实截图”。
