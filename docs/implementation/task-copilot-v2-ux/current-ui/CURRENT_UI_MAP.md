# Current UI Map

> 截至 2026-07-26：所有未在本目录索引的既有 Desktop 截图默认 `HISTORICAL`；下表的 `OPEN` 表示尚无
> 与当前代码 Commit 对齐的真实截图，不代表功能未实现。

| 场景 | 最新实现状态 | 当前截图 | 下一次取证 Gate |
|---|---|---|---|
| 工具栏 / 现在 / 待我确认 / 项目 / 更多 | 已实现，部分历史 Desktop 通过 | OPEN | 集中 P0/P1 Desktop Gate |
| Block / Page 现场入口 | 已实现，宿主位置仍有开放项 | OPEN | main/sidebar/Query/reference/中文输入 |
| Service 状态 / reload / quit / Graph switch | reload/quit/owned shutdown 已通过；`ca50304` 又完成未配置 Graph 立即受限、稳定 fail-closed 和切回原 authority | CURRENT：`p0-h-16`～`18` + P2-C restart 健康态 | P0-H 已关闭；只在未来宿主能力变化时重开非代表性组合 |
| Project Page Head / Context Recovery | P1-G Context Recovery 代表链 DONE；File Graph Page Head 有界隐藏 | CURRENT：`p1-g-07`～`13` | P1-F DB Graph Page Head 宿主 Gate；1.3.0 持续质量样本不阻断当前 Slice |
| Block Marker | 默认关闭 prototype | OPEN | 编辑/TODO/Query/sidebar/Zoom/主题/性能 |
| MiniProject Grill / 原位重构 | 一个纵向链历史 Desktop 通过 | OPEN | 最新构建回归与多材料质量样本 |
| Project Creation Grill | Blank、Page 两种关系与 MiniProject 演化功能链均真实 Provider→Preview→HIGH Review→create→reload/restart→Undo→健康 PASS；`7a7492a407ed` 已复验 MiniProject Undo 精确返回来源根 Block | CURRENT：Page dedicated Undo/健康、reuse readiness/Preview/返回现场/Undo/健康；MiniProject Grill/Preview/Review/create/reload/来源返回/健康 | Light/窄栏与集中宿主视觉 Gate；Project 新页 ownership metadata 仍过于前台 |
| Project 结构操作路由 | 16 类分类；MEDIUM 当前摘要、LIGHT Condition 与 HEAVY 完整当前接口均完成正式链；无 inverse 的 Association 安全禁用 | CURRENT：`p2-d-05`/`06` MEDIUM；`p2-d-07`～`10` HEAVY；`p2-d-11`～`13` LIGHT Condition | Association/其余 LIGHT、其他 HEAVY 类型与 Light/窄栏 |
| Project Closure | 确定性证据、用户判断、真实 Provider、HIGH Review、Commit、reload、专用 inverse Undo 主链；receipt-backed Commit 中断→同 Commit 续跑→reload→Undo 已完成 | CURRENT：预览 `p2-e-01`～`04`；正常正式/Undo `p2-e-05`～`12`；中断/续跑 `p2-e-13`～`18` | Provider error/stale；真正不能安全续跑的 `RECOVERY_REQUIRED` 代表链 |
| Recovery / Rebind / Restore / Migration | Rebind 受控选择主链已完成；纠错指引自动 Gate 不复活 missing/conflict 旧 Anchor；Restore 正常往返、自动回滚以及真实连续双重失败→无需 reload 人工恢复→Doctor/清锁→正常 Launcher/reload 均已完成；Migration 已完成 ledger、session-only scan、逐项 Review、恢复基线/Import/Verify/Undo、HIGH Activation 与完成后只读交接 | CURRENT：Rebind `p2-g-07`～`12`；Restore 真实双重失败 `p2-g-55`～`59`（旧 normal/rollback/受控恢复图为历史阶段证据）；Migration scan `p2-g-20`～`25`、Review/Preview `p2-g-26`～`29`、Import/Verify/Undo `p2-g-30`～`37`、Activation `p2-g-38`～`42`、只读归档 `p2-g-43` | Rebind 新成功态；Restore Light/窄栏；Migration 失败/中断恢复与视觉 Gate |
| Attention Signal | Shadow runtime | OPEN | 首批确定性 Signal 开放门通过后 |

权威进度仍以 `current-status.md`、`09_PROGRESS_REPORT.md` 和
`10_ACCEPTANCE_REPORT.md` 为准；本表只回答“当前界面是否有最新真实截图”。
