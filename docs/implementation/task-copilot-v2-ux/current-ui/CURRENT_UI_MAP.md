# Current UI Map

> 截至 2026-07-27：所有未在本目录索引的既有 Desktop 截图默认 `HISTORICAL`；下表的 `OPEN` 表示尚无
> 与当前代码 Commit 对齐的真实截图，不代表功能未实现。

| 场景 | 最新实现状态 | 当前截图 | 下一次取证 Gate |
|---|---|---|---|
| 工具栏 / 现在 / 待我确认 / 项目 / 更多 | “现在”卡片单一主动作；待审阅当前问题与历史记录分离；候选区普通路径去除 Provider/Proposal/SQLite | CURRENT：`ui-compression-01`～`04`、`07`（`f4acf77`） | “更多”及异常态继续沿用各自最新证据；集中 P0/P1 宿主 Gate |
| Block / Page 现场入口 | 已实现，宿主位置仍有开放项 | OPEN | main/sidebar/Query/reference/中文输入 |
| Service 状态 / reload / quit / Graph switch | reload/quit/owned shutdown 已通过；`ca50304` 又完成未配置 Graph 立即受限、稳定 fail-closed 和切回原 authority | CURRENT：`p0-h-16`～`18` + P2-C restart 健康态 | P0-H 已关闭；只在未来宿主能力变化时重开非代表性组合 |
| Project Page Head / Context Recovery | P1-G Context Recovery 代表链 DONE；File Graph Page Head 有界隐藏 | CURRENT：`p1-g-07`～`13` | P1-F DB Graph Page Head 宿主 Gate；1.3.0 持续质量样本不阻断当前 Slice |
| Block Marker | 默认关闭 prototype | OPEN | 编辑/TODO/Query/sidebar/Zoom/主题/性能 |
| MiniProject Grill / 原位重构 | 一个纵向链历史 Desktop 通过 | OPEN | 最新构建回归与多材料质量样本 |
| Project Creation Grill | Blank、Page 两种关系与 MiniProject 演化功能链均真实 Provider→Preview→HIGH Review→create→reload/restart→Undo→健康 PASS；`7a7492a407ed` 已复验 MiniProject Undo 精确返回来源根 Block | CURRENT：Page dedicated Undo/健康、reuse readiness/Preview/返回现场/Undo/健康；MiniProject Grill/Preview/Review/create/reload/来源返回/健康 | Light/窄栏与集中宿主视觉 Gate；Project 新页 ownership metadata 仍过于前台 |
| Project 结构操作路由 | 16 类后台分类保留；前台改为“更新状态/整理摘要/调整目标成果结构/结束项目”等用户意图；无 inverse 的 Association 安全禁用 | CURRENT：`ui-compression-04`（`f4acf77`）+ `p2-d-05`～`13` 正式链 | Association/其余 LIGHT、其他 HEAVY 类型 |
| Project Closure | 首屏先显示待判断数量、未正式应用、退出安全和唯一主动作；逐目标原始依据与完整依据默认折叠。Provider error 保留用户判断并只给一个重试动作；真实 Provider Review 从结构化结果生成一句结论，长模型说明继续折叠。正式 Commit/reload/inverse Undo 与 receipt-backed 中断续跑链保持不变 | CURRENT UI：`ui-compression-05`、`06`、`08`（`f4acf77`）、Provider error（`7727770`）、Review（`662246a`）；正式链：`p2-e-01`～`18` | generation stale；真正不能安全续跑的 `RECOVERY_REQUIRED` 代表链 |
| Recovery / Rebind / Restore / Migration | Rebind 受控选择主链已完成；纠错指引自动 Gate 不复活 missing/conflict 旧 Anchor；Restore 正常往返、自动回滚以及真实连续双重失败→无需 reload 人工恢复→Doctor/清锁→正常 Launcher/reload 均已完成；Migration 已完成 normal main chain、完成后只读交接及写后响应丢失→ledger reload→Verify→Undo | CURRENT：Rebind `p2-g-07`～`12`；Restore 真实双重失败 `p2-g-55`～`59`；Migration normal `p2-g-20`～`43`、response-loss `p2-g-60`～`65` | Rebind 新成功态；Restore Light/窄栏；Migration Verify/Activate failure 与视觉 Gate |
| Attention Signal | Shadow runtime | OPEN | 首批确定性 Signal 开放门通过后 |

权威进度仍以 `current-status.md`、`09_PROGRESS_REPORT.md` 和
`10_ACCEPTANCE_REPORT.md` 为准；本表只回答“当前界面是否有最新真实截图”。
