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
| Project 结构操作路由 | `ae2395523798` 已实现 16 类分类；MEDIUM 当前摘要完成真实 Provider→Review→apply→reload→专用 Undo→reload，顶部显示当前受控 Copilot 可用性 | CURRENT：`p2-d-05` Undo/reload，`p2-d-06` Dark 正式对象入口 | LIGHT Undo、HEAVY 完整接口链与 Light/窄栏 |
| Recovery / Rebind / Restore / Migration | 底层能力存在，产品化未完成 | OPEN | P2-G 用户向导整链 |
| Attention Signal | Shadow runtime | OPEN | 首批确定性 Signal 开放门通过后 |

权威进度仍以 `current-status.md`、`09_PROGRESS_REPORT.md` 和
`10_ACCEPTANCE_REPORT.md` 为准；本表只回答“当前界面是否有最新真实截图”。
