# Current UI Map

> 截至 2026-07-29：所有未在本目录索引的既有 Desktop 截图默认 `HISTORICAL`；下表的 `OPEN` 表示尚无
> 与当前代码 Commit 对齐的真实截图，不代表功能未实现。

| 场景 | 最新实现状态 | 当前截图 | 下一次取证 Gate |
|---|---|---|---|
| 工具栏 / 现在 / 待我确认 / 项目 / 更多 | 正式 Now 不采用会遗漏刚恢复事项的 Dynamic Shadow，而把既有 Service facts 去重为“继续处理 / 需要回看 / 保持等待”；Focus 明确显示来源且永不被普通 4 项上限折叠；卡片保持单一主动作。待审阅当前问题与历史分离，候选处置在 reload/recompute 后不冒充新增 | CURRENT Now：`p1-now-frontstage-continue-dark-standard-3d63d5a.png`、`p1-now-frontstage-continue-dark-narrow-3d63d5a.png`；Review/Project/More 继续用 Day 10 当前证据；Day 8 disposition 继续有效 | 当前 Graph 的“需要回看/保持等待”代表 Desktop；Attention helpful/noise 与 disposition/cooldown 有界前台 Pilot |
| 插件外观 / Dark / 窄栏 | 自动模式优先可读宿主；custom.css 与官方信号分离时可显式选择浅色或深色。Dark 1001×720 与 723×720、reload 持久性已通过 | CURRENT：`ui-theme-dark-current-d7526f4.png`、`ui-theme-dark-current-narrow-d7526f4.png` | Logseq File Graph 自身 Light bounded host issue 仍 OPEN；不把深色覆盖冒充 Light PASS |
| Block / Page 现场入口 | main Page 与普通 Block 可用；Page 操作已压缩为一个突出主操作和两个次级意图；正式 Block“暂时做不了”只显示三种用户原因，空原因不保存，成功/Undo 返回同一原文并经 reload 恢复；727×720 保持同一层级；同一 UUID 移动后精确返回新位置，来源删除后安全关闭；right-sidebar、Query 与 Block reference 无可靠正式 identity 时安全隐藏或用用户语言停止，不猜测目标 | CURRENT：`ui-page-context-user-language-current-869127f.jpg` + `p0-k-01`～`08`、`10` + `p0-k-condition-*-73dc1e2.jpg` | P0-K 已为代表性 DONE；中文 IME；未来 DB Graph 宿主差异 |
| Service 状态 / reload / quit / Graph switch | reload/quit/owned shutdown 已通过；`ca50304` 完成未配置 Graph fail-closed 和切回原 authority；Day 10 又在连续使用尾声复验已失效隔离 Graph 安全受限与切回后投影恢复 | CURRENT：`p0-h-16`～`18`；Day 10 `day-10-graph-switch-*-plugin-7fe762d-docs-f738f59.jpg` | P0-H 已关闭；只在未来宿主能力变化时重开非代表性组合 |
| Project Page Head / Context Recovery | Project Page 菜单能在 File Graph UUID 漂移后按受控 metadata + 正式对象 + 唯一 active Anchor 识别，并以“打开项目工作区”为突出主操作；Project 默认首屏为“继续项目”，一个主操作 + 一个 Copilot 次操作，其余折叠；P1-G Context Recovery 代表链 DONE；File Graph Page Head 有界隐藏 | CURRENT Page 菜单：`ui-project-page-context-user-language-current-869127f.jpg`；默认首屏：`ui-project-continuation-compressed-current-*`（`b605e18`）；生成与异常：`p1-g-07`～`13` | P1-F DB Graph Page Head 宿主 Gate；1.3.0 持续质量样本不阻断当前 Slice |
| Block Marker | 默认关闭 prototype | OPEN | 编辑/TODO/Query/sidebar/Zoom/主题/性能 |
| MiniProject Grill / 原位重构 | 一个纵向链历史 Desktop 通过 | OPEN | 最新构建回归与多材料质量样本 |
| Project Creation Grill / 创建后落地 | Blank、Page 两种关系与 MiniProject 演化功能链均真实 Provider→Preview→HIGH Review→create→reload/restart→Undo→健康 PASS；Preview 使用四区压缩，HIGH Review 先显示影响和安全边界；创建后 Project 落地页只显示当前状态、一个当前推进、预期成果、来源和一个主操作，完整结构折叠；开始推进会重验正式 Project 与受控 Page 后关闭面板、留在 Logseq 工作现场 | CURRENT：Preview `ui-project-creation-preview-compressed-*`（`2adfc35`）；Review `ui-high-review-concise-understanding-*`（`efb3864`）；落地页 `ui-project-landing-*-bfabf40.jpg`（Dark/Light 1000px、Light 723px）；既有 create/reload/Undo/健康链继续有效 | 物理 Logseq Page 仍显示受控 owner/object/commit metadata；最新构建重新执行完整 create→Undo 和其他宿主组合仍 OPEN；Grill 一次重复 Page 关系提问继续作为通用 answer-evidence 质量债 |
| Project 结构操作路由 | 16 类后台分类保留；前台改为“更新状态/整理摘要/调整目标成果结构/结束项目”等用户意图；无 inverse 的 Association 安全禁用 | CURRENT：`ui-compression-04`（`f4acf77`）+ `p2-d-05`～`13` 正式链 | Association/其余 LIGHT、其他 HEAVY 类型 |
| Project Closure | 首屏先显示待判断数量、未正式应用、退出安全和唯一主动作；逐目标原始依据与完整依据默认折叠。Provider error 保留用户判断并只给一个重试动作；stale 丢弃旧草稿并改为重新检查。FAILED 明确“没有应用、项目和正文不变、重新发起”，不再保留确认应用按钮；receipt-backed PENDING 才表示原修改可以继续。应用/reload/Undo 与最近修改都使用业务结论，内部错误码折叠 | CURRENT UI：`ui-compression-05`、`06`、`08`（`f4acf77`）、Provider error（`7727770`）、stale/reload（`662246a`）、Day 9 Review/应用/Undo/健康（`aad478c` / `f18cc72` / `7fe762d`）、精确 `98df827` reload 空审阅；正式链：`p2-e-01`～`18` | FAILED/STALE 专用卡由自动故障注入验证；生产入口不增加危险注入。Closure 单步失败不人为进入 `RECOVERY_REQUIRED` |
| Recovery / Rebind / Restore / Migration | Rebind 受控选择、选错后重新选择、整库回退路由与捕获取消零旧快照写入均已完成；Restore 正常往返、自动回滚以及真实连续双重失败→无需 reload 人工恢复→Doctor/清锁→正常 Launcher/reload 均已完成；Migration 已完成 normal main chain、完成后只读交接、写后响应丢失→ledger reload→Verify→Undo、Verify/Activate failure same-ledger retry 与窄栏 | CURRENT：Rebind `p2-g-rebind-*-075e031.png` + `p0-explicit-sync-cancel-*-075e031.png`；Restore 真实双重失败 `p2-g-55`～`59`；Migration normal `p2-g-20`～`43`、response-loss `p2-g-60`～`65`、failure retry + narrow；主题表达由 `ui-theme-dark-*` 接管 | 显式正式化等价撤销入口核对；Restore 代表视觉；Logseq File Graph Light bounded host issue |
| Attention Signal | Shadow runtime | OPEN | 首批确定性 Signal 开放门通过后 |

权威进度仍以 `current-status.md`、`09_PROGRESS_REPORT.md` 和
`10_ACCEPTANCE_REPORT.md` 为准；本表只回答“当前界面是否有最新真实截图”。
